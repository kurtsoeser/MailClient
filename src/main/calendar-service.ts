import { listAccounts } from './accounts'
import {
  graphListCalendarView,
  graphListCalendarViewInCalendar,
  graphListCalendars,
  graphListM365GroupCalendarPage,
  graphPatchCalendarColor,
  graphCreateTeamsCalendarEvent,
  graphCreateSimpleCalendarEvent,
  graphUpdateCalendarEvent,
  graphPatchCalendarEventTimes,
  graphDeleteCalendarEvent,
  graphPatchEventCategories,
  graphGetCalendarEvent,
  type GraphCalendarEventRow,
  type CreateTeamsCalendarEventInput,
  type CreateTeamsCalendarEventResult
} from './graph/calendar-graph'
import {
  googleListCalendars,
  googleListEventsInCalendar,
  googleCreateEvent,
  googleUpdateEvent,
  googlePatchEventTimes,
  googleDeleteEvent,
  googleGetCalendarEventDetail
} from './google/calendar-google'
import { addDays, min as minDate, startOfDay } from 'date-fns'
import { getMessageById } from './db/messages-repo'
import type {
  CalendarEventView,
  CalendarSuggestionFromMail,
  CalendarSaveEventInput,
  CalendarSaveEventResult,
  CalendarUpdateEventInput,
  CalendarDeleteEventInput,
  CalendarGraphCalendarRow,
  CalendarM365GroupCalendarsPage,
  CalendarPatchCalendarColorInput,
  CalendarPatchScheduleInput,
  CalendarIncludeCalendarRef,
  ConnectedAccount,
  CalendarGetEventInput,
  CalendarGetEventResult
} from '@shared/types'

export type CalendarListEventsFocus =
  | null
  | undefined
  | { accountId: string; graphCalendarId: string }

export interface ListMergedCalendarEventsOptions {
  focus?: CalendarListEventsFocus
  includeCalendars?: CalendarIncludeCalendarRef[] | null
  /** Google: `syncToken`-Delta statt Zeitfenster (Hintergrund-Sync). Standard: false. */
  googleIncremental?: boolean
}

const DEFAULT_CALENDAR_LOAD_AHEAD_DAYS = 365

/** Ende des fuer ein Konto angefragten Zeitraums (Ansicht vs. Vorausschau ab heute). */
function effectiveFetchEndForAccount(acc: ConnectedAccount, viewEnd: Date): Date {
  if (acc.calendarLoadAheadDays === null) {
    return viewEnd
  }
  const days = acc.calendarLoadAheadDays ?? DEFAULT_CALENDAR_LOAD_AHEAD_DAYS
  const cap = addDays(startOfDay(new Date()), days)
  return minDate([viewEnd, cap])
}

async function fetchMicrosoftCalendarViews(
  acc: ConnectedAccount,
  calendarIds: string[],
  start: Date,
  end: Date
): Promise<GraphCalendarEventRow[]> {
  if (calendarIds.length === 0) return []
  const batches = await Promise.all(
    calendarIds.map(async (calId) => {
      try {
        return await graphListCalendarViewInCalendar(acc.id, calId, start, end)
      } catch (e) {
        console.warn('[calendar-service] Kalender konnte nicht geladen werden:', acc.id, calId, e)
        return [] as GraphCalendarEventRow[]
      }
    })
  )
  const seenIds = new Set<string>()
  const rows: GraphCalendarEventRow[] = []
  for (const batch of batches) {
    for (const r of batch) {
      if (seenIds.has(r.id)) continue
      seenIds.add(r.id)
      rows.push(r)
    }
  }
  return rows
}

async function fetchGoogleCalendarViews(
  acc: ConnectedAccount,
  calendarIds: string[],
  start: Date,
  end: Date,
  useIncremental: boolean
): Promise<GraphCalendarEventRow[]> {
  if (calendarIds.length === 0) return []
  const batches = await Promise.all(
    calendarIds.map(async (calId) => {
      try {
        return await googleListEventsInCalendar(acc.id, calId, start, end, useIncremental)
      } catch (e) {
        console.warn('[calendar-service] Google Kalender konnte nicht geladen werden:', acc.id, calId, e)
        return [] as GraphCalendarEventRow[]
      }
    })
  )
  const seen = new Set<string>()
  const rows: GraphCalendarEventRow[] = []
  for (const batch of batches) {
    for (const r of batch) {
      if (seen.has(r.id)) continue
      seen.add(r.id)
      rows.push(r)
    }
  }
  return rows
}

