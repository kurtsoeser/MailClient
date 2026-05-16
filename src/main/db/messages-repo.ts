import { getDb } from './index'
import type { MailFull, MailListItem, MetaFolderCriteria, MetaFolderExceptionClause } from '@shared/types'

interface MessageRow {
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
  follow_up_flag_status?: string | null
  has_attachments: number
  importance: string | null
  snoozed_until?: string | null
  waiting_for_reply_until?: string | null
  list_unsubscribe?: string | null
  list_unsubscribe_post?: string | null
}

export function rowToListItem(r: MessageRow): MailListItem {
  return {
    id: r.id,
    accountId: r.account_id,
    folderId: r.folder_id,
    threadId: r.thread_id,
    remoteId: r.remote_id,
    remoteThreadId: r.remote_thread_id,
    subject: r.subject,
    fromAddr: r.from_addr,
    fromName: r.from_name,
    toAddrs: r.to_addrs ?? null,
    snippet: r.snippet,
    sentAt: r.sent_at,
    receivedAt: r.received_at,
    isRead: !!r.is_read,
    isFlagged: !!r.is_flagged,
    hasAttachments: !!r.has_attachments,
    importance: r.importance,
    snoozedUntil: r.snoozed_until ?? null,
    waitingForReplyUntil: r.waiting_for_reply_until ?? null,
    listUnsubscribe: r.list_unsubscribe ?? null,
    listUnsubscribePost: r.list_unsubscribe_post ?? null
  }
}

function rowToFull(
  r: MessageRow,
  openTodo?: {
    id: number
    due_kind: string
    due_at: string | null
    todo_start_at: string | null
    todo_end_at: string | null
  } | null
): MailFull {
  return {
    ...rowToListItem(r),
    bodyHtml: r.body_html,
    bodyText: r.body_text,
    ccAddrs: r.cc_addrs,
    openTodoId: openTodo?.id ?? null,
    openTodoDueKind: openTodo?.due_kind ?? null,
    openTodoDueAt: openTodo?.due_at ?? null,
    openTodoStartAt: openTodo?.todo_start_at ?? null,
    openTodoEndAt: openTodo?.todo_end_at ?? null
  }
}

export interface UpsertMessageInput {
  accountId: string
  folderId: number | null
  threadId: number | null
  remoteId: string
  remoteThreadId: string | null
  subject: string | null
  fromAddr: string | null
  fromName: string | null
  toAddrs: string | null
  ccAddrs: string | null
  bccAddrs: string | null
  snippet: string | null
  bodyHtml: string | null
  bodyText: string | null
  sentAt: string | null
  receivedAt: string | null
  isRead: number
  isFlagged: number
  /** Graph: notFlagged | flagged | complete — Gmail: notFlagged | flagged */
  followUpFlagStatus: string
  hasAttachments: number
  importance: string | null
  changeKey: string | null
  listUnsubscribe: string | null
  listUnsubscribePost: string | null
  listId?: string | null
}

/** Kontext fuer Regelauswertung (lokal, ohne Graph). */
export interface MessageRuleContextRow {
  id: number
  accountId: string
  folderId: number | null
  fromAddr: string | null
  fromName: string | null
  toAddrs: string | null
  ccAddrs: string | null
  subject: string | null
  bodyText: string | null
  hasAttachments: boolean
  listId: string | null
  importance: string | null
  isRead: boolean
  receivedAt: string | null
}

