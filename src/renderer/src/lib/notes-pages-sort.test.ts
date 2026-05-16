import { describe, expect, it } from 'vitest'
import type { UserNoteListItem } from '@shared/types'
import { sortNotesPages } from './notes-pages-sort'

function note(
  id: number,
  overrides: Partial<UserNoteListItem> = {}
): UserNoteListItem {
  return {
    id,
    kind: 'standalone',
    messageId: null,
    accountId: null,
    calendarSource: null,
    calendarRemoteId: null,
    eventRemoteId: null,
    title: `Note ${id}`,
    body: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-03T00:00:00.000Z',
    eventTitleSnapshot: null,
    eventStartIsoSnapshot: null,
    scheduledStartIso: null,
    scheduledEndIso: null,
    scheduledAllDay: false,
    sectionId: null,
    sortOrder: id,
    mailSubject: null,
    mailAccountId: null,
    mailFromAddr: null,
    mailFromName: null,
    mailSnippet: null,
    mailSentAt: null,
    mailReceivedAt: null,
    mailIsRead: null,
    mailHasAttachments: null,
    ...overrides
  }
}

describe('sortNotesPages', () => {
  it('sorts by title ascending', () => {
    const notes = [
      note(1, { title: 'Zebra' }),
      note(2, { title: 'Alpha' }),
      note(3, { title: 'Beta' })
    ]
    const sorted = sortNotesPages(notes, 'title_asc', 'Untitled')
    expect(sorted.map((n) => n.id)).toEqual([2, 3, 1])
  })

  it('sorts by created date descending', () => {
    const notes = [
      note(1, { createdAt: '2026-01-01T00:00:00.000Z' }),
      note(2, { createdAt: '2026-03-01T00:00:00.000Z' }),
      note(3, { createdAt: '2026-02-01T00:00:00.000Z' })
    ]
    const sorted = sortNotesPages(notes, 'created_desc', 'Untitled')
    expect(sorted.map((n) => n.id)).toEqual([2, 3, 1])
  })

  it('puts unscheduled notes last when sorting by scheduled date', () => {
    const notes = [
      note(1, { scheduledStartIso: '2026-02-01T10:00:00.000Z' }),
      note(2, { scheduledStartIso: null }),
      note(3, { scheduledStartIso: '2026-01-01T10:00:00.000Z' })
    ]
    const sorted = sortNotesPages(notes, 'scheduled_asc', 'Untitled')
    expect(sorted.map((n) => n.id)).toEqual([3, 1, 2])
  })
})
