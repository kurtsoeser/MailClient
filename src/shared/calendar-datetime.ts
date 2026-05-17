import { normalizeDueAtIso, zonedLocalDateTimeToUtcIso } from './zoned-iso-date'

/** Kalenderlokale Felder (Wochentag 1=Mo … 7=So, wie früher Luxon). */
export type CalendarZonedParts = {
  dateOnly: string
  month: number
  day: number
  weekday: number
}

const WEEKDAY_SHORT_TO_ISO: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7
}

export function trimFractionalSeconds(isoLike: string): string {
  return isoLike.replace(/(\.\d{3})\d+/, '$1').trim()
}

function formatPartsInZone(
  date: Date,
  timeZone: string
): { dateOnly: string; month: number; day: number; weekday: number; hour: number; minute: number; second: number } {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hour12: false
  })
  const parts = dtf.formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? ''
  const dateOnly = `${get('year')}-${get('month')}-${get('day')}`
  const weekday = WEEKDAY_SHORT_TO_ISO[get('weekday')] ?? 1
  return {
    dateOnly,
    month: Number(get('month')),
    day: Number(get('day')),
    weekday,
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    second: Number(get('second'))
  }
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function calendarZonedPartsFromUtcIso(utcIso: string, timeZone: string): CalendarZonedParts | null {
  const d = new Date(utcIso)
  if (Number.isNaN(d.getTime())) return null
  const p = formatPartsInZone(d, timeZone)
  return { dateOnly: p.dateOnly, month: p.month, day: p.day, weekday: p.weekday }
}

export function calendarZonedPartsFromDateOnly(dateOnly: string, timeZone: string): CalendarZonedParts {
  const utcIso = zonedLocalDateTimeToUtcIso(dateOnly, 12, 0, 0, timeZone)
  return calendarZonedPartsFromUtcIso(utcIso, timeZone) ?? {
    dateOnly,
    month: Number(dateOnly.slice(5, 7)),
    day: Number(dateOnly.slice(8, 10)),
    weekday: 1
  }
}

/** UTC-ISO → lokales `yyyy-MM-ddTHH:mm:ss` in IANA-Zone (Graph/Google-Schreiben). */
export function formatUtcIsoAsLocalDateTime(utcIso: string, timeZone: string): string | null {
  const d = new Date(utcIso)
  if (Number.isNaN(d.getTime())) return null
  const p = formatPartsInZone(d, timeZone)
  return `${p.dateOnly}T${pad2(p.hour)}:${pad2(p.minute)}:${pad2(p.second)}`
}

/**
 * API-Wandzeit ohne Offset → UTC-ISO (Graph/Google lesen).
 * `resolveZone` mappt z. B. Windows-Zonen auf IANA.
 */
export function utcIsoFromWallDateTime(
  dateTime: string,
  zoneHint: string | null | undefined,
  isAllDay: boolean,
  resolveZone: (zoneHint: string | null | undefined) => string
): string | null {
  if (!dateTime) return null
  const trimmed = dateTime.trim()
  if (isAllDay) {
    const d = trimmed.slice(0, 10)
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null
  }
  const norm = trimFractionalSeconds(trimmed)
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(norm)) {
    const d = new Date(norm)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }
  const m = norm.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})/)
  if (!m) return null
  const zone = resolveZone(zoneHint)
  return zonedLocalDateTimeToUtcIso(m[1]!, Number(m[2]), Number(m[3]), Number(m[4]), zone)
}

/** RRULE UNTIL für zeitgebundene Serien (UTC `yyyyMMddTHHmmssZ`). */
export function rruleUntilUtcFromDateOnly(dateOnly: string, calendarIanaTz: string): string | null {
  const endUtc = normalizeDueAtIso(dateOnly, calendarIanaTz)
  if (!endUtc) return null
  const d = new Date(endUtc)
  if (Number.isNaN(d.getTime())) return null
  const y = d.getUTCFullYear()
  const mo = pad2(d.getUTCMonth() + 1)
  const day = pad2(d.getUTCDate())
  const h = pad2(d.getUTCHours())
  const mi = pad2(d.getUTCMinutes())
  const s = pad2(d.getUTCSeconds())
  return `${y}${mo}${day}T${h}${mi}${s}Z`
}

/** Fälligkeit aus UI/API in einheitliches Storage-ISO. */
export function dueIsoFromClientInput(dueIso: string | null): string | null {
  if (dueIso === null) return null
  const s = String(dueIso).trim()
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T12:00:00.000Z`
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? s : d.toISOString()
}

export function dueIsoToGraphDateTimePayload(
  dueIso: string,
  windowsTz: string,
  ianaTz: string
): { dateTime: string; timeZone: string } | undefined {
  const s = dueIso.trim()
  if (!s) return undefined
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return { dateTime: `${s}T00:00:00.0000000`, timeZone: windowsTz }
  }
  const local = formatUtcIsoAsLocalDateTime(new Date(s).toISOString(), ianaTz)
  if (!local) return undefined
  return { dateTime: `${local}.0000000`, timeZone: windowsTz }
}
