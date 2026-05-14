import type { MailListItem } from '@shared/types'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ThreadGroup } from './thread-group'
import type { MailListVirtualRow as VirtualRow } from './mail-list-arrange'
import {
  computeMailListLayout,
  dateBucketFor,
  filterMailListLayoutForCollapsedGroups,
  mailListGroupCollapseKey,
  navigableIdsFromFlatRows
} from './mail-list-arrange'

describe('dateBucketFor', () => {
  const prevTz = process.env.TZ

  beforeAll(() => {
    process.env.TZ = 'UTC'
  })

  afterAll(() => {
    process.env.TZ = prevTz
  })

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-13T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('behandelt fehlende oder ungueltige Daten', () => {
    expect(dateBucketFor(null).key).toBe('unknown')
    expect(dateBucketFor(undefined).key).toBe('unknown')
    expect(dateBucketFor('').key).toBe('unknown')
    expect(dateBucketFor('not-a-date').key).toBe('unknown')
  })

  it('klassifiziert relativ zu Referenzdatum (UTC)', () => {
    expect(dateBucketFor('2026-05-13T08:00:00.000Z').key).toBe('today')
    expect(dateBucketFor('2026-05-12T15:00:00.000Z').key).toBe('yesterday')
  })
})

describe('navigableIdsFromFlatRows', () => {
  it('mappt thread-head auf latestMessage.id und sub auf message.id', () => {
    const m1: MailListItem = {
      id: 10,
      accountId: 'a',
      folderId: 1,
      threadId: null,
      remoteId: 'r',
      remoteThreadId: 't',
      subject: null,
      fromAddr: null,
      fromName: null,
      snippet: null,
      sentAt: null,
      receivedAt: '2026-01-01T00:00:00.000Z',
      isRead: true,
      isFlagged: false,
      hasAttachments: false,
      importance: null,
      snoozedUntil: null
    }
    const m2: MailListItem = { ...m1, id: 11, receivedAt: '2026-01-02T00:00:00.000Z' }
    const thread: ThreadGroup = {
      threadKey: 't',
      accountId: 'a',
      messageCount: 2,
      unreadCount: 0,
      hasAttachments: false,
      isFlagged: false,
      latestMessage: m2,
      rootMessage: m1,
      participantNames: []
    }
    const ids = navigableIdsFromFlatRows([
      { kind: 'thread-head', key: 'h', thread, threadMessages: [m1, m2] },
      { kind: 'thread-sub', key: 's', threadKey: 't', message: m1 }
    ])
    expect(ids).toEqual([11, 10])
  })
})

describe('computeMailListLayout', () => {
  it('liefert eine Gruppe mit thread-head', () => {
    const m: MailListItem = {
      id: 5,
      accountId: 'acc',
      folderId: 1,
      threadId: null,
      remoteId: 'r',
      remoteThreadId: 'th1',
      subject: 'Subj',
      fromAddr: 'a@b.c',
      fromName: 'A',
      snippet: null,
      sentAt: null,
      receivedAt: '2026-02-01T10:00:00.000Z',
      isRead: false,
      isFlagged: true,
      hasAttachments: false,
      importance: 'high',
      snoozedUntil: null
    }
    const thread: ThreadGroup = {
      threadKey: 'th1',
      accountId: 'acc',
      messageCount: 1,
      unreadCount: 1,
      hasAttachments: false,
      isFlagged: true,
      latestMessage: m,
      rootMessage: m,
      participantNames: ['A']
    }
    const map = new Map<string, MailListItem[]>([['th1', [m]]])
    const layout = computeMailListLayout([thread], map, new Set(), 'from', 'newest_on_top', {
      accountLabel: () => 'Konto',
      folderWellKnown: 'inbox'
    })
    expect(layout.groupLabels.length).toBeGreaterThan(0)
    expect(layout.flatRows.some((r) => r.kind === 'thread-head')).toBe(true)
    expect(navigableIdsFromFlatRows(layout.flatRows)).toContain(5)
  })
})

describe('filterMailListLayoutForCollapsedGroups', () => {
  it('blendet eingeklappte Gruppen aus', () => {
    const rowA: VirtualRow = {
      kind: 'thread-head',
      key: 'a',
      thread: {} as ThreadGroup,
      threadMessages: []
    }
    const rowB: VirtualRow = {
      kind: 'thread-head',
      key: 'b',
      thread: {} as ThreadGroup,
      threadMessages: []
    }
    const groupLabels = ['G1', 'G2']
    const groupCounts = [1, 1]
    const flatRows = [rowA, rowB]
    const arrange = 'from' as const
    const k0 = mailListGroupCollapseKey(arrange, 0, 'G1')
    const collapsed = new Set([k0])
    const { visibleGroupCounts, visibleFlatRows } = filterMailListLayoutForCollapsedGroups(
      groupLabels,
      groupCounts,
      flatRows,
      arrange,
      collapsed
    )
    expect(visibleGroupCounts).toEqual([0, 1])
    expect(visibleFlatRows).toEqual([rowB])
  })
})
