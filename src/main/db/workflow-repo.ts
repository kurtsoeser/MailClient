import { getDb } from './index'
import type { WorkflowBoard, WorkflowColumn, TodoDueKindList } from '@shared/types'

const TODO_DUE_KINDS = new Set<TodoDueKindList>([
  'today',
  'tomorrow',
  'this_week',
  'later',
  'done',
  'overdue'
])

function parseTodoDueKindField(v: unknown): TodoDueKindList | null {
  if (typeof v !== 'string') return null
  if (TODO_DUE_KINDS.has(v as TodoDueKindList)) return v as TodoDueKindList
  return null
}

interface WorkflowRow {
  id: number
  name: string
  columns_json: string
  sort_order: number
}

function parseColumns(json: string): WorkflowColumn[] {
  try {
    const raw = JSON.parse(json) as unknown
    if (!Array.isArray(raw)) return []
    return raw
      .filter((c): c is Record<string, unknown> => c != null && typeof c === 'object')
      .map((c) => {
        const o = c as {
          id?: unknown
          title?: unknown
          quickStepId?: unknown
          todoDueKind?: unknown
        }
        const id = typeof o.id === 'string' ? o.id : ''
        const title = typeof o.title === 'string' ? o.title : ''
        const quickStepId =
          typeof o.quickStepId === 'number' && Number.isFinite(o.quickStepId)
            ? o.quickStepId
            : null
        const todoDueKind = parseTodoDueKindField(o.todoDueKind)
        const col: WorkflowColumn = { id, title, quickStepId }
        if (todoDueKind != null) col.todoDueKind = todoDueKind
        return col
      })
      .filter((c) => c.id.length > 0 && c.title.length > 0)
  } catch {
    return []
  }
}

export function listWorkflowBoards(): WorkflowBoard[] {
  const db = getDb()
  const rows = db
    .prepare<[], WorkflowRow>(
      `SELECT id, name, columns_json, sort_order FROM workflow_boards
       ORDER BY sort_order ASC, id ASC`
    )
    .all()
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    columns: parseColumns(r.columns_json),
    sortOrder: r.sort_order
  }))
}

export function updateWorkflowBoardColumns(boardId: number, columns: WorkflowColumn[]): void {
  const db = getDb()
  db.prepare(
    `UPDATE workflow_boards SET columns_json = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(JSON.stringify(columns), boardId)
}

/**
 * Vollstaendiger Ersatz aller Workflow-Boards (Einstellungen-Import).
 * Leere Liste: keine Aenderung (verhindert versehentlich leere DB).
 */
export function replaceAllWorkflowBoardsFromBackup(
  boards: Array<{
    id: number
    name?: string
    sortOrder?: number
    columns: WorkflowColumn[]
  }>
): void {
  if (boards.length === 0) return
  const db = getDb()
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM workflow_boards').run()
    const ins = db.prepare(
      `INSERT INTO workflow_boards (id, name, columns_json, sort_order, created_at, updated_at)
       VALUES (@id, @name, @columns_json, @sort_order, datetime('now'), datetime('now'))`
    )
    const sorted = [...boards].sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id
    )
    for (const b of sorted) {
      const name =
        typeof b.name === 'string' && b.name.trim()
          ? b.name.trim()
          : b.id === 1
            ? 'Standard'
            : `Board ${b.id}`
      const sortOrder =
        typeof b.sortOrder === 'number' && Number.isFinite(b.sortOrder) ? b.sortOrder : 0
      ins.run({
        id: b.id,
        name,
        columns_json: JSON.stringify(b.columns ?? []),
        sort_order: sortOrder
      })
    }
  })
  tx()
}
