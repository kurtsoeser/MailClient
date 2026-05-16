import { DateTime } from 'luxon'
import type { calendar_v3 } from 'googleapis'
import type { CalendarGraphCalendarRow, CalendarSaveEventRecurrence } from '@shared/types'
import { loadConfig } from '../config'
import { resolveCalendarTimeZone } from '../todo-due-buckets'
import { getGoogleApis } from './google-auth-client'
import type { GraphCalendarEventRow, GraphCalendarEventDetail } from '../graph/calendar-graph'
import { buildGoogleEventRecurrence } from '../calendar-recurrence'
import { getCalendarEventsSyncToken, setCalendarEventsSyncToken } from './google-sync-meta-store'
import { withGoogleUsageLimitRetry } from './google-api-usage-retry'

const SIMPLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i
const MAX_GOOGLE_EVENT_ATTENDEES = 40
const GOOGLE_CAL_DESCRIPTION_MAX = 8192

/** Google `attendees` (dedupliziert, max. 40). */
export function buildGoogleAttendees(
  emails: string[] | null | undefined
): calendar_v3.Schema$EventAttendee[] {
  if (!emails?.length) return []
  const seen = new Set<string>()
  const out: calendar_v3.Schema$EventAttendee[] = []
  for (const raw of emails) {
    const a = raw.trim().toLowerCase()
    if (!a || !SIMPLE_EMAIL.test(a) || seen.has(a)) continue
    seen.add(a)
    out.push({ email: a })
    if (out.length >= MAX_GOOGLE_EVENT_ATTENDEES) break
  }
  return out
}

function escapeHtmlPlain(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function normalizeGoogleEventDescriptionHtml(raw: string | null | undefined): string | null {
  const c = raw?.trim()
  if (!c) return null
  if (/<[a-z][\s\S]*>/i.test(c)) return c
  return `<p>${escapeHtmlPlain(c).replace(/\n/g, '<br>')}</p>`
}

function isEffectivelyEmptyEditorHtml(html: string): boolean {
  const t = html.replace(/<[^>]+>/gi, '').replace(/\u00a0/g, ' ').trim()
  return t.length === 0
}

/** Google `description` ist ein String; HTML bleibt als Zeichenkette erhalten (wie Web-Outlook). */
function googleCalendarDescriptionFromEditorHtml(html: string | null | undefined): string | undefined {
  if (html === null || html === undefined) return undefined
  if (isEffectivelyEmptyEditorHtml(html)) return ''
  const t = html.trim().replace(/\0/g, '').slice(0, GOOGLE_CAL_DESCRIPTION_MAX)
  return t || ''
}

function googleDateToIso(
  dt: calendar_v3.Schema$EventDateTime | null | undefined,
  fallbackTz: string,
  isAllDay: boolean
): string | null {
  if (!dt) return null
  if (isAllDay && dt.date) {
    return /^\d{4}-\d{2}-\d{2}$/.test(dt.date) ? dt.date : null
  }
  const s = dt.dateTime
  if (!s) return null
  const norm = s.replace(/(\.\d{3})\d+/, '$1').trim()
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(norm)) {
    const d = DateTime.fromISO(norm, { setZone: true })
    return d.isValid ? d.toUTC().toISO() : null
  }
  const zone = dt.timeZone?.trim() || fallbackTz
  const d = DateTime.fromISO(norm, { zone })
  return d.isValid ? d.toUTC().toISO() : null
}

function rowFromGoogleEvent(
  ev: calendar_v3.Schema$Event,
  calendarId: string,
  calendarHex: string | null,
  calendarCanEdit: boolean
): GraphCalendarEventRow | null {
  const allDay = Boolean(ev.start?.date && ev.end?.date)
  const tz = ev.start?.timeZone ?? 'UTC'
  const startIso = googleDateToIso(ev.start, tz, allDay)
  const endIso = googleDateToIso(ev.end, tz, allDay)
  if (!startIso || !endIso || !ev.id) return null
  return {
    id: ev.id,
    subject: ev.summary ?? null,
    startIso,
    endIso,
    isAllDay: allDay,
    location: ev.location ?? null,
    webLink: ev.htmlLink ?? null,
    joinUrl: ev.hangoutLink ?? ev.conferenceData?.entryPoints?.[0]?.uri ?? null,
    organizer: ev.organizer?.email ?? ev.organizer?.displayName ?? null,
    categories: [],
    displayColorHex: calendarHex,
    graphCalendarId: calendarId,
    calendarCanEdit
  }
}

