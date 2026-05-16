import { describe, expect, it } from 'vitest'
import type { UserNoteListItem } from '@shared/types'
import {
  LOCAL_NOTES_ACCOUNT_KEY,
  buildNoteAccountBuckets,
  noteAccountKey
} from '@/lib/notes-sidebar-accounts'

function note(
  partial: Partial<UserNoteListItem> & Pick<UserNoteListItem, 'id' | 'kind'>
): UserNoteListItem {
  const { id, kind, ...rest } = partial
  return {
    id,
    kind,
    messageId: null,
    accountId: null,
    calendarSource: null,
    calendarRemoteId: null,
    eventRemoteId: null,
    title: null,
    body: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    eventTitleSnapshot: null,
    eventStartIsoSnapshot: null,
    scheduledStartIso: null,
    scheduledEndIso: null,
    scheduledAllDay: false,
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
    mailHasAttachments: null,
    ...rest
  }
}

describe('noteAccountKey', () => {
  it('prefers mail account for mail notes', () => {
    expect(
      noteAccountKey(
        note({ id: 1, kind: 'mail', mailAccountId: 'mail-acc', accountId: 'other' })
      )
    ).toBe('mail-acc')
  })

  it('uses local key when no account', () => {
    expect(noteAccountKey(note({ id: 2, kind: 'standalone' }))).toBe(LOCAL_NOTES_ACCOUNT_KEY)
  })
})

describe('buildNoteAccountBuckets', () => {
  it('orders known accounts first then local', () => {
    const accounts = [
      {
        id: 'a1',
        email: 'a@test.com',
        displayName: 'A',
        color: 'bg-red-500',
        initials: 'A',
        provider: 'microsoft' as const,
        addedAt: '2026-01-01T00:00:00.000Z'
      },
      {
        id: 'a2',
        email: 'b@test.com',
        displayName: 'B',
        color: 'bg-blue-500',
        initials: 'B',
        provider: 'google' as const,
        addedAt: '2026-01-01T00:00:00.000Z'
      }
    ]

    const notes = [
      note({ id: 1, kind: 'standalone' }),
      note({ id: 2, kind: 'mail', mailAccountId: 'a2' }),
      note({ id: 3, kind: 'calendar', accountId: 'a1' })
    ]

    const buckets = buildNoteAccountBuckets(accounts, notes)
    expect(buckets.map((b) => b.accountId)).toEqual(['a1', 'a2', LOCAL_NOTES_ACCOUNT_KEY])
    expect(buckets[0]?.notes).toHaveLength(1)
    expect(buckets[2]?.notes).toHaveLength(1)
  })
})
