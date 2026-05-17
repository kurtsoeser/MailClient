import type { EventApi, EventInput } from '@fullcalendar/core'
import type { UserNoteListItem } from '@shared/types'
import { NOTE_DEFAULT_APPOINTMENT_MINUTES, resolveNoteCalendarSpan } from '@shared/note-calendar-span'
import {
  addCalendarDaysIsoDate,
  defaultAppointmentRangeForCalendarDay,
  isoDateInTimeZone
} from '@/lib/zoned-iso-date'

export const CALENDAR_KIND_USER_NOTE = 'userNote' as const

const NOTE_EVENT_COLOR = '#a855f7'

export function userNoteEventId(noteId: number): string {
  return `user-note:${noteId}`
}

export function parseUserNoteEventId(eventId: string): number | null {
  const m = /^user-note:(\d+)$/.exec(eventId)
  if (!m) return null
  const id = Number(m[1])
  return Number.isFinite(id) && id > 0 ? id : null
}

function noteDisplayTitle(note: Pick<UserNoteListItem, 'kind' | 'title' | 'eventTitleSnapshot' | 'mailSubject'>): string {
  if (note.title?.trim()) return note.title.trim()
  if (note.kind === 'mail' && note.mailSubject?.trim()) return note.mailSubject.trim()
  if (note.kind === 'calendar' && note.eventTitleSnapshot?.trim()) return note.eventTitleSnapshot.trim()
  return ''
}

export function notesToFullCalendarEvents(
  notes: UserNoteListItem[],
  options?: { defaultTitle?: string }
): EventInput[] {
  const fallback = options?.defaultTitle ?? 'Notiz'
  const out: EventInput[] = []
  for (const note of notes) {
    const span = resolveNoteCalendarSpan(note)
    if (!span) continue
    const title = noteDisplayTitle(note) || fallback
    out.push({
      id: userNoteEventId(note.id),
      title,
      start: span.startIso,
      end: span.endIso,
      allDay: span.allDay,
      backgroundColor: NOTE_EVENT_COLOR,
      borderColor: NOTE_EVENT_COLOR,
      extendedProps: {
        calendarKind: CALENDAR_KIND_USER_NOTE,
        userNote: note,
        noteKind: note.kind
      }
    })
  }
  return out
}

export type UserNoteSchedulePersistTarget = {
  noteId: number
  scheduledStartIso: string
  scheduledEndIso: string
  scheduledAllDay: boolean
}

export function computePersistTargetForUserNote(
  event: EventApi,
  fcTimeZone: string
): UserNoteSchedulePersistTarget | null {
  const noteId = parseUserNoteEventId(event.id)
  if (noteId == null) return null
  const start = event.start
  const end = event.end
  if (!start) return null

  if (event.allDay) {
    const startIso = isoDateInTimeZone(start, fcTimeZone)
    const endIso = end
      ? isoDateInTimeZone(end, fcTimeZone)
      : addCalendarDaysIsoDate(startIso, 1, fcTimeZone)
    return {
      noteId,
      scheduledStartIso: startIso,
      scheduledEndIso: endIso,
      scheduledAllDay: true
    }
  }

  const startIso = start.toISOString()
  const endIso = end
    ? end.toISOString()
    : new Date(start.getTime() + NOTE_DEFAULT_APPOINTMENT_MINUTES * 60_000).toISOString()
  return {
    noteId,
    scheduledStartIso: startIso,
    scheduledEndIso: endIso,
    scheduledAllDay: false
  }
}

export function defaultScheduleForNoteCalendarDayFc(
  dateStr: string,
  fcTimeZone: string
): { startIso: string; endIso: string } {
  return defaultAppointmentRangeForCalendarDay(
    dateStr,
    fcTimeZone,
    9,
    NOTE_DEFAULT_APPOINTMENT_MINUTES
  )
}
