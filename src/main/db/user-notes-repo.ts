import { normalizeEntityIconColor } from '@shared/entity-icon-color'
import { getDb } from './index'
import { normalizeMessagesFtsMatchQuery } from './messages-repo'
import type {
  SettingsBackupUserNoteSnapshot,
  UserNote,
  UserNoteCalendarKey,
  UserNoteCalendarUpsertInput,
  UserNoteListFilters,
  UserNoteListInRangeFilters,
  UserNoteListItem,
  UserNoteMailUpsertInput,
  UserNoteMoveToSectionInput,
  UserNoteScheduleInput,
  UserNoteScheduleFields,
  UserNoteSearchFilters,
  UserNoteStandaloneCreateInput,
  UserNoteStandaloneUpdateInput
} from '@shared/types'
import { NOTE_DEFAULT_APPOINTMENT_MINUTES } from '@shared/note-calendar-span'
import {
  deleteAllLinksForNote,
  replaceAllNoteLinksFromBackup
} from './user-note-entity-links-repo'

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
  scheduled_start_iso: string | null
  scheduled_end_iso: string | null
  scheduled_all_day: number
  section_id: number | null
  sort_order: number
  icon_id: string | null
  icon_color: string | null
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
  primary_link_kind: string | null
}

const NOTE_PRIMARY_LINK_SUBQUERY = `(
  SELECT l.target_kind
  FROM user_note_entity_links l
  WHERE l.from_note_id = n.id
  ORDER BY CASE l.target_kind
    WHEN 'mail' THEN 1
    WHEN 'calendar_event' THEN 2
    WHEN 'cloud_task' THEN 3
    ELSE 4
  END,
  l.id ASC
  LIMIT 1
)`

const NOTE_SELECT = `
  id, kind, message_id, account_id, calendar_source, calendar_remote_id, event_remote_id,
  title, body, created_at, updated_at, event_title_snapshot, event_start_iso_snapshot,
  scheduled_start_iso, scheduled_end_iso, scheduled_all_day, section_id, sort_order,
  icon_id, icon_color
`

const NOTE_SELECT_N = `
  n.id, n.kind, n.message_id, n.account_id, n.calendar_source, n.calendar_remote_id, n.event_remote_id,
  n.title, n.body, n.created_at, n.updated_at, n.event_title_snapshot, n.event_start_iso_snapshot,
  n.scheduled_start_iso, n.scheduled_end_iso, n.scheduled_all_day, n.section_id, n.sort_order,
  n.icon_id, n.icon_color
`

export type { NoteCalendarSpan } from '@shared/note-calendar-span'
export { resolveNoteCalendarSpan } from '@shared/note-calendar-span'

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
    eventStartIsoSnapshot: row.event_start_iso_snapshot,
    scheduledStartIso: row.scheduled_start_iso,
    scheduledEndIso: row.scheduled_end_iso,
    scheduledAllDay: !!row.scheduled_all_day,
    sectionId: row.section_id,
    sortOrder: row.sort_order ?? 0,
    iconId: row.icon_id?.trim() ? row.icon_id.trim() : null,
    iconColor: row.icon_color?.trim() ? row.icon_color.trim() : null
  }
}

export function patchNoteDisplay(
  noteId: number,
  patch: { iconId?: string | null; iconColor?: string | null }
): UserNote {
  assertPositiveId(noteId, 'Notiz-ID')
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
  if (sets.length === 0) {
    const existing = getNoteById(noteId)
    if (!existing) throw new Error('Notiz nicht gefunden.')
    return existing
  }
  params.push(noteId)
  getDb()
    .prepare(
      `UPDATE user_notes SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`
    )
    .run(...params)
  const note = getNoteById(noteId)
  if (!note) throw new Error('Notiz nicht gefunden.')
  return note
}

function parsePrimaryLinkKind(value: string | null): UserNoteListItem['primaryLinkKind'] {
  if (
    value === 'note' ||
    value === 'mail' ||
    value === 'calendar_event' ||
    value === 'cloud_task'
  ) {
    return value
  }
  return null
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
    mailHasAttachments: row.mail_has_attachments == null ? null : !!row.mail_has_attachments,
    primaryLinkKind: parsePrimaryLinkKind(row.primary_link_kind)
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

function addMinutesIso(iso: string, minutes: number): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  d.setMinutes(d.getMinutes() + minutes)
  return d.toISOString()
}

