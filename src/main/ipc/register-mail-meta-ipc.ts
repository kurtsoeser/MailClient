import { ipcMain } from 'electron'
import {
  IPC,
  type MailListItem,
  type MetaFolderSummary,
  type MetaFolderCreateInput,
  type MetaFolderUpdateInput
} from '@shared/types'
import {
  listMetaFolders,
  getMetaFolder,
  createMetaFolder,
  updateMetaFolder,
  deleteMetaFolder,
  reorderMetaFolders,
  listMessagesForMetaFolder
} from '../db/meta-folders-repo'
import { decorateMailList } from './ipc-helpers'

export function registerMailMetaIpc(): void {
  ipcMain.removeHandler(IPC.mail.listMetaFolders)
  ipcMain.removeHandler(IPC.mail.getMetaFolder)
  ipcMain.removeHandler(IPC.mail.createMetaFolder)
  ipcMain.removeHandler(IPC.mail.updateMetaFolder)
  ipcMain.removeHandler(IPC.mail.deleteMetaFolder)
  ipcMain.removeHandler(IPC.mail.reorderMetaFolders)
  ipcMain.removeHandler(IPC.mail.listMetaFolderMessages)

  ipcMain.handle(IPC.mail.listMetaFolders, (): MetaFolderSummary[] => listMetaFolders())

  ipcMain.handle(IPC.mail.getMetaFolder, (_event, id: number): MetaFolderSummary | null =>
    getMetaFolder(id)
  )

  ipcMain.handle(
    IPC.mail.createMetaFolder,
    (_event, input: MetaFolderCreateInput): MetaFolderSummary => createMetaFolder(input)
  )

  ipcMain.handle(
    IPC.mail.updateMetaFolder,
    (_event, input: MetaFolderUpdateInput): MetaFolderSummary => updateMetaFolder(input)
  )

  ipcMain.handle(IPC.mail.deleteMetaFolder, (_event, id: number): void => {
    deleteMetaFolder(id)
  })

  ipcMain.handle(IPC.mail.reorderMetaFolders, (_event, orderedIds: number[]): void => {
    reorderMetaFolders(orderedIds)
  })

  ipcMain.handle(
    IPC.mail.listMetaFolderMessages,
    (_event, metaFolderId: number): MailListItem[] =>
      decorateMailList(listMessagesForMetaFolder(metaFolderId))
  )
}
