import { getDb } from './index'
import type { MailFull, MailListItem } from '@shared/types'

export interface MessageRow {
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

export function rowToFull(
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
      body_html        = COALESCE(excluded.body_html, messages.body_html),
      body_text        = COALESCE(excluded.body_text, messages.body_text),
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
