import { BrowserWindow } from 'electron'
import type { ConnectedAccount, UserNoteKind } from '@shared/types'

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

export function broadcastMailChanged(accountId: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('mail:changed', { accountId })
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
