import { BrowserWindow } from 'electron'
import type { ConnectedAccount, MailChangedPayload, UserNoteKind } from '@shared/types'
import { mergeMailChangedPayload } from '@shared/mail-changed-merge'

const MAIL_CHANGED_COALESCE_MS = 100

const pendingMailChanged = new Map<string, MailChangedPayload>()
let mailChangedFlushTimer: ReturnType<typeof setTimeout> | null = null

function flushMailChanged(): void {
  mailChangedFlushTimer = null
  if (pendingMailChanged.size === 0) return
  const batch = [...pendingMailChanged.values()]
  pendingMailChanged.clear()
  for (const win of BrowserWindow.getAllWindows()) {
    for (const payload of batch) {
      win.webContents.send('mail:changed', payload)
    }
  }
}

function scheduleMailChangedFlush(): void {
  if (mailChangedFlushTimer != null) return
  mailChangedFlushTimer = setTimeout(flushMailChanged, MAIL_CHANGED_COALESCE_MS)
}

export function broadcastAccountsChanged(accounts: ConnectedAccount[]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('accounts:changed', accounts)
  }
}

export function broadcastSyncStatus(status: {
  accountId: string
  state: 'idle' | 'syncing-folders' | 'syncing-messages' | 'error'
  message?: string
}): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('sync:status', status)
  }
}

export function broadcastMailChanged(
  accountId: string,
  extra: Omit<MailChangedPayload, 'accountId'> = {}
): void {
  const incoming: MailChangedPayload = { accountId, ...extra }
  const prev = pendingMailChanged.get(accountId)
  pendingMailChanged.set(
    accountId,
    prev ? mergeMailChangedPayload(prev, extra) : incoming
  )
  scheduleMailChangedFlush()
}

export function broadcastMailBulkUnflagProgress(payload: {
  accountId: string
  done: number
  total: number
}): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('mail:bulk-unflag-progress', payload)
  }
}

export function broadcastCalendarChanged(accountId: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('calendar:changed', { accountId })
  }
}

export function broadcastCalendarSyncStatus(status: {
  accountId: string
  state: 'idle' | 'syncing-folders' | 'syncing-messages' | 'error'
  message?: string
}): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('calendar:sync-status', status)
  }
}

export function broadcastTasksChanged(accountId: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('tasks:changed', { accountId })
  }
}

export function broadcastNotesChanged(payload: {
  kind?: UserNoteKind
  noteId?: number
  messageId?: number | null
  accountId?: string | null
}): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('notes:changed', payload)
  }
}

export function broadcastTeamsChatPopoutClosed(payload: {
  accountId: string
  chatId: string
}): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('teams-chat-popout:closed', payload)
  }
}
