import { listAccounts } from './accounts'
import { patchCachedCalendarEventIcon, patchCachedCalendarEventSchedule } from './calendar-cache-service'
import { getDb } from './db/index'
import { deleteCalendarEvent, upsertCalendarEvents } from './db/calendar-events-repo'
import {
  deleteCalendarEventDetails,
  upsertCalendarEventDetails
} from './db/calendar-event-details-repo'
import { broadcastCalendarChanged } from './ipc/ipc-broadcasts'
import type {
  CalendarEventView,
  CalendarPatchEventIconInput,
  CalendarPatchScheduleInput,
  CalendarSaveEventInput,
  CalendarSaveEventResult,
  CalendarUpdateEventInput,
  ConnectedAccount
} from '@shared/types'

function eventViewFromSaveInput(
  acc: ConnectedAccount,
  input: CalendarSaveEventInput,
  result: CalendarSaveEventResult
): CalendarEventView {
  const graphCalId = input.graphCalendarId?.trim() || null
  const source = acc.provider === 'google' ? 'google' : 'microsoft'
  return {
    id: `${acc.id}:${result.id}`,
    source,
    accountId: acc.id,
    accountEmail: acc.email,
    accountColorClass: acc.color,
    graphEventId: result.id,
    graphCalendarId: graphCalId,
    title: input.subject.trim() || '(Ohne Titel)',
    startIso: input.startIso,
    endIso: input.endIso,
    isAllDay: input.isAllDay,
    location: input.location?.trim() || null,
    webLink: result.webLink,
    joinUrl: null,
    organizer: null,
    categories: input.categories?.filter((c) => c.trim().length > 0),
    calendarCanEdit: true
  }
}

/** Neuer Termin: in SQLite eintragen, UI per Broadcast aktualisieren — kein Voll-Sync. */
export async function afterCalendarEventCreated(
  accountId: string,
  input: CalendarSaveEventInput,
  result: CalendarSaveEventResult
): Promise<void> {
  const accounts = await listAccounts()
  const acc = accounts.find((a) => a.id === accountId)
  if (acc && (acc.provider === 'microsoft' || acc.provider === 'google')) {
    upsertCalendarEvents([eventViewFromSaveInput(acc, input, result)])
    const eventId = result.id?.trim()
    const attendeeEmails = input.attendeeEmails?.filter((e) => e.trim().length > 0) ?? []
    const hasDetailCache =
      attendeeEmails.length > 0 ||
      Boolean(input.bodyHtml?.trim()) ||
      (acc.provider === 'microsoft' && input.teamsMeeting === true)
    if (eventId && hasDetailCache) {
      upsertCalendarEventDetails(accountId, eventId, input.graphCalendarId ?? null, {
        subject: input.subject.trim() || null,
        attendeeEmails,
        joinUrl: null,
        isOnlineMeeting: acc.provider === 'microsoft' && input.teamsMeeting === true && !input.isAllDay,
        bodyHtml: input.bodyHtml?.trim() ? input.bodyHtml.trim() : null
      })
    }
  }
  broadcastCalendarChanged(accountId)
}

function readExistingEventLinks(
  accountId: string,
  graphEventId: string
): { webLink: string | null; joinUrl: string | null } {
  const row = getDb()
    .prepare(
      `SELECT web_link, join_url FROM calendar_events WHERE account_id = ? AND graph_event_id = ?`
    )
    .get(accountId, graphEventId.trim()) as
    | { web_link: string | null; join_url: string | null }
    | undefined
  return { webLink: row?.web_link ?? null, joinUrl: row?.join_url ?? null }
}

/** Termin geändert: Cache-Zeile aktualisieren statt Kontosync zu invalidieren. */
export async function afterCalendarEventUpdated(
  accountId: string,
  input: CalendarUpdateEventInput
): Promise<void> {
  const accounts = await listAccounts()
  const acc = accounts.find((a) => a.id === accountId)
  if (acc && (acc.provider === 'microsoft' || acc.provider === 'google')) {
    const links = readExistingEventLinks(accountId, input.graphEventId)
    const view = eventViewFromSaveInput(acc, input, {
      id: input.graphEventId,
      webLink: links.webLink
    })
    view.joinUrl = links.joinUrl
    upsertCalendarEvents([view])
  }
  broadcastCalendarChanged(accountId)
}

export function afterCalendarEventSchedulePatched(input: CalendarPatchScheduleInput): void {
  patchCachedCalendarEventSchedule(input.accountId, input.graphEventId, {
    startIso: input.startIso,
    endIso: input.endIso,
    isAllDay: input.isAllDay
  })
  broadcastCalendarChanged(input.accountId)
}

export function afterCalendarEventIconPatched(input: CalendarPatchEventIconInput): void {
  const trimmed = input.iconId?.trim()
  patchCachedCalendarEventIcon(input.accountId, input.graphEventId, trimmed || null)
  broadcastCalendarChanged(input.accountId)
}

export function afterCalendarEventDeleted(accountId: string, graphEventId: string): void {
  deleteCalendarEvent(accountId, graphEventId)
  deleteCalendarEventDetails(accountId, graphEventId)
  broadcastCalendarChanged(accountId)
}
