import { getDb } from './index'
import type {
  NoteEntityLinkTarget,
  NoteEntityLinkTargetKind,
  NoteEntityLinkedItem,
  NoteLinksBundle
} from '@shared/note-entity-links'
import { noteEntityLinkTargetsEqual } from '@shared/note-entity-links'

interface EntityLinkRow {
  id: number
  from_note_id: number
  target_kind: NoteEntityLinkTargetKind
  to_note_id: number | null
  mail_message_id: number | null
  calendar_account_id: string | null
  calendar_graph_event_id: string | null
  task_account_id: string | null
  task_list_id: string | null
  task_id: string | null
  created_at: string
}

function assertPositiveId(id: number, label: string): void {
  if (!Number.isFinite(id) || id <= 0) throw new Error(`${label} fehlt.`)
}

function rowToTarget(row: EntityLinkRow): NoteEntityLinkTarget {
  switch (row.target_kind) {
    case 'note':
      return { kind: 'note', noteId: row.to_note_id! }
    case 'mail':
      return { kind: 'mail', messageId: row.mail_message_id! }
    case 'calendar_event':
      return {
        kind: 'calendar_event',
        accountId: row.calendar_account_id!,
        graphEventId: row.calendar_graph_event_id!
      }
    case 'cloud_task':
      return {
        kind: 'cloud_task',
        accountId: row.task_account_id!,
        listId: row.task_list_id!,
        taskId: row.task_id!
      }
    default:
      throw new Error(`Unbekannter Verknuepfungstyp: ${row.target_kind}`)
  }
}

function resolveTitleSubtitle(
  row: EntityLinkRow
): { title: string; subtitle: string | null } {
  const db = getDb()
  switch (row.target_kind) {
    case 'note': {
      const n = db
        .prepare('SELECT title, kind FROM user_notes WHERE id = ?')
        .get(row.to_note_id!) as { title: string | null; kind: string } | undefined
      return {
        title: n?.title?.trim() || 'Ohne Titel',
        subtitle: n?.kind ?? 'standalone'
      }
    }
    case 'mail': {
      const m = db
        .prepare('SELECT subject, from_name, from_addr FROM messages WHERE id = ?')
        .get(row.mail_message_id!) as
        | { subject: string | null; from_name: string | null; from_addr: string | null }
        | undefined
      return {
        title: m?.subject?.trim() || '(Kein Betreff)',
        subtitle: m?.from_name?.trim() || m?.from_addr?.trim() || null
      }
    }
    case 'calendar_event': {
      const ev = db
        .prepare(
          `SELECT title, start_iso FROM calendar_events
           WHERE account_id = ? AND graph_event_id = ?`
        )
        .get(row.calendar_account_id!, row.calendar_graph_event_id!) as
        | { title: string | null; start_iso: string | null }
        | undefined
      return {
        title: ev?.title?.trim() || 'Termin',
        subtitle: ev?.start_iso?.slice(0, 16) ?? null
      }
    }
    case 'cloud_task': {
      const t = db
        .prepare(
          `SELECT title, due_iso FROM cloud_tasks
           WHERE account_id = ? AND list_id = ? AND task_id = ?`
        )
        .get(row.task_account_id!, row.task_list_id!, row.task_id!) as
        | { title: string; due_iso: string | null }
        | undefined
      return {
        title: t?.title?.trim() || 'Aufgabe',
        subtitle: t?.due_iso?.slice(0, 10) ?? null
      }
    }
    default:
      return { title: '—', subtitle: null }
  }
}

function mapRow(row: EntityLinkRow): NoteEntityLinkedItem {
  const { title, subtitle } = resolveTitleSubtitle(row)
  return {
    linkId: row.id,
    target: rowToTarget(row),
    title,
    subtitle,
    createdAt: row.created_at
  }
}

function mapIncomingNoteRow(row: EntityLinkRow): NoteEntityLinkedItem {
  const db = getDb()
  const n = db
    .prepare('SELECT title, kind FROM user_notes WHERE id = ?')
    .get(row.from_note_id) as { title: string | null; kind: string } | undefined
  return {
    linkId: row.id,
    target: { kind: 'note', noteId: row.from_note_id },
    title: n?.title?.trim() || 'Ohne Titel',
    subtitle: n?.kind ?? 'standalone',
    createdAt: row.created_at
  }
}

