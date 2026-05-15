import { getDb } from './index'
import type {
  SettingsBackupUserNoteSnapshot,
  UserNote,
  UserNoteCalendarKey,
  UserNoteCalendarUpsertInput,
  UserNoteListFilters,
  UserNoteListItem,
  UserNoteMailUpsertInput,
  UserNoteStandaloneCreateInput,
  UserNoteStandaloneUpdateInput
} from '@shared/types'

interface UserNoteRow {
  id: number
  kind: 'mail' | 'calendar' | 'standalone'
  message_id: number | null
  account_id: string | null
  calendar_source: 'microsoft' | 'google' | null
  calendar_remote_id: string | null
  event_remote_id: string | null
  title: string | null
  body: string
  created_at: string
  updated_at: string
  event_title_snapshot: string | null
  event_start_iso_snapshot: string | null
}

interface UserNoteListRow extends UserNoteRow {
  mail_subject: string | null
  mail_account_id: string | null
  mail_from_addr: string | null
  mail_from_name: string | null
  mail_snippet: string | null
  mail_sent_at: string | null
  mail_received_at: string | null
  mail_is_read: number | null
  mail_has_attachments: number | null
}

const NOTE_SELECT = `
  id, kind, message_id, account_id, calendar_source, calendar_remote_id, event_remote_id,
  title, body, created_at, updated_at, event_title_snapshot, event_start_iso_snapshot
`

const NOTE_SELECT_N = `
  n.id, n.kind, n.message_id, n.account_id, n.calendar_source, n.calendar_remote_id, n.event_remote_id,
  n.title, n.body, n.created_at, n.updated_at, n.event_title_snapshot, n.event_start_iso_snapshot
`

function rowToNote(row: UserNoteRow): UserNote {
  return {
    id: row.id,
    kind: row.kind,
    messageId: row.message_id,
    accountId: row.account_id,
    calendarSource: row.calendar_source,
    calendarRemoteId: row.calendar_remote_id,
    eventRemoteId: row.event_remote_id,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    eventTitleSnapshot: row.event_title_snapshot,
    eventStartIsoSnapshot: row.event_start_iso_snapshot
  }
}

function rowToListItem(row: UserNoteListRow): UserNoteListItem {
  return {
    ...rowToNote(row),
    mailSubject: row.mail_subject,
    mailAccountId: row.mail_account_id,
    mailFromAddr: row.mail_from_addr,
    mailFromName: row.mail_from_name,
    mailSnippet: row.mail_snippet,
    mailSentAt: row.mail_sent_at,
    mailReceivedAt: row.mail_received_at,
    mailIsRead: row.mail_is_read == null ? null : !!row.mail_is_read,
    mailHasAttachments: row.mail_has_attachments == null ? null : !!row.mail_has_attachments
  }
}

