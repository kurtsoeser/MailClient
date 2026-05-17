import { getDb } from './index'
import type { MailFull, MailListItem } from '@shared/types'
import { rowToListItem, rowToFull, type MessageRow } from './messages-repo-core'
import { LIST_COLUMNS, normalizeMessagesFtsMatchQuery } from './messages-repo-list'
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

export function updateMessageBodiesLocal(
  id: number,
  bodyHtml: string | null,
  bodyText: string | null
): void {
  const db = getDb()
  db.prepare('UPDATE messages SET body_html = ?, body_text = ? WHERE id = ?').run(
    bodyHtml,
    bodyText,
    id
  )
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
