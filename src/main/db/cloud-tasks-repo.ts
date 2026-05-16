import { normalizeEntityIconColor } from '@shared/entity-icon-color'
import { getDb } from './index'
import type { TaskItemRow, TaskListRow } from '@shared/types'

interface TaskListDbRow {
  account_id: string
  list_id: string
  name: string
  is_default: number
  provider: string
}

interface CloudTaskDbRow {
  account_id: string
  list_id: string
  task_id: string
  title: string
  completed: number
  due_iso: string | null
  notes: string | null
  icon_id: string | null
  icon_color: string | null
}

function rowToTaskList(r: TaskListDbRow): TaskListRow {
  return {
    id: r.list_id,
    name: r.name,
    isDefault: r.is_default === 1,
    provider: r.provider as 'microsoft' | 'google'
  }
}

function rowToTaskItem(r: CloudTaskDbRow): TaskItemRow {
  return {
    id: r.task_id,
    listId: r.list_id,
    title: r.title,
    completed: r.completed === 1,
    dueIso: r.due_iso,
    notes: r.notes,
    iconId: r.icon_id?.trim() ? r.icon_id.trim() : null,
    iconColor: r.icon_color?.trim() ? r.icon_color.trim() : null
  }
}

const CLOUD_TASK_SELECT = `account_id, list_id, task_id, title, completed, due_iso, notes, icon_id, icon_color`

const UPSERT_LIST = `
  INSERT INTO task_lists (account_id, list_id, name, is_default, provider, synced_at)
  VALUES (@account_id, @list_id, @name, @is_default, @provider, datetime('now'))
  ON CONFLICT(account_id, list_id) DO UPDATE SET
    name = excluded.name,
    is_default = excluded.is_default,
    provider = excluded.provider,
    synced_at = datetime('now')
`

const UPSERT_TASK = `
  INSERT INTO cloud_tasks (
    account_id, list_id, task_id, title, completed, due_iso, notes, synced_at
  ) VALUES (
    @account_id, @list_id, @task_id, @title, @completed, @due_iso, @notes, datetime('now')
  )
  ON CONFLICT(account_id, list_id, task_id) DO UPDATE SET
    title = excluded.title,
    completed = excluded.completed,
    due_iso = excluded.due_iso,
    notes = excluded.notes,
    synced_at = datetime('now')
`

export function upsertTaskLists(accountId: string, lists: TaskListRow[]): void {
  if (lists.length === 0) return
  const db = getDb()
  const stmt = db.prepare(UPSERT_LIST)
  const tx = db.transaction((rows: TaskListRow[]) => {
    for (const list of rows) {
      stmt.run({
        account_id: accountId,
        list_id: list.id,
        name: list.name,
        is_default: list.isDefault ? 1 : 0,
        provider: list.provider
      })
    }
  })
  tx(lists)
}

