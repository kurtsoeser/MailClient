import { ipcMain, app, BrowserWindow, dialog, shell } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  IPC,
  type MailFolder,
  type MailListItem,
  type MailFull,
  type AttachmentMeta,
  type UndoableActionSummary,
  type UndoResult,
  type ComposeSendInput,
  type ComposeSaveDraftInput,
  type ComposeSaveDraftResult,
  type SnoozedMessageItem,
  type ComposeRecipientSuggestion,
  type ComposeListDriveExplorerInput,
  type ComposeDriveExplorerEntry,
  type TodoDueKindOpen,
  type TodoDueKindList,
  type TodoCountsAll,
  type MailTemplate,
  type MailQuickStep,
  type MailMasterCategory,
  type SearchHit,
  type WorkflowMailFolderUiState,
  type EnsureWorkflowMailFoldersResult,
  type MetaFolderSummary,
  type MetaFolderCreateInput,
  type MetaFolderUpdateInput
} from '@shared/types'
import { loadConfig } from '../config'
import { listAccounts } from '../accounts'
import { gmailSendMail, gmailSaveDraft } from '../google/gmail-compose'
import {
  gmailCreateMailLabel,
  gmailRenameMailLabel,
  gmailDeleteMailLabel
} from '../google/gmail-label-folders'
import {
  gmailListAttachmentsMeta,
  gmailDownloadAttachmentBytes,
  gmailFetchInlineImages
} from '../google/gmail-attachments'
import { runInitialSync, runFolderSync } from '../sync-runner'
import { triggerManualPoll, setActivePollFolder } from '../mail-poll-runner'
import {
  listFoldersByAccount,
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
import { peekLastUndoable, markUndone } from '../db/message-actions-repo'
import {
  listMessagesByFolder,
  listMessagesByAccount,
  listInboxMessagesAllAccounts,
  listMessagesByThread,
  listMessagesByThreadKeys,
  getMessageById,
  setMessageHasAttachmentsLocal,
  updateMessageFolderLocal,
  searchMessages,
  listSnoozedMessages,
  listWaitingMessages,
  searchMessageParticipantEmails,
  listRecentParticipantEmailsForCompose
} from '../db/messages-repo'
import { listMailTemplates } from '../db/templates-repo'
import { insertScheduledCompose } from '../db/compose-scheduled-repo'
import { searchPeopleContactsForCompose, listBootstrapPeopleContactsForCompose } from '../db/people-repo'
import { listMailQuickSteps } from '../db/quicksteps-repo'
import {
  ensureMicrosoftWorkflowMailFolders,
  ensureGoogleWorkflowMailFolders,
  getWorkflowMailFolderUiState,
  routeToWipAfterTodoIfConfigured,
  routeToDoneFolderAfterCompleteIfConfigured,
  setWorkflowMailFolderMapping
} from '../workflow-mail-folder-routing'
import { runQuickStep } from '../quicksteps-service'
import { snoozeMessage, unsnoozeMessage } from '../snooze'
import {
  setTodoForMessage,
  setTodoScheduleForMessage,
  completeTodoForMessage,
  listTodoMessagesMerged,
  listTodoMessagesInRange,
  getTodoCountsAll
} from '../todos-service'
import { resolveCalendarTimeZone } from '../todo-due-buckets'
import { setWaitingForMessage, clearWaitingForMessage } from '../waiting-service'
import {
  applySetReadForMessage,
  applyMoveMessageToWellKnownAlias,
  applyMoveMessageToFolder,
  applySetFlaggedForMessage,
  applySetMessageCategories,
  applyPermanentDeleteMessage,
  applyEmptyTrashFolder
} from '../message-graph-actions'
import {
  createFolder as graphCreateFolder,
  renameFolder as graphRenameFolder,
  deleteFolder as graphDeleteFolder,
  moveFolder as graphMoveFolder
} from '../graph/folder-actions'
import {
  graphListMasterCategories,
  graphCreateMasterCategory,
  graphUpdateMasterCategory,
  graphDeleteMasterCategory
} from '../graph/master-categories'
import { sendMail as graphSendMail, saveMailDraft as graphSaveMailDraft } from '../graph/compose'
import {
  graphListDriveExplorer,
  graphSearchPeopleForCompose,
  graphSearchDirectoryUsersForCompose,
  graphSearchMailEnabledGroupsForCompose
} from '../graph/compose-recipient-graph'
import {
  fetchInlineImages as graphFetchInlineImages,
  listAttachmentsMeta,
  downloadAttachmentBytes
} from '../graph/attachments'
import { performOneClickUnsubscribe } from '../mail-unsubscribe'
import {
  decorateMailList,
  decorateMailFull,
  decorateMailListLike,
  sanitizeFileName,
  defaultUndoLabel
} from './ipc-helpers'
import { broadcastMailChanged } from './ipc-broadcasts'
import { applyUndo } from './mail-ipc-undo'
import { listDistinctTagsForAccount } from '../db/message-tags-repo'
import {
  listMetaFolders,
  getMetaFolder,
  createMetaFolder,
  updateMetaFolder,
  deleteMetaFolder,
  reorderMetaFolders,
  listMessagesForMetaFolder
} from '../db/meta-folders-repo'

export function registerMailIpc(): void {
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
  
  ipcMain.handle(IPC.mail.listUnifiedInbox, (): MailListItem[] =>
    decorateMailList(listInboxMessagesAllAccounts(null))
  )

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

  ipcMain.handle(IPC.mail.getMessage, (_event, id: number): MailFull | null => {
    return decorateMailFull(getMessageById(id))
  })
  
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
  
  ipcMain.handle(
    IPC.mail.fetchInlineImages,
    async (
      _event,
      args: { messageId: number }
    ): Promise<Record<string, string>> => {
      const msg = getMessageById(args.messageId)
      if (!msg) return {}
      try {
        const accounts = await listAccounts()
        const acc = accounts.find((a) => a.id === msg.accountId)
        if (acc?.provider === 'google') {
          return await gmailFetchInlineImages(msg.accountId, msg.remoteId)
        }
        return await graphFetchInlineImages(msg.accountId, msg.remoteId)
      } catch (e) {
        console.warn('[ipc] fetchInlineImages fehlgeschlagen:', e)
        return {}
      }
    }
  )
  
  ipcMain.handle(
    IPC.mail.listAttachments,
    async (
      _event,
      args: { messageId: number }
    ): Promise<AttachmentMeta[]> => {
      const msg = getMessageById(args.messageId)
      if (!msg) return []
      try {
        const accounts = await listAccounts()
        const acc = accounts.find((a) => a.id === msg.accountId)
        if (acc?.provider === 'google') {
          return await gmailListAttachmentsMeta(msg.accountId, msg.remoteId)
        }
        return await listAttachmentsMeta(msg.accountId, msg.remoteId)
      } catch (e) {
        console.warn('[ipc] listAttachments fehlgeschlagen:', e)
        return []
      }
    }
  )
  
  ipcMain.handle(
    IPC.mail.openAttachment,
    async (
      _event,
      args: { messageId: number; attachmentId: string }
    ): Promise<{ ok: boolean; error?: string }> => {
      const msg = getMessageById(args.messageId)
      if (!msg) return { ok: false, error: 'Mail nicht gefunden.' }
      try {
        const accounts = await listAccounts()
        const acc = accounts.find((a) => a.id === msg.accountId)
        const file =
          acc?.provider === 'google'
            ? await gmailDownloadAttachmentBytes(msg.accountId, msg.remoteId, args.attachmentId)
            : await downloadAttachmentBytes(msg.accountId, msg.remoteId, args.attachmentId)
        const cacheDir = path.join(app.getPath('userData'), 'attachment-cache')
        await fs.mkdir(cacheDir, { recursive: true })
        const safeName = sanitizeFileName(file.name)
        const target = path.join(cacheDir, `${args.attachmentId}-${safeName}`)
        await fs.writeFile(target, file.bytes)
        const err = await shell.openPath(target)
        if (err) return { ok: false, error: err }
        return { ok: true }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        return { ok: false, error: message }
      }
    }
  )
  
  ipcMain.handle(
    IPC.mail.syncAttachmentsFlag,
    (_event, args: { messageId: number; value: boolean }): void => {
      const msg = getMessageById(args.messageId)
      if (!msg) return
      if (msg.hasAttachments === args.value) return
      setMessageHasAttachmentsLocal(args.messageId, args.value)
      broadcastMailChanged(msg.accountId)
    }
  )
  
  ipcMain.handle(
    IPC.mail.saveAttachmentAs,
    async (
      event,
      args: { messageId: number; attachmentId: string; suggestedName?: string }
    ): Promise<{ ok: boolean; path?: string; error?: string; cancelled?: boolean }> => {
      const msg = getMessageById(args.messageId)
      if (!msg) return { ok: false, error: 'Mail nicht gefunden.' }
  
      const win = BrowserWindow.fromWebContents(event.sender) ?? undefined
      const suggested = sanitizeFileName(args.suggestedName ?? 'attachment')
      const result = await dialog.showSaveDialog(win!, {
        defaultPath: suggested,
        title: 'Anhang speichern unter'
      })
      if (result.canceled || !result.filePath) {
        return { ok: false, cancelled: true }
      }
  
      try {
        const accounts = await listAccounts()
        const acc = accounts.find((a) => a.id === msg.accountId)
        const file =
          acc?.provider === 'google'
            ? await gmailDownloadAttachmentBytes(msg.accountId, msg.remoteId, args.attachmentId)
            : await downloadAttachmentBytes(msg.accountId, msg.remoteId, args.attachmentId)
        await fs.writeFile(result.filePath, file.bytes)
        return { ok: true, path: result.filePath }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        return { ok: false, error: message }
      }
    }
  )
  
  ipcMain.handle(IPC.mail.syncAccount, async (_event, accountId: string) => {
    return runInitialSync(accountId)
  })
  
  ipcMain.handle(IPC.mail.syncFolder, async (_event, folderId: number) => {
    return runFolderSync(folderId)
  })
  
  ipcMain.handle(
    IPC.mail.refreshNow,
    async (_event, args: { folderId: number | null }): Promise<void> => {
      await triggerManualPoll(args.folderId)
    }
  )
  
  ipcMain.handle(
    IPC.mail.setActiveFolder,
    (_event, args: { folderId: number | null }): void => {
      setActivePollFolder(args.folderId)
    }
  )
  
  ipcMain.handle(
    IPC.mail.search,
    (_event, args: { query: string; limit?: number }): SearchHit[] => {
      const limit = args.limit ?? 30
      return decorateMailListLike(searchMessages(args.query, limit))
    }
  )
  
  ipcMain.handle(
    IPC.mail.setRead,
    async (_event, args: { messageId: number; isRead: boolean }): Promise<void> => {
      await applySetReadForMessage(args.messageId, args.isRead)
    }
  )
  
  ipcMain.handle(
    IPC.mail.setFlagged,
    async (_event, args: { messageId: number; flagged: boolean }): Promise<void> => {
      await applySetFlaggedForMessage(args.messageId, args.flagged)
    }
  )
  
  ipcMain.handle(IPC.mail.archive, async (_event, messageId: number): Promise<void> => {
    return applyMoveMessageToWellKnownAlias(messageId, 'archive')
  })
  
  ipcMain.handle(IPC.mail.moveToTrash, async (_event, messageId: number): Promise<void> => {
    return applyMoveMessageToWellKnownAlias(messageId, 'deleteditems')
  })

  ipcMain.handle(
    IPC.mail.moveToFolder,
    async (
      _event,
      args: { messageId: number; targetFolderId: number }
    ): Promise<void> => {
      return applyMoveMessageToFolder(args.messageId, args.targetFolderId, { source: 'ui' })
    }
  )
  
  ipcMain.handle(IPC.mail.permanentDeleteMessage, async (_event, messageId: number): Promise<void> => {
    return applyPermanentDeleteMessage(messageId)
  })
  
  ipcMain.handle(
    IPC.mail.emptyTrashFolder,
    async (_event, folderId: number): Promise<{ deletedRemote: number }> => {
      return applyEmptyTrashFolder(folderId)
    }
  )
  
  ipcMain.handle(
    IPC.mail.snooze,
    async (
      _event,
      args: { messageId: number; wakeAt: string; preset?: string }
    ): Promise<void> => {
      return snoozeMessage({
        messageId: args.messageId,
        wakeAt: args.wakeAt,
        preset: args.preset
      })
    }
  )
  
  ipcMain.handle(IPC.mail.unsnooze, async (_event, messageId: number): Promise<void> => {
    return unsnoozeMessage(messageId)
  })
  
  ipcMain.handle(
    IPC.mail.listSnoozed,
    (_event, args?: { limit?: number }): SnoozedMessageItem[] =>
      decorateMailListLike(listSnoozedMessages(args?.limit ?? 200)) as SnoozedMessageItem[]
  )
  
  ipcMain.handle(
    IPC.mail.listTodoMessages,
    async (
      _event,
      args: { accountId: string | null; dueKind: TodoDueKindList; limit?: number }
    ): Promise<MailListItem[]> => {
      const cfg = await loadConfig()
      const tz = resolveCalendarTimeZone(cfg.calendarTimeZone)
      return decorateMailList(
        listTodoMessagesMerged(args.accountId, args.dueKind, tz, args.limit ?? 200)
      )
    }
  )
  
  ipcMain.handle(
    IPC.mail.listTodoMessagesInRange,
    (
      _event,
      args: {
        accountId: string | null
        rangeStartIso: string
        rangeEndIso: string
        limit?: number
      }
    ): MailListItem[] =>
      decorateMailList(
        listTodoMessagesInRange(
          args.accountId,
          args.rangeStartIso,
          args.rangeEndIso,
          args.limit ?? 500
        )
      )
  )
  
  ipcMain.handle(IPC.mail.listTodoCounts, async (): Promise<TodoCountsAll> => {
    const cfg = await loadConfig()
    const tz = resolveCalendarTimeZone(cfg.calendarTimeZone)
    return getTodoCountsAll(tz)
  })
  
  ipcMain.handle(IPC.mail.listTemplates, (): MailTemplate[] => listMailTemplates())
  
  ipcMain.handle(IPC.mail.listQuickSteps, (): MailQuickStep[] => listMailQuickSteps())
  
  ipcMain.handle(
    IPC.mail.runQuickStep,
    async (_event, args: { quickStepId: number; messageId: number }): Promise<void> => {
      await runQuickStep(args.quickStepId, args.messageId)
    }
  )
  
  ipcMain.handle(IPC.mail.unsubscribeOneClick, async (_event, messageId: number): Promise<void> => {
    const msg = getMessageById(messageId)
    if (!msg) throw new Error('Mail nicht gefunden.')
    await performOneClickUnsubscribe(msg.listUnsubscribe, msg.listUnsubscribePost)
  })
  
  ipcMain.handle(
    IPC.mail.setTodoForMessage,
    async (_event, args: { messageId: number; dueKind: TodoDueKindOpen }): Promise<void> => {
      setTodoForMessage(args.messageId, args.dueKind)
      await routeToWipAfterTodoIfConfigured(args.messageId)
    }
  )
  
  ipcMain.handle(
    IPC.mail.setTodoScheduleForMessage,
    async (
      _event,
      args: { messageId: number; startIso: string; endIso: string }
    ): Promise<void> => {
      setTodoScheduleForMessage(args.messageId, args.startIso, args.endIso)
      await routeToWipAfterTodoIfConfigured(args.messageId)
    }
  )
  
  ipcMain.handle(IPC.mail.completeTodoForMessage, async (_event, messageId: number): Promise<void> => {
    completeTodoForMessage(messageId)
    await routeToDoneFolderAfterCompleteIfConfigured(messageId)
  })
  
  ipcMain.handle(
    IPC.mail.listWaitingMessages,
    (_event, args?: { limit?: number }): MailListItem[] =>
      decorateMailList(listWaitingMessages(args?.limit ?? 200))
  )
  
  ipcMain.handle(
    IPC.mail.setWaitingForMessage,
    (_event, args: { messageId: number; days?: number }): void => {
      setWaitingForMessage(args.messageId, args.days ?? 7)
    }
  )
  
  ipcMain.handle(IPC.mail.clearWaitingForMessage, (_event, messageId: number): void => {
    clearWaitingForMessage(messageId)
  })
  
  ipcMain.handle(
    IPC.mail.setMessageCategories,
    async (_event, args: { messageId: number; categories?: string[] }): Promise<void> => {
      await applySetMessageCategories(args.messageId, args.categories ?? [])
    }
  )
  
  ipcMain.handle(
    IPC.mail.listMasterCategories,
    async (_event, accountId: string): Promise<MailMasterCategory[]> => {
      return graphListMasterCategories(accountId)
    }
  )
  
  ipcMain.handle(
    IPC.mail.createMasterCategory,
    async (
      _event,
      args: { accountId: string; displayName: string; color: string }
    ): Promise<MailMasterCategory> => {
      return graphCreateMasterCategory(args.accountId, args.displayName, args.color)
    }
  )
  
  ipcMain.handle(
    IPC.mail.updateMasterCategory,
    async (
      _event,
      args: { accountId: string; categoryId: string; displayName?: string; color?: string }
    ): Promise<void> => {
      await graphUpdateMasterCategory(args.accountId, args.categoryId, {
        displayName: args.displayName,
        color: args.color
      })
    }
  )
  
  ipcMain.handle(
    IPC.mail.deleteMasterCategory,
    async (_event, args: { accountId: string; categoryId: string }): Promise<void> => {
      await graphDeleteMasterCategory(args.accountId, args.categoryId)
    }
  )
  
  ipcMain.handle(IPC.mail.listDistinctMessageTags, (_event, accountId: string): string[] => {
    return listDistinctTagsForAccount(accountId)
  })
  
  ipcMain.handle(
    IPC.mail.getWorkflowMailFolderState,
    (_event, accountId: string): WorkflowMailFolderUiState => {
      return getWorkflowMailFolderUiState(accountId)
    }
  )
  
  ipcMain.handle(
    IPC.mail.ensureWorkflowMailFolders,
    async (_event, accountId: string): Promise<EnsureWorkflowMailFoldersResult> => {
      const accounts = await listAccounts()
      const acc = accounts.find((a) => a.id === accountId)
      if (!acc) throw new Error('Konto nicht gefunden.')
      let result: EnsureWorkflowMailFoldersResult
      if (acc.provider === 'microsoft') {
        result = await ensureMicrosoftWorkflowMailFolders(accountId)
      } else if (acc.provider === 'google') {
        result = await ensureGoogleWorkflowMailFolders(accountId)
      } else {
        throw new Error('Triage-Ordner werden nur fuer Microsoft-365- und Gmail-Konten angelegt.')
      }
      void runFolderSync(result.wipFolderId).catch((e) =>
        console.warn('[ipc] Sync WIP-Ordner nach Anlage:', e)
      )
      void runFolderSync(result.doneFolderId).catch((e) =>
        console.warn('[ipc] Sync Erledigt-Ordner nach Anlage:', e)
      )
      broadcastMailChanged(accountId)
      return result
    }
  )
  
  ipcMain.handle(
    IPC.mail.setWorkflowMailFolderMapping,
    (
      _event,
      args: { accountId: string; wipFolderId: number | null; doneFolderId: number | null }
    ): void => {
      setWorkflowMailFolderMapping(args.accountId, args.wipFolderId, args.doneFolderId)
      broadcastMailChanged(args.accountId)
    }
  )
  
  ipcMain.handle(IPC.mail.peekUndo, (): UndoableActionSummary | null => {
    const last = peekLastUndoable()
    if (!last) return null
    return {
      id: last.id,
      actionType: last.actionType,
      label: last.payload.label ?? defaultUndoLabel(last.actionType),
      performedAt: last.performedAt
    }
  })
  
  ipcMain.handle(IPC.mail.undoLast, async (): Promise<UndoResult> => {
    const last = peekLastUndoable()
    if (!last) return { ok: false, error: 'Keine Aktion zum Zuruecknehmen.' }
  
    try {
      const performedLabel = await applyUndo(last)
      markUndone(last.id)
      return { ok: true, label: performedLabel }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      console.warn('[ipc] undoLast fehlgeschlagen:', e)
      return { ok: false, error: message }
    }
  })
  
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
        // Move to root: Graph erlaubt das ueber den Spezialwert 'msgfolderroot'.
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
  
  ipcMain.handle(
    IPC.compose.send,
    async (_event, input: ComposeSendInput): Promise<void> => {
      if (!input.accountId) throw new Error('Kein Konto ausgewaehlt.')
      if (input.to.length === 0) throw new Error('Mindestens ein Empfaenger erforderlich.')
      const accounts = await listAccounts()
      const acc = accounts.find((a) => a.id === input.accountId)
      if (!acc) throw new Error('Konto nicht gefunden.')

      if (input.referenceAttachments?.length && acc.provider === 'google') {
        throw new Error('Cloud-Anhaenge (OneDrive) sind nur fuer Microsoft 365 verfuegbar.')
      }

      const scheduleRaw = input.scheduledSendAt?.trim()
      if (scheduleRaw) {
        const when = Date.parse(scheduleRaw)
        if (!Number.isNaN(when) && when > Date.now() + 15_000) {
          const attBytes = (input.attachments ?? []).reduce((s, a) => s + (a.size ?? 0), 0)
          if (attBytes > 10 * 1024 * 1024) {
            throw new Error('Geplanter Versand: Dateianhaenge insgesamt max. ca. 10 MB.')
          }
          const { scheduledSendAt: _drop, ...queued } = input
          insertScheduledCompose(queued, new Date(when).toISOString())
          return
        }
      }

      if (acc.provider === 'google') {
        await gmailSendMail(
          {
            accountId: input.accountId,
            subject: input.subject,
            bodyHtml: input.bodyHtml,
            to: input.to,
            cc: input.cc,
            bcc: input.bcc,
            attachments: input.attachments,
            replyToRemoteId: input.replyToRemoteId,
            replyMode: input.replyMode
          },
          acc.email,
          acc.displayName
        )
      } else {
        await graphSendMail({
          accountId: input.accountId,
          subject: input.subject,
          bodyHtml: input.bodyHtml,
          to: input.to,
          cc: input.cc,
          bcc: input.bcc,
          attachments: input.attachments,
          replyToRemoteId: input.replyToRemoteId,
          replyMode: input.replyMode,
          importance: input.importance,
          isDeliveryReceiptRequested: input.isDeliveryReceiptRequested,
          isReadReceiptRequested: input.isReadReceiptRequested,
          referenceAttachments: input.referenceAttachments
        })
      }

      if (
        input.trackWaitingOnMessageId != null &&
        input.expectReplyInDays != null &&
        input.expectReplyInDays > 0
      ) {
        try {
          setWaitingForMessage(input.trackWaitingOnMessageId, input.expectReplyInDays)
        } catch (e) {
          console.warn('[ipc] compose.send: Waiting-for nach Senden:', e)
        }
      }

      // Gesendete Mails landen jetzt in "Gesendete Elemente" -> Sync triggern,
      // damit sie in der Outbox-/Gesendet-Liste auftauchen.
      const sentFolder = findFolderByWellKnown(input.accountId, 'sentitems')
      if (sentFolder) {
        void runFolderSync(sentFolder.id).catch(() => undefined)
      }
    }
  )

  ipcMain.handle(
    IPC.compose.saveDraft,
    async (_event, input: ComposeSaveDraftInput): Promise<ComposeSaveDraftResult> => {
      if (!input.accountId) throw new Error('Kein Konto ausgewaehlt.')
      const accounts = await listAccounts()
      const acc = accounts.find((a) => a.id === input.accountId)
      if (!acc) throw new Error('Konto nicht gefunden.')

      if (input.referenceAttachments?.length && acc.provider === 'google') {
        throw new Error('Cloud-Anhaenge (OneDrive) sind nur fuer Microsoft 365 verfuegbar.')
      }

      const toRecipients = input.to.map((r) => ({
        address: r.address.trim(),
        ...(r.name?.trim() ? { name: r.name.trim() } : {})
      }))
      const ccRecipients = (input.cc ?? []).map((r) => ({
        address: r.address.trim(),
        ...(r.name?.trim() ? { name: r.name.trim() } : {})
      }))
      const bccRecipients = (input.bcc ?? []).map((r) => ({
        address: r.address.trim(),
        ...(r.name?.trim() ? { name: r.name.trim() } : {})
      }))
      const attachments = input.attachments?.map((a) => ({
        name: a.name,
        contentType: a.contentType,
        dataBase64: a.dataBase64,
        ...(a.isInline ? { isInline: true as const } : {}),
        ...(a.contentId ? { contentId: a.contentId } : {})
      }))

      let result: ComposeSaveDraftResult
      if (acc.provider === 'google') {
        const r = await gmailSaveDraft(
          {
            accountId: input.accountId,
            subject: input.subject,
            bodyHtml: input.bodyHtml,
            to: toRecipients,
            cc: ccRecipients.length ? ccRecipients : undefined,
            bcc: bccRecipients.length ? bccRecipients : undefined,
            attachments,
            replyToRemoteId: input.replyToRemoteId,
            replyMode: input.replyMode,
            remoteDraftId: input.remoteDraftId
          },
          acc.email,
          acc.displayName ?? ''
        )
        result = { remoteDraftId: r.remoteDraftId }
      } else {
        result = await graphSaveMailDraft({
          accountId: input.accountId,
          subject: input.subject,
          bodyHtml: input.bodyHtml,
          to: toRecipients,
          cc: ccRecipients.length ? ccRecipients : undefined,
          bcc: bccRecipients.length ? bccRecipients : undefined,
          attachments,
          replyToRemoteId: input.replyToRemoteId,
          replyMode: input.replyMode,
          referenceAttachments: input.referenceAttachments,
          importance: input.importance,
          isDeliveryReceiptRequested: input.isDeliveryReceiptRequested,
          isReadReceiptRequested: input.isReadReceiptRequested,
          remoteDraftId: input.remoteDraftId
        })
      }

      const draftsFolder = findFolderByWellKnown(input.accountId, 'drafts')
      if (draftsFolder) {
        void runFolderSync(draftsFolder.id).catch(() => undefined)
      }
      return result
    }
  )

  ipcMain.handle(
    IPC.compose.recipientSuggestions,
    async (
      _event,
      args: { accountId: string; query: string }
    ): Promise<ComposeRecipientSuggestion[]> => {
      const accounts = await listAccounts()
      const acc = accounts.find((a) => a.id === args.accountId)
      if (!acc) return []
      const q = args.query.trim()
      const limit = 16
      const seen = new Set<string>()
      const out: ComposeRecipientSuggestion[] = []

      const push = (s: ComposeRecipientSuggestion): void => {
        const k = s.email.trim().toLowerCase()
        if (!k || seen.has(k)) return
        seen.add(k)
        out.push(s)
      }

      if (q.length === 0) {
        for (const r of listBootstrapPeopleContactsForCompose({
          accountId: args.accountId,
          limit: 10
        })) {
          push({
            email: r.email,
            displayName: r.displayName,
            source: 'people-local'
          })
          if (out.length >= limit) return out
        }
        for (const r of listRecentParticipantEmailsForCompose({
          accountId: args.accountId,
          limit: 10
        })) {
          push({
            email: r.email,
            displayName: r.displayName,
            source: 'mail-history'
          })
          if (out.length >= limit) return out
        }
        return out
      }

      for (const r of searchPeopleContactsForCompose({
        accountId: args.accountId,
        needle: q,
        limit
      })) {
        push({
          email: r.email,
          displayName: r.displayName,
          source: 'people-local'
        })
        if (out.length >= limit) return out
      }

      for (const r of searchMessageParticipantEmails({
        accountId: args.accountId,
        needle: q,
        limit
      })) {
        push({
          email: r.email,
          displayName: r.displayName,
          source: 'mail-history'
        })
        if (out.length >= limit) return out
      }

      if (acc.provider === 'microsoft') {
        try {
          for (const r of await graphSearchPeopleForCompose(args.accountId, q, 8)) {
            push(r)
            if (out.length >= limit) return out
          }
          if (q.length >= 2) {
            for (const r of await graphSearchDirectoryUsersForCompose(args.accountId, q, 6)) {
              push(r)
              if (out.length >= limit) return out
            }
            for (const r of await graphSearchMailEnabledGroupsForCompose(args.accountId, q, 5)) {
              push(r)
              if (out.length >= limit) return out
            }
          }
        } catch (e) {
          console.warn('[ipc] compose.recipientSuggestions graph:', e)
        }
      }

      return out
    }
  )

  ipcMain.handle(
    IPC.compose.listDriveExplorer,
    async (_event, raw: unknown): Promise<ComposeDriveExplorerEntry[]> => {
      try {
        const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
        const accountId = typeof o.accountId === 'string' ? o.accountId.trim() : ''
        if (!accountId) {
          throw new Error('Kein Konto fuer OneDrive ausgewaehlt.')
        }
        const scopeRaw = o.scope
        const scope =
          scopeRaw === 'recent' || scopeRaw === 'myfiles' || scopeRaw === 'shared' ? scopeRaw : 'myfiles'
        const folderId =
          typeof o.folderId === 'string'
            ? o.folderId.trim() || null
            : o.folderId === null
              ? null
              : undefined
        const folderDriveId =
          typeof o.folderDriveId === 'string'
            ? o.folderDriveId.trim() || null
            : o.folderDriveId === null
              ? null
              : undefined
        const accounts = await listAccounts()
        const acc = accounts.find((a) => a.id === accountId)
        if (!acc) {
          throw new Error('Konto nicht gefunden oder nicht mehr angemeldet.')
        }
        if (acc.provider !== 'microsoft') {
          throw new Error('OneDrive steht nur fuer Microsoft-365-Konten zur Verfuegung.')
        }
        return await graphListDriveExplorer(accountId, scope, folderId ?? null, folderDriveId ?? null)
      } catch (e) {
        console.warn('[ipc] compose.listDriveExplorer:', e)
        throw e instanceof Error ? e : new Error(String(e))
      }
    }
  )
  void findFolderByRemoteId
  void updateMessageFolderLocal
}
