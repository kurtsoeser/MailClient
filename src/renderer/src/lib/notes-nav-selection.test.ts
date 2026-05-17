import { describe, expect, it } from 'vitest'
import type { UserNoteListItem } from '@shared/types'
import { notesForNavSelection } from './notes-nav-selection'

function note(id: number, sectionId: number | null, accountId: string | null = null): UserNoteListItem {
  return {
    id,
    kind: 'standalone',
    messageId: null,
    accountId,
    calendarSource: null,
    calendarRemoteId: null,
    eventRemoteId: null,
    title: `Note ${id}`,
    body: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    eventTitleSnapshot: null,
    eventStartIsoSnapshot: null,
    scheduledStartIso: null,
    scheduledEndIso: null,
    scheduledAllDay: false,
    sectionId,
    sortOrder: id,
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

describe('notesForNavSelection', () => {
  it('filters by section', () => {
    const notes = [note(1, 10), note(2, 20), note(3, 10)]
    const result = notesForNavSelection(notes, {
      kind: 'sections',
      scope: { sectionId: 10 }
    })
    expect(result.map((n) => n.id)).toEqual([1, 3])
  })

  it('filters ungrouped', () => {
    const notes = [note(1, null), note(2, 10)]
    const result = notesForNavSelection(notes, { kind: 'sections', scope: 'ungrouped' })
    expect(result.map((n) => n.id)).toEqual([1])
  })

  it('returns all notes for all scope', () => {
    const notes = [note(1, null), note(2, 10), note(3, 20)]
    const result = notesForNavSelection(notes, { kind: 'sections', scope: 'all' })
    expect(result.map((n) => n.id)).toEqual([1, 2, 3])
  })
})
