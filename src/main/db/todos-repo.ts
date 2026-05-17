import { getDb } from './index'
import type { MailListItem, TodoDueKindList, TodoOpenCounts } from '@shared/types'
import { rowToListItem } from './messages-repo'
import { computeTodoDisplayBounds, type TodoDisplayBounds } from '../todo-due-buckets'

const TODO_JOIN_SELECT = `
         t.id as todo_id,
         t.due_kind as todo_due_kind,
         t.due_at as todo_due_at,
         t.completed_at as todo_completed_at,
         t.todo_start_at as todo_start_at,
         t.todo_end_at as todo_end_at`

interface MessageJoinRow {
  id: number
  account_id: string
  folder_id: number | null
  thread_id: number | null
  remote_id: string
  remote_thread_id: string | null
  subject: string | null
  from_addr: string | null
  from_name: string | null
  to_addrs: string | null
  cc_addrs: string | null
  snippet: string | null
  body_html: string | null
  body_text: string | null
  sent_at: string | null
  received_at: string | null
  is_read: number
  is_flagged: number
  has_attachments: number
  importance: string | null
  snoozed_until: string | null
  waiting_for_reply_until: string | null
  list_unsubscribe: string | null
  list_unsubscribe_post: string | null
}

export interface OpenTodoRow {
  id: number
  messageId: number
  accountId: string
  dueKind: string
  dueAt: string | null
  todoStartAt: string | null
  todoEndAt: string | null
}

const M_LIST = `
  m.id, m.account_id, m.folder_id, m.thread_id, m.remote_id, m.remote_thread_id,
  m.subject, m.from_addr, m.from_name, m.to_addrs, m.cc_addrs, m.snippet,
  NULL as body_html, NULL as body_text,
  m.sent_at, m.received_at, m.is_read, m.is_flagged, m.has_attachments, m.importance,
  m.snoozed_until, m.waiting_for_reply_until, m.list_unsubscribe, m.list_unsubscribe_post
`

/** Offene Mail-ToDos: nur bei aktivem Follow-up (Graph `flagged`; Legacy NULL). */
const OPEN_TODO_MAIL_FOLLOW_UP_SQL = `(m.follow_up_flag_status IS NULL OR m.follow_up_flag_status = 'flagged')`

/** Erledigt-Liste: ausblenden sobald die Mail `notFlagged` ist (Message = Quelle der Wahrheit). */
const DONE_TODO_MAIL_FOLLOW_UP_SQL = `(m.follow_up_flag_status IS NULL OR m.follow_up_flag_status != 'notFlagged')`

function rowToTodoListItem(
  r: MessageJoinRow & {
    todo_id: number
    todo_due_kind: string
    todo_due_at: string | null
    todo_completed_at: string | null
    todo_start_at?: string | null
    todo_end_at?: string | null
  }
): MailListItem {
  const base = rowToListItem(r)
  return {
    ...base,
    todoId: r.todo_id,
    todoDueKind: r.todo_due_kind,
    todoDueAt: r.todo_due_at,
    todoStartAt: r.todo_start_at ?? null,
    todoEndAt: r.todo_end_at ?? null,
    todoCompletedAt: r.todo_completed_at
  }
}

function todoItemOverlapsRange(
  item: Pick<MailListItem, 'todoDueAt' | 'todoStartAt' | 'todoEndAt'>,
  rangeStartIso: string,
  rangeEndIso: string
): boolean {
  const r0 = new Date(rangeStartIso).getTime()
  const r1 = new Date(rangeEndIso).getTime()
  if (!Number.isFinite(r0) || !Number.isFinite(r1)) return false
  const startIso = item.todoStartAt ?? item.todoDueAt
  if (!startIso) return false
  const s = new Date(startIso).getTime()
  if (!Number.isFinite(s)) return false
  let e: number
  if (item.todoEndAt) {
    e = new Date(item.todoEndAt).getTime()
    if (!Number.isFinite(e) || e <= s) e = s + 60_000
  } else if (item.todoStartAt) {
    e = s + 60 * 60 * 1000
  } else {
    e = s + 25 * 60 * 1000
  }
  return s < r1 && e > r0
}

