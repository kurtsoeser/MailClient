import { getDb } from './index'
import type {
  MailListItem,
  MetaFolderCreateInput,
  MetaFolderCriteria,
  MetaFolderExceptionClause,
  MetaFolderSummary,
  MetaFolderUpdateInput
} from '@shared/types'
import {
  listMessagesForMetaCriteria,
  metaFolderCriteriaHasActiveFilter,
  metaFolderExceptionClauseHasFilter,
  DEFAULT_META_FOLDER_MESSAGE_LIST_LIMIT
} from './messages-repo'

interface Row {
  id: number
  name: string
  sort_order: number
  criteria_json: string
  created_at: string
  updated_at: string
}

function parseExceptionClause(o: unknown): MetaFolderExceptionClause | null {
  if (!o || typeof o !== 'object') return null
  const r = o as Record<string, unknown>
  return {
    textQuery: typeof r.textQuery === 'string' ? r.textQuery : undefined,
    unreadOnly: r.unreadOnly === true,
    flaggedOnly: r.flaggedOnly === true,
    hasAttachmentsOnly: r.hasAttachmentsOnly === true,
    fromContains: typeof r.fromContains === 'string' ? r.fromContains : undefined
  }
}

function parseCriteriaJson(json: string): MetaFolderCriteria {
  try {
    const o = JSON.parse(json) as Record<string, unknown>
    if (!o || typeof o !== 'object') return {}
    const scopeRaw = o.scopeFolderIds
    const scopeFolderIds = Array.isArray(scopeRaw)
      ? scopeRaw
          .filter((x): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0)
          .map((x) => Math.floor(x))
      : undefined
    const matchOp = o.matchOp === 'or' ? 'or' : o.matchOp === 'and' ? 'and' : undefined
    const exRaw = o.exceptions
    const exceptionsParsed = Array.isArray(exRaw)
      ? exRaw.map(parseExceptionClause).filter((x): x is MetaFolderExceptionClause => x != null)
      : []
    return {
      textQuery: typeof o.textQuery === 'string' ? o.textQuery : undefined,
      unreadOnly: o.unreadOnly === true,
      flaggedOnly: o.flaggedOnly === true,
      hasAttachmentsOnly: o.hasAttachmentsOnly === true,
      fromContains: typeof o.fromContains === 'string' ? o.fromContains : undefined,
      scopeFolderIds: scopeFolderIds && scopeFolderIds.length > 0 ? scopeFolderIds : undefined,
      matchOp: matchOp === 'or' || matchOp === 'and' ? matchOp : undefined,
      exceptions: exceptionsParsed.length > 0 ? exceptionsParsed : undefined
    }
  } catch {
    return {}
  }
}

function serializeCriteria(c: MetaFolderCriteria): string {
  const exceptions =
    c.exceptions?.filter((x) => metaFolderExceptionClauseHasFilter(x)).map((ex) => ({
      textQuery: ex.textQuery?.trim() ? ex.textQuery : undefined,
      unreadOnly: ex.unreadOnly === true ? true : undefined,
      flaggedOnly: ex.flaggedOnly === true ? true : undefined,
      hasAttachmentsOnly: ex.hasAttachmentsOnly === true ? true : undefined,
      fromContains: ex.fromContains?.trim() ? ex.fromContains.trim() : undefined
    }))
  return JSON.stringify({
    textQuery: c.textQuery?.trim() ? c.textQuery : undefined,
    unreadOnly: c.unreadOnly === true ? true : undefined,
    flaggedOnly: c.flaggedOnly === true ? true : undefined,
    hasAttachmentsOnly: c.hasAttachmentsOnly === true ? true : undefined,
    fromContains: c.fromContains?.trim() ? c.fromContains.trim() : undefined,
    scopeFolderIds:
      c.scopeFolderIds && c.scopeFolderIds.length > 0 ? c.scopeFolderIds : undefined,
    matchOp: c.matchOp === 'or' ? 'or' : c.matchOp === 'and' ? 'and' : undefined,
    exceptions: exceptions && exceptions.length > 0 ? exceptions : undefined
  })
}