function rowToView(acc: ConnectedAccount, r: GraphCalendarEventRow, source: 'microsoft' | 'google'): CalendarEventView {
  return {
    id: `${acc.id}:${r.id}`,
    source,
    accountId: acc.id,
    accountEmail: acc.email,
    accountColorClass: acc.color,
    graphEventId: r.id,
    title: r.subject?.trim() || '(Ohne Titel)',
    startIso: r.startIso,
    endIso: r.endIso,
    isAllDay: r.isAllDay,
    location: r.location,
    webLink: r.webLink,
    joinUrl: r.joinUrl,
    organizer: r.organizer,
    categories: r.categories.length > 0 ? r.categories : undefined,
    displayColorHex: r.displayColorHex,
    graphCalendarId: r.graphCalendarId,
    calendarCanEdit: r.calendarCanEdit !== false
  }
}

export async function listMergedCalendarEvents(
  startIso: string,
  endIso: string,
  options?: ListMergedCalendarEventsOptions
): Promise<CalendarEventView[]> {
  const start = new Date(startIso)
  const end = new Date(endIso)
  const accounts = await listAccounts()
  const out: CalendarEventView[] = []
  const focus = options?.focus
  const includeCalendars = options?.includeCalendars
  const googleIncremental = options?.googleIncremental === true

  if (focus?.accountId && focus.graphCalendarId) {
    const acc = accounts.find((a) => a.id === focus.accountId)
    if (!acc) {
      return []
    }
    const effEnd = effectiveFetchEndForAccount(acc, end)
    if (effEnd.getTime() <= start.getTime()) {
      return []
    }
    if (acc.provider === 'microsoft') {
      let rows: GraphCalendarEventRow[] = []
      try {
        rows = await graphListCalendarViewInCalendar(acc.id, focus.graphCalendarId, start, effEnd)
      } catch (e) {
        console.warn('[calendar-service] Graph Kalender-Ansicht fehlgeschlagen:', acc.id, focus.graphCalendarId, e)
      }
      for (const r of rows) {
        out.push(rowToView(acc, r, 'microsoft'))
      }
    } else if (acc.provider === 'google') {
      let rows: GraphCalendarEventRow[] = []
      try {
        rows = await googleListEventsInCalendar(
          acc.id,
          focus.graphCalendarId,
          start,
          effEnd,
          googleIncremental
        )
      } catch (e) {
        console.warn('[calendar-service] Google Kalender fehlgeschlagen:', acc.id, focus.graphCalendarId, e)
      }
      for (const r of rows) {
        out.push(rowToView(acc, r, 'google'))
      }
    }
    out.sort((a, b) => a.startIso.localeCompare(b.startIso))
    return out
  }

  if (Array.isArray(includeCalendars)) {
    if (includeCalendars.length === 0) {
      return []
    }
    const byAccount = new Map<string, Set<string>>()
    for (const ref of includeCalendars) {
      const cid = ref.graphCalendarId?.trim()
      if (!cid) continue
      const set = byAccount.get(ref.accountId) ?? new Set<string>()
      set.add(cid)
      byAccount.set(ref.accountId, set)
    }
    for (const [accountId, idSet] of byAccount) {
      const acc = accounts.find((a) => a.id === accountId)
      if (!acc || (acc.provider !== 'microsoft' && acc.provider !== 'google')) continue
      const effEnd = effectiveFetchEndForAccount(acc, end)
      if (effEnd.getTime() <= start.getTime()) continue
      const ids = [...idSet]
      if (acc.provider === 'microsoft') {
        const rows = await fetchMicrosoftCalendarViews(acc, ids, start, effEnd)
        for (const r of rows) {
          out.push(rowToView(acc, r, 'microsoft'))
        }
      } else {
        const rows = await fetchGoogleCalendarViews(acc, ids, start, effEnd, googleIncremental)
        for (const r of rows) {
          out.push(rowToView(acc, r, 'google'))
        }
      }
    }
    out.sort((a, b) => a.startIso.localeCompare(b.startIso))
    return out
  }

  for (const acc of accounts) {
    const effEnd = effectiveFetchEndForAccount(acc, end)
    if (effEnd.getTime() <= start.getTime()) {
      continue
    }
    if (acc.provider === 'microsoft') {
      let rows: GraphCalendarEventRow[] = []
      try {
        const calendars = await graphListCalendars(acc.id)
        if (calendars.length === 0) {
          rows = await graphListCalendarView(acc.id, start, effEnd)
        } else {
          rows = await fetchMicrosoftCalendarViews(
            acc,
            calendars.map((c) => c.id),
            start,
            effEnd
          )
        }
      } catch (e) {
        console.warn('[calendar-service] Graph-Kalender fehlgeschlagen:', acc.id, e)
      }
      for (const r of rows) {
        out.push(rowToView(acc, r, 'microsoft'))
      }
    } else if (acc.provider === 'google') {
      let rows: GraphCalendarEventRow[] = []
      try {
        const calendars = await googleListCalendars(acc.id)
        rows = await fetchGoogleCalendarViews(
          acc,
          calendars.map((c) => c.id),
          start,
          effEnd,
          googleIncremental
        )
      } catch (e) {
        console.warn('[calendar-service] Google-Kalender fehlgeschlagen:', acc.id, e)
      }
      for (const r of rows) {
        out.push(rowToView(acc, r, 'google'))
      }
    }
  }

  out.sort((a, b) => a.startIso.localeCompare(b.startIso))
  return out
}