export function listTaskListsFromCache(accountId: string): TaskListRow[] {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT account_id, list_id, name, is_default, provider
       FROM task_lists WHERE account_id = ?
       ORDER BY is_default DESC, name COLLATE NOCASE ASC`
    )
    .all(accountId) as TaskListDbRow[]
  return rows.map(rowToTaskList)
}

export function replaceTaskListsForAccount(accountId: string, lists: TaskListRow[]): void {
  const db = getDb()
  const keepIds = new Set(lists.map((l) => l.id))
  const tx = db.transaction(() => {
    const existing = db
      .prepare(`SELECT list_id FROM task_lists WHERE account_id = ?`)
      .all(accountId) as Array<{ list_id: string }>
    for (const row of existing) {
      if (!keepIds.has(row.list_id)) {
        db.prepare(`DELETE FROM cloud_tasks WHERE account_id = ? AND list_id = ?`).run(
          accountId,
          row.list_id
        )
        db.prepare(`DELETE FROM task_list_sync_state WHERE account_id = ? AND list_id = ?`).run(
          accountId,
          row.list_id
        )
        db.prepare(`DELETE FROM task_lists WHERE account_id = ? AND list_id = ?`).run(
          accountId,
          row.list_id
        )
      }
    }
    upsertTaskLists(accountId, lists)
  })
  tx()
}

export function upsertCloudTasks(accountId: string, tasks: TaskItemRow[]): void {
  if (tasks.length === 0) return
  const db = getDb()
  const stmt = db.prepare(UPSERT_TASK)
  const tx = db.transaction((rows: TaskItemRow[]) => {
    for (const task of rows) {
      stmt.run({
        account_id: accountId,
        list_id: task.listId,
        task_id: task.id,
        title: task.title,
        completed: task.completed ? 1 : 0,
        due_iso: task.dueIso,
        notes: task.notes
      })
    }
  })
  tx(tasks)
}

export function listCloudTasksFromCache(
  accountId: string,
  listId: string,
  opts?: { showCompleted?: boolean }
): TaskItemRow[] {
  const showCompleted = opts?.showCompleted !== false
  const db = getDb()
  const completedFilter = showCompleted ? '' : ' AND completed = 0'
  const rows = db
    .prepare(
      `SELECT ${CLOUD_TASK_SELECT}
       FROM cloud_tasks
       WHERE account_id = ? AND list_id = ?${completedFilter}
       ORDER BY completed ASC, due_iso IS NULL, due_iso ASC, title COLLATE NOCASE ASC`
    )
    .all(accountId, listId) as CloudTaskDbRow[]
  return rows.map(rowToTaskItem)
}

export function pruneCloudTasksInList(
  accountId: string,
  listId: string,
  keepTaskIds: Set<string>
): void {
  const db = getDb()
  const rows = db
    .prepare(`SELECT task_id FROM cloud_tasks WHERE account_id = ? AND list_id = ?`)
    .all(accountId, listId) as Array<{ task_id: string }>
  const del = db.prepare(
    `DELETE FROM cloud_tasks WHERE account_id = ? AND list_id = ? AND task_id = ?`
  )
  const tx = db.transaction(() => {
    for (const r of rows) {
      if (!keepTaskIds.has(r.task_id)) {
        del.run(accountId, listId, r.task_id)
      }
    }
  })
  tx()
}

export function deleteCloudTask(accountId: string, listId: string, taskId: string): void {
  getDb()
    .prepare(`DELETE FROM cloud_tasks WHERE account_id = ? AND list_id = ? AND task_id = ?`)
    .run(accountId, listId, taskId.trim())
}

export function getTaskListsSyncState(accountId: string): string | null {
  const row = getDb()
    .prepare(`SELECT last_synced_at FROM task_lists_sync_state WHERE account_id = ?`)
    .get(accountId) as { last_synced_at: string } | undefined
  return row?.last_synced_at ?? null
}

export function touchTaskListsSyncState(accountId: string): void {
  getDb()
    .prepare(
      `INSERT INTO task_lists_sync_state (account_id, last_synced_at)
       VALUES (?, datetime('now'))
       ON CONFLICT(account_id) DO UPDATE SET last_synced_at = datetime('now')`
    )
    .run(accountId)
}

export function invalidateTaskListsSyncState(accountId: string): void {
  getDb().prepare(`DELETE FROM task_lists_sync_state WHERE account_id = ?`).run(accountId)
}

export function getTaskListSyncState(accountId: string, listId: string): string | null {
  const row = getDb()
    .prepare(
      `SELECT last_synced_at FROM task_list_sync_state WHERE account_id = ? AND list_id = ?`
    )
    .get(accountId, listId) as { last_synced_at: string } | undefined
  return row?.last_synced_at ?? null
}

export function touchTaskListSyncState(accountId: string, listId: string): void {
  getDb()
    .prepare(
      `INSERT INTO task_list_sync_state (account_id, list_id, last_synced_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(account_id, list_id) DO UPDATE SET last_synced_at = datetime('now')`
    )
    .run(accountId, listId)
}

export function invalidateTaskListSyncState(accountId: string, listId?: string): void {
  const db = getDb()
  if (listId) {
    db.prepare(`DELETE FROM task_list_sync_state WHERE account_id = ? AND list_id = ?`).run(
      accountId,
      listId
    )
    return
  }
  db.prepare(`DELETE FROM task_list_sync_state WHERE account_id = ?`).run(accountId)
}

export function isTaskListSyncFresh(
  accountId: string,
  listId: string,
  staleMs: number
): boolean {
  const at = getTaskListSyncState(accountId, listId)
  if (!at) return false
  const t = Date.parse(at)
  if (Number.isNaN(t)) return false
  return Date.now() - t < staleMs
}

export function isTaskListsSyncFresh(accountId: string, staleMs: number): boolean {
  const at = getTaskListsSyncState(accountId)
  if (!at) return false
  const t = Date.parse(at)
  if (Number.isNaN(t)) return false
  return Date.now() - t < staleMs
}

export function patchCloudTaskDisplay(
  accountId: string,
  listId: string,
  taskId: string,
  patch: { iconId?: string | null; iconColor?: string | null }
): void {
  const sets: string[] = []
  const params: unknown[] = []
  if ('iconId' in patch) {
    sets.push('icon_id = ?')
    const trimmed = patch.iconId?.trim()
    params.push(trimmed ? trimmed : null)
  }
  if ('iconColor' in patch) {
    sets.push('icon_color = ?')
    params.push(normalizeEntityIconColor(patch.iconColor))
  }
  if (sets.length === 0) return
  params.push(accountId, listId, taskId.trim())
  getDb()
    .prepare(
      `UPDATE cloud_tasks SET ${sets.join(', ')}, synced_at = datetime('now')
       WHERE account_id = ? AND list_id = ? AND task_id = ?`
    )
    .run(...params)
}

export function getCloudTaskFromCache(
  accountId: string,
  listId: string,
  taskId: string
): TaskItemRow | null {
  const row = getDb()
    .prepare(
      `SELECT ${CLOUD_TASK_SELECT}
       FROM cloud_tasks WHERE account_id = ? AND list_id = ? AND task_id = ?`
    )
    .get(accountId, listId, taskId.trim()) as CloudTaskDbRow | undefined
  return row ? rowToTaskItem(row) : null
}

export function deleteCloudTasksDataForAccount(accountId: string): void {
  const db = getDb()
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM cloud_tasks WHERE account_id = ?').run(accountId)
    db.prepare('DELETE FROM task_lists WHERE account_id = ?').run(accountId)
    db.prepare('DELETE FROM task_lists_sync_state WHERE account_id = ?').run(accountId)
    db.prepare('DELETE FROM task_list_sync_state WHERE account_id = ?').run(accountId)
  })
  tx()
}
