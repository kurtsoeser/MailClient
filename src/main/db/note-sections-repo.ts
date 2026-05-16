import { normalizeGraphHexColor } from '@shared/graph-calendar-colors'
import { getDb } from './index'
import type {
  NoteSection,
  NoteSectionCreateInput,
  NoteSectionReorderInput,
  NoteSectionUpdateInput,
  SettingsBackupNoteSectionSnapshot
} from '@shared/types'

interface NoteSectionRow {
  id: number
  name: string
  icon: string | null
  icon_color: string | null
  parent_id: number | null
  sort_order: number
  created_at: string
  updated_at: string
}

function rowToSection(row: NoteSectionRow): NoteSection {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    iconColor: row.icon_color,
    parentId: row.parent_id,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function normalizeNullableText(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function normalizeIconColor(value: string | null | undefined): string | null {
  if (value === undefined) return null
  if (value == null) return null
  const normalized = normalizeGraphHexColor(value)
  return normalized
}

function assertPositiveId(id: number, label: string): void {
  if (!Number.isFinite(id) || id <= 0) throw new Error(`${label} fehlt.`)
}

function assertText(value: string, label: string): void {
  if (!value.trim()) throw new Error(`${label} fehlt.`)
}

function normalizeParentId(parentId: number | null | undefined): number | null {
  if (parentId == null) return null
  assertPositiveId(parentId, 'Eltern-Sektions-ID')
  return parentId
}

function wouldCreateParentCycle(sectionId: number, newParentId: number): boolean {
  let cur: number | null = newParentId
  while (cur != null) {
    if (cur === sectionId) return true
    const row = getDb()
      .prepare<[number], { parent_id: number | null } | undefined>(
        'SELECT parent_id FROM note_sections WHERE id = ?'
      )
      .get(cur)
    cur = row?.parent_id ?? null
  }
  return false
}

function nextSortOrderForParent(parentId: number | null): number {
  const row = parentId == null
    ? getDb()
        .prepare<[], { next_order: number } | undefined>(
          `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order
           FROM note_sections WHERE parent_id IS NULL`
        )
        .get()
    : getDb()
        .prepare<[number], { next_order: number } | undefined>(
          `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order
           FROM note_sections WHERE parent_id = ?`
        )
        .get(parentId)
  return row?.next_order ?? 0
}

export function listNoteSections(): NoteSection[] {
  const rows = getDb()
    .prepare(
      `SELECT id, name, icon, icon_color, parent_id, sort_order, created_at, updated_at
       FROM note_sections
       ORDER BY sort_order ASC, id ASC`
    )
    .all() as NoteSectionRow[]
  return rows.map(rowToSection)
}

export function getNoteSectionById(id: number): NoteSection | null {
  assertPositiveId(id, 'Sektions-ID')
  const row = getDb()
    .prepare<[number], NoteSectionRow>(
      `SELECT id, name, icon, parent_id, sort_order, created_at, updated_at
       FROM note_sections WHERE id = ?`
    )
    .get(id)
  return row ? rowToSection(row) : null
}

export function createNoteSection(input: NoteSectionCreateInput): NoteSection {
  assertText(input.name, 'Name')
  const parentId = normalizeParentId(input.parentId)
  if (parentId != null) {
    const parent = getNoteSectionById(parentId)
    if (!parent) throw new Error('Eltern-Sektion nicht gefunden.')
  }
  const sortOrder = nextSortOrderForParent(parentId)
  const info = getDb()
    .prepare(
      `INSERT INTO note_sections (name, icon, icon_color, parent_id, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    )
    .run(
      input.name.trim(),
      normalizeNullableText(input.icon),
      normalizeIconColor(input.iconColor),
      parentId,
      sortOrder
    )
  const section = getNoteSectionById(Number(info.lastInsertRowid))
  if (!section) throw new Error('Sektion konnte nicht gelesen werden.')
  return section
}

export function updateNoteSection(input: NoteSectionUpdateInput): NoteSection {
  assertPositiveId(input.id, 'Sektions-ID')
  const existing = getNoteSectionById(input.id)
  if (!existing) throw new Error('Sektion nicht gefunden.')

  let parentId = existing.parentId
  if (input.parentId !== undefined) {
    parentId = normalizeParentId(input.parentId)
    if (parentId != null) {
      if (parentId === input.id) throw new Error('Eine Sektion kann nicht ihre eigene Untersektion sein.')
      const parent = getNoteSectionById(parentId)
      if (!parent) throw new Error('Eltern-Sektion nicht gefunden.')
      if (wouldCreateParentCycle(input.id, parentId)) {
        throw new Error('Zyklische Verschachtelung ist nicht erlaubt.')
      }
    }
  }

  getDb()
    .prepare(
      `UPDATE note_sections
       SET name = ?, icon = ?, icon_color = ?, parent_id = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(
      input.name !== undefined ? input.name.trim() : existing.name,
      input.icon !== undefined ? normalizeNullableText(input.icon) : existing.icon,
      input.iconColor !== undefined ? normalizeIconColor(input.iconColor) : existing.iconColor,
      parentId,
      input.id
    )
  const section = getNoteSectionById(input.id)
  if (!section) throw new Error('Sektion konnte nicht gelesen werden.')
  return section
}

export function deleteNoteSection(id: number): void {
  assertPositiveId(id, 'Sektions-ID')
  getDb().prepare('DELETE FROM note_sections WHERE id = ?').run(id)
}

export function reorderNoteSections(input: NoteSectionReorderInput): void {
  const parentId = normalizeParentId(input.parentId)
  const ids = input.orderedIds.filter((id) => Number.isFinite(id) && id > 0)
  const db = getDb()
  const stmt = db.prepare(
    'UPDATE note_sections SET sort_order = ?, updated_at = datetime("now") WHERE id = ?'
  )
  const tx = db.transaction(() => {
    for (const [index, id] of ids.entries()) {
      const row = db
        .prepare<[number], { parent_id: number | null } | undefined>(
          'SELECT parent_id FROM note_sections WHERE id = ?'
        )
        .get(id)
      if (!row) continue
      const rowParent = row.parent_id ?? null
      if (rowParent !== parentId) continue
      stmt.run(index, id)
    }
  })
  tx()
}

export function listNoteSectionsForSettingsBackup(): SettingsBackupNoteSectionSnapshot[] {
  const sections = listNoteSections()
  const idToIndex = new Map(sections.map((s, index) => [s.id, index] as const))
  return sections.map((s) => ({
    name: s.name,
    icon: s.icon,
    iconColor: s.iconColor,
    sortOrder: s.sortOrder,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    parentIndex: s.parentId != null ? (idToIndex.get(s.parentId) ?? null) : null
  }))
}

export function replaceAllNoteSectionsFromBackup(rows: SettingsBackupNoteSectionSnapshot[]): number[] {
  const db = getDb()
  const ins = db.prepare(
    `INSERT INTO note_sections (name, icon, icon_color, parent_id, sort_order, created_at, updated_at)
     VALUES (@name, @icon, @icon_color, NULL, @sort_order, @created_at, @updated_at)`
  )
  const ids: number[] = []
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM note_sections').run()
    for (const r of rows) {
      const name = typeof r.name === 'string' ? r.name.trim() : ''
      if (!name) {
        ids.push(0)
        continue
      }
      const info = ins.run({
        name,
        icon: normalizeNullableText(r.icon),
        icon_color: normalizeIconColor(r.iconColor),
        sort_order: Number.isFinite(r.sortOrder) ? Math.floor(r.sortOrder) : 0,
        created_at: r.createdAt,
        updated_at: r.updatedAt
      })
      ids.push(Number(info.lastInsertRowid))
    }
    const setParent = db.prepare('UPDATE note_sections SET parent_id = ? WHERE id = ?')
    rows.forEach((r, index) => {
      const id = ids[index]
      if (!id) return
      const pi = r.parentIndex
      if (pi == null || !Number.isFinite(pi) || pi < 0 || pi >= ids.length) return
      const parentId = ids[Math.floor(pi)]
      if (!parentId || parentId === id) return
      setParent.run(parentId, id)
    })
  })
  tx()
  return ids
}