export function listNoteLinksBundle(fromNoteId: number): NoteLinksBundle {
  assertPositiveId(fromNoteId, 'Notiz-ID')
  const db = getDb()
  const outgoingRows = db
    .prepare(
      `SELECT id, from_note_id, target_kind, to_note_id, mail_message_id,
              calendar_account_id, calendar_graph_event_id,
              task_account_id, task_list_id, task_id, created_at
       FROM user_note_entity_links
       WHERE from_note_id = ?
       ORDER BY created_at ASC, id ASC`
    )
    .all(fromNoteId) as EntityLinkRow[]

  const incomingRows = db
    .prepare(
      `SELECT id, from_note_id, target_kind, to_note_id, mail_message_id,
              calendar_account_id, calendar_graph_event_id,
              task_account_id, task_list_id, task_id, created_at
       FROM user_note_entity_links
       WHERE target_kind = 'note' AND to_note_id = ?
       ORDER BY created_at ASC, id ASC`
    )
    .all(fromNoteId) as EntityLinkRow[]

  return {
    outgoing: outgoingRows.map(mapRow),
    incoming: incomingRows.map(mapIncomingNoteRow)
  }
}

function assertTargetExists(target: NoteEntityLinkTarget): void {
  const db = getDb()
  switch (target.kind) {
    case 'note': {
      assertPositiveId(target.noteId, 'Ziel-Notiz-ID')
      const row = db.prepare('SELECT 1 FROM user_notes WHERE id = ?').get(target.noteId)
      if (!row) throw new Error('Notiz nicht gefunden.')
      break
    }
    case 'mail': {
      assertPositiveId(target.messageId, 'Mail-ID')
      const row = db.prepare('SELECT 1 FROM messages WHERE id = ?').get(target.messageId)
      if (!row) throw new Error('E-Mail nicht gefunden.')
      break
    }
    case 'calendar_event': {
      const accountId = target.accountId?.trim()
      const graphEventId = target.graphEventId?.trim()
      if (!accountId || !graphEventId) throw new Error('Termin-Referenz unvollstaendig.')
      const row = db
        .prepare(
          `SELECT 1 FROM calendar_events WHERE account_id = ? AND graph_event_id = ?`
        )
        .get(accountId, graphEventId)
      if (!row) throw new Error('Termin nicht im Cache.')
      break
    }
    case 'cloud_task': {
      const accountId = target.accountId?.trim()
      const listId = target.listId?.trim()
      const taskId = target.taskId?.trim()
      if (!accountId || !listId || !taskId) throw new Error('Aufgaben-Referenz unvollstaendig.')
      const row = db
        .prepare(
          `SELECT 1 FROM cloud_tasks WHERE account_id = ? AND list_id = ? AND task_id = ?`
        )
        .get(accountId, listId, taskId)
      if (!row) throw new Error('Aufgabe nicht im Cache.')
      break
    }
    default:
      throw new Error('Unbekannter Verknuepfungstyp.')
  }
}

export function addNoteEntityLink(fromNoteId: number, target: NoteEntityLinkTarget): number {
  assertPositiveId(fromNoteId, 'Quell-Notiz-ID')
  const fromExists = getDb().prepare('SELECT 1 FROM user_notes WHERE id = ?').get(fromNoteId)
  if (!fromExists) throw new Error('Notiz nicht gefunden.')
  if (target.kind === 'note' && target.noteId === fromNoteId) {
    throw new Error('Eine Notiz kann nicht mit sich selbst verknuepft werden.')
  }
  assertTargetExists(target)

  const existing = listNoteLinksBundle(fromNoteId).outgoing
  if (existing.some((item) => noteEntityLinkTargetsEqual(item.target, target))) {
    const match = existing.find((item) => noteEntityLinkTargetsEqual(item.target, target))
    return match?.linkId ?? 0
  }

  const db = getDb()
  let result: { lastInsertRowid: number | bigint }
  switch (target.kind) {
    case 'note':
      result = db
        .prepare(
          `INSERT INTO user_note_entity_links
           (from_note_id, target_kind, to_note_id, created_at)
           VALUES (?, 'note', ?, datetime('now'))`
        )
        .run(fromNoteId, target.noteId)
      break
    case 'mail':
      result = db
        .prepare(
          `INSERT INTO user_note_entity_links
           (from_note_id, target_kind, mail_message_id, created_at)
           VALUES (?, 'mail', ?, datetime('now'))`
        )
        .run(fromNoteId, target.messageId)
      break
    case 'calendar_event':
      result = db
        .prepare(
          `INSERT INTO user_note_entity_links
           (from_note_id, target_kind, calendar_account_id, calendar_graph_event_id, created_at)
           VALUES (?, 'calendar_event', ?, ?, datetime('now'))`
        )
        .run(fromNoteId, target.accountId.trim(), target.graphEventId.trim())
      break
    case 'cloud_task':
      result = db
        .prepare(
          `INSERT INTO user_note_entity_links
           (from_note_id, target_kind, task_account_id, task_list_id, task_id, created_at)
           VALUES (?, 'cloud_task', ?, ?, ?, datetime('now'))`
        )
        .run(fromNoteId, target.accountId.trim(), target.listId.trim(), target.taskId.trim())
      break
    default:
      throw new Error('Unbekannter Verknuepfungstyp.')
  }
  return Number(result.lastInsertRowid)
}

