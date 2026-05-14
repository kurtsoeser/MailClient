import type { MailListItem } from '@shared/types'
import { describe, expect, it } from 'vitest'
import { groupMessagesIntoThreads, indexMessagesByThread, threadGroupingKey } from './thread-group'

function msg(p: Partial<MailListItem> & Pick<MailListItem, 'id' | 'accountId' | 'remoteId'>): MailListItem {
  return {
    folderId: 1,
    threadId: null,
    remoteThreadId: null,
    subject: 's',
    fromAddr: null,
    fromName: null,
    snippet: null,
    sentAt: null,
    receivedAt: '2026-01-02T10:00:00.000Z',
    isRead: true,
    isFlagged: false,
    hasAttachments: false,
    importance: 'normal',
    snoozedUntil: null,
    ...p
  }
}

describe('threadGroupingKey', () => {
  it('prefixt mit Konto wenn namespace aktiv', () => {
    const m = msg({
      id: 1,
      accountId: 'ms:a',
      remoteId: 'r1',
      remoteThreadId: 'thread-x'
    })
    expect(threadGroupingKey(m, false)).toBe('thread-x')
    expect(threadGroupingKey(m, true)).toBe('ms:a\tthread-x')
  })

  it('nutzt msg:id wenn keine remoteThreadId', () => {
    const m = msg({ id: 42, accountId: 'ms:a', remoteId: 'r1', remoteThreadId: null })
    expect(threadGroupingKey(m, false)).toBe('msg:42')
  })
})

describe('groupMessagesIntoThreads', () => {
  it('fasst gleiche remoteThreadId zusammen', () => {
    const a = msg({
      id: 1,
      accountId: 'ms:a',
      remoteId: 'r1',
      remoteThreadId: 't1',
      receivedAt: '2026-01-01T10:00:00.000Z'
    })
    const b = msg({
      id: 2,
      accountId: 'ms:a',
      remoteId: 'r2',
      remoteThreadId: 't1',
      receivedAt: '2026-01-03T10:00:00.000Z',
      isRead: false
    })
    const groups = groupMessagesIntoThreads([a, b])
    expect(groups).toHaveLength(1)
    expect(groups[0]!.messageCount).toBe(2)
    expect(groups[0]!.unreadCount).toBe(1)
    expect(groups[0]!.latestMessage.id).toBe(2)
    expect(groups[0]!.rootMessage.id).toBe(1)
  })
})

describe('indexMessagesByThread', () => {
  it('fuellt messagesByThread und threads', () => {
    const a = msg({
      id: 1,
      accountId: 'ms:a',
      remoteId: 'r1',
      remoteThreadId: 't1',
      receivedAt: '2026-01-02T10:00:00.000Z'
    })
    const idx = indexMessagesByThread([a], {}, false)
    expect(idx.threads).toHaveLength(1)
    expect(idx.messagesByThread.get('t1')).toEqual([a])
  })
})