function normalizeScheduleFields(fields: UserNoteScheduleFields | undefined): {
  scheduled_start_iso: string | null
  scheduled_end_iso: string | null
  scheduled_all_day: number
} {
  const start = normalizeNullableText(fields?.scheduledStartIso)
  if (!start) {
    return { scheduled_start_iso: null, scheduled_end_iso: null, scheduled_all_day: 0 }
  }
  const end = normalizeNullableText(fields?.scheduledEndIso) ?? addMinutesIso(start, NOTE_DEFAULT_APPOINTMENT_MINUTES)
  return {
    scheduled_start_iso: start,
    scheduled_end_iso: end,
    scheduled_all_day: fields?.scheduledAllDay ? 1 : 0
  }
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
  const schedule = normalizeScheduleFields(input)
  const db = getDb()
  db.prepare(
    `INSERT INTO user_notes (
       kind, message_id, title, body, created_at, updated_at,
       scheduled_start_iso, scheduled_end_iso, scheduled_all_day, section_id, sort_order
     )
     VALUES (
       'mail', @messageId, @title, @body, datetime('now'), datetime('now'),
       @scheduled_start_iso, @scheduled_end_iso, @scheduled_all_day, @section_id, @sort_order
     )
     ON CONFLICT(message_id) WHERE kind = 'mail'
     DO UPDATE SET
       title = excluded.title,
       body = excluded.body,
       updated_at = datetime('now'),
       scheduled_start_iso = excluded.scheduled_start_iso,
       scheduled_end_iso = excluded.scheduled_end_iso,
       scheduled_all_day = excluded.scheduled_all_day,
       section_id = COALESCE(excluded.section_id, user_notes.section_id),
       sort_order = COALESCE(excluded.sort_order, user_notes.sort_order)`
  ).run({
    messageId: Math.floor(input.messageId),
    title: normalizeNullableText(input.title),
    body: input.body ?? '',
    ...schedule,
    section_id: input.sectionId ?? null,
    sort_order: input.sortOrder ?? 0
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
  const schedule = normalizeScheduleFields(input)
  const db = getDb()
  db.prepare(
    `INSERT INTO user_notes (
       kind, account_id, calendar_source, calendar_remote_id, event_remote_id,
       title, body, created_at, updated_at, event_title_snapshot, event_start_iso_snapshot,
       scheduled_start_iso, scheduled_end_iso, scheduled_all_day, section_id, sort_order
     )
     VALUES (
       'calendar', @accountId, @calendarSource, @calendarRemoteId, @eventRemoteId,
       @title, @body, datetime('now'), datetime('now'), @eventTitleSnapshot, @eventStartIsoSnapshot,
       @scheduled_start_iso, @scheduled_end_iso, @scheduled_all_day, @section_id, @sort_order
     )
     ON CONFLICT(account_id, calendar_source, calendar_remote_id, event_remote_id) WHERE kind = 'calendar'
     DO UPDATE SET
       title = excluded.title,
       body = excluded.body,
       updated_at = datetime('now'),
       event_title_snapshot = excluded.event_title_snapshot,
       event_start_iso_snapshot = excluded.event_start_iso_snapshot,
       scheduled_start_iso = excluded.scheduled_start_iso,
       scheduled_end_iso = excluded.scheduled_end_iso,
       scheduled_all_day = excluded.scheduled_all_day,
       section_id = COALESCE(excluded.section_id, user_notes.section_id),
       sort_order = COALESCE(excluded.sort_order, user_notes.sort_order)`
  ).run({
    accountId: input.accountId,
    calendarSource: input.calendarSource,
    calendarRemoteId: input.calendarRemoteId,
    eventRemoteId: input.eventRemoteId,
    title: normalizeNullableText(input.title),
    body: input.body ?? '',
    eventTitleSnapshot: normalizeNullableText(input.eventTitleSnapshot),
    eventStartIsoSnapshot: normalizeNullableText(input.eventStartIsoSnapshot),
    ...schedule,
    section_id: input.sectionId ?? null,
    sort_order: input.sortOrder ?? 0
  })
  const note = getCalendarNote(input)
  if (!note) throw new Error('Notiz konnte nicht gelesen werden.')
  return note
}

export function createStandaloneNote(input: UserNoteStandaloneCreateInput): UserNote {
  const schedule = normalizeScheduleFields(input)
  const info = getDb()
    .prepare(
      `INSERT INTO user_notes (
         kind, title, body, created_at, updated_at,
         scheduled_start_iso, scheduled_end_iso, scheduled_all_day, section_id, sort_order
       )
       VALUES (
         'standalone', ?, ?, datetime('now'), datetime('now'),
         ?, ?, ?, ?, ?
       )`
    )
    .run(
      normalizeNullableText(input.title),
      input.body ?? '',
      schedule.scheduled_start_iso,
      schedule.scheduled_end_iso,
      schedule.scheduled_all_day,
      input.sectionId ?? null,
      input.sortOrder ?? 0
    )
  const note = getNoteById(Number(info.lastInsertRowid))
  if (!note) throw new Error('Notiz konnte nicht gelesen werden.')
  return note
}

export function updateStandaloneNote(input: UserNoteStandaloneUpdateInput): UserNote {
  assertPositiveId(input.id, 'Notiz-ID')
  const existing = getNoteById(input.id)
  if (!existing || existing.kind !== 'standalone') throw new Error('Freie Notiz nicht gefunden.')

  let schedule = {
    scheduled_start_iso: existing.scheduledStartIso,
    scheduled_end_iso: existing.scheduledEndIso,
    scheduled_all_day: existing.scheduledAllDay ? 1 : 0
  }
  if (input.clearSchedule) {
    schedule = { scheduled_start_iso: null, scheduled_end_iso: null, scheduled_all_day: 0 }
  } else if (
    input.scheduledStartIso !== undefined ||
    input.scheduledEndIso !== undefined ||
    input.scheduledAllDay !== undefined
  ) {
    schedule = normalizeScheduleFields({
      scheduledStartIso: input.scheduledStartIso ?? existing.scheduledStartIso,
      scheduledEndIso: input.scheduledEndIso ?? existing.scheduledEndIso,
      scheduledAllDay: input.scheduledAllDay ?? existing.scheduledAllDay
    })
  }

  getDb()
    .prepare(
      `UPDATE user_notes
       SET title = ?, body = ?, updated_at = datetime('now'),
           scheduled_start_iso = ?, scheduled_end_iso = ?, scheduled_all_day = ?,
           section_id = ?, sort_order = ?
       WHERE id = ? AND kind = 'standalone'`
    )
    .run(
      input.title !== undefined ? normalizeNullableText(input.title) : existing.title,
      input.body !== undefined ? input.body : existing.body,
      schedule.scheduled_start_iso,
      schedule.scheduled_end_iso,
      schedule.scheduled_all_day,
      input.sectionId !== undefined ? input.sectionId : existing.sectionId,
      input.sortOrder !== undefined ? input.sortOrder : existing.sortOrder,
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

export function setNoteSchedule(input: UserNoteScheduleInput): UserNote {
  assertPositiveId(input.id, 'Notiz-ID')
  const schedule = normalizeScheduleFields(input)
  getDb()
    .prepare(
      `UPDATE user_notes
       SET scheduled_start_iso = ?, scheduled_end_iso = ?, scheduled_all_day = ?,
           updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(
      schedule.scheduled_start_iso,
      schedule.scheduled_end_iso,
      schedule.scheduled_all_day,
      input.id
    )
  const note = getNoteById(input.id)
  if (!note) throw new Error('Notiz nicht gefunden.')
  return note
}

export function clearNoteSchedule(id: number): UserNote {
  assertPositiveId(id, 'Notiz-ID')
  getDb()
    .prepare(
      `UPDATE user_notes
       SET scheduled_start_iso = NULL, scheduled_end_iso = NULL, scheduled_all_day = 0,
           updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(id)
  const note = getNoteById(id)
  if (!note) throw new Error('Notiz nicht gefunden.')
  return note
}

export function moveNoteToSection(input: UserNoteMoveToSectionInput): UserNote {
  assertPositiveId(input.noteId, 'Notiz-ID')
  if (input.sectionId != null) {
    assertPositiveId(input.sectionId, 'Sektions-ID')
    const section = getDb().prepare('SELECT 1 FROM note_sections WHERE id = ?').get(input.sectionId)
    if (!section) throw new Error('Sektion nicht gefunden.')
  }
  const sortOrder =
    input.sortOrder ??
    ((): number => {
      const row = getDb()
        .prepare(
          `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order
           FROM user_notes
           WHERE section_id IS ?`
        )
        .get(input.sectionId) as { next_order: number } | undefined
      return row?.next_order ?? 0
    })()
  getDb()
    .prepare(
      `UPDATE user_notes SET section_id = ?, sort_order = ?, updated_at = datetime('now') WHERE id = ?`
    )
    .run(input.sectionId, sortOrder, input.noteId)
  const note = getNoteById(input.noteId)
  if (!note) throw new Error('Notiz nicht gefunden.')
  return note
}

export function deleteNote(id: number): void {
  assertPositiveId(id, 'Notiz-ID')
  deleteAllLinksForNote(id)
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

  if (filters.scheduledOnly) {
    where.push('n.scheduled_start_iso IS NOT NULL')
  }

  if (filters.sectionId !== undefined) {
    if (filters.sectionId === null) {
      where.push('n.section_id IS NULL')
    } else {
      where.push('n.section_id = ?')
      params.push(filters.sectionId)
    }
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
         m.has_attachments as mail_has_attachments,
         ${NOTE_PRIMARY_LINK_SUBQUERY} as primary_link_kind
       FROM user_notes n
       LEFT JOIN messages m ON m.id = n.message_id
       ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY COALESCE(n.section_id, 2147483647), n.sort_order ASC, n.updated_at DESC, n.id DESC
       LIMIT ?`
    )
    .all(...params, limit) as UserNoteListRow[]
  return rows.map(rowToListItem)
}

/**
 * FTS5-Volltextsuche ueber Titel, Body, Termin-Titel und Mail-Betreff.
 */
export function searchNotes(filters: UserNoteSearchFilters): UserNoteListItem[] {
  const cleaned = normalizeMessagesFtsMatchQuery(filters.query)
  if (!cleaned) return []

  const kinds = (filters.kinds ?? []).filter((k) => k === 'mail' || k === 'calendar' || k === 'standalone')
  const kindClause =
    kinds.length > 0 ? `AND n.kind IN (${kinds.map(() => '?').join(', ')})` : ''

  const limit =
    typeof filters.limit === 'number' && Number.isFinite(filters.limit) && filters.limit > 0
      ? Math.min(Math.floor(filters.limit), 100)
      : 30

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
         m.has_attachments as mail_has_attachments,
         ${NOTE_PRIMARY_LINK_SUBQUERY} as primary_link_kind
       FROM user_notes_fts fts
       JOIN user_notes n ON n.id = fts.rowid
       LEFT JOIN messages m ON m.id = n.message_id
       WHERE user_notes_fts MATCH ?
       ${kindClause}
       ORDER BY bm25(user_notes_fts), n.updated_at DESC, n.id DESC
       LIMIT ?`
    )
    .all(...(kinds.length > 0 ? [cleaned, ...kinds, limit] : [cleaned, limit])) as UserNoteListRow[]

  return rows.map(rowToListItem)
}

export function listNotesInRange(filters: UserNoteListInRangeFilters): UserNoteListItem[] {
  const startIso = filters.startIso?.trim()
  const endIso = filters.endIso?.trim()
  if (!startIso || !endIso) return []

  const where: string[] = ['n.scheduled_start_iso IS NOT NULL']
  const params: unknown[] = []

  const kinds = (filters.kinds ?? []).filter((k) => k === 'mail' || k === 'calendar' || k === 'standalone')
  if (kinds.length > 0) {
    where.push(`n.kind IN (${kinds.map(() => '?').join(', ')})`)
    params.push(...kinds)
  }

  where.push(
    `(n.scheduled_all_day = 1 AND date(n.scheduled_start_iso) < date(?) AND date(COALESCE(n.scheduled_end_iso, n.scheduled_start_iso)) >= date(?))
     OR (n.scheduled_all_day = 0 AND n.scheduled_start_iso < ? AND COALESCE(n.scheduled_end_iso, datetime(n.scheduled_start_iso, '+30 minutes')) > ?)`
  )
  params.push(endIso, startIso, endIso, startIso)

  const limit =
    typeof filters.limit === 'number' && Number.isFinite(filters.limit) && filters.limit > 0
      ? Math.min(Math.floor(filters.limit), 500)
      : 500

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
         m.has_attachments as mail_has_attachments,
         ${NOTE_PRIMARY_LINK_SUBQUERY} as primary_link_kind
       FROM user_notes n
       LEFT JOIN messages m ON m.id = n.message_id
       WHERE ${where.join(' AND ')}
       ORDER BY n.scheduled_start_iso ASC, n.id ASC
       LIMIT ?`
    )
    .all(...params, limit) as UserNoteListRow[]
  return rows.map(rowToListItem)
}

export function listUserNoteIdsInBackupOrder(): number[] {
  const rows = getDb().prepare('SELECT id FROM user_notes ORDER BY id ASC').all() as Array<{ id: number }>
  return rows.map((r) => r.id)
}

export function restoreUserNoteLinksFromSnapshots(
  rows: SettingsBackupUserNoteSnapshot[],
  noteIds: number[]
): void {
  const links: Array<{ fromNoteIndex: number; toNoteIndex: number; createdAt: string }> = []
  rows.forEach((row, fromIndex) => {
    for (const toIndex of row.linkedToNoteIndices ?? []) {
      links.push({ fromNoteIndex: fromIndex, toNoteIndex: toIndex, createdAt: row.updatedAt })
    }
  })
  if (links.length > 0) {
    replaceAllNoteLinksFromBackup(links, noteIds)
  }
}

export function listUserNotesForSettingsBackup(): SettingsBackupUserNoteSnapshot[] {
  const rows = getDb()
    .prepare(
      `SELECT n.id, n.kind, n.account_id, n.calendar_source, n.calendar_remote_id, n.event_remote_id,
              n.title, n.body, n.created_at, n.updated_at, n.event_title_snapshot, n.event_start_iso_snapshot,
              n.scheduled_start_iso, n.scheduled_end_iso, n.scheduled_all_day, n.section_id, n.sort_order,
              n.icon_id, n.icon_color,
              m.account_id AS mail_account_id, m.remote_id AS mail_remote_id
       FROM user_notes n
       LEFT JOIN messages m ON m.id = n.message_id
       ORDER BY n.id ASC`
    )
    .all() as Array<{
      id: number
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
      scheduled_start_iso: string | null
      scheduled_end_iso: string | null
      scheduled_all_day: number
      section_id: number | null
      sort_order: number
      icon_id: string | null
      icon_color: string | null
      mail_account_id: string | null
      mail_remote_id: string | null
    }>

  const sectionRows = getDb().prepare('SELECT id FROM note_sections ORDER BY id ASC').all() as Array<{ id: number }>
  const sectionIdToIndex = new Map(sectionRows.map((s, i) => [s.id, i]))

  const linkRows = getDb()
    .prepare('SELECT from_note_id, to_note_id FROM user_note_links ORDER BY from_note_id, to_note_id')
    .all() as Array<{ from_note_id: number; to_note_id: number }>
  const noteIdToIndex = new Map(rows.map((r, i) => [r.id, i]))
  const linksByFrom = new Map<number, number[]>()
  for (const link of linkRows) {
    const fromIdx = noteIdToIndex.get(link.from_note_id)
    const toIdx = noteIdToIndex.get(link.to_note_id)
    if (fromIdx === undefined || toIdx === undefined) continue
    const list = linksByFrom.get(fromIdx) ?? []
    list.push(toIdx)
    linksByFrom.set(fromIdx, list)
  }

  return rows.map((r, index) => {
    const scheduleExtras = {
      scheduledStartIso: r.scheduled_start_iso,
      scheduledEndIso: r.scheduled_end_iso,
      scheduledAllDay: !!r.scheduled_all_day,
      sectionIndex: r.section_id != null ? (sectionIdToIndex.get(r.section_id) ?? null) : null,
      sortOrder: r.sort_order ?? 0,
      iconId: r.icon_id?.trim() || null,
      iconColor: r.icon_color?.trim() || null,
      linkedToNoteIndices: linksByFrom.get(index) ?? []
    }
    if (r.kind === 'mail') {
      return {
        kind: 'mail' as const,
        mailAccountId: r.mail_account_id ?? r.account_id,
        mailRemoteId: r.mail_remote_id,
        title: r.title,
        body: r.body,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        ...scheduleExtras
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
        eventStartIsoSnapshot: r.event_start_iso_snapshot,
        ...scheduleExtras
      }
    }
    return {
      kind: 'standalone' as const,
      title: r.title,
      body: r.body,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      ...scheduleExtras
    }
  })
}

export function replaceAllUserNotesFromBackup(
  rows: SettingsBackupUserNoteSnapshot[],
  sectionIdsByIndex: number[]
): number[] {
  const db = getDb()
  const resolveMsg = db.prepare<[string, string], { id: number } | undefined>(
    'SELECT id FROM messages WHERE account_id = ? AND remote_id = ?'
  )
  const insMail = db.prepare(
    `INSERT INTO user_notes (
       kind, message_id, title, body, created_at, updated_at,
       scheduled_start_iso, scheduled_end_iso, scheduled_all_day, section_id, sort_order,
       icon_id, icon_color
     )
     VALUES (
       'mail', @message_id, @title, @body, @created_at, @updated_at,
       @scheduled_start_iso, @scheduled_end_iso, @scheduled_all_day, @section_id, @sort_order,
       @icon_id, @icon_color
     )`
  )
  const insCal = db.prepare(
    `INSERT INTO user_notes (
       kind, message_id, account_id, calendar_source, calendar_remote_id, event_remote_id,
       title, body, created_at, updated_at, event_title_snapshot, event_start_iso_snapshot,
       scheduled_start_iso, scheduled_end_iso, scheduled_all_day, section_id, sort_order,
       icon_id, icon_color
     )
     VALUES (
       'calendar', NULL, @account_id, @calendar_source, @calendar_remote_id, @event_remote_id,
       @title, @body, @created_at, @updated_at, @event_title_snapshot, @event_start_iso_snapshot,
       @scheduled_start_iso, @scheduled_end_iso, @scheduled_all_day, @section_id, @sort_order,
       @icon_id, @icon_color
     )`
  )
  const insStandalone = db.prepare(
    `INSERT INTO user_notes (
       kind, message_id, title, body, created_at, updated_at,
       scheduled_start_iso, scheduled_end_iso, scheduled_all_day, section_id, sort_order,
       icon_id, icon_color
     )
     VALUES (
       'standalone', NULL, @title, @body, @created_at, @updated_at,
       @scheduled_start_iso, @scheduled_end_iso, @scheduled_all_day, @section_id, @sort_order,
       @icon_id, @icon_color
     )`
  )

  const noteIds: number[] = []
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM user_note_links').run()
    db.prepare('DELETE FROM user_notes').run()
    for (const r of rows) {
      const sectionId =
        r.sectionIndex != null && r.sectionIndex >= 0 && r.sectionIndex < sectionIdsByIndex.length
          ? sectionIdsByIndex[r.sectionIndex] ?? null
          : null
      const schedule = {
        scheduled_start_iso: normalizeNullableText(r.scheduledStartIso),
        scheduled_end_iso: normalizeNullableText(r.scheduledEndIso),
        scheduled_all_day: r.scheduledAllDay ? 1 : 0,
        section_id: sectionId,
        sort_order: r.sortOrder ?? 0,
        icon_id: normalizeNullableText(r.iconId),
        icon_color: normalizeEntityIconColor(r.iconColor)
      }
      if (r.kind === 'mail') {
        const acc = typeof r.mailAccountId === 'string' ? r.mailAccountId.trim() : ''
        const rid = typeof r.mailRemoteId === 'string' ? r.mailRemoteId.trim() : ''
        if (!acc || !rid) {
          noteIds.push(0)
          continue
        }
        const m = resolveMsg.get(acc, rid)
        if (!m) {
          noteIds.push(0)
          continue
        }
        const info = insMail.run({
          message_id: m.id,
          title: r.title,
          body: r.body ?? '',
          created_at: r.createdAt,
          updated_at: r.updatedAt,
          ...schedule
        })
        noteIds.push(Number(info.lastInsertRowid))
      } else if (r.kind === 'calendar') {
        const acc = typeof r.accountId === 'string' ? r.accountId.trim() : ''
        const cs = r.calendarSource
        const cr = typeof r.calendarRemoteId === 'string' ? r.calendarRemoteId.trim() : ''
        const er = typeof r.eventRemoteId === 'string' ? r.eventRemoteId.trim() : ''
        if (!acc || (cs !== 'microsoft' && cs !== 'google') || !cr || !er) {
          noteIds.push(0)
          continue
        }
        const info = insCal.run({
          account_id: acc,
          calendar_source: cs,
          calendar_remote_id: cr,
          event_remote_id: er,
          title: r.title,
          body: r.body ?? '',
          created_at: r.createdAt,
          updated_at: r.updatedAt,
          event_title_snapshot: r.eventTitleSnapshot ?? null,
          event_start_iso_snapshot: r.eventStartIsoSnapshot ?? null,
          ...schedule
        })
        noteIds.push(Number(info.lastInsertRowid))
      } else {
        const info = insStandalone.run({
          title: r.title,
          body: r.body ?? '',
          created_at: r.createdAt,
          updated_at: r.updatedAt,
          ...schedule
        })
        noteIds.push(Number(info.lastInsertRowid))
      }
    }
  })
  tx()
  return noteIds
}
