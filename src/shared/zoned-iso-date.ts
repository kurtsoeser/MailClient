/** IANA-Zeitzone oder `local` (System). */
export type AppTimeZone = string

function resolveTimeZone(timeZone: AppTimeZone): string {
  if (timeZone === 'local' || !timeZone.trim()) {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  }
  return timeZone
}

/** Kalendertag `yyyy-MM-dd` in der angegebenen Zeitzone. */
export function isoDateInTimeZone(date: Date, timeZone: AppTimeZone): string {
  const tz = resolveTimeZone(timeZone)
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(date)
}

export function addCalendarDaysIsoDate(isoDate: string, days: number, timeZone: AppTimeZone): string {
  const tz = resolveTimeZone(timeZone)
  const [y, m, d] = isoDate.split('-').map(Number)
  const utcNoon = Date.UTC(y!, m! - 1, d!, 12, 0, 0)
  const shifted = new Date(utcNoon + days * 86_400_000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(shifted)
}

/** Start/Ende des lokalen Tages in `timeZone` als UTC-ISO (Vergleich mit dueAt). */
export function zonedDayBoundsUtcIso(
  nowMs: number,
  timeZone: AppTimeZone
): {
  startTodayIso: string
  endTodayIso: string
  startTomorrowIso: string
  endTomorrowIso: string
  endWeekIso: string
} {
  const tz = resolveTimeZone(timeZone)
  const today = isoDateInTimeZone(new Date(nowMs), tz)
  const tomorrow = addCalendarDaysIsoDate(today, 1, tz)

  const startTodayIso = zonedLocalDateTimeToUtcIso(today, 0, 0, 0, tz)
  const endTodayIso = zonedLocalDateTimeToUtcIso(today, 23, 59, 59, tz)
  const startTomorrowIso = zonedLocalDateTimeToUtcIso(tomorrow, 0, 0, 0, tz)
  const endTomorrowIso = zonedLocalDateTimeToUtcIso(tomorrow, 23, 59, 59, tz)

  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(
    new Date(nowMs)
  )
  const daysUntilSun =
    weekday === 'Sun' ? 0 : weekday === 'Mon' ? 6 : weekday === 'Tue' ? 5 : weekday === 'Wed' ? 4 : weekday === 'Thu' ? 3 : weekday === 'Fri' ? 2 : 1
  const weekEndDate = addCalendarDaysIsoDate(today, daysUntilSun, tz)
  const endWeekIso = zonedLocalDateTimeToUtcIso(weekEndDate, 23, 59, 59, tz)

  return {
    startTodayIso,
    endTodayIso,
    startTomorrowIso,
    endTomorrowIso,
    endWeekIso
  }
}

export function zonedLocalDateTimeToUtcIso(
  isoDate: string,
  hour: number,
  minute: number,
  second: number,
  timeZone: AppTimeZone
): string {
  const tz = resolveTimeZone(timeZone)
  const [y, m, d] = isoDate.split('-').map(Number)
  const guess = Date.UTC(y!, m! - 1, d!, hour, minute, second)
  const offsetMs = getTimeZoneOffsetMs(new Date(guess), tz)
  return new Date(guess - offsetMs).toISOString()
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
  const parts = dtf.formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value ?? 0)
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second')
  )
  return asUtc - date.getTime()
}

export function zonedLocalTimeToUtcIso(
  isoDate: string,
  hour: number,
  minute: number,
  timeZone: AppTimeZone
): string {
  return zonedLocalDateTimeToUtcIso(isoDate, hour, minute, 0, timeZone)
}

export function appointmentRangeFromCalendarSlot(
  dateStr: string,
  timeStr: string,
  timeZone: AppTimeZone,
  durationMinutes = 30
): { startIso: string; endIso: string } {
  const normalized = timeStr.length <= 5 ? `${timeStr}:00` : timeStr
  const [h, m] = normalized.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) {
    return defaultAppointmentRangeForCalendarDay(dateStr, timeZone, 9, durationMinutes)
  }
  const startIso = zonedLocalTimeToUtcIso(dateStr, h, m, timeZone)
  const endIso = new Date(
    new Date(startIso).getTime() + durationMinutes * 60 * 1000
  ).toISOString()
  return { startIso, endIso }
}

export function defaultAppointmentRangeForCalendarDay(
  dateStr: string,
  timeZone: AppTimeZone,
  startHour = 9,
  durationMinutes = 30
): { startIso: string; endIso: string } {
  const startIso = zonedLocalTimeToUtcIso(dateStr, startHour, 0, timeZone)
  const endIso = new Date(
    new Date(startIso).getTime() + durationMinutes * 60 * 1000
  ).toISOString()
  return { startIso, endIso }
}

export function normalizeDueAtIso(dueIso: string, timeZone: AppTimeZone): string | null {
  const raw = dueIso.trim()
  if (!raw) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return zonedLocalDateTimeToUtcIso(raw, 23, 59, 59, timeZone)
  }
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export function dueIsoEndOfZonedDayFromScheduleStart(
  start: Date | string,
  timeZone: AppTimeZone
): string {
  const date = typeof start === 'string' ? new Date(start) : start
  if (Number.isNaN(date.getTime())) {
    const fallback =
      typeof start === 'string' ? start.slice(0, 10) : date.toISOString().slice(0, 10)
    return `${fallback}T23:59:59.000Z`
  }
  const dateOnly = isoDateInTimeZone(date, timeZone)
  return normalizeDueAtIso(dateOnly, timeZone) ?? `${dateOnly}T23:59:59.000Z`
}

export function jsDateHasNonMidnightTimeInZone(date: Date, timeZone: AppTimeZone): boolean {
  const tz = resolveTimeZone(timeZone)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value ?? 0)
  return get('hour') !== 0 || get('minute') !== 0 || get('second') !== 0
}
