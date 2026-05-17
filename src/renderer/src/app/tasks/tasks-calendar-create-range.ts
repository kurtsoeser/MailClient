import { isoDateInTimeZone } from '@/lib/zoned-iso-date'

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
  if (range.allDay) {
    const dueDate = isoDateInTimeZone(range.start, timeZone)
    return { dueDate, plannedStartIso: null, plannedEndIso: null }
  }
  let end = range.end
  if (end.getTime() <= range.start.getTime()) {
    end = new Date(range.start.getTime() + DEFAULT_APPOINTMENT_MINUTES * 60 * 1000)
  }
  const dueDate = isoDateInTimeZone(range.start, timeZone)
  return {
    dueDate,
    plannedStartIso: range.start.toISOString(),
    plannedEndIso: end.toISOString()
  }
}
