import { DateTime } from 'luxon'
import type { calendar_v3 } from 'googleapis'
import type { CalendarGraphCalendarRow, CalendarSaveEventRecurrence } from '@shared/types'
import { loadConfig } from '../config'
import { resolveCalendarTimeZone } from '../todo-due-buckets'
import { getGoogleApis } from './google-auth-client'
import type { GraphCalendarEventRow } from '../graph/calendar-graph'
import { buildGoogleEventRecurrence } from '../calendar-recurrence'
import { getCalendarEventsSyncToken, setCalendarEventsSyncToken } from './google-sync-meta-store'

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

export async function googleListCalendars(accountId: string): Promise<CalendarGraphCalendarRow[]> {
  const { calendar } = await getGoogleApis(accountId)
  const res = await calendar.calendarList.list({
    minAccessRole: 'reader',
    showHidden: false
  })
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

  const calMeta = await calendar.calendarList.get({ calendarId })
  const calHex = calMeta.data.backgroundColor ?? null
  const ar = calMeta.data.accessRole
  const calendarCanEdit = ar === 'owner' || ar === 'writer'

  try {
    while (true) {
      const res = await calendar.events.list({
        ...params,
        pageToken
      })
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
  }
): Promise<{ id: string; webLink: string | null }> {
  const { calendar } = await getGoogleApis(accountId)
  const config = await loadConfig()
  const tz = resolveCalendarTimeZone(config.calendarTimeZone)
  const calId = calendarId?.trim() || 'primary'

  const body: calendar_v3.Schema$Event = {
    summary: input.subject,
    location: input.location ?? undefined,
    description: input.bodyHtml ? stripHtmlToText(input.bodyHtml) : undefined
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

  const res = await calendar.events.insert({
    calendarId: calId,
    requestBody: body
  })
  return { id: res.data.id ?? '', webLink: res.data.htmlLink ?? null }
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 8000)
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
  }
): Promise<void> {
  const { calendar } = await getGoogleApis(accountId)
  const config = await loadConfig()
  const tz = resolveCalendarTimeZone(config.calendarTimeZone)

  const body: calendar_v3.Schema$Event = {
    summary: input.subject,
    location: input.location ?? undefined,
    description: input.bodyHtml ? stripHtmlToText(input.bodyHtml) : undefined
  }

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
