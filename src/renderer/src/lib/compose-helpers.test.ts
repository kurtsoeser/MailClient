import type { MailFull } from '@shared/types'
import { describe, expect, it } from 'vitest'
import {
  buildForwardBody,
  buildReplyBody,
  formatRecipientsForInput,
  parseRecipients,
  plainToHtml,
  withForwardPrefix,
  withReplyPrefix
} from './compose-helpers'

describe('parseRecipients', () => {
  it('parst Namen mit Klammer-Adresse und filtert Ungueltiges', () => {
    expect(parseRecipients('')).toEqual([])
    expect(parseRecipients('  ')).toEqual([])
    const r = parseRecipients('Max <max@test.de>, nur-text')
    expect(r).toEqual([{ address: 'max@test.de', name: 'Max' }])
  })
})

describe('formatRecipientsForInput', () => {
  it('formatiert zurueck', () => {
    const s = formatRecipientsForInput([{ address: 'a@b.c', name: 'A' }, { address: 'x@y.z' }])
    expect(s).toContain('A <a@b.c>')
    expect(s).toContain('x@y.z')
  })
})

describe('Betreff-Prefixe', () => {
  it('Re: und Fwd: idempotent', () => {
    expect(withReplyPrefix('Hallo')).toBe('Re: Hallo')
    expect(withReplyPrefix('Re: Hallo')).toBe('Re: Hallo')
    expect(withForwardPrefix('X')).toBe('Fwd: X')
    expect(withForwardPrefix('Fwd: X')).toBe('Fwd: X')
  })
})

describe('plainToHtml', () => {
  it('escaped und br', () => {
    expect(plainToHtml('a<b>\n')).toBe('<p>a&lt;b&gt;<br></p>')
  })
})

function fullMsg(p: Partial<MailFull> & Pick<MailFull, 'id' | 'accountId' | 'remoteId'>): MailFull {
  return {
    folderId: 1,
    threadId: null,
    remoteThreadId: null,
    subject: 'S',
    fromAddr: 'f@x.de',
    fromName: 'F',
    snippet: null,
    sentAt: '2026-01-01T12:00:00.000Z',
    receivedAt: null,
    isRead: true,
    isFlagged: false,
    hasAttachments: false,
    importance: null,
    snoozedUntil: null,
    bodyHtml: '<p>Hi</p>',
    bodyText: null,
    ccAddrs: null,
    toAddrs: 't@t.de',
    openTodoId: null,
    openTodoDueKind: null,
    openTodoDueAt: null,
    openTodoStartAt: null,
    openTodoEndAt: null,
    ...p
  }
}

describe('buildReplyBody / buildForwardBody', () => {
  it('enthalten Zitat-Struktur', () => {
    const m = fullMsg({ id: 1, accountId: 'a', remoteId: 'r' })
    const reply = buildReplyBody(m)
    expect(reply).toContain('schrieb')
    expect(reply).toContain('Hi')
    const fwd = buildForwardBody(m)
    expect(fwd).toContain('Von:')
    expect(fwd).toContain('Betreff:')
  })
})