export function upsertMessages(input: UpsertMessageInput[]): void {
  if (input.length === 0) return
  const db = getDb()
  const stmt = db.prepare(`
    INSERT INTO messages (
      account_id, folder_id, thread_id, remote_id, remote_thread_id,
      subject, from_addr, from_name, to_addrs, cc_addrs, bcc_addrs,
      snippet, body_html, body_text, sent_at, received_at,
      is_read, is_flagged, follow_up_flag_status, has_attachments, importance, change_key,
      list_unsubscribe, list_unsubscribe_post, list_id, last_synced_at
    ) VALUES (
      @accountId, @folderId, @threadId, @remoteId, @remoteThreadId,
      @subject, @fromAddr, @fromName, @toAddrs, @ccAddrs, @bccAddrs,
      @snippet, @bodyHtml, @bodyText, @sentAt, @receivedAt,
      @isRead, @isFlagged, @followUpFlagStatus, @hasAttachments, @importance, @changeKey,
      @listUnsubscribe, @listUnsubscribePost, @listId, datetime('now')
    )
    ON CONFLICT(account_id, remote_id) DO UPDATE SET
      folder_id        = excluded.folder_id,
      thread_id        = excluded.thread_id,
      remote_thread_id = excluded.remote_thread_id,
      subject          = excluded.subject,
      from_addr        = excluded.from_addr,
      from_name        = excluded.from_name,
      to_addrs         = excluded.to_addrs,
      cc_addrs         = excluded.cc_addrs,
      bcc_addrs        = excluded.bcc_addrs,
      snippet          = excluded.snippet,
      body_html        = excluded.body_html,
      body_text        = excluded.body_text,
      sent_at          = excluded.sent_at,
      received_at      = excluded.received_at,
      is_read          = excluded.is_read,
      is_flagged       = excluded.is_flagged,
      follow_up_flag_status = excluded.follow_up_flag_status,
      has_attachments  = excluded.has_attachments,
      importance       = excluded.importance,
      change_key       = excluded.change_key,
      list_unsubscribe = excluded.list_unsubscribe,
      list_unsubscribe_post = excluded.list_unsubscribe_post,
      list_id          = excluded.list_id,
      last_synced_at   = datetime('now')
  `)
  const tx = db.transaction((items: UpsertMessageInput[]) => {
    for (const item of items) {
      stmt.run({
        ...item,
        listId: item.listId ?? null
      })
    }
  })
  tx(input)
}

function mapRuleContextRow(r: {
  id: number
  account_id: string
  folder_id: number | null
  from_addr: string | null
  from_name: string | null
  to_addrs: string | null
  cc_addrs: string | null
  subject: string | null
  body_text: string | null
  has_attachments: number
  list_id: string | null
  importance: string | null
  is_read: number
  received_at: string | null
}): MessageRuleContextRow {
  return {
    id: r.id,
    accountId: r.account_id,
    folderId: r.folder_id,
    fromAddr: r.from_addr,
    fromName: r.from_name,
    toAddrs: r.to_addrs,
    ccAddrs: r.cc_addrs,
    subject: r.subject,
    bodyText: r.body_text,
    hasAttachments: !!r.has_attachments,
    listId: r.list_id,
    importance: r.importance,
    isRead: !!r.is_read,
    receivedAt: r.received_at
  }
}

export function listMessageIdsByRemoteIds(
  accountId: string,
  remoteIds: string[]
): Map<string, number> {
  const out = new Map<string, number>()
  if (remoteIds.length === 0) return out
  const uniq = Array.from(new Set(remoteIds.filter((x) => x.length > 0)))
  if (uniq.length === 0) return out
  const db = getDb()
  const placeholders = uniq.map(() => '?').join(',')
  const rows = db
    .prepare<unknown[], { id: number; remote_id: string }>(
      `SELECT id, remote_id FROM messages
       WHERE account_id = ? AND remote_id IN (${placeholders})`
    )
    .all(accountId, ...uniq)
  for (const row of rows) out.set(row.remote_id, row.id)
  return out
}

/** Vor Mail-Upsert: Follow-up-Status fuer Abgleich mit Graph (flagged|complete|notFlagged). */
export interface MessageFollowUpSyncSnapshot {
  localId: number
  followUpFlagStatus: string | null
  wasActivelyFlagged: boolean
}

