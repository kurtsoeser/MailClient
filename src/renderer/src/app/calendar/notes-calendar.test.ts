import { describe, expect, it } from 'vitest'
import type { UserNoteListItem } from '@shared/types'
import { resolveNoteCalendarSpan } from '@shared/note-calendar-span'
import { notesToFullCalendarEvents, parseUserNoteEventId, userNoteEventId } from './notes-calendar'

function note(partial: Partial<UserNoteListItem> & Pick<UserNoteListItem, 'id'>): UserNoteListItem {
  return {
    id: partial.id,
    kind: partial.kind ?? 'standalone',
    messageId: null,
    accountId: null,
    calendarSource: null,
    calendarRemoteId: null,
    eventRemoteId: null,
    title: partial.title ?? 'Test',
    body: '',
    createdAt: '2026-05-15T10:00:00.000Z',
    updatedAt: '2026-05-15T10:00:00.000Z',
    eventTitleSnapshot: null,
    eventStartIsoSnapshot: null,
    scheduledStartIso: partial.scheduledStartIso ?? null,
    scheduledEndIso: partial.scheduledEndIso ?? null,
    scheduledAllDay: partial.scheduledAllDay ?? false,
    sectionId: null,
    sortOrder: 0,
    mailSubject: null,
    mailAccountId: null,
    mailFromAddr: null,
    mailFromName: null,
    mailSnippet: null,
    mailSentAt: null,
    mailReceivedAt: null,
    mailIsRead: null,
    mailHasAttachments: null
  }
}

describe('resolveNoteCalendarSpan', () => {
  it('liefert null ohne Planung', () => {
    expect(resolveNoteCalendarSpan(note({ id: 1 }))).toBeNull()
  })

  it('berechnet Zeitspanne mit Default-Ende', () => {
    const span = resolveNoteCalendarSpan(
      note({
        id: 1,
        scheduledStartIso: '2026-05-16T10:00:00.000Z',
        scheduledEndIso: null,
        scheduledAllDay: false
      })
    )
    expect(span?.allDay).toBe(false)
    expect(span?.startIso).toBe('2026-05-16T10:00:00.000Z')
    expect(span?.endIso).toBeTruthy()
  })

  it('unterstuetzt Ganztag', () => {
    const span = resolveNoteCalendarSpan(
      note({
        id: 1,
        scheduledStartIso: '2026-05-16',
        scheduledEndIso: null,
        scheduledAllDay: true
      })
    )
    expect(span?.allDay).toBe(true)
    expect(span?.startIso).toBe('2026-05-16')
  })
})

describe('notesToFullCalendarEvents', () => {
  it('erzeugt Events nur fuer geplante Notizen', () => {
    const events = notesToFullCalendarEvents([
      note({ id: 1, scheduledStartIso: '2026-05-16T10:00:00.000Z' }),
      note({ id: 2 })
    ])
    expect(events).toHaveLength(1)
    expect(events[0]?.id).toBe(userNoteEventId(1))
  })
})

describe('parseUserNoteEventId', () => {
  it('parst gueltige IDs', () => {
    expect(parseUserNoteEventId('user-note:42')).toBe(42)
    expect(parseUserNoteEventId('mail-todo:1')).toBeNull()
  })
})