export function removeNoteEntityLink(linkId: number, fromNoteId: number): void {
  assertPositiveId(linkId, 'Verknuepfungs-ID')
  assertPositiveId(fromNoteId, 'Notiz-ID')
  getDb()
    .prepare('DELETE FROM user_note_entity_links WHERE id = ? AND from_note_id = ?')
    .run(linkId, fromNoteId)
}

export function removeNoteEntityLinkIncoming(linkId: number, toNoteId: number): void {
  assertPositiveId(linkId, 'Verknuepfungs-ID')
  assertPositiveId(toNoteId, 'Notiz-ID')
  getDb()
    .prepare(
      `DELETE FROM user_note_entity_links
       WHERE id = ? AND target_kind = 'note' AND to_note_id = ?`
    )
    .run(linkId, toNoteId)
}

export function deleteAllEntityLinksForNote(noteId: number): void {
  assertPositiveId(noteId, 'Notiz-ID')
  const db = getDb()
  db.prepare('DELETE FROM user_note_entity_links WHERE from_note_id = ?').run(noteId)
  db.prepare(
    `DELETE FROM user_note_entity_links WHERE target_kind = 'note' AND to_note_id = ?`
  ).run(noteId)
  db.prepare('DELETE FROM user_note_links WHERE from_note_id = ? OR to_note_id = ?').run(
    noteId,
    noteId
  )
}

export interface SettingsBackupEntityLinkSnapshot {
  fromNoteIndex: number
  targetKind: NoteEntityLinkTargetKind
  toNoteIndex?: number
  mailMessageId?: number
  calendarAccountId?: string
  calendarGraphEventId?: string
  taskAccountId?: string
  taskListId?: string
  taskId?: string
  createdAt: string
}

export function listEntityLinksForSettingsBackup(
  noteIdsInOrder: number[]
): SettingsBackupEntityLinkSnapshot[] {
  const idToIndex = new Map(noteIdsInOrder.map((id, index) => [id, index]))
  const rows = getDb()
    .prepare(
      `SELECT from_note_id, target_kind, to_note_id, mail_message_id,
              calendar_account_id, calendar_graph_event_id,
              task_account_id, task_list_id, task_id, created_at
       FROM user_note_entity_links ORDER BY id`
    )
    .all() as EntityLinkRow[]

  const out: SettingsBackupEntityLinkSnapshot[] = []
  for (const row of rows) {
    const fromNoteIndex = idToIndex.get(row.from_note_id)
    if (fromNoteIndex === undefined) continue
    const base = { fromNoteIndex, createdAt: row.created_at, targetKind: row.target_kind }
    switch (row.target_kind) {
      case 'note': {
        const toNoteIndex = idToIndex.get(row.to_note_id!)
        if (toNoteIndex === undefined) continue
        out.push({ ...base, toNoteIndex })
        break
      }
      case 'mail':
        if (row.mail_message_id == null) continue
        out.push({ ...base, mailMessageId: row.mail_message_id })
        break
      case 'calendar_event':
        if (!row.calendar_account_id || !row.calendar_graph_event_id) continue
        out.push({
          ...base,
          calendarAccountId: row.calendar_account_id,
          calendarGraphEventId: row.calendar_graph_event_id
        })
        break
      case 'cloud_task':
        if (!row.task_account_id || !row.task_list_id || !row.task_id) continue
        out.push({
          ...base,
          taskAccountId: row.task_account_id,
          taskListId: row.task_list_id,
          taskId: row.task_id
        })
        break
      default:
        break
    }
  }
  return out
}

