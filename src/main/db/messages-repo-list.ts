import { getDb } from './index'
import type { MailListItem, MetaFolderCriteria, MetaFolderExceptionClause } from '@shared/types'
import { rowToListItem, type MessageRow } from './messages-repo-core'
export const LIST_COLUMNS = `
  id, account_id, folder_id, thread_id, remote_id, remote_thread_id,
  subject, from_addr, from_name, to_addrs, cc_addrs, snippet,
  NULL as body_html, NULL as body_text,
  sent_at, received_at, is_read, is_flagged, has_attachments, importance,
  snoozed_until, waiting_for_reply_until, list_unsubscribe, list_unsubscribe_post
`

/** Qualifizierte Spalten fuer JOINs (z. B. Inbox + offenes ToDo), damit `id` nicht mehrdeutig ist. */
const LIST_COLUMNS_M = `
  m.id, m.account_id, m.folder_id, m.thread_id, m.remote_id, m.remote_thread_id,
  m.subject, m.from_addr, m.from_name, m.to_addrs, m.cc_addrs, m.snippet,
  NULL as body_html, NULL as body_text,
  m.sent_at, m.received_at, m.is_read, m.is_flagged, m.has_attachments, m.importance,
  m.snoozed_until, m.waiting_for_reply_until, m.list_unsubscribe, m.list_unsubscribe_post
`

interface InboxOpenTodoJoinRow extends MessageRow {
  join_todo_id: number | null
  join_todo_due_kind: string | null
  join_todo_due_at: string | null
  join_todo_start_at: string | null
  join_todo_end_at: string | null
}

const OPEN_TODO_JOIN_SQL = `LEFT JOIN (
         SELECT message_id, MAX(id) as picked_todo_id
         FROM todos
         WHERE status = 'open'
         GROUP BY message_id
       ) open_pick ON open_pick.message_id = m.id
       LEFT JOIN todos t ON t.id = open_pick.picked_todo_id`

const SELECT_LIST_WITH_OPEN_TODO = `SELECT ${LIST_COLUMNS_M},
         t.id as join_todo_id,
         t.due_kind as join_todo_due_kind,
         t.due_at as join_todo_due_at,
         t.todo_start_at as join_todo_start_at,
         t.todo_end_at as join_todo_end_at`

function mapOpenTodoJoinRow(r: InboxOpenTodoJoinRow): MailListItem {
  const base = rowToListItem(r)
  if (r.join_todo_id == null) return base
  return {
    ...base,
    todoId: r.join_todo_id,
    todoDueKind: r.join_todo_due_kind,
    todoDueAt: r.join_todo_due_at,
    todoStartAt: r.join_todo_start_at,
    todoEndAt: r.join_todo_end_at
  }
}

