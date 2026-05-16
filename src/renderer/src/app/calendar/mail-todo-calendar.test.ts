import { describe, expect, it } from 'vitest'
import type { MailListItem } from '@shared/types'
import {
  mailTodoConversationsToFullCalendarEvents,
  mailTodoItemsToFullCalendarEvents
} from './mail-todo-calendar'

function mail(partial: Partial<MailListItem> & Pick<MailListItem, 'id' | 'accountId'>): MailListItem {
  return {
    id: partial.id,
    accountId: partial.accountId,
    folderId: null,
    threadId: null,
    remoteId: `r-${partial.id}`,
    remoteThreadId: partial.remoteThreadId ?? 'thread-1',
    subject: partial.subject ?? 'Betreff',
    fromAddr: null,
    fromName: null,
    snippet: null,
    sentAt: null,
    receivedAt: '2026-05-15T10:00:00.000Z',
    isRead: false,
    isFlagged: false,
    hasAttachments: false,
    importance: null,
    snoozedUntil: null,
    todoDueAt: partial.todoDueAt ?? '2026-05-16',
    todoStartAt: partial.todoStartAt ?? null,
    todoEndAt: partial.todoEndAt ?? null
  }
}

describe('mailTodoItemsToFullCalendarEvents', () => {
  it('erzeugt pro Message ein Event', () => {
    const items = [
      mail({ id: 1, accountId: 'a1', subject: 'A' }),
      mail({ id: 2, accountId: 'a1', subject: 'B', remoteThreadId: 'thread-1' })
    ]
    const events = mailTodoItemsToFullCalendarEvents(items, { a1: '#f00' })
    expect(events).toHaveLength(2)
    expect(events.map((e) => e.id)).toEqual(['mail-todo:1', 'mail-todo:2'])
    expect(events[0]?.extendedProps?.mailMessage).toMatchObject({ id: 1 })
    expect(events[1]?.extendedProps?.mailMessage).toMatchObject({ id: 2 })
  })
})

describe('mailTodoConversationsToFullCalendarEvents', () => {
  it('führt Messages im gleichen Thread zu einem Event zusammen', () => {
    const items = [
      mail({ id: 1, accountId: 'a1', subject: 'A' }),
      mail({ id: 2, accountId: 'a1', subject: 'B', remoteThreadId: 'thread-1' })
    ]
    const events = mailTodoConversationsToFullCalendarEvents(items, { a1: '#f00' })
    expect(events).toHaveLength(1)
    expect(String(events[0]?.id)).toContain('mail-todo-thread:')
    expect(events[0]?.title).toContain('(2)')
  })
})