export function replaceAllEntityLinksFromBackup(
  links: SettingsBackupEntityLinkSnapshot[],
  noteIdByIndex: number[]
): void {
  const db = getDb()
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM user_note_entity_links').run()
    db.prepare('DELETE FROM user_note_links').run()
    for (const link of links) {
      const fromNoteId = noteIdByIndex[link.fromNoteIndex]
      if (!fromNoteId) continue
      try {
        switch (link.targetKind) {
          case 'note': {
            const toNoteId =
              link.toNoteIndex != null ? noteIdByIndex[link.toNoteIndex] : undefined
            if (!toNoteId || fromNoteId === toNoteId) continue
            addNoteEntityLink(fromNoteId, { kind: 'note', noteId: toNoteId })
            break
          }
          case 'mail':
            if (link.mailMessageId == null) continue
            addNoteEntityLink(fromNoteId, { kind: 'mail', messageId: link.mailMessageId })
            break
          case 'calendar_event':
            if (!link.calendarAccountId || !link.calendarGraphEventId) continue
            addNoteEntityLink(fromNoteId, {
              kind: 'calendar_event',
              accountId: link.calendarAccountId,
              graphEventId: link.calendarGraphEventId
            })
            break
          case 'cloud_task':
            if (!link.taskAccountId || !link.taskListId || !link.taskId) continue
            addNoteEntityLink(fromNoteId, {
              kind: 'cloud_task',
              accountId: link.taskAccountId,
              listId: link.taskListId,
              taskId: link.taskId
            })
            break
          default:
            break
        }
      } catch {
        /* skip broken refs after restore */
      }
    }
  })
  tx()
}

/** Legacy note-only API (delegates to entity links). */
export function listLinkedNotes(fromNoteId: number) {
  return listNoteLinksBundle(fromNoteId).outgoing
    .filter((item) => item.target.kind === 'note')
    .map((item) => {
      if (item.target.kind !== 'note') throw new Error('unexpected')
      const db = getDb()
      const n = db
        .prepare(
          `SELECT id, kind, title, body, scheduled_start_iso, updated_at
           FROM user_notes WHERE id = ?`
        )
        .get(item.target.noteId) as {
        id: number
        kind: 'mail' | 'calendar' | 'standalone'
        title: string | null
        body: string
        scheduled_start_iso: string | null
        updated_at: string
      }
      return {
        id: n.id,
        kind: n.kind,
        title: n.title,
        body: n.body,
        scheduledStartIso: n.scheduled_start_iso,
        updatedAt: n.updated_at
      }
    })
}

export function addNoteLink(fromNoteId: number, toNoteId: number): void {
  addNoteEntityLink(fromNoteId, { kind: 'note', noteId: toNoteId })
}

export function removeNoteLink(fromNoteId: number, toNoteId: number): void {
  const bundle = listNoteLinksBundle(fromNoteId)
  const match = bundle.outgoing.find(
    (item) => item.target.kind === 'note' && item.target.noteId === toNoteId
  )
  if (match) removeNoteEntityLink(match.linkId, fromNoteId)
}

export function listAllNoteLinksForBackup(): Array<{
  fromNoteId: number
  toNoteId: number
  createdAt: string
}> {
  const rows = getDb()
    .prepare(
      `SELECT from_note_id, to_note_id, created_at FROM user_note_entity_links
       WHERE target_kind = 'note' ORDER BY id`
    )
    .all() as Array<{ from_note_id: number; to_note_id: number; created_at: string }>
  return rows.map((r) => ({
    fromNoteId: r.from_note_id,
    toNoteId: r.to_note_id,
    createdAt: r.created_at
  }))
}

export function listUserNoteLinksForSettingsBackup(noteIdsInOrder: number[]) {
  const idToIndex = new Map(noteIdsInOrder.map((id, index) => [id, index]))
  return listAllNoteLinksForBackup().flatMap((link) => {
    const fromNoteIndex = idToIndex.get(link.fromNoteId)
    const toNoteIndex = idToIndex.get(link.toNoteId)
    if (fromNoteIndex === undefined || toNoteIndex === undefined) return []
    return [{ fromNoteIndex, toNoteIndex, createdAt: link.createdAt }]
  })
}

export function replaceAllNoteLinksFromBackup(
  links: Array<{ fromNoteIndex: number; toNoteIndex: number; createdAt: string }>,
  noteIdByIndex: number[]
): void {
  const entityLinks: SettingsBackupEntityLinkSnapshot[] = links.map((l) => ({
    fromNoteIndex: l.fromNoteIndex,
    toNoteIndex: l.toNoteIndex,
    targetKind: 'note' as const,
    createdAt: l.createdAt
  }))
  replaceAllEntityLinksFromBackup(entityLinks, noteIdByIndex)
}

export function deleteAllLinksForNote(noteId: number): void {
  deleteAllEntityLinksForNote(noteId)
}