export function getOpenTodoByMessageId(messageId: number): OpenTodoRow | null {
  const db = getDb()
  const row = db
    .prepare<
      [number],
      {
        id: number
        message_id: number
        account_id: string
        due_kind: string
        due_at: string | null
        todo_start_at: string | null
        todo_end_at: string | null
      }
    >(
      `SELECT id, message_id, account_id, due_kind, due_at, todo_start_at, todo_end_at
       FROM todos
       WHERE message_id = ? AND status = 'open'`
    )
    .get(messageId)
  if (!row) return null
  return {
    id: row.id,
    messageId: row.message_id,
    accountId: row.account_id,
    dueKind: row.due_kind,
    dueAt: row.due_at,
    todoStartAt: row.todo_start_at,
    todoEndAt: row.todo_end_at
  }
}

export function getTodoById(todoId: number): {
  id: number
  messageId: number
  accountId: string
  status: string
  dueKind: string
  dueAt: string | null
  todoStartAt: string | null
  todoEndAt: string | null
  completedAt: string | null
} | null {
  const db = getDb()
  const row = db
    .prepare<
      [number],
      {
        id: number
        message_id: number
        account_id: string
        status: string
        due_kind: string
        due_at: string | null
        todo_start_at: string | null
        todo_end_at: string | null
        completed_at: string | null
      }
    >(
      `SELECT id, message_id, account_id, status, due_kind, due_at, todo_start_at, todo_end_at, completed_at
       FROM todos WHERE id = ?`
    )
    .get(todoId)
  if (!row) return null
  return {
    id: row.id,
    messageId: row.message_id,
    accountId: row.account_id,
    status: row.status,
    dueKind: row.due_kind,
    dueAt: row.due_at,
    todoStartAt: row.todo_start_at,
    todoEndAt: row.todo_end_at,
    completedAt: row.completed_at
  }
}

export function insertOpenTodo(input: {
  messageId: number
  accountId: string
  dueKind: string
  dueAt: string | null
  todoStartAt?: string | null
  todoEndAt?: string | null
}): number {
  const db = getDb()
  const res = db
    .prepare(
      `INSERT INTO todos (message_id, account_id, due_kind, due_at, todo_start_at, todo_end_at, status, created_at)
       VALUES (@messageId, @accountId, @dueKind, @dueAt, @todoStartAt, @todoEndAt, 'open', datetime('now'))`
    )
    .run({
      messageId: input.messageId,
      accountId: input.accountId,
      dueKind: input.dueKind,
      dueAt: input.dueAt,
      todoStartAt: input.todoStartAt ?? null,
      todoEndAt: input.todoEndAt ?? null
    })
  return Number(res.lastInsertRowid)
}

export function updateOpenTodoDue(
  todoId: number,
  dueKind: string,
  dueAt: string | null
): void {
  const db = getDb()
  db.prepare(
    `UPDATE todos SET due_kind = ?, due_at = ?, todo_start_at = NULL, todo_end_at = NULL
     WHERE id = ? AND status = ?`
  ).run(dueKind, dueAt, todoId, 'open')
}

/** Setzt Kalender-Start/Ende, Faelligkeit (`due_at`) und Bucket (`due_kind`) fuer ein offenes ToDo. */
export function updateOpenTodoCalendarWindow(
  todoId: number,
  startIso: string,
  endIso: string,
  dueAt: string | null,
  dueKind: string
): void {
  const db = getDb()
  db.prepare(
    `UPDATE todos SET todo_start_at = ?, todo_end_at = ?, due_at = ?, due_kind = ? WHERE id = ? AND status = ?`
  ).run(startIso, endIso, dueAt, dueKind, todoId, 'open')
}