export async function listMicrosoftCalendars(
  accountId: string,
  opts?: { forceRefresh?: boolean }
): Promise<CalendarGraphCalendarRow[]> {
  const accounts = await listAccounts()
  const acc = accounts.find((a) => a.id === accountId)
  if (!acc) return []
  if (acc.provider === 'google') {
    return googleListCalendars(accountId, opts)
  }
  return graphListCalendars(accountId)
}

const M365_GROUP_CALENDAR_PAGE_DEFAULT = 10
const M365_GROUP_CALENDAR_PAGE_MAX = 25

/** Microsoft-365-Gruppenkalender (Unified Groups), paginiert. */
export async function listMicrosoft365GroupCalendars(
  accountId: string,
  opts?: { offset?: number; limit?: number }
): Promise<CalendarM365GroupCalendarsPage> {
  const accounts = await listAccounts()
  const acc = accounts.find((a) => a.id === accountId)
  if (!acc || acc.provider !== 'microsoft') {
    return {
      calendars: [],
      totalGroups: 0,
      offset: 0,
      limit: M365_GROUP_CALENDAR_PAGE_DEFAULT,
      hasMore: false
    }
  }
  const offset = Math.max(0, opts?.offset ?? 0)
  const limit = Math.min(
    M365_GROUP_CALENDAR_PAGE_MAX,
    Math.max(1, opts?.limit ?? M365_GROUP_CALENDAR_PAGE_DEFAULT)
  )
  return graphListM365GroupCalendarPage(accountId, offset, limit)
}

export async function patchMicrosoftCalendarColor(input: CalendarPatchCalendarColorInput): Promise<void> {
  await graphPatchCalendarColor(input.accountId, input.graphCalendarId, input.color)
}

export async function createTeamsMeetingForAccount(
  accountId: string,
  input: CreateTeamsCalendarEventInput
): Promise<CreateTeamsCalendarEventResult> {
  return graphCreateTeamsCalendarEvent(accountId, input)
}

export async function getCalendarEventForAccount(input: CalendarGetEventInput): Promise<CalendarGetEventResult> {
  const accounts = await listAccounts()
  const acc = accounts.find((a) => a.id === input.accountId)
  if (!acc) {
    throw new Error('Konto nicht gefunden.')
  }
  if (acc.provider === 'google') {
    const calId = input.graphCalendarId?.trim()
    if (!calId) {
      throw new Error('Google: Kalender-ID fehlt (graphCalendarId).')
    }
    return googleGetCalendarEventDetail(input.accountId, calId, input.graphEventId.trim())
  }
  if (acc.provider !== 'microsoft') {
    throw new Error('Kalender-Termin-Details werden fuer dieses Konto nicht unterstuetzt.')
  }
  return graphGetCalendarEvent(input.accountId, input.graphEventId, input.graphCalendarId ?? null)
}

export async function createSimpleCalendarEventForAccount(
  input: CalendarSaveEventInput
): Promise<CalendarSaveEventResult> {
  const accounts = await listAccounts()
  const acc = accounts.find((a) => a.id === input.accountId)
  if (acc?.provider === 'google') {
    const r = await googleCreateEvent(input.accountId, input.graphCalendarId ?? null, {
      subject: input.subject,
      startIso: input.startIso,
      endIso: input.endIso,
      isAllDay: input.isAllDay,
      location: input.location,
      bodyHtml: input.bodyHtml,
      recurrence: input.recurrence ?? null,
      attendeeEmails: input.attendeeEmails
    })
    return { id: r.id, webLink: r.webLink }
  }
  const r = await graphCreateSimpleCalendarEvent(input.accountId, {
    subject: input.subject,
    startIso: input.startIso,
    endIso: input.endIso,
    isAllDay: input.isAllDay,
    location: input.location,
    bodyHtml: input.bodyHtml,
    graphCalendarId: input.graphCalendarId ?? null,
    categories: input.categories,
    attendeeEmails: input.attendeeEmails,
    teamsMeeting: input.teamsMeeting,
    recurrence: input.recurrence ?? null
  })
  return { id: r.id, webLink: r.webLink }
}