const GOOGLE_CALENDAR_LIST_TTL_MS = 5 * 60 * 1000

const googleCalendarListCache = new Map<
  string,
  { fetchedAt: number; rows: CalendarGraphCalendarRow[] }
>()
const googleCalendarListInflight = new Map<string, Promise<CalendarGraphCalendarRow[]>>()

function cloneCalendarGraphRows(rows: CalendarGraphCalendarRow[]): CalendarGraphCalendarRow[] {
  return rows.map((r) => ({ ...r }))
}

async function fetchGoogleCalendarListUncached(accountId: string): Promise<CalendarGraphCalendarRow[]> {
  const { calendar } = await getGoogleApis(accountId)
  const res = await withGoogleUsageLimitRetry('calendarList.list', () =>
    calendar.calendarList.list({
      minAccessRole: 'reader',
      showHidden: false
    })
  )
  const items = res.data.items ?? []
  return items
    .filter((c) => c.id)
    .map((c) => ({
      id: c.id!,
      name: c.summaryOverride?.trim() || c.summary?.trim() || c.id!,
      isDefaultCalendar: Boolean(c.primary),
      color: c.colorId ?? null,
      hexColor: c.backgroundColor ?? null,
      canEdit: c.accessRole === 'owner' || c.accessRole === 'writer',
      provider: 'google' as const,
      accessRole: c.accessRole ?? null
    }))
}

export async function googleListCalendars(
  accountId: string,
  opts?: { forceRefresh?: boolean }
): Promise<CalendarGraphCalendarRow[]> {
  if (!opts?.forceRefresh) {
    const hit = googleCalendarListCache.get(accountId)
    if (hit && Date.now() - hit.fetchedAt < GOOGLE_CALENDAR_LIST_TTL_MS) {
      return cloneCalendarGraphRows(hit.rows)
    }
  }

  while (googleCalendarListInflight.has(accountId)) {
    await googleCalendarListInflight.get(accountId)
  }

  if (!opts?.forceRefresh) {
    const hit = googleCalendarListCache.get(accountId)
    if (hit && Date.now() - hit.fetchedAt < GOOGLE_CALENDAR_LIST_TTL_MS) {
      return cloneCalendarGraphRows(hit.rows)
    }
  }

  const run = fetchGoogleCalendarListUncached(accountId).then((rows) => {
    googleCalendarListCache.set(accountId, { fetchedAt: Date.now(), rows })
    return rows
  })
  googleCalendarListInflight.set(accountId, run)
  try {
    const rows = await run
    return cloneCalendarGraphRows(rows)
  } finally {
    if (googleCalendarListInflight.get(accountId) === run) {
      googleCalendarListInflight.delete(accountId)
    }
  }
}

