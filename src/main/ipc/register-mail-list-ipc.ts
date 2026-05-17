import { ipcMain } from 'electron'
import { IPC, type MailFolder, type MailListItem, type MailFull } from '@shared/types'
import { listFoldersByAccount } from '../db/folders-repo'
import {
  listMessagesByFolder,
  listMessagesByAccount,
  listInboxMessagesAllAccounts,
  listMessagesByThread,
  listMessagesByThreadKeys
} from '../db/messages-repo'
import { decorateMailList, decorateMailFull } from './ipc-helpers'

export function registerMailListIpc(): void {
  ipcMain.removeHandler(IPC.mail.listFolders)
  ipcMain.removeHandler(IPC.mail.listMessages)
  ipcMain.removeHandler(IPC.mail.listInboxTriage)
  ipcMain.removeHandler(IPC.mail.listUnifiedInbox)
  ipcMain.removeHandler(IPC.mail.listThreadMessages)
  ipcMain.removeHandler(IPC.mail.listMessagesByThreads)

  ipcMain.handle(
    IPC.mail.listFolders,
    (_event, accountId: string): MailFolder[] => listFoldersByAccount(accountId)
  )

  ipcMain.handle(
    IPC.mail.listMessages,
    (_event, options: { folderId?: number; accountId?: string; limit?: number }): MailListItem[] => {
      const limit = options.limit ?? 100
      let rows: MailListItem[] = []
      if (options.folderId != null) rows = listMessagesByFolder(options.folderId, limit)
      else if (options.accountId) rows = listMessagesByAccount(options.accountId, limit)
      return decorateMailList(rows)
    }
  )

  ipcMain.handle(
    IPC.mail.listInboxTriage,
    (_event, args?: { limit?: number | null }): MailListItem[] => {
      let resolved: number | null
      if (args?.limit === null) {
        resolved = null
      } else if (typeof args?.limit === 'number' && Number.isFinite(args.limit) && args.limit > 0) {
        resolved = Math.floor(args.limit)
      } else {
        resolved = 200
      }
      return decorateMailList(listInboxMessagesAllAccounts(resolved))
    }
  )

  ipcMain.handle(
    IPC.mail.listUnifiedInbox,
    (
      _event,
      limit?: number | null,
      options?: { includeOpenTodo?: boolean }
    ): MailListItem[] => {
      const resolved =
        limit === null ? null : Math.min(Math.max(limit ?? 300, 1), 2000)
      return decorateMailList(listInboxMessagesAllAccounts(resolved, options))
    }
  )

  ipcMain.handle(
    IPC.mail.listThreadMessages,
    (
      _event,
      args: { accountId: string; threadKey: string }
    ): MailFull[] =>
      listMessagesByThread(args.accountId, args.threadKey).map((m) => decorateMailFull(m)!)
  )

  ipcMain.handle(
    IPC.mail.listMessagesByThreads,
    (
      _event,
      args: { accountId: string; threadKeys: string[] }
    ): MailListItem[] => decorateMailList(listMessagesByThreadKeys(args.accountId, args.threadKeys))
  )
}