export async function updateCalendarEventForAccount(input: CalendarUpdateEventInput): Promise<void> {
  const accounts = await listAccounts()
  const acc = accounts.find((a) => a.id === input.accountId)
  if (acc?.provider === 'google') {
    const calId = input.graphCalendarId?.trim()
    if (!calId) {
      throw new Error('Google: Kalender-ID fehlt (graphCalendarId).')
    }
    await googleUpdateEvent(input.accountId, calId, input.graphEventId, {
      subject: input.subject,
      startIso: input.startIso,
      endIso: input.endIso,
      isAllDay: input.isAllDay,
      location: input.location,
      bodyHtml: input.bodyHtml,
      attendeeEmails: input.attendeeEmails
    })
    return
  }
  const { accountId, graphEventId, ...rest } = input
  await graphUpdateCalendarEvent(accountId, graphEventId, {
    subject: rest.subject,
    startIso: rest.startIso,
    endIso: rest.endIso,
    isAllDay: rest.isAllDay,
    location: rest.location,
    bodyHtml: rest.bodyHtml,
    graphCalendarId: rest.graphCalendarId ?? null,
    categories: rest.categories,
    attendeeEmails: rest.attendeeEmails,
    teamsMeeting: rest.teamsMeeting
  })
}

export async function patchCalendarEventScheduleForAccount(input: CalendarPatchScheduleInput): Promise<void> {
  const accounts = await listAccounts()
  const acc = accounts.find((a) => a.id === input.accountId)
  if (acc?.provider === 'google') {
    const calId = input.graphCalendarId?.trim()
    if (!calId) {
      throw new Error('Google: Kalender-ID fehlt (graphCalendarId).')
    }
    await googlePatchEventTimes(input.accountId, calId, input.graphEventId, {
      startIso: input.startIso,
      endIso: input.endIso,
      isAllDay: input.isAllDay
    })
    return
  }
  await graphPatchCalendarEventTimes(input.accountId, input.graphEventId, {
    startIso: input.startIso,
    endIso: input.endIso,
    isAllDay: input.isAllDay
  }, input.graphCalendarId ?? null)
}

export async function deleteCalendarEventForAccount(input: CalendarDeleteEventInput): Promise<void> {
  const accounts = await listAccounts()
  const acc = accounts.find((a) => a.id === input.accountId)
  if (acc?.provider === 'google') {
    const calId = input.graphCalendarId?.trim()
    if (!calId) {
      throw new Error('Google: Kalender-ID fehlt (graphCalendarId).')
    }
    await googleDeleteEvent(input.accountId, calId, input.graphEventId)
    return
  }
  await graphDeleteCalendarEvent(input.accountId, input.graphEventId, input.graphCalendarId ?? null)
}

export async function patchCalendarEventCategories(
  accountId: string,
  graphEventId: string,
  categories: string[],
  graphCalendarId?: string | null
): Promise<void> {
  await graphPatchEventCategories(accountId, graphEventId, categories, graphCalendarId)
}

export function buildCalendarSuggestionFromMessage(messageId: number): CalendarSuggestionFromMail {
  const msg = getMessageById(messageId)
  if (!msg) throw new Error('Mail nicht gefunden.')

  const now = new Date()
  const start = new Date(now.getTime() + 60 * 60 * 1000)
  const end = new Date(start.getTime() + 30 * 60 * 1000)

  const attendeeBits = [msg.fromAddr, msg.toAddrs, msg.ccAddrs]
    .filter(Boolean)
    .join(', ')
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter((s) => s.includes('@'))

  const agenda =
    (msg.bodyText ?? msg.snippet ?? '')
      .slice(0, 4000)
      .trim()
      .replace(/\r\n/g, '\n') || 'Agenda folgt.'

  const bodyHtml = `<p><strong>Bezug:</strong> ${escapeHtml(msg.subject ?? '(Kein Betreff)')}</p><p>${escapeHtml(agenda).replace(/\n/g, '<br>')}</p><p><a href="mailto:${escapeHtml(msg.fromAddr ?? '')}?subject=${encodeURIComponent(msg.subject ?? '')}">Mail in Outlook oeffnen</a></p>`

  return {
    accountId: msg.accountId,
    messageId: msg.id,
    subject: msg.subject?.trim() ? `Termin: ${msg.subject}` : 'Besprechung',
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    bodyHtml,
    attendeeEmails: Array.from(new Set(attendeeBits)).slice(0, 20)
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