export function restoreOpenTodoState(
  todoId: number,
  dueKind: string,
  dueAt: string | null,
  startAt: string | null,
  endAt: string | null
): void {
  const db = getDb()
  db.prepare(
    `UPDATE todos SET due_kind = ?, due_at = ?, todo_start_at = ?, todo_end_at = ?
     WHERE id = ? AND status = ?`
  ).run(dueKind, dueAt, startAt, endAt, todoId, 'open')
}

export function markTodoDone(todoId: number): void {
  const db = getDb()
  db.prepare(
    `UPDATE todos
     SET status = 'done', completed_at = datetime('now')
     WHERE id = ? AND status = 'open'`
  ).run(todoId)
}

export function reopenTodo(
  todoId: number,
  dueKind: string,
  dueAt: string | null,
  startAt: string | null = null,
  endAt: string | null = null
): void {
  const db = getDb()
  db.prepare(
    `UPDATE todos
     SET status = 'open', completed_at = NULL, due_kind = ?, due_at = ?, todo_start_at = ?, todo_end_at = ?
     WHERE id = ?`
  ).run(dueKind, dueAt, startAt, endAt, todoId)
}

export function deleteTodoById(todoId: number): void {
  const db = getDb()
  db.prepare('DELETE FROM todos WHERE id = ?').run(todoId)
}

/** Entfernt alle Mail-ToDos zu einer Nachricht (offen und erledigt). Gibt die Anzahl geloeschter Zeilen zurueck. */
export function deleteTodosByMessageId(messageId: number): number {
  const db = getDb()
  const r = db.prepare('DELETE FROM todos WHERE message_id = ?').run(messageId)
  return r.changes
}

type OpenTodoDisplayKind = Exclude<TodoDueKindList, 'done'>

function listOpenTodoMessagesByDueAtBucket(
  accountId: string | null,
  bucket: OpenTodoDisplayKind,
  b: TodoDisplayBounds,
  limit: number
): MailListItem[] {
  const db = getDb()

  let whereSql: string
  const params: string[] = []

  switch (bucket) {
    case 'overdue':
      whereSql = 't.due_at IS NOT NULL AND t.due_at < ?'
      params.push(b.startTodayIso)
      break
    case 'today':
      whereSql = 't.due_at IS NOT NULL AND t.due_at >= ? AND t.due_at <= ?'
      params.push(b.startTodayIso, b.endTodayIso)
      break
    case 'tomorrow':
      whereSql = 't.due_at IS NOT NULL AND t.due_at >= ? AND t.due_at <= ?'
      params.push(b.startTomorrowIso, b.endTomorrowIso)
      break
    case 'this_week':
      whereSql = 't.due_at IS NOT NULL AND t.due_at > ? AND t.due_at <= ?'
      params.push(b.endTomorrowIso, b.endWeekIso)
      break
    case 'later':
      whereSql = '(t.due_at IS NULL OR t.due_at > ?)'
      params.push(b.endWeekIso)
      break
    default:
      return []
  }

  const accountClause = accountId != null ? 'AND m.account_id = ?' : ''
  const sql = `SELECT
         ${TODO_JOIN_SELECT},
         ${M_LIST}
       FROM todos t
       INNER JOIN messages m ON m.id = t.message_id
       WHERE t.status = 'open'
         AND (${whereSql})
         AND ${OPEN_TODO_MAIL_FOLLOW_UP_SQL}
         ${accountClause}
       ORDER BY
         CASE WHEN t.due_at IS NULL THEN 1 ELSE 0 END,
         t.due_at ASC,
         m.received_at DESC NULLS LAST,
         m.id DESC
       LIMIT ?`

  const stmt = db.prepare(sql)

  if (accountId != null) {
    const rows = stmt.all(...params, accountId, limit) as Array<
      MessageJoinRow & {
        todo_id: number
        todo_due_kind: string
        todo_due_at: string | null
        todo_completed_at: string | null
        todo_start_at: string | null
        todo_end_at: string | null
      }
    >
    return rows.map(rowToTodoListItem)
  }

  const rows = stmt.all(...params, limit) as Array<
    MessageJoinRow & {
      todo_id: number
      todo_due_kind: string
      todo_due_at: string | null
      todo_completed_at: string | null
      todo_start_at: string | null
      todo_end_at: string | null
    }
  >
  return rows.map(rowToTodoListItem)
}