export function getMessageFlagSnapshotsByRemoteIds(
  accountId: string,
  remoteIds: string[]
): Map<string, MessageFollowUpSyncSnapshot> {
  const out = new Map<string, MessageFollowUpSyncSnapshot>()
  const uniq = Array.from(new Set(remoteIds.filter((x) => x.length > 0)))
  if (uniq.length === 0) return out
  const db = getDb()
  const placeholders = uniq.map(() => '?').join(',')
  const rows = db
    .prepare<unknown[], { id: number; remote_id: string; is_flagged: number; follow_up_flag_status: string | null }>(
      `SELECT id, remote_id, is_flagged, follow_up_flag_status FROM messages
       WHERE account_id = ? AND remote_id IN (${placeholders})`
    )
    .all(accountId, ...uniq)
  for (const row of rows) {
    out.set(row.remote_id, {
      localId: row.id,
      followUpFlagStatus: row.follow_up_flag_status ?? null,
      wasActivelyFlagged: !!row.is_flagged
    })
  }
  return out
}

export function getMessageRuleContext(messageId: number): MessageRuleContextRow | null {
  const db = getDb()
  const r = db
    .prepare<
      [number],
      {
        id: number
        account_id: string
        folder_id: number | null
        from_addr: string | null
        from_name: string | null
        to_addrs: string | null
        cc_addrs: string | null
        subject: string | null
        body_text: string | null
        has_attachments: number
        list_id: string | null
        importance: string | null
        is_read: number
        received_at: string | null
      }
    >(
      `SELECT id, account_id, folder_id, from_addr, from_name, to_addrs, cc_addrs,
              subject, body_text, has_attachments, list_id, importance, is_read, received_at
       FROM messages WHERE id = ?`
    )
    .get(messageId)
  return r ? mapRuleContextRow(r) : null
}

export function listMessagesForRuleDryRun(
  accountId: string | null,
  limit: number
): MessageRuleContextRow[] {
  const db = getDb()
  const lim = Math.min(Math.max(1, limit), 2000)
  const rows = accountId
    ? db
        .prepare<
          [string, number],
          {
            id: number
            account_id: string
            folder_id: number | null
            from_addr: string | null
            from_name: string | null
            to_addrs: string | null
            cc_addrs: string | null
            subject: string | null
            body_text: string | null
            has_attachments: number
            list_id: string | null
            importance: string | null
            is_read: number
            received_at: string | null
          }
        >(
          `SELECT id, account_id, folder_id, from_addr, from_name, to_addrs, cc_addrs,
                  subject, body_text, has_attachments, list_id, importance, is_read, received_at
           FROM messages
           WHERE account_id = ?
           ORDER BY received_at DESC NULLS LAST, id DESC
           LIMIT ?`
        )
        .all(accountId, lim)
    : db
        .prepare<
          [number],
          {
            id: number
            account_id: string
            folder_id: number | null
            from_addr: string | null
            from_name: string | null
            to_addrs: string | null
            cc_addrs: string | null
            subject: string | null
            body_text: string | null
            has_attachments: number
            list_id: string | null
            importance: string | null
            is_read: number
            received_at: string | null
          }
        >(
          `SELECT id, account_id, folder_id, from_addr, from_name, to_addrs, cc_addrs,
                  subject, body_text, has_attachments, list_id, importance, is_read, received_at
           FROM messages
           ORDER BY received_at DESC NULLS LAST, id DESC
           LIMIT ?`
        )
        .all(lim)
  return rows.map(mapRuleContextRow)
}

