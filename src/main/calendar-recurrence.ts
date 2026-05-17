import type { CalendarZonedParts } from '@shared/calendar-datetime'
import { rruleUntilUtcFromDateOnly } from '@shared/calendar-datetime'
import type { CalendarSaveEventRecurrence } from '@shared/types'

const GRAPH_DOW = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday'
] as const

const GOOGLE_BYDAY = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const

function graphDayOfWeek(parts: CalendarZonedParts): (typeof GRAPH_DOW)[number] {
  const idx = Math.min(Math.max(parts.weekday - 1, 0), 6)
  return GRAPH_DOW[idx]!
}

function googleByDay(parts: CalendarZonedParts): string {
  return GOOGLE_BYDAY[parts.weekday - 1]!
}

/**
 * Microsoft Graph `event.recurrence` = PatternedRecurrence (`pattern` + `range`).
 */
export function buildMicrosoftGraphRecurrencePayload(
  recurrence: CalendarSaveEventRecurrence,
  startLocal: CalendarZonedParts,
  recurrenceTimeZoneWindows: string
): { recurrence: Record<string, unknown> } {
  const startDateStr = startLocal.dateOnly
  let pattern: Record<string, unknown>
  switch (recurrence.frequency) {
    case 'daily':
      pattern = { type: 'daily', interval: 1 }
      break
    case 'weekly':
      pattern = {
        type: 'weekly',
        interval: 1,
        daysOfWeek: [graphDayOfWeek(startLocal)],
        firstDayOfWeek: 'monday'
      }
      break
    case 'biweekly':
      pattern = {
        type: 'weekly',
        interval: 2,
        daysOfWeek: [graphDayOfWeek(startLocal)],
        firstDayOfWeek: 'monday'
      }
      break
    case 'monthly':
      pattern = { type: 'absoluteMonthly', interval: 1, dayOfMonth: startLocal.day }
      break
    case 'yearly':
      pattern = {
        type: 'absoluteYearly',
        interval: 1,
        month: startLocal.month,
        dayOfMonth: startLocal.day
      }
      break
    default:
      pattern = { type: 'daily', interval: 1 }
  }

  const range: Record<string, unknown> = {
    recurrenceTimeZone: recurrenceTimeZoneWindows,
    startDate: startDateStr
  }
  switch (recurrence.rangeEnd) {
    case 'never':
      range.type = 'noEnd'
      break
    case 'until': {
      const ed = recurrence.untilDate?.trim()
      if (!ed || !/^\d{4}-\d{2}-\d{2}$/.test(ed)) {
        throw new Error('Serientermin: Enddatum (JJJJ-MM-TT) fehlt oder ist ungueltig.')
      }
      range.type = 'endDate'
      range.endDate = ed
      break
    }
    case 'count': {
      const n = recurrence.count
      if (n == null || !Number.isFinite(n) || n < 1 || n > 999) {
        throw new Error('Serientermin: Anzahl muss zwischen 1 und 999 liegen.')
      }
      range.type = 'numbered'
      range.numberOfOccurrences = Math.floor(n)
      break
    }
    default:
      range.type = 'noEnd'
  }

  return { recurrence: { pattern, range } }
}

/**
 * Google Calendar API: `event.recurrence` = RFC5545-Zeilen, z. B. `RRULE:...`.
 */
export function buildGoogleEventRecurrence(
  recurrence: CalendarSaveEventRecurrence,
  startLocal: CalendarZonedParts,
  calendarIanaTz: string,
  isAllDay: boolean
): string[] {
  const byday = googleByDay(startLocal)
  let freqPart = ''
  switch (recurrence.frequency) {
    case 'daily':
      freqPart = 'FREQ=DAILY'
      break
    case 'weekly':
      freqPart = `FREQ=WEEKLY;INTERVAL=1;BYDAY=${byday}`
      break
    case 'biweekly':
      freqPart = `FREQ=WEEKLY;INTERVAL=2;BYDAY=${byday}`
      break
    case 'monthly':
      freqPart = `FREQ=MONTHLY;BYMONTHDAY=${startLocal.day}`
      break
    case 'yearly':
      freqPart = `FREQ=YEARLY;BYMONTH=${startLocal.month};BYMONTHDAY=${startLocal.day}`
      break
    default:
      freqPart = 'FREQ=DAILY'
  }

  let tail = ''
  if (recurrence.rangeEnd === 'count' && recurrence.count != null) {
    const n = Math.floor(recurrence.count)
    if (!Number.isFinite(n) || n < 1 || n > 999) {
      throw new Error('Serientermin: Anzahl muss zwischen 1 und 999 liegen.')
    }
    tail += `;COUNT=${n}`
  } else if (recurrence.rangeEnd === 'until' && recurrence.untilDate) {
    const u = recurrence.untilDate.trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(u)) {
      throw new Error('Serientermin: Enddatum ungueltig.')
    }
    if (isAllDay) {
      tail += `;UNTIL=${u.replace(/-/g, '')}`
    } else {
      const untilUtc = rruleUntilUtcFromDateOnly(u, calendarIanaTz)
      if (!untilUtc) {
        throw new Error('Serientermin: Enddatum ungueltig.')
      }
      tail += `;UNTIL=${untilUtc}`
    }
  }

  return [`RRULE:${freqPart}${tail}`]
}