function escapeSqlLikePattern(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

/**
 * FTS5-MATCH-String (Prefix-Tokens), konsistent mit {@link searchMessages}.
 */
export function normalizeMessagesFtsMatchQuery(rawQuery: string): string | null {
  const cleaned = rawQuery
    .trim()
    .replace(/["()]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .map((t) => `${t.replace(/[^\w\u00C0-\u017F]/g, '')}*`)
    .filter((t) => t.length > 1)
    .join(' ')
  return cleaned.length > 0 ? cleaned : null
}

export function metaFolderCriteriaHasActiveFilter(criteria: MetaFolderCriteria): boolean {
  if (normalizeMessagesFtsMatchQuery(criteria.textQuery ?? '')) return true
  for (const alt of criteria.textQueryOrAlternatives ?? []) {
    if (normalizeMessagesFtsMatchQuery(typeof alt === 'string' ? alt : '')) return true
  }
  if (criteria.unreadOnly) return true
  if (criteria.flaggedOnly) return true
  if (criteria.hasAttachmentsOnly) return true
  const from0 = criteria.fromContains?.trim()
  if (from0 && from0.length >= 2) return true
  for (const a of criteria.fromContainsOrAlternatives ?? []) {
    const f = typeof a === 'string' ? a.trim() : ''
    if (f.length >= 2) return true
  }
  const scope = criteria.scopeFolderIds?.filter((id) => Number.isFinite(id) && id > 0) ?? []
  if (scope.length > 0) return true
  return false
}

/** Mindestens ein auswertbarer Teilfilter (fuer Ausnahme-Zeilen). */
export function metaFolderExceptionClauseHasFilter(e: MetaFolderExceptionClause): boolean {
  if (normalizeMessagesFtsMatchQuery(e.textQuery ?? '')) return true
  if (e.unreadOnly) return true
  if (e.flaggedOnly) return true
  if (e.hasAttachmentsOnly) return true
  const from = e.fromContains?.trim()
  if (from && from.length >= 2) return true
  return false
}

type MetaFolderAtomSource = MetaFolderExceptionClause & Pick<
  MetaFolderCriteria,
  'textQueryOrAlternatives' | 'fromContainsOrAlternatives'
>

function collectMetaFolderAtomSqlFragments(src: MetaFolderAtomSource, params: unknown[]): string[] {
  const parts: string[] = []
  const ftsLines: string[] = []
  const t0 = src.textQuery?.trim()
  if (t0) ftsLines.push(t0)
  for (const alt of src.textQueryOrAlternatives ?? []) {
    if (typeof alt === 'string' && alt.trim()) ftsLines.push(alt.trim())
  }
  const ftsFrags: string[] = []
  for (const line of ftsLines) {
    const fts = normalizeMessagesFtsMatchQuery(line)
    if (fts) {
      ftsFrags.push(`m.id IN (SELECT rowid FROM messages_fts WHERE messages_fts MATCH ?)`)
      params.push(fts)
    }
  }
  if (ftsFrags.length === 1) parts.push(ftsFrags[0]!)
  else if (ftsFrags.length > 1) parts.push(`(${ftsFrags.join(' OR ')})`)
  if (src.unreadOnly) parts.push('m.is_read = 0')
  if (src.flaggedOnly) parts.push('m.is_flagged = 1')
  if (src.hasAttachmentsOnly) parts.push('m.has_attachments = 1')
  const fromLines: string[] = []
  const f0 = src.fromContains?.trim()
  if (f0) fromLines.push(f0)
  for (const alt of src.fromContainsOrAlternatives ?? []) {
    if (typeof alt === 'string' && alt.trim()) fromLines.push(alt.trim())
  }
  const fromFrags: string[] = []
  for (const fromQ of fromLines) {
    if (fromQ.length < 2) continue
    const like = `%${escapeSqlLikePattern(fromQ)}%`
    fromFrags.push(
      `(LOWER(IFNULL(m.from_addr,'')) LIKE LOWER(?) ESCAPE '\\' OR LOWER(IFNULL(m.from_name,'')) LIKE LOWER(?) ESCAPE '\\')`
    )
    params.push(like, like)
  }
  if (fromFrags.length === 1) parts.push(fromFrags[0]!)
  else if (fromFrags.length > 1) parts.push(`(${fromFrags.join(' OR ')})`)
  return parts
}

/** Oberkante fuer Meta-Ordner-Listen (neueste zuerst); verhindert unbounded SQL-Scans. */
export const DEFAULT_META_FOLDER_MESSAGE_LIST_LIMIT = 2000

/**
 * Mails passend zu Meta-Ordner-Kriterien (alle Konten, optional Ordner-Scope).
 */
export function listMessagesForMetaCriteria(
  criteria: MetaFolderCriteria,
  limit: number | null
): MailListItem[] {
  if (!metaFolderCriteriaHasActiveFilter(criteria)) return []
  const db = getDb()
  const clauses: string[] = []
  const params: unknown[] = []

  const scope = (criteria.scopeFolderIds ?? []).filter((id) => Number.isFinite(id) && id > 0) as number[]

  if (scope.length > 0) {
    clauses.push(`m.folder_id IN (${scope.map(() => '?').join(',')})`)
    params.push(...scope)
  } else {
    clauses.push(
      `(f.well_known IS NULL OR (f.well_known != 'deleteditems' AND f.well_known != 'junkemail'))`
    )
  }

  const atomSrc: MetaFolderAtomSource = {
    textQuery: criteria.textQuery,
    textQueryOrAlternatives: criteria.textQueryOrAlternatives,
    unreadOnly: criteria.unreadOnly,
    flaggedOnly: criteria.flaggedOnly,
    hasAttachmentsOnly: criteria.hasAttachmentsOnly,
    fromContains: criteria.fromContains,
    fromContainsOrAlternatives: criteria.fromContainsOrAlternatives
  }
  const posFrags = collectMetaFolderAtomSqlFragments(atomSrc, params)
  if (posFrags.length > 0) {
    const useOr = criteria.matchOp === 'or'
    if (useOr && posFrags.length > 1) {
      clauses.push(`(${posFrags.join(' OR ')})`)
    } else {
      clauses.push(posFrags.join(' AND '))
    }
  }

  const exList = criteria.exceptions?.filter((x) => metaFolderExceptionClauseHasFilter(x)) ?? []
  if (exList.length > 0) {
    const exSqlParts: string[] = []
    for (const ex of exList) {
      const fr = collectMetaFolderAtomSqlFragments(ex, params)
      if (fr.length === 0) continue
      exSqlParts.push(fr.length === 1 ? fr[0]! : `(${fr.join(' AND ')})`)
    }
    if (exSqlParts.length > 0) {
      clauses.push(
        exSqlParts.length === 1 ? `NOT (${exSqlParts[0]!})` : `NOT (${exSqlParts.join(' OR ')})`
      )
    }
  }

  const where = `WHERE ${clauses.join(' AND ')}`
  const normalizedLimit =
    limit != null && Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : null
  const limitSql = normalizedLimit != null ? ' LIMIT ?' : ''
  if (normalizedLimit != null) params.push(normalizedLimit)

  const sql = `${SELECT_LIST_WITH_OPEN_TODO}
       FROM messages m
       INNER JOIN folders f ON f.id = m.folder_id
       ${OPEN_TODO_JOIN_SQL}
       ${where}
       ORDER BY m.received_at DESC NULLS LAST, m.id DESC${limitSql}`

  const rows = db.prepare(sql).all(...params) as InboxOpenTodoJoinRow[]
  return rows.map(mapOpenTodoJoinRow)
}

export function listMessagesByFolder(folderId: number, limit = 100): MailListItem[] {
  const db = getDb()
  const sqlBody = `
       FROM messages m
       ${OPEN_TODO_JOIN_SQL}
       WHERE m.folder_id = ?
       ORDER BY m.received_at DESC NULLS LAST, m.id DESC`

  const rows = db
    .prepare<[number, number], InboxOpenTodoJoinRow>(`${SELECT_LIST_WITH_OPEN_TODO} ${sqlBody} LIMIT ?`)
    .all(folderId, limit)
  return rows.map(mapOpenTodoJoinRow)
}

export function listMessagesByAccount(accountId: string, limit = 100): MailListItem[] {
  const db = getDb()
  const rows = db
    .prepare<[string, number], MessageRow>(
      `SELECT ${LIST_COLUMNS} FROM messages
       WHERE account_id = ?
       ORDER BY received_at DESC NULLS LAST
       LIMIT ?`
    )
    .all(accountId, limit)
  return rows.map(rowToListItem)
}

export type ListInboxMessagesOptions = {
  /** Standard `true`. `false` spart den OPEN_TODO-JOIN (z. B. reine Unread-Listen). */
  includeOpenTodo?: boolean
}

/**
 * Alle Mails aus den Posteingaengen aller Konten (well_known = inbox), neueste zuerst.
 * Kein Mix mit anderen Ordnern — fuer Workflow-Triage und Unified-Inbox.
 *
 * @param limit Positive Zahl = max. Zeilen; `null` = keine SQL-Begrenzung (alle lokal
 *   im Posteingang gespeicherten Mails).
 */
export function listInboxMessagesAllAccounts(
  limit: number | null,
  options?: ListInboxMessagesOptions
): MailListItem[] {
  const db = getDb()
  const includeOpenTodo = options?.includeOpenTodo !== false
  const sqlBody = includeOpenTodo
    ? `
       FROM messages m
       INNER JOIN folders f ON f.id = m.folder_id AND f.well_known = 'inbox'
       ${OPEN_TODO_JOIN_SQL}
       ORDER BY m.received_at DESC NULLS LAST, m.id DESC`
    : `
       FROM messages m
       INNER JOIN folders f ON f.id = m.folder_id AND f.well_known = 'inbox'
       ORDER BY m.received_at DESC NULLS LAST, m.id DESC`

  if (limit === null) {
    if (includeOpenTodo) {
      const rows = db
        .prepare<[], InboxOpenTodoJoinRow>(`${SELECT_LIST_WITH_OPEN_TODO} ${sqlBody}`)
        .all()
      return rows.map(mapOpenTodoJoinRow)
    }
    const rows = db.prepare<[], MessageRow>(`SELECT ${LIST_COLUMNS_M} ${sqlBody}`).all()
    return rows.map(rowToListItem)
  }

  if (includeOpenTodo) {
    const rows = db
      .prepare<[number], InboxOpenTodoJoinRow>(`${SELECT_LIST_WITH_OPEN_TODO} ${sqlBody} LIMIT ?`)
      .all(limit)
    return rows.map(mapOpenTodoJoinRow)
  }

  const rows = db
    .prepare<[number], MessageRow>(`SELECT ${LIST_COLUMNS_M} ${sqlBody} LIMIT ?`)
    .all(limit)
  return rows.map(rowToListItem)
}