const LIST_COLUMNS = `
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

/**
 * Alle Mails aus den Posteingaengen aller Konten (well_known = inbox), neueste zuerst.
 * Kein Mix mit anderen Ordnern — fuer Workflow-Triage und Unified-Inbox.
 *
 * @param limit Positive Zahl = max. Zeilen; `null` = keine SQL-Begrenzung (alle lokal
 *   im Posteingang gespeicherten Mails).
 */
export function listInboxMessagesAllAccounts(limit: number | null): MailListItem[] {
  const db = getDb()
  const sqlBody = `
       FROM messages m
       INNER JOIN folders f ON f.id = m.folder_id AND f.well_known = 'inbox'
       ${OPEN_TODO_JOIN_SQL}
       ORDER BY m.received_at DESC NULLS LAST, m.id DESC`

  if (limit === null) {
    const rows = db.prepare<[], InboxOpenTodoJoinRow>(`${SELECT_LIST_WITH_OPEN_TODO} ${sqlBody}`).all()
    return rows.map(mapOpenTodoJoinRow)
  }

  const rows = db
    .prepare<[number], InboxOpenTodoJoinRow>(`${SELECT_LIST_WITH_OPEN_TODO} ${sqlBody} LIMIT ?`)
    .all(limit)
  return rows.map(mapOpenTodoJoinRow)
}

export function setMessageReadLocal(id: number, isRead: boolean): void {
  const db = getDb()
  db.prepare('UPDATE messages SET is_read = ? WHERE id = ?').run(isRead ? 1 : 0, id)
}

export function setMessageFlaggedLocal(id: number, isFlagged: boolean): void {
  const db = getDb()
  const status = isFlagged ? 'flagged' : 'notFlagged'
  db.prepare(
    'UPDATE messages SET is_flagged = ?, follow_up_flag_status = ? WHERE id = ?'
  ).run(isFlagged ? 1 : 0, status, id)
}

export function setMessageHasAttachmentsLocal(id: number, value: boolean): void {
  const db = getDb()
  db.prepare('UPDATE messages SET has_attachments = ? WHERE id = ?').run(
    value ? 1 : 0,
    id
  )
}

export function deleteMessageLocal(id: number): void {
  const db = getDb()
  db.prepare('DELETE FROM messages WHERE id = ?').run(id)
}

/** Delta-/Sync: Mails anhand der Graph-Remote-IDs fuer ein Konto loeschen. */
export function deleteMessagesByAccountRemoteIds(accountId: string, remoteIds: string[]): void {
  const ids = Array.from(new Set(remoteIds.map((r) => r.trim()).filter(Boolean)))
  if (ids.length === 0) return
  const db = getDb()
  const chunk = 80
  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk)
    const ph = slice.map(() => '?').join(', ')
    db.prepare(`DELETE FROM messages WHERE account_id = ? AND remote_id IN (${ph})`).run(
      accountId,
      ...slice
    )
  }
}

/** Entfernt alle lokalen Mails eines Ordners (z. B. nach Papierkorb-leeren auf dem Server). */
export function deleteAllMessagesInFolderLocal(folderId: number): number {
  const db = getDb()
  const r = db.prepare('DELETE FROM messages WHERE folder_id = ?').run(folderId)
  return Number(r.changes ?? 0)
}

export function updateMessageFolderLocal(
  id: number,
  newFolderId: number,
  newRemoteId: string
): void {
  const db = getDb()
  db.prepare('UPDATE messages SET folder_id = ?, remote_id = ? WHERE id = ?').run(
    newFolderId,
    newRemoteId,
    id
  )
}

/**
 * Setzt Snooze-Status. `snoozedFromFolderId` ist der urspruengliche Ordner,
 * in dem die Mail vor dem Snoozen lag - dorthin wird sie geweckt.
 */
export function setMessageSnooze(
  id: number,
  snoozedUntilIso: string,
  snoozedFromFolderId: number
): void {
  const db = getDb()
  db.prepare(
    `UPDATE messages
     SET snoozed_until = ?, snoozed_from_folder_id = ?
     WHERE id = ?`
  ).run(snoozedUntilIso, snoozedFromFolderId, id)
}

export function clearMessageSnooze(id: number): void {
  const db = getDb()
  db.prepare(
    `UPDATE messages
     SET snoozed_until = NULL, snoozed_from_folder_id = NULL
     WHERE id = ?`
  ).run(id)
}

export interface DueSnoozeRow {
  id: number
  accountId: string
  folderId: number | null
  remoteId: string
  snoozedFromFolderId: number | null
  snoozedUntil: string
}

/**
 * Liefert alle Mails, deren snoozed_until <= now ist und die noch im
 * Snoozed-Folder liegen (snoozed_from_folder_id IS NOT NULL).
 */
export function listDueSnoozes(): DueSnoozeRow[] {
  const db = getDb()
  const rows = db
    .prepare<
      [],
      {
        id: number
        account_id: string
        folder_id: number | null
        remote_id: string
        snoozed_from_folder_id: number | null
        snoozed_until: string
      }
    >(
      `SELECT id, account_id, folder_id, remote_id,
              snoozed_from_folder_id, snoozed_until
       FROM messages
       WHERE snoozed_until IS NOT NULL
         AND snoozed_from_folder_id IS NOT NULL
         AND snoozed_until <= datetime('now')`
    )
    .all()
  return rows.map((r) => ({
    id: r.id,
    accountId: r.account_id,
    folderId: r.folder_id,
    remoteId: r.remote_id,
    snoozedFromFolderId: r.snoozed_from_folder_id,
    snoozedUntil: r.snoozed_until
  }))
}

export interface SnoozedMessageRow extends MailListItem {
  snoozedUntil: string | null
  snoozedFromFolderId: number | null
  snoozedFromFolderName: string | null
}

/**
 * Alle aktuell snoozed Mails uebergreifend ueber Konten, sortiert nach
 * naechstem Wake-Zeitpunkt (ascending). Fuer die Snoozed-View.
 */
export function listSnoozedMessages(limit = 200): SnoozedMessageRow[] {
  const db = getDb()
  const rows = db
    .prepare<
      [number],
      MessageRow & {
        snoozed_until: string | null
        snoozed_from_folder_id: number | null
        waiting_for_reply_until: string | null
        list_unsubscribe: string | null
        list_unsubscribe_post: string | null
        from_folder_name: string | null
      }
    >(
      `SELECT
         m.id, m.account_id, m.folder_id, m.thread_id, m.remote_id, m.remote_thread_id,
         m.subject, m.from_addr, m.from_name, m.to_addrs, m.cc_addrs, m.snippet,
         NULL as body_html, NULL as body_text,
         m.sent_at, m.received_at, m.is_read, m.is_flagged, m.has_attachments, m.importance,
         m.snoozed_until, m.snoozed_from_folder_id, m.waiting_for_reply_until,
         m.list_unsubscribe, m.list_unsubscribe_post,
         src.name as from_folder_name
       FROM messages m
       LEFT JOIN folders src ON src.id = m.snoozed_from_folder_id
       WHERE m.snoozed_until IS NOT NULL AND m.snoozed_from_folder_id IS NOT NULL
       ORDER BY m.snoozed_until ASC
       LIMIT ?`
    )
    .all(limit)
  return rows.map((r) => ({
    ...rowToListItem(r),
    snoozedUntil: r.snoozed_until,
    snoozedFromFolderId: r.snoozed_from_folder_id,
    snoozedFromFolderName: r.from_folder_name
  }))
}

/**
 * Mails mit aktivem Waiting-for (Antwort bis), sortiert nach Faelligkeit.
 */
export function listWaitingMessages(limit = 200): MailListItem[] {
  const db = getDb()
  const rows = db
    .prepare<[number], MessageRow>(
      `SELECT ${LIST_COLUMNS} FROM messages
       WHERE waiting_for_reply_until IS NOT NULL
       ORDER BY waiting_for_reply_until ASC, received_at DESC NULLS LAST, id DESC
       LIMIT ?`
    )
    .all(limit)
  return rows.map(rowToListItem)
}

export function countWaitingMessagesGlobal(): number {
  const db = getDb()
  const row = db
    .prepare<[], { c: number }>(
      'SELECT COUNT(*) as c FROM messages WHERE waiting_for_reply_until IS NOT NULL'
    )
    .get()
  return row?.c ?? 0
}

export function setMessageWaitingForReplyUntilLocal(id: number, untilIso: string | null): void {
  const db = getDb()
  db.prepare('UPDATE messages SET waiting_for_reply_until = ? WHERE id = ?').run(untilIso, id)
}

export interface SearchHit extends MailListItem {
  /** Folder-Name fuer die Anzeige im Ergebnis. */
  folderName: string | null
  folderWellKnown: string | null
}

/**
 * FTS5-Volltextsuche ueber `subject`, `from_*` und `body_text` aller Mails.
 * Eingabe-Query wird zu einer Prefix-Suche pro Token gewandelt
 * ("kurt sept" -> "kurt* sept*").
 */
export function searchMessages(rawQuery: string, limit = 30): SearchHit[] {
  const cleaned = normalizeMessagesFtsMatchQuery(rawQuery)
  if (!cleaned) return []

  const db = getDb()
  const rows = db
    .prepare<[string, number], MessageRow & { folder_name: string | null; folder_well_known: string | null }>(
      `SELECT
         m.id, m.account_id, m.folder_id, m.thread_id, m.remote_id, m.remote_thread_id,
         m.subject, m.from_addr, m.from_name, m.to_addrs, m.cc_addrs, m.snippet,
         NULL as body_html, NULL as body_text,
         m.sent_at, m.received_at, m.is_read, m.is_flagged, m.has_attachments, m.importance,
         m.snoozed_until, m.waiting_for_reply_until, m.list_unsubscribe, m.list_unsubscribe_post,
         f.name as folder_name, f.well_known as folder_well_known
       FROM messages_fts fts
       JOIN messages m ON m.id = fts.rowid
       LEFT JOIN folders f ON f.id = m.folder_id
       WHERE messages_fts MATCH ?
       ORDER BY bm25(messages_fts), m.received_at DESC NULLS LAST
       LIMIT ?`
    )
    .all(cleaned, limit)

  return rows.map((r) => ({
    ...rowToListItem(r),
    folderName: r.folder_name,
    folderWellKnown: r.folder_well_known
  }))
}

/**
 * Setzt `waiting_for_reply_until` fuer alle Mails der angegebenen
 * Graph-Threads zurueck (z. B. wenn im Posteingang eine externe Antwort
 * eingetroffen ist).
 */
export function clearWaitingForReplyOnThreads(accountId: string, remoteThreadIds: string[]): void {
  const ids = Array.from(new Set(remoteThreadIds.filter((t) => t.length > 0)))
  if (ids.length === 0) return
  const db = getDb()
  const placeholders = ids.map(() => '?').join(',')
  db.prepare(
    `UPDATE messages
     SET waiting_for_reply_until = NULL
     WHERE account_id = ?
       AND remote_thread_id IN (${placeholders})
       AND waiting_for_reply_until IS NOT NULL`
  ).run(accountId, ...ids)
}

export function getMessageById(id: number): MailFull | null {
  const db = getDb()
  const row = db.prepare<[number], MessageRow>('SELECT * FROM messages WHERE id = ?').get(id)
  if (!row) return null
  const openTodo = db
    .prepare<
      [number, string],
      {
        id: number
        due_kind: string
        due_at: string | null
        todo_start_at: string | null
        todo_end_at: string | null
      }
    >(
      'SELECT id, due_kind, due_at, todo_start_at, todo_end_at FROM todos WHERE message_id = ? AND status = ?'
    )
    .get(id, 'open')
  return rowToFull(row, openTodo ?? null)
}

/**
 * Liefert alle Mails (als List-Items) zu mehreren Thread-Keys eines Accounts,
 * ueber alle Ordner hinweg. Damit kann die Konversationsansicht im Posteingang
 * auch gesendete Antworten (aus "Gesendete Elemente") als Teil des Threads
 * zeigen.
 */
export function listMessagesByThreadKeys(
  accountId: string,
  threadKeys: string[]
): MailListItem[] {
  if (threadKeys.length === 0) return []
  const db = getDb()
  const placeholders = threadKeys.map(() => '?').join(',')
  const rows = db
    .prepare<unknown[], MessageRow>(
      `SELECT ${LIST_COLUMNS} FROM messages
       WHERE account_id = ? AND remote_thread_id IN (${placeholders})
       ORDER BY received_at ASC NULLS LAST, id ASC`
    )
    .all(accountId, ...threadKeys)
  return rows.map(rowToListItem)
}

/**
 * Liefert alle Mails eines Threads, chronologisch von alt nach neu.
 * threadKey-Format:
 *   - 'msg:<id>'   - einzelne Mail (kein Thread)
 *   - sonst        - remote_thread_id
 */
export function listMessagesByThread(accountId: string, threadKey: string): MailFull[] {
  const db = getDb()

  if (threadKey.startsWith('msg:')) {
    const id = Number.parseInt(threadKey.slice(4), 10)
    if (!Number.isFinite(id)) return []
    const row = db
      .prepare<[number, string], MessageRow>(
        'SELECT * FROM messages WHERE id = ? AND account_id = ?'
      )
      .get(id, accountId)
    if (!row) {
      console.warn(
        '[messages-repo] listMessagesByThread (msg:id) keine Mail gefunden',
        { id, accountId }
      )
    }
    return row ? [rowToFull(row)] : []
  }

  const rows = db
    .prepare<[string, string], MessageRow>(
      `SELECT * FROM messages
       WHERE account_id = ? AND remote_thread_id = ?
       ORDER BY received_at ASC NULLS LAST, id ASC`
    )
    .all(accountId, threadKey)

  if (rows.length === 0) {
    console.warn(
      '[messages-repo] listMessagesByThread (thread) keine Mails gefunden',
      { accountId, threadKey, threadKeyLength: threadKey.length }
    )
    const sample = db
      .prepare<[string], { account_id: string; remote_thread_id: string | null }>(
        'SELECT account_id, remote_thread_id FROM messages WHERE account_id = ? LIMIT 5'
      )
      .all(accountId)
    console.warn('[messages-repo] Beispiel-Zeilen fuer Account:', sample)
  }

  return rows.map((r) => rowToFull(r))
}

const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/gi

/** E-Mail-Adressen aus bisherigen Mails (From/Cc/An) fuer Compose-Autocomplete. */
export function searchMessageParticipantEmails(args: {
  accountId: string
  needle: string
  limit: number
}): Array<{ email: string; displayName?: string }> {
  const raw = args.needle.trim().replace(/%/g, '').replace(/_/g, '')
  if (raw.length < 1) return []
  const needle = `%${raw}%`
  const lim = Math.min(Math.max(args.limit, 1), 24)
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT DISTINCT from_addr, from_name, to_addrs, cc_addrs
       FROM messages
       WHERE account_id = ?
         AND (
           (from_addr IS NOT NULL AND from_addr LIKE ?)
           OR (to_addrs IS NOT NULL AND to_addrs LIKE ?)
           OR (cc_addrs IS NOT NULL AND cc_addrs LIKE ?)
         )
       ORDER BY received_at DESC NULLS LAST, id DESC
       LIMIT 80`
    )
    .all(args.accountId, needle, needle, needle) as Array<{
    from_addr: string | null
    from_name: string | null
    to_addrs: string | null
    cc_addrs: string | null
  }>

  const seen = new Set<string>()
  const out: Array<{ email: string; displayName?: string }> = []
  const rawLower = raw.toLowerCase()

  const collectFromLine = (line: string | null | undefined, nameHint: string | null | undefined): void => {
    if (!line?.trim()) return
    const emails = line.match(EMAIL_RE) ?? []
    for (const em of emails) {
      const eLower = em.toLowerCase()
      if (seen.has(eLower)) continue
      if (!eLower.includes(rawLower) && !line.toLowerCase().includes(rawLower)) continue
      seen.add(eLower)
      out.push({ email: em, ...(nameHint?.trim() ? { displayName: nameHint.trim() } : {}) })
    }
  }

  for (const r of rows) {
    collectFromLine(r.from_addr, r.from_name)
    collectFromLine(r.to_addrs, undefined)
    collectFromLine(r.cc_addrs, undefined)
    if (out.length >= lim) break
  }
  return out.slice(0, lim)
}

