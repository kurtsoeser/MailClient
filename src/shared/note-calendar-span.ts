export const NOTE_DEFAULT_APPOINTMENT_MINUTES = 30

export interface NoteCalendarSpan {
  allDay: boolean
  startIso: string
  endIso: string
}

function addMinutesIso(iso: string, minutes: number): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  d.setMinutes(d.getMinutes() + minutes)
  return d.toISOString()
}

function addOneCalendarDay(dateOnly: string): string {
  const d = new Date(`${dateOnly}T12:00:00.000Z`)
  if (Number.isNaN(d.getTime())) return dateOnly
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/** Kalender-Anzeige nur bei expliziter Planung. */
export function resolveNoteCalendarSpan(note: {
  scheduledStartIso: string | null
  scheduledEndIso: string | null
  scheduledAllDay: boolean
}): NoteCalendarSpan | null {
  const start = note.scheduledStartIso?.trim()
  if (!start) return null
  if (note.scheduledAllDay) {
    const d0 = start.slice(0, 10)
    const d1 = addOneCalendarDay(d0)
    return { allDay: true, startIso: d0, endIso: d1 }
  }
  const end = note.scheduledEndIso?.trim() || addMinutesIso(start, NOTE_DEFAULT_APPOINTMENT_MINUTES)
  const s = new Date(start).getTime()
  const e = new Date(end).getTime()
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return null
  return { allDay: false, startIso: start, endIso: end }
}
