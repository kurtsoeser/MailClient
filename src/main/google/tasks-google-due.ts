import { DateTime } from 'luxon'

/** Client dueIso (YYYY-MM-DD oder ISO) → Google Tasks `due` (RFC 3339, Mitternacht UTC). */
export function dueIsoToGoogleTasksDue(dueIso: string): string {
  const s = dueIso.trim()
  if (!s) throw new Error('Ungültiges Fälligkeitsdatum.')

  let dateOnly: string
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    dateOnly = s
  } else {
    const dt = DateTime.fromISO(s, { setZone: true })
    if (dt.isValid) {
      dateOnly = dt.toUTC().toISODate()!
    } else {
      dateOnly = s.slice(0, 10)
    }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    throw new Error('Ungültiges Fälligkeitsdatum.')
  }
  return `${dateOnly}T00:00:00.000Z`
}
