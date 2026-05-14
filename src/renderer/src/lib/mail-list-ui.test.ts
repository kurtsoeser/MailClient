import { describe, expect, it } from 'vitest'
import {
  dedupeMailListThreadMessagesById,
  mailListTodoViewTitle,
  MAIL_LIST_UNIFIED_INBOX_STRIPE_BAR
} from './mail-list-ui'
import type { MailListItem } from '@shared/types'

function msg(id: number): MailListItem {
  return {
    id,
    accountId: 'a',
    folderId: 1,
    threadId: null,
    remoteId: `r${id}`,
    remoteThreadId: null,
    subject: null,
    fromAddr: null,
    fromName: null,
    snippet: null,
    sentAt: null,
    receivedAt: null,
    isRead: true,
    isFlagged: false,
    hasAttachments: false,
    importance: null,
    snoozedUntil: null
  }
}

describe('mailListTodoViewTitle', () => {
  it('liefert lesbare Titel', () => {
    expect(mailListTodoViewTitle('today')).toContain('Heute')
    expect(mailListTodoViewTitle('done')).toContain('Erledigt')
  })
})

describe('dedupeMailListThreadMessagesById', () => {
  it('entfernt doppelte ids', () => {
    const a = msg(1)
    const b = msg(2)
    expect(dedupeMailListThreadMessagesById([a, b, a])).toEqual([a, b])
  })
})

describe('MAIL_LIST_UNIFIED_INBOX_STRIPE_BAR', () => {
  it('ist eine Tailwind-Klassenkette', () => {
    expect(MAIL_LIST_UNIFIED_INBOX_STRIPE_BAR).toContain('absolute')
  })
})