const BULK_UNFLAG_MAX_IDS = 50_000

/**
 * Lokale Mails mit Kennzeichnung fuer Batch-Entkennung (Graph/Gmail PATCH).
 * `excludeDeletedJunk`: Ordner well_known deleteditems/junkemail auslassen (wie UI-Filter).
 */
export function countFlaggedMessageIdsForBulkUnflag(
  accountId: string,
  excludeDeletedJunk: boolean
): number {
  const id = accountId.trim()
  if (!id) return 0
  const exclude = excludeDeletedJunk ? 1 : 0
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) as c
       FROM messages m
       LEFT JOIN folders f ON f.id = m.folder_id
       WHERE m.account_id = ?
         AND m.is_flagged = 1
         AND (
           ? = 0
           OR m.folder_id IS NULL
           OR f.id IS NULL
           OR LOWER(COALESCE(f.well_known, '')) NOT IN ('deleteditems', 'junkemail')
         )`
    )
    .get(id, exclude) as { c: number } | undefined
  return row?.c ?? 0
}

export function listFlaggedMessageIdsForBulkUnflag(
  accountId: string,
  excludeDeletedJunk: boolean
): number[] {
  const id = accountId.trim()
  if (!id) return []
  const exclude = excludeDeletedJunk ? 1 : 0
  const rows = getDb()
    .prepare(
      `SELECT m.id
       FROM messages m
       LEFT JOIN folders f ON f.id = m.folder_id
       WHERE m.account_id = ?
         AND m.is_flagged = 1
         AND (
           ? = 0
           OR m.folder_id IS NULL
           OR f.id IS NULL
           OR LOWER(COALESCE(f.well_known, '')) NOT IN ('deleteditems', 'junkemail')
         )
       ORDER BY m.id ASC
       LIMIT ${BULK_UNFLAG_MAX_IDS}`
    )
    .all(id, exclude) as Array<{ id: number }>
  return rows.map((r) => r.id)
}

/** Zuletzt vorkommende Empfaenger-Adressen ohne Suchbegriff (Compose-Autocomplete beim Fokus). */
export function listRecentParticipantEmailsForCompose(args: {
  accountId: string
  limit: number
}): Array<{ email: string; displayName?: string }> {
  const lim = Math.min(Math.max(args.limit, 1), 24)
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT from_addr, from_name, to_addrs, cc_addrs
       FROM messages
       WHERE account_id = ?
         AND (
           (from_addr IS NOT NULL AND from_addr LIKE '%@%')
           OR (to_addrs IS NOT NULL AND to_addrs LIKE '%@%')
           OR (cc_addrs IS NOT NULL AND cc_addrs LIKE '%@%')
         )
       ORDER BY received_at DESC NULLS LAST, id DESC
       LIMIT 120`
    )
    .all(args.accountId) as Array<{
    from_addr: string | null
    from_name: string | null
    to_addrs: string | null
    cc_addrs: string | null
  }>

  const seen = new Set<string>()
  const out: Array<{ email: string; displayName?: string }> = []

  const collectFromLine = (line: string | null | undefined, nameHint: string | null | undefined): void => {
    if (!line?.trim()) return
    const emails = line.match(EMAIL_RE) ?? []
    for (const em of emails) {
      const eLower = em.toLowerCase()
      if (seen.has(eLower)) continue
      seen.add(eLower)
      out.push({ email: em, ...(nameHint?.trim() ? { displayName: nameHint.trim() } : {}) })
    }
  }

  for (const r of rows) {
    collectFromLine(r.from_addr, r.from_name)
    collectFromLine(r.to_addrs, undefined)
    collectFromLine(r.cc_addrs, undefined)
    if (out.length >= lim) break
  }
  return out.slice(0, lim)
}