function normalizeNullableText(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function assertPositiveId(id: number, label: string): void {
  if (!Number.isFinite(id) || id <= 0) throw new Error(`${label} fehlt.`)
}

function assertText(value: string, label: string): void {
  if (!value.trim()) throw new Error(`${label} fehlt.`)
}

export function getMailNote(messageId: number): UserNote | null {
  assertPositiveId(messageId, 'Mail-ID')
  const row = getDb()
    .prepare<[number], UserNoteRow>(`SELECT ${NOTE_SELECT} FROM user_notes WHERE kind = 'mail' AND message_id = ?`)
    .get(messageId)
  return row ? rowToNote(row) : null
}

export function upsertMailNote(input: UserNoteMailUpsertInput): UserNote {
  assertPositiveId(input.messageId, 'Mail-ID')
  const db = getDb()
  db.prepare(
    `INSERT INTO user_notes (kind, message_id, title, body, created_at, updated_at)
     VALUES ('mail', @messageId, @title, @body, datetime('now'), datetime('now'))
     ON CONFLICT(message_id) WHERE kind = 'mail'
     DO UPDATE SET title = excluded.title, body = excluded.body, updated_at = datetime('now')`
  ).run({
    messageId: Math.floor(input.messageId),
    title: normalizeNullableText(input.title),
    body: input.body ?? ''
  })
  const note = getMailNote(input.messageId)
  if (!note) throw new Error('Notiz konnte nicht gelesen werden.')
  return note
}

export function getCalendarNote(key: UserNoteCalendarKey): UserNote | null {
  assertText(key.accountId, 'Konto')
  assertText(key.calendarRemoteId, 'Kalender-ID')
  assertText(key.eventRemoteId, 'Termin-ID')
  const row = getDb()
    .prepare<[string, string, string, string], UserNoteRow>(
      `SELECT ${NOTE_SELECT}
       FROM user_notes
       WHERE kind = 'calendar'
         AND account_id = ?
         AND calendar_source = ?
         AND calendar_remote_id = ?
         AND event_remote_id = ?`
    )
    .get(key.accountId, key.calendarSource, key.calendarRemoteId, key.eventRemoteId)
  return row ? rowToNote(row) : null
}

export function upsertCalendarNote(input: UserNoteCalendarUpsertInput): UserNote {
  assertText(input.accountId, 'Konto')
  assertText(input.calendarRemoteId, 'Kalender-ID')
  assertText(input.eventRemoteId, 'Termin-ID')
  const db = getDb()
  db.prepare(
    `INSERT INTO user_notes (
       kind, account_id, calendar_source, calendar_remote_id, event_remote_id,
       title, body, created_at, updated_at, event_title_snapshot, event_start_iso_snapshot
     )
     VALUES (
       'calendar', @accountId, @calendarSource, @calendarRemoteId, @eventRemoteId,
       @title, @body, datetime('now'), datetime('now'), @eventTitleSnapshot, @eventStartIsoSnapshot
     )
     ON CONFLICT(account_id, calendar_source, calendar_remote_id, event_remote_id) WHERE kind = 'calendar'
     DO UPDATE SET
       title = excluded.title,
       body = excluded.body,
       updated_at = datetime('now'),
       event_title_snapshot = excluded.event_title_snapshot,
       event_start_iso_snapshot = excluded.event_start_iso_snapshot`
  ).run({
    accountId: input.accountId,
    calendarSource: input.calendarSource,
    calendarRemoteId: input.calendarRemoteId,
    eventRemoteId: input.eventRemoteId,
    title: normalizeNullableText(input.title),
    body: input.body ?? '',
    eventTitleSnapshot: normalizeNullableText(input.eventTitleSnapshot),
    eventStartIsoSnapshot: normalizeNullableText(input.eventStartIsoSnapshot)
  })
  const note = getCalendarNote(input)
  if (!note) throw new Error('Notiz konnte nicht gelesen werden.')
  return note
}

export function createStandaloneNote(input: UserNoteStandaloneCreateInput): UserNote {
  const info = getDb()
    .prepare(
      `INSERT INTO user_notes (kind, title, body, created_at, updated_at)
       VALUES ('standalone', ?, ?, datetime('now'), datetime('now'))`
    )
    .run(normalizeNullableText(input.title), input.body ?? '')
  const note = getNoteById(Number(info.lastInsertRowid))
  if (!note) throw new Error('Notiz konnte nicht gelesen werden.')
  return note
}

export function updateStandaloneNote(input: UserNoteStandaloneUpdateInput): UserNote {
  assertPositiveId(input.id, 'Notiz-ID')
  const existing = getNoteById(input.id)
  if (!existing || existing.kind !== 'standalone') throw new Error('Freie Notiz nicht gefunden.')
  getDb()
    .prepare(
      `UPDATE user_notes
       SET title = ?, body = ?, updated_at = datetime('now')
       WHERE id = ? AND kind = 'standalone'`
    )
    .run(
      input.title !== undefined ? normalizeNullableText(input.title) : existing.title,
      input.body !== undefined ? input.body : existing.body,
      input.id
    )
  const note = getNoteById(input.id)
  if (!note) throw new Error('Notiz konnte nicht gelesen werden.')
  return note
}

export function getNoteById(id: number): UserNote | null {
  assertPositiveId(id, 'Notiz-ID')
  const row = getDb().prepare<[number], UserNoteRow>(`SELECT ${NOTE_SELECT} FROM user_notes WHERE id = ?`).get(id)
  return row ? rowToNote(row) : null
}

export function deleteNote(id: number): void {
  assertPositiveId(id, 'Notiz-ID')
  getDb().prepare('DELETE FROM user_notes WHERE id = ?').run(id)
}

export function listNotes(filters: UserNoteListFilters = {}): UserNoteListItem[] {
  const where: string[] = []
  const params: unknown[] = []

  const kinds = (filters.kinds ?? []).filter((k) => k === 'mail' || k === 'calendar' || k === 'standalone')
  if (kinds.length > 0) {
    where.push(`n.kind IN (${kinds.map(() => '?').join(', ')})`)
    params.push(...kinds)
  }

  const accountIds = (filters.accountIds ?? []).map((x) => x.trim()).filter(Boolean)
  if (accountIds.length > 0) {
    where.push(`COALESCE(n.account_id, m.account_id) IN (${accountIds.map(() => '?').join(', ')})`)
    params.push(...accountIds)
  }

  if (filters.dateFrom?.trim()) {
    where.push('n.updated_at >= ?')
    params.push(filters.dateFrom.trim())
  }
  if (filters.dateTo?.trim()) {
    where.push('n.updated_at <= ?')
    params.push(filters.dateTo.trim())
  }

  const search = filters.search?.trim()
  if (search) {
    const like = `%${search.replace(/[%_]/g, (ch) => `\\${ch}`)}%`
    where.push(
      `(n.title LIKE ? ESCAPE '\\' OR n.body LIKE ? ESCAPE '\\' OR n.event_title_snapshot LIKE ? ESCAPE '\\' OR m.subject LIKE ? ESCAPE '\\')`
    )
    params.push(like, like, like, like)
  }

  const limit =
    typeof filters.limit === 'number' && Number.isFinite(filters.limit) && filters.limit > 0
      ? Math.min(Math.floor(filters.limit), 1000)
      : 300

  const rows = getDb()
    .prepare(
      `SELECT
         ${NOTE_SELECT_N},
         m.subject as mail_subject,
         m.account_id as mail_account_id,
         m.from_addr as mail_from_addr,
         m.from_name as mail_from_name,
         m.snippet as mail_snippet,
         m.sent_at as mail_sent_at,
         m.received_at as mail_received_at,
         m.is_read as mail_is_read,
         m.has_attachments as mail_has_attachments
       FROM user_notes n
       LEFT JOIN messages m ON m.id = n.message_id
       ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY n.updated_at DESC, n.id DESC
       LIMIT ?`
    )
    .all(...params, limit) as UserNoteListRow[]
  return rows.map(rowToListItem)
}

export function listUserNotesForSettingsBackup(): SettingsBackupUserNoteSnapshot[] {
  const rows = getDb()
    .prepare(
      `SELECT n.kind, n.account_id, n.calendar_source, n.calendar_remote_id, n.event_remote_id,
              n.title, n.body, n.created_at, n.updated_at, n.event_title_snapshot, n.event_start_iso_snapshot,
              m.account_id AS mail_account_id, m.remote_id AS mail_remote_id
       FROM user_notes n
       LEFT JOIN messages m ON m.id = n.message_id
       ORDER BY n.id ASC`
    )
    .all() as Array<{
      kind: 'mail' | 'calendar' | 'standalone'
      account_id: string | null
      calendar_source: 'microsoft' | 'google' | null
      calendar_remote_id: string | null
      event_remote_id: string | null
      title: string | null
      body: string
      created_at: string
      updated_at: string
      event_title_snapshot: string | null
      event_start_iso_snapshot: string | null
      mail_account_id: string | null
      mail_remote_id: string | null
    }>
  return rows.map((r) => {
    if (r.kind === 'mail') {
      return {
        kind: 'mail' as const,
        mailAccountId: r.mail_account_id ?? r.account_id,
        mailRemoteId: r.mail_remote_id,
        title: r.title,
        body: r.body,
        createdAt: r.created_at,
        updatedAt: r.updated_at
      }
    }
    if (r.kind === 'calendar') {
      return {
        kind: 'calendar' as const,
        accountId: r.account_id,
        calendarSource: r.calendar_source,
        calendarRemoteId: r.calendar_remote_id,
        eventRemoteId: r.event_remote_id,
        title: r.title,
        body: r.body,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        eventTitleSnapshot: r.event_title_snapshot,
        eventStartIsoSnapshot: r.event_start_iso_snapshot
      }
    }
    return {
      kind: 'standalone' as const,
      title: r.title,
      body: r.body,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }
  })
}

export function replaceAllUserNotesFromBackup(rows: SettingsBackupUserNoteSnapshot[]): void {
  const db = getDb()
  const resolveMsg = db.prepare<[string, string], { id: number } | undefined>(
    'SELECT id FROM messages WHERE account_id = ? AND remote_id = ?'
  )
  const insMail = db.prepare(
    `INSERT INTO user_notes (kind, message_id, title, body, created_at, updated_at)
     VALUES ('mail', @message_id, @title, @body, @created_at, @updated_at)`
  )
  const insCal = db.prepare(
    `INSERT INTO user_notes (
       kind, message_id, account_id, calendar_source, calendar_remote_id, event_remote_id,
       title, body, created_at, updated_at, event_title_snapshot, event_start_iso_snapshot
     )
     VALUES (
       'calendar', NULL, @account_id, @calendar_source, @calendar_remote_id, @event_remote_id,
       @title, @body, @created_at, @updated_at, @event_title_snapshot, @event_start_iso_snapshot
     )`
  )
  const insStandalone = db.prepare(
    `INSERT INTO user_notes (kind, message_id, title, body, created_at, updated_at)
     VALUES ('standalone', NULL, @title, @body, @created_at, @updated_at)`
  )
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM user_notes').run()
    for (const r of rows) {
      if (r.kind === 'mail') {
        const acc = typeof r.mailAccountId === 'string' ? r.mailAccountId.trim() : ''
        const rid = typeof r.mailRemoteId === 'string' ? r.mailRemoteId.trim() : ''
        if (!acc || !rid) continue
        const m = resolveMsg.get(acc, rid)
        if (!m) continue
        insMail.run({
          message_id: m.id,
          title: r.title,
          body: r.body ?? '',
          created_at: r.createdAt,
          updated_at: r.updatedAt
        })
      } else if (r.kind === 'calendar') {
        const acc = typeof r.accountId === 'string' ? r.accountId.trim() : ''
        const cs = r.calendarSource
        const cr = typeof r.calendarRemoteId === 'string' ? r.calendarRemoteId.trim() : ''
        const er = typeof r.eventRemoteId === 'string' ? r.eventRemoteId.trim() : ''
        if (!acc || (cs !== 'microsoft' && cs !== 'google') || !cr || !er) continue
        insCal.run({
          account_id: acc,
          calendar_source: cs,
          calendar_remote_id: cr,
          event_remote_id: er,
          title: r.title,
          body: r.body ?? '',
          created_at: r.createdAt,
          updated_at: r.updatedAt,
          event_title_snapshot: r.eventTitleSnapshot ?? null,
          event_start_iso_snapshot: r.eventStartIsoSnapshot ?? null
        })
      } else {
        insStandalone.run({
          title: r.title,
          body: r.body ?? '',
          created_at: r.createdAt,
          updated_at: r.updatedAt
        })
      }
    }
  })
  tx()
}
