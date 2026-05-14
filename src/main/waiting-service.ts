import { BrowserWindow } from 'electron'
import { getMessageById, setMessageWaitingForReplyUntilLocal } from './db/messages-repo'
import { recordAction } from './db/message-actions-repo'

function broadcastMailChanged(accountId: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('mail:changed', { accountId })
  }
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max - 1) + '...'
}

function replyExpectedUntilIso(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(23, 59, 59, 999)
  return d.toISOString()
}

/**
 * Markiert eine Mail als "auf Antwort wartend" (Standard: 7 Tage).
 * Audit: `add-waiting-for` oder `change-waiting-for`.
 */
export function setWaitingForMessage(messageId: number, days = 7): void {
  const msg = getMessageById(messageId)
  if (!msg) throw new Error('Mail nicht gefunden.')
  const until = replyExpectedUntilIso(days)
  const prev = msg.waitingForReplyUntil
  if (prev === until) return

  setMessageWaitingForReplyUntilLocal(messageId, until)
  const subj = truncate(msg.subject ?? '(Kein Betreff)', 50)
  const labelDate = new Date(until).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })

  if (prev == null) {
    recordAction({
      messageId,
      accountId: msg.accountId,
      actionType: 'add-waiting-for',
      source: 'manual',
      payload: {
        waitingUntil: until,
        label: `Warten auf Antwort bis ${labelDate}: ${subj}`
      }
    })
  } else {
    recordAction({
      messageId,
      accountId: msg.accountId,
      actionType: 'change-waiting-for',
      source: 'manual',
      payload: {
        waitingUntil: until,
        previousWaitingUntil: prev,
        label: `Warten bis ${labelDate}: ${subj}`
      }
    })
  }
  broadcastMailChanged(msg.accountId)
}

export function clearWaitingForMessage(messageId: number): void {
  const msg = getMessageById(messageId)
  if (!msg) throw new Error('Mail nicht gefunden.')
  const prev = msg.waitingForReplyUntil
  if (prev == null) return

  setMessageWaitingForReplyUntilLocal(messageId, null)
  const subj = truncate(msg.subject ?? '(Kein Betreff)', 50)
  recordAction({
    messageId,
    accountId: msg.accountId,
    actionType: 'remove-waiting-for',
    source: 'manual',
    payload: {
      previousWaitingUntil: prev,
      label: `Warten aufgehoben: ${subj}`
    }
  })
  broadcastMailChanged(msg.accountId)
}

export function undoAddWaitingFor(messageId: number): string {
  const msg = getMessageById(messageId)
  if (!msg) throw new Error('Mail nicht mehr vorhanden.')
  setMessageWaitingForReplyUntilLocal(messageId, null)
  return msg.accountId
}

export function undoRemoveWaitingFor(messageId: number, previousUntil: string): string {
  const msg = getMessageById(messageId)
  if (!msg) throw new Error('Mail nicht mehr vorhanden.')
  setMessageWaitingForReplyUntilLocal(messageId, previousUntil)
  return msg.accountId
}

export function undoChangeWaitingFor(messageId: number, previousUntil: string | null): string {
  const msg = getMessageById(messageId)
  if (!msg) throw new Error('Mail nicht mehr vorhanden.')
  setMessageWaitingForReplyUntilLocal(messageId, previousUntil)
  return msg.accountId
}