function rowToSummary(r: Row): MetaFolderSummary {
  return {
    id: r.id,
    name: r.name,
    sortOrder: r.sort_order,
    criteria: parseCriteriaJson(r.criteria_json),
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

export function validateMetaFolderInput(name: string, criteria: MetaFolderCriteria): string | null {
  const n = name.trim()
  if (n.length < 1) return 'Name fehlt.'
  if (n.length > 120) return 'Name ist zu lang (max. 120 Zeichen).'
  if (!metaFolderCriteriaHasActiveFilter(criteria)) {
    return 'Mindestens ein Filter ist erforderlich (Volltext, Ungelesen, Markiert, Anhaenge, Absender oder Ordnerauswahl).'
  }
  if (criteria.exceptions && criteria.exceptions.length > 0) {
    for (const ex of criteria.exceptions) {
      if (!metaFolderExceptionClauseHasFilter(ex)) {
        return 'Jede Ausnahmen-Zeile muss mindestens einen aktiven Filter haben.'
      }
    }
  }
  return null
}

export function listMetaFolders(): MetaFolderSummary[] {
  const db = getDb()
  const rows = db
    .prepare<[], Row>(
      `SELECT id, name, sort_order, criteria_json, created_at, updated_at
       FROM meta_folders
       ORDER BY sort_order ASC, id ASC`
    )
    .all()
  return rows.map(rowToSummary)
}

export function getMetaFolder(id: number): MetaFolderSummary | null {
  const db = getDb()
  const r = db
    .prepare<[number], Row>(
      `SELECT id, name, sort_order, criteria_json, created_at, updated_at
       FROM meta_folders WHERE id = ?`
    )
    .get(id)
  return r ? rowToSummary(r) : null
}

export function createMetaFolder(input: MetaFolderCreateInput): MetaFolderSummary {
  const err = validateMetaFolderInput(input.name, input.criteria)
  if (err) throw new Error(err)
  const db = getDb()
  const maxRow = db.prepare<[], { m: number | null }>('SELECT MAX(sort_order) as m FROM meta_folders').get()
  const nextOrder = (maxRow?.m ?? -1) + 1
  const info = db
    .prepare<[string, number, string], { lastInsertRowid: bigint }>(
      `INSERT INTO meta_folders (name, sort_order, criteria_json, created_at, updated_at)
       VALUES (?, ?, ?, datetime('now'), datetime('now'))`
    )
    .run(input.name.trim(), nextOrder, serializeCriteria(input.criteria))
  const id = Number(info.lastInsertRowid)
  const created = getMetaFolder(id)
  if (!created) throw new Error('Meta-Ordner konnte nicht gelesen werden.')
  return created
}

export function updateMetaFolder(input: MetaFolderUpdateInput): MetaFolderSummary {
  const existing = getMetaFolder(input.id)
  if (!existing) throw new Error('Meta-Ordner nicht gefunden.')
  const name = input.name !== undefined ? input.name : existing.name
  const criteria = input.criteria !== undefined ? input.criteria : existing.criteria
  const err = validateMetaFolderInput(name, criteria)
  if (err) throw new Error(err)
  const db = getDb()
  db.prepare(
    `UPDATE meta_folders SET name = ?, criteria_json = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(name.trim(), serializeCriteria(criteria), input.id)
  const u = getMetaFolder(input.id)
  if (!u) throw new Error('Meta-Ordner nicht gefunden.')
  return u
}

export function deleteMetaFolder(id: number): void {
  const db = getDb()
  db.prepare('DELETE FROM meta_folders WHERE id = ?').run(id)
}

/**
 * Sidebar-Reihenfolge: `orderedIds` muss exakt die Menge der vorhandenen Meta-Ordner sein.
 */
export function reorderMetaFolders(orderedIds: number[]): void {
  if (orderedIds.length === 0) return
  const db = getDb()
  const rows = db.prepare<[], { id: number }>('SELECT id FROM meta_folders').all()
  const existing = new Set(rows.map((r) => r.id))
  if (orderedIds.length !== existing.size) {
    throw new Error('Meta-Ordner: Reihenfolge ungueltig (Anzahl passt nicht).')
  }
  for (const id of orderedIds) {
    if (!existing.has(id)) {
      throw new Error('Meta-Ordner: Reihenfolge enthaelt unbekannte ID.')
    }
  }
  const tx = db.transaction(() => {
    const stmt = db.prepare<[number, number], unknown>(
      'UPDATE meta_folders SET sort_order = ?, updated_at = datetime(\'now\') WHERE id = ?'
    )
    orderedIds.forEach((id, idx) => {
      stmt.run(idx, id)
    })
  })
  tx()
}

export function listMessagesForMetaFolder(metaFolderId: number): MailListItem[] {
  const summary = getMetaFolder(metaFolderId)
  if (!summary) return []
  return listMessagesForMetaCriteria(summary.criteria, DEFAULT_META_FOLDER_MESSAGE_LIST_LIMIT)
}
