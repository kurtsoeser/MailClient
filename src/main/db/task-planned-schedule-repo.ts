import { getDb } from './index'

export interface TaskPlannedScheduleRow {
  taskKey: string
  plannedStartIso: string
  plannedEndIso: string
  updatedAt: string
}

function rowFromDb(r: {
  task_key: string
  planned_start_iso: string
  planned_end_iso: string
  updated_at: string
}): TaskPlannedScheduleRow {
  return {
    taskKey: r.task_key,
    plannedStartIso: r.planned_start_iso,
    plannedEndIso: r.planned_end_iso,
    updatedAt: r.updated_at
  }
}

export function getTaskPlannedSchedule(taskKey: string): TaskPlannedScheduleRow | null {
  const key = taskKey.trim()
  if (!key) return null
  const db = getDb()
  const row = db
    .prepare(
      `SELECT task_key, planned_start_iso, planned_end_iso, updated_at
       FROM task_planned_schedule WHERE task_key = ?`
    )
    .get(key) as
    | {
        task_key: string
        planned_start_iso: string
        planned_end_iso: string
        updated_at: string
      }
    | undefined
  return row ? rowFromDb(row) : null
}

export function listTaskPlannedSchedulesForKeys(taskKeys: string[]): TaskPlannedScheduleRow[] {
  const keys = [...new Set(taskKeys.map((k) => k.trim()).filter(Boolean))]
  if (keys.length === 0) return []
  const db = getDb()
  const placeholders = keys.map(() => '?').join(', ')
  const rows = db
    .prepare(
      `SELECT task_key, planned_start_iso, planned_end_iso, updated_at
       FROM task_planned_schedule WHERE task_key IN (${placeholders})`
    )
    .all(...keys) as Array<{
    task_key: string
    planned_start_iso: string
    planned_end_iso: string
    updated_at: string
  }>
  return rows.map(rowFromDb)
}

export function upsertTaskPlannedSchedule(
  taskKey: string,
  plannedStartIso: string,
  plannedEndIso: string
): void {
  const key = taskKey.trim()
  const start = plannedStartIso.trim()
  const end = plannedEndIso.trim()
  if (!key || !start || !end) throw new Error('Planungszeit unvollständig.')
  if (end <= start) throw new Error('Planungsende muss nach dem Beginn liegen.')
  const db = getDb()
  db.prepare(
    `INSERT INTO task_planned_schedule (task_key, planned_start_iso, planned_end_iso, updated_at)
     VALUES (@task_key, @planned_start_iso, @planned_end_iso, datetime('now'))
     ON CONFLICT(task_key) DO UPDATE SET
       planned_start_iso = excluded.planned_start_iso,
       planned_end_iso = excluded.planned_end_iso,
       updated_at = datetime('now')`
  ).run({
    task_key: key,
    planned_start_iso: start,
    planned_end_iso: end
  })
}

export function deleteTaskPlannedSchedule(taskKey: string): void {
  const key = taskKey.trim()
  if (!key) return
  const db = getDb()
  db.prepare(`DELETE FROM task_planned_schedule WHERE task_key = ?`).run(key)
}

/** Entfernt alle Planungseinträge für Cloud-Aufgaben dieses Kontos (`task:{accountId}:…`). */
export function deleteTaskPlannedSchedulesForAccount(accountId: string): void {
  const id = accountId.trim()
  if (!id) return
  const escaped = id.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
  const pattern = `task:${escaped}:%`
  getDb()
    .prepare(`DELETE FROM task_planned_schedule WHERE task_key LIKE ? ESCAPE '\\'`)
    .run(pattern)
}