/** Alle offenen Mail-ToDos (alle Buckets) in einer Abfrage — fuer vereinheitlichte ToDo-Liste. */
export function listAllOpenTodoMessagesMerged(
  accountId: string | null,
  limit = 2000
): MailListItem[] {
  const db = getDb()
  const accountClause = accountId != null ? 'AND m.account_id = ?' : ''
  const sql = `SELECT
         ${TODO_JOIN_SELECT},
         ${M_LIST}
       FROM todos t
       INNER JOIN messages m ON m.id = t.message_id
       WHERE t.status = 'open'
         AND ${OPEN_TODO_MAIL_FOLLOW_UP_SQL}
         ${accountClause}
       ORDER BY
         CASE WHEN t.due_at IS NULL THEN 1 ELSE 0 END,
         t.due_at ASC,
         m.received_at DESC NULLS LAST,
         m.id DESC
       LIMIT ?`
  const rows =
    accountId != null
      ? (db.prepare(sql).all(accountId, limit) as Array<
          MessageJoinRow & {
            todo_id: number
            todo_due_kind: string
            todo_due_at: string | null
            todo_completed_at: string | null
            todo_start_at: string | null
            todo_end_at: string | null
          }
        >)
      : (db.prepare(sql).all(limit) as Array<
          MessageJoinRow & {
            todo_id: number
            todo_due_kind: string
            todo_due_at: string | null
            todo_completed_at: string | null
            todo_start_at: string | null
            todo_end_at: string | null
          }
        >)
  return rows.map(rowToTodoListItem)
}

export function listTodoMessagesWithMeta(
  accountId: string | null,
  dueKind: TodoDueKindList,
  timeZone: string,
  limit = 200
): MailListItem[] {
  const db = getDb()
  if (dueKind === 'done') {
    if (accountId != null) {
      const rows = db
        .prepare<[string, number], MessageJoinRow & {
          todo_id: number
          todo_due_kind: string
          todo_due_at: string | null
          todo_completed_at: string | null
          todo_start_at: string | null
          todo_end_at: string | null
        }>(
          `SELECT
             ${TODO_JOIN_SELECT},
             ${M_LIST}
           FROM todos t
           INNER JOIN messages m ON m.id = t.message_id
           WHERE m.account_id = ?
             AND t.status = 'done'
             AND ${DONE_TODO_MAIL_FOLLOW_UP_SQL}
           ORDER BY t.completed_at DESC NULLS LAST, t.id DESC
           LIMIT ?`
        )
        .all(accountId, limit)
      return rows.map(rowToTodoListItem)
    }
    const rows = db
      .prepare<[number], MessageJoinRow & {
        todo_id: number
        todo_due_kind: string
        todo_due_at: string | null
        todo_completed_at: string | null
        todo_start_at: string | null
        todo_end_at: string | null
      }>(
        `SELECT
           ${TODO_JOIN_SELECT},
           ${M_LIST}
         FROM todos t
         INNER JOIN messages m ON m.id = t.message_id
         WHERE t.status = 'done'
           AND ${DONE_TODO_MAIL_FOLLOW_UP_SQL}
         ORDER BY t.completed_at DESC NULLS LAST, t.id DESC
         LIMIT ?`
      )
      .all(limit)
    return rows.map(rowToTodoListItem)
  }

  const b = computeTodoDisplayBounds(Date.now(), timeZone)
  return listOpenTodoMessagesByDueAtBucket(accountId, dueKind, b, limit)
}

/**
 * Offene Mail-ToDos, die den sichtbaren Kalenderbereich schneiden (Start/Ende oder nur `due_at`).
 */