export async function googleListEventsInCalendar(
  accountId: string,
  calendarId: string,
  start: Date,
  end: Date,
  useIncremental: boolean
): Promise<GraphCalendarEventRow[]> {
  const { calendar } = await getGoogleApis(accountId)
  const config = await loadConfig()
  const tz = resolveCalendarTimeZone(config.calendarTimeZone)

  let syncToken: string | null = null
  if (useIncremental) {
    syncToken = await getCalendarEventsSyncToken(accountId, calendarId)
  }

  const params: calendar_v3.Params$Resource$Events$List = {
    calendarId,
    singleEvents: true,
    timeZone: tz
  }

  if (syncToken) {
    params.syncToken = syncToken
  } else {
    params.timeMin = start.toISOString()
    params.timeMax = end.toISOString()
    params.orderBy = 'startTime'
  }

  let pageToken: string | undefined
  const rows: GraphCalendarEventRow[] = []
  let latestSyncToken: string | null = null

  const calMeta = await withGoogleUsageLimitRetry('calendarList.get', () =>
    calendar.calendarList.get({ calendarId })
  )
  const calHex = calMeta.data.backgroundColor ?? null
  const ar = calMeta.data.accessRole
  const calendarCanEdit = ar === 'owner' || ar === 'writer'

  try {
    while (true) {
      const res = await withGoogleUsageLimitRetry('events.list', () =>
        calendar.events.list({
          ...params,
          pageToken
        })
      )
      if (res.data.nextSyncToken) {
        latestSyncToken = res.data.nextSyncToken
      }
      for (const ev of res.data.items ?? []) {
        if (ev.status === 'cancelled') continue
        const row = rowFromGoogleEvent(ev, calendarId, calHex, calendarCanEdit)
        if (row) rows.push(row)
      }
      pageToken = res.data.nextPageToken ?? undefined
      if (!pageToken) break
    }
  } catch (e: unknown) {
    const err = e as { code?: number }
    if (syncToken && (err.code === 410 || err.code === 400)) {
      await setCalendarEventsSyncToken(accountId, calendarId, null)
      return googleListEventsInCalendar(accountId, calendarId, start, end, false)
    }
    throw e
  }

  if (latestSyncToken) {
    await setCalendarEventsSyncToken(accountId, calendarId, latestSyncToken)
  }

  return rows
}

export async function googleCreateEvent(
  accountId: string,
  calendarId: string | null | undefined,
  input: {
    subject: string
    startIso: string
    endIso: string
    isAllDay: boolean
    location?: string | null
    bodyHtml?: string | null
    recurrence?: CalendarSaveEventRecurrence | null
    attendeeEmails?: string[] | null
  }
): Promise<{ id: string; webLink: string | null }> {
  const { calendar } = await getGoogleApis(accountId)
  const config = await loadConfig()
  const tz = resolveCalendarTimeZone(config.calendarTimeZone)
  const calId = calendarId?.trim() || 'primary'

  const body: calendar_v3.Schema$Event = {
    summary: input.subject,
    location: input.location ?? undefined
  }
  const descCreate = googleCalendarDescriptionFromEditorHtml(input.bodyHtml ?? null)
  if (descCreate !== undefined && descCreate !== '') {
    body.description = descCreate
  }

  if (input.isAllDay) {
    body.start = { date: input.startIso.slice(0, 10) }
    body.end = { date: input.endIso.slice(0, 10) }
  } else {
    body.start = { dateTime: input.startIso, timeZone: tz }
    body.end = { dateTime: input.endIso, timeZone: tz }
  }

  if (input.recurrence) {
    const startLocal = input.isAllDay
      ? DateTime.fromISO(input.startIso.slice(0, 10), { zone: tz })
      : DateTime.fromISO(input.startIso, { zone: 'utc' }).setZone(tz)
    if (!startLocal.isValid) {
      throw new Error('Serientermin: Startdatum fuer Wiederholung ungueltig.')
    }
    body.recurrence = buildGoogleEventRecurrence(input.recurrence, startLocal, tz, input.isAllDay)
  }

  const attendees = buildGoogleAttendees(input.attendeeEmails)
  if (attendees.length > 0) {
    body.attendees = attendees
  }

  const res = await calendar.events.insert({
    calendarId: calId,
    sendUpdates: attendees.length > 0 ? 'all' : undefined,
    requestBody: body
  })
  return { id: res.data.id ?? '', webLink: res.data.htmlLink ?? null }
}

