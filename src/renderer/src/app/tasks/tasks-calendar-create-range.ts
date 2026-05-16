import { DateTime } from 'luxon'

const DEFAULT_APPOINTMENT_MINUTES = 30

export type CalendarCreateRange = {
  start: Date
  end: Date
  allDay: boolean
}

export type CloudTaskCreateSchedule = {
  dueDate: string
  plannedStartIso: string | null
  plannedEndIso: string | null
}

export function scheduleFromCalendarCreateRange(
  range: CalendarCreateRange,
  timeZone: string
): CloudTaskCreateSchedule {
  const zone = timeZone === 'local' ? 'local' : timeZone
  if (range.allDay) {
    const dueDate = DateTime.fromJSDate(range.start, { zone }).toISODate()!
    return { dueDate, plannedStartIso: null, plannedEndIso: null }
  }
  let end = range.end
  if (end.getTime() <= range.start.getTime()) {
    end = new Date(range.start.getTime() + DEFAULT_APPOINTMENT_MINUTES * 60 * 1000)
  }
  const dueDate = DateTime.fromJSDate(range.start, { zone }).toISODate()!
  return {
    dueDate,
    plannedStartIso: range.start.toISOString(),
    plannedEndIso: end.toISOString()
  }
}
