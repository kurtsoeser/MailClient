import { ipcMain } from 'electron'
import { IPC, type MailFolder } from '@shared/types'
import { listAccounts } from '../accounts'
import {
  gmailCreateMailLabel,
  gmailRenameMailLabel,
  gmailDeleteMailLabel
} from '../google/gmail-label-folders'
import { runFolderSync } from '../sync-runner'
import {
  findFolderById,
  findFolderByWellKnown,
  findFolderByRemoteId,
  renameFolderLocal,
  deleteFolderLocal,
  updateFolderParentLocal,
  insertFolderLocal,
  isProtectedFolder,
  setFolderFavoriteLocal
} from '../db/folders-repo'
import { clearWorkflowFolderPrefsIfRemoteFolderRemoved } from '../db/workflow-folders-repo'
import {
  createFolder as graphCreateFolder,
  renameFolder as graphRenameFolder,
  deleteFolder as graphDeleteFolder,
  moveFolder as graphMoveFolder
} from '../graph/folder-actions'
import { broadcastMailChanged } from './ipc-broadcasts'

export function registerMailFoldersIpc(): void {
  ipcMain.handle(
    IPC.folder.create,
    async (
      _event,
      args: { accountId: string; parentFolderId: number | null; name: string }
    ): Promise<MailFolder> => {
      const name = args.name.trim()
      if (!name) throw new Error('Ordnername darf nicht leer sein.')

      const accounts = await listAccounts()
      const acc = accounts.find((a) => a.id === args.accountId)
      if (!acc) throw new Error('Konto nicht gefunden.')

      if (acc.provider === 'google') {
        const labelId = await gmailCreateMailLabel(args.accountId, name)
        const folder = findFolderByRemoteId(args.accountId, labelId)
        if (!folder) throw new Error('Gmail: Ordner nach Anlage nicht gefunden.')
        broadcastMailChanged(args.accountId)
        return folder
      }

      let parentRemoteId: string | null = null
      if (args.parentFolderId != null) {
        const parent = findFolderById(args.parentFolderId)
        if (!parent || parent.accountId !== args.accountId) {
          throw new Error('Eltern-Ordner nicht gefunden.')
        }
        parentRemoteId = parent.remoteId
      }

      const created = await graphCreateFolder(args.accountId, name, parentRemoteId)

      const localId = insertFolderLocal({
        accountId: args.accountId,
        remoteId: created.id,
        name: created.displayName,
        parentRemoteId: created.parentFolderId ?? parentRemoteId,
        wellKnown: null,
        unreadCount: created.unreadItemCount ?? 0,
        totalCount: created.totalItemCount ?? 0
      })

      broadcastMailChanged(args.accountId)
      const folder = findFolderById(localId)
      if (!folder) throw new Error('Erstellter Ordner konnte nicht gelesen werden.')
      return folder
    }
  )

  ipcMain.handle(
    IPC.folder.rename,
    async (_event, args: { folderId: number; name: string }): Promise<void> => {
      const folder = findFolderById(args.folderId)
      if (!folder) throw new Error('Ordner nicht gefunden.')
      if (isProtectedFolder(folder)) {
        throw new Error('Systemordner koennen nicht umbenannt werden.')
      }
      const name = args.name.trim()
      if (!name) throw new Error('Ordnername darf nicht leer sein.')
      if (name === folder.name) return

      const accounts = await listAccounts()
      const acc = accounts.find((a) => a.id === folder.accountId)
      if (acc?.provider === 'google') {
        await gmailRenameMailLabel(folder.accountId, folder.remoteId, name)
        renameFolderLocal(args.folderId, name)
        broadcastMailChanged(folder.accountId)
        return
      }

      await graphRenameFolder(folder.accountId, folder.remoteId, name)
      renameFolderLocal(args.folderId, name)
      broadcastMailChanged(folder.accountId)
    }
  )

  ipcMain.handle(
    IPC.folder.delete,
    async (_event, folderId: number): Promise<void> => {
      const folder = findFolderById(folderId)
      if (!folder) throw new Error('Ordner nicht gefunden.')
      if (isProtectedFolder(folder)) {
        throw new Error('Systemordner koennen nicht geloescht werden.')
      }

      const accounts = await listAccounts()
      const acc = accounts.find((a) => a.id === folder.accountId)

      if (acc?.provider === 'google') {
        await gmailDeleteMailLabel(folder.accountId, folder.remoteId)
        clearWorkflowFolderPrefsIfRemoteFolderRemoved(folder.accountId, folder.remoteId)
        deleteFolderLocal(folderId)
        const inbox = findFolderByWellKnown(folder.accountId, 'inbox')
        if (inbox) {
          void runFolderSync(inbox.id).catch((e) =>
            console.warn('[ipc] Gmail: Posteingang nach Label-Loeschen sync:', e)
          )
        }
        broadcastMailChanged(folder.accountId)
        return
      }

      await graphDeleteFolder(folder.accountId, folder.remoteId)
      clearWorkflowFolderPrefsIfRemoteFolderRemoved(folder.accountId, folder.remoteId)
      deleteFolderLocal(folderId)
      broadcastMailChanged(folder.accountId)
    }
  )

  ipcMain.handle(
    IPC.folder.toggleFavorite,
    (
      _event,
      args: { folderId: number; value: boolean }
    ): MailFolder => {
      const folder = findFolderById(args.folderId)
      if (!folder) throw new Error('Ordner nicht gefunden.')
      setFolderFavoriteLocal(args.folderId, args.value)
      broadcastMailChanged(folder.accountId)
      const refreshed = findFolderById(args.folderId)
      if (!refreshed) throw new Error('Ordner konnte nach Update nicht gelesen werden.')
      return refreshed
    }
  )

  ipcMain.handle(
    IPC.folder.move,
    async (
      _event,
      args: { folderId: number; destinationFolderId: number | null }
    ): Promise<void> => {
      const folder = findFolderById(args.folderId)
      if (!folder) throw new Error('Ordner nicht gefunden.')
      if (isProtectedFolder(folder)) {
        throw new Error('Systemordner koennen nicht verschoben werden.')
      }

      const accounts = await listAccounts()
      const acc = accounts.find((a) => a.id === folder.accountId)
      if (acc?.provider === 'google') {
        throw new Error(
          'Gmail-Labels sind nicht hierarchisch: «Verschieben» wie bei Exchange ist nicht moeglich. Neues Label anlegen und Mails per Regel/Triage zuordnen.'
        )
      }

      let destinationRemoteId: string
      if (args.destinationFolderId == null) {
        destinationRemoteId = 'msgfolderroot'
      } else {
        const dest = findFolderById(args.destinationFolderId)
        if (!dest || dest.accountId !== folder.accountId) {
          throw new Error('Ziel-Ordner nicht gefunden.')
        }
        if (dest.id === folder.id) {
          throw new Error('Ordner kann nicht in sich selbst verschoben werden.')
        }
        destinationRemoteId = dest.remoteId
      }

      const moved = await graphMoveFolder(folder.accountId, folder.remoteId, destinationRemoteId)
      updateFolderParentLocal(args.folderId, moved.parentFolderId ?? null)
      broadcastMailChanged(folder.accountId)
    }
  )
}