export async function googleUpdateEvent(
  accountId: string,
  calendarId: string,
  eventId: string,
  input: {
    subject: string
    startIso: string
    endIso: string
    isAllDay: boolean
    location?: string | null
    bodyHtml?: string | null
    attendeeEmails?: string[] | null
  }
): Promise<void> {
  const { calendar } = await getGoogleApis(accountId)
  const config = await loadConfig()
  const tz = resolveCalendarTimeZone(config.calendarTimeZone)

  const descPatch = googleCalendarDescriptionFromEditorHtml(input.bodyHtml ?? null)
  const body: calendar_v3.Schema$Event = {
    summary: input.subject,
    location: input.location ?? undefined,
    ...(descPatch !== undefined ? { description: descPatch } : {})
  }

  if (input.isAllDay) {
    body.start = { date: input.startIso.slice(0, 10) }
    body.end = { date: input.endIso.slice(0, 10) }
  } else {
    body.start = { dateTime: input.startIso, timeZone: tz }
    body.end = { dateTime: input.endIso, timeZone: tz }
  }

  let sendUpdates: 'all' | undefined
  if (input.attendeeEmails !== undefined) {
    const attendees = buildGoogleAttendees(input.attendeeEmails ?? [])
    body.attendees = attendees
    sendUpdates = 'all'
  }

  await calendar.events.patch({
    calendarId,
    eventId,
    sendUpdates,
    requestBody: body
  })
}

export async function googlePatchEventTimes(
  accountId: string,
  calendarId: string,
  eventId: string,
  input: { startIso: string; endIso: string; isAllDay: boolean }
): Promise<void> {
  const { calendar } = await getGoogleApis(accountId)
  const config = await loadConfig()
  const tz = resolveCalendarTimeZone(config.calendarTimeZone)
  const body: calendar_v3.Schema$Event = {}
  if (input.isAllDay) {
    body.start = { date: input.startIso.slice(0, 10) }
    body.end = { date: input.endIso.slice(0, 10) }
  } else {
    body.start = { dateTime: input.startIso, timeZone: tz }
    body.end = { dateTime: input.endIso, timeZone: tz }
  }
  await calendar.events.patch({
    calendarId,
    eventId,
    requestBody: body
  })
}

export async function googleDeleteEvent(
  accountId: string,
  calendarId: string,
  eventId: string
): Promise<void> {
  const { calendar } = await getGoogleApis(accountId)
  await calendar.events.delete({ calendarId, eventId })
}

/** Termin-Details inkl. Beschreibung (Google `description`, oft HTML) fuer den Dialog. */
export async function googleGetCalendarEventDetail(
  accountId: string,
  calendarId: string,
  eventId: string
): Promise<GraphCalendarEventDetail> {
  const { calendar } = await getGoogleApis(accountId)
  const res = await withGoogleUsageLimitRetry('events.get', () =>
    calendar.events.get({
      calendarId,
      eventId,
      fields:
        'summary,description,location,hangoutLink,conferenceData,attendees(email),organizer(email,displayName)'
    })
  )
  const ev = res.data
  const emails: string[] = []
  const seen = new Set<string>()
  for (const at of ev.attendees ?? []) {
    const addr = at.email?.trim().toLowerCase()
    if (!addr || !SIMPLE_EMAIL.test(addr) || seen.has(addr)) continue
    seen.add(addr)
    emails.push(addr)
    if (emails.length >= MAX_GOOGLE_EVENT_ATTENDEES) break
  }
  const joinUrl =
    ev.hangoutLink?.trim() ||
    ev.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri?.trim() ||
    ev.conferenceData?.entryPoints?.[0]?.uri?.trim() ||
    null
  const isOnlineMeeting = Boolean(
    joinUrl || (ev.conferenceData?.entryPoints && ev.conferenceData.entryPoints.length > 0)
  )
  const organizer =
    ev.organizer?.email?.trim() || ev.organizer?.displayName?.trim() || null
  return {
    subject: ev.summary ?? null,
    attendeeEmails: emails,
    joinUrl,
    isOnlineMeeting,
    bodyHtml: normalizeGoogleEventDescriptionHtml(ev.description ?? null),
    location: ev.location?.trim() || null,
    organizer
  }
}