export function listOpenTodoMessagesWithDueAtInRange(
  accountId: string | null,
  rangeStartIso: string,
  rangeEndIso: string,
  limit = 500
): MailListItem[] {
  const db = getDb()
  const accountClause = accountId != null ? 'AND m.account_id = ?' : ''
  const broadLimit = 4000
  const sql = `SELECT
     ${TODO_JOIN_SELECT},
     ${M_LIST}
   FROM todos t
   INNER JOIN messages m ON m.id = t.message_id
   WHERE t.status = 'open'
     AND (t.due_at IS NOT NULL OR t.todo_start_at IS NOT NULL)
     AND ${OPEN_TODO_MAIL_FOLLOW_UP_SQL}
     ${accountClause}
   ORDER BY COALESCE(t.todo_start_at, t.due_at, '') DESC
   LIMIT ?`

  type Row = MessageJoinRow & {
    todo_id: number
    todo_due_kind: string
    todo_due_at: string | null
    todo_completed_at: string | null
    todo_start_at: string | null
    todo_end_at: string | null
  }

  const rows =
    accountId != null
      ? (db.prepare(sql).all(accountId, broadLimit) as Row[])
      : (db.prepare(sql).all(broadLimit) as Row[])

  const mapped = rows.map(rowToTodoListItem)
  const filtered = mapped.filter((item) => todoItemOverlapsRange(item, rangeStartIso, rangeEndIso))
  return filtered.slice(0, limit)
}

export function countOpenTodosGlobal(timeZone: string): TodoOpenCounts {
  const db = getDb()
  const b = computeTodoDisplayBounds(Date.now(), timeZone)
  const row = db
    .prepare<
      [string, string, string, string, string, string, string, string],
      {
        overdue: number
        today: number
        tomorrow: number
        this_week: number
        later: number
      }
    >(
      `SELECT
        COALESCE(SUM(CASE WHEN t.due_at IS NOT NULL AND t.due_at < ? AND ${OPEN_TODO_MAIL_FOLLOW_UP_SQL} THEN 1 ELSE 0 END), 0) as overdue,
        COALESCE(SUM(CASE WHEN t.due_at IS NOT NULL AND t.due_at >= ? AND t.due_at <= ? AND ${OPEN_TODO_MAIL_FOLLOW_UP_SQL} THEN 1 ELSE 0 END), 0) as today,
        COALESCE(SUM(CASE WHEN t.due_at IS NOT NULL AND t.due_at >= ? AND t.due_at <= ? AND ${OPEN_TODO_MAIL_FOLLOW_UP_SQL} THEN 1 ELSE 0 END), 0) as tomorrow,
        COALESCE(SUM(CASE WHEN t.due_at IS NOT NULL AND t.due_at > ? AND t.due_at <= ? AND ${OPEN_TODO_MAIL_FOLLOW_UP_SQL} THEN 1 ELSE 0 END), 0) as this_week,
        COALESCE(SUM(CASE WHEN (t.due_at IS NULL OR t.due_at > ?) AND ${OPEN_TODO_MAIL_FOLLOW_UP_SQL} THEN 1 ELSE 0 END), 0) as later
       FROM todos t
       INNER JOIN messages m ON m.id = t.message_id
       WHERE t.status = 'open'`
    )
    .get(
      b.startTodayIso,
      b.startTodayIso,
      b.endTodayIso,
      b.startTomorrowIso,
      b.endTomorrowIso,
      b.endTomorrowIso,
      b.endWeekIso,
      b.endWeekIso
    )
  return {
    overdue: row?.overdue ?? 0,
    today: row?.today ?? 0,
    tomorrow: row?.tomorrow ?? 0,
    this_week: row?.this_week ?? 0,
    later: row?.later ?? 0
  }
}

export function countDoneTodosGlobal(): number {
  const db = getDb()
  const row = db
    .prepare<[], { c: number }>(
      `SELECT COUNT(*) as c
       FROM todos t
       INNER JOIN messages m ON m.id = t.message_id
       WHERE t.status = 'done' AND ${DONE_TODO_MAIL_FOLLOW_UP_SQL}`
    )
    .get()
  return row?.c ?? 0
}
