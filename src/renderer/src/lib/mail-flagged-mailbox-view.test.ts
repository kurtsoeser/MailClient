import { describe, expect, it } from 'vitest'
import type { MailFolder, MailListItem } from '@shared/types'
import type { ThreadGroup } from '@/lib/thread-group'
import {
  buildMailboxFlagExcludedFolderIds,
  threadMatchesMailboxFlaggedFilter
} from '@/lib/mail-flagged-mailbox-view'

const stubFolder = (id: number, wellKnown: string | null, remoteId = `r${id}`): MailFolder => ({
  id,
  accountId: 'ms:x',
  remoteId,
  name: 'x',
  parentRemoteId: null,
  path: null,
  wellKnown,
  isFavorite: false,
  unreadCount: 0,
  totalCount: 0
})

function thread(isFlagged: boolean, threadKey = 'k'): ThreadGroup {
  return {
    threadKey,
    accountId: 'ms:x',
    messageCount: 1,
    unreadCount: 0,
    hasAttachments: false,
    isFlagged,
    latestMessage: {} as MailListItem,
    rootMessage: {} as MailListItem,
    participantNames: []
  }
}

function msg(over: Partial<MailListItem>): MailListItem {
  return {
    id: 1,
    accountId: 'ms:x',
    folderId: 10,
    threadId: null,
    remoteId: 'r1',
    remoteThreadId: 't1',
    subject: 's',
    fromAddr: null,
    fromName: null,
    snippet: null,
    sentAt: null,
    receivedAt: '2020-01-01T00:00:00Z',
    isRead: true,
    isFlagged: true,
    hasAttachments: false,
    importance: null,
    snoozedUntil: null,
    waitingForReplyUntil: null,
    listUnsubscribe: null,
    listUnsubscribePost: null,
    ...over
  }
}

describe('buildMailboxFlagExcludedFolderIds', () => {
  it('marks Gmail trash/spam by remoteId when wellKnown is null', () => {
    const ex = buildMailboxFlagExcludedFolderIds({
      'g:x': [
        stubFolder(1, 'inbox', 'INBOX'),
        stubFolder(2, null, 'TRASH'),
        stubFolder(3, null, 'SPAM')
      ]
    })
    expect(ex.has(1)).toBe(false)
    expect(ex.has(2)).toBe(true)
    expect(ex.has(3)).toBe(true)
  })
})

describe('threadMatchesMailboxFlaggedFilter', () => {
  it('behaves like thread.isFlagged when exclusion off', () => {
    const t = thread(true)
    const map = new Map<string, MailListItem[]>()
    const ex = new Set<number>()
    expect(threadMatchesMailboxFlaggedFilter(t, map, ex, false)).toBe(true)
    expect(threadMatchesMailboxFlaggedFilter(thread(false), map, ex, false)).toBe(false)
  })

  it('hides thread when only deleted folder has flag', () => {
    const t = thread(true, 'tk')
    const m = msg({ id: 1, folderId: 99, isFlagged: true })
    const messagesByThread = new Map([['tk', [m]]])
    const excluded = buildMailboxFlagExcludedFolderIds({
      'ms:x': [stubFolder(99, 'deleteditems')]
    })
    expect(threadMatchesMailboxFlaggedFilter(t, messagesByThread, excluded, true)).toBe(false)
  })

  it('hides thread when only Gmail TRASH folder has flag (wellKnown null)', () => {
    const t = thread(true, 'tk')
    const m = msg({ id: 1, folderId: 2, isFlagged: true })
    const messagesByThread = new Map([['tk', [m]]])
    const excluded = buildMailboxFlagExcludedFolderIds({
      'g:x': [stubFolder(2, null, 'TRASH')]
    })
    expect(threadMatchesMailboxFlaggedFilter(t, messagesByThread, excluded, true)).toBe(false)
  })

  it('shows thread when inbox copy is flagged', () => {
    const t = thread(true, 'tk')
    const messagesByThread = new Map([
      [
        'tk',
        [
          msg({ id: 1, folderId: 99, isFlagged: true }),
          msg({ id: 2, folderId: 1, isFlagged: true, receivedAt: '2021-01-01T00:00:00Z' })
        ]
      ]
    ])
    const excluded = buildMailboxFlagExcludedFolderIds({
      'ms:x': [stubFolder(99, 'deleteditems'), stubFolder(1, 'inbox')]
    })
    expect(threadMatchesMailboxFlaggedFilter(t, messagesByThread, excluded, true)).toBe(true)
  })
})
