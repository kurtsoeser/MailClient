import { addDays, addMonths, startOfMonth, startOfWeek } from 'date-fns'
import type { CalendarEventView } from '@shared/types'

/** Gleicher Horizont wie Posteingang-Agenda / Kalender-Vorausladen. */
export const CALENDAR_PREVIEW_RANGE_DAYS_AHEAD = 56

export function calendarPreviewRangeIso(): { startIso: string; endIso: string } {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = addDays(start, CALENDAR_PREVIEW_RANGE_DAYS_AHEAD)
  return { startIso: start.toISOString(), endIso: end.toISOString() }
}

export function filterCalendarEventsForWeek(
  events: CalendarEventView[],
  ref = new Date()
): CalendarEventView[] {
  const start = startOfWeek(ref, { weekStartsOn: 1 })
  const end = addDays(start, 7)
  const startMs = start.getTime()
  const endMs = end.getTime()
  return events.filter((ev) => {
    const s = Date.parse(ev.startIso)
    const e = Date.parse(ev.endIso)
    if (!Number.isFinite(s) || !Number.isFinite(e)) return false
    return e > startMs && s < endMs
  })
}

export function filterCalendarEventsForMonth(
  events: CalendarEventView[],
  ref = new Date()
): CalendarEventView[] {
  const start = startOfMonth(ref)
  const startMs = start.getTime()
  const endMs = addMonths(start, 1).getTime()
  return events.filter((ev) => {
    const s = Date.parse(ev.startIso)
    const e = Date.parse(ev.endIso)
    if (!Number.isFinite(s) || !Number.isFinite(e)) return false
    return e > startMs && s < endMs
  })
}

export function pickNextOnlineMeetingFromEvents(
  events: CalendarEventView[],
  refMs = Date.now()
): CalendarEventView | null {
  return (
    events
      .filter((ev) => {
        const joinUrl = ev.joinUrl?.trim()
        if (!joinUrl) return false
        const startMs = Date.parse(ev.startIso)
        return !Number.isNaN(startMs) && startMs > refMs
      })
      .sort((a, b) => Date.parse(a.startIso) - Date.parse(b.startIso))[0] ?? null
  )
}

export function filterUpcomingCalendarEvents(
  events: CalendarEventView[],
  max: number,
  refMs = Date.now()
): CalendarEventView[] {
  return events
    .filter((ev) => {
      const t = Date.parse(ev.endIso)
      return !Number.isNaN(t) && t >= refMs
    })
    .sort((a, b) => Date.parse(a.startIso) - Date.parse(b.startIso))
    .slice(0, max)
}
