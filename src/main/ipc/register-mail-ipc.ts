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
  type ComposeDriveExplorerScope,
  type ComposeDriveExplorerNavCrumb,
  type ComposeDriveExplorerFavorite,
  type TodoDueKindOpen,
  type TodoDueKindList,
  type TodoCountsAll,
  type MailTemplate,
  type MailQuickStep,
  type MailMasterCategory,
  type SearchHit,
  type WorkflowMailFolderUiState,
  type EnsureWorkflowMailFoldersResult,
  type MailBulkUnflagInput,
  type MailBulkUnflagResult,
  type RemoveMailTodoRecordsResult
} from '@shared/types'
import { writeAttachmentCacheFile } from '../attachment-cache'
import { loadConfig } from '../config'
import { listAccounts } from '../accounts'
import { gmailSendMail, gmailSaveDraft } from '../google/gmail-compose'
import {
  gmailListAttachmentsMeta,
  gmailDownloadAttachmentBytes,
  gmailFetchInlineImages
} from '../google/gmail-attachments'
import { runInitialSync, runFolderSync } from '../sync-runner'
import { clearMailAccountLocalCacheAndResync } from '../mail-cache-reset'
import { runBulkUnflagFlaggedMessages } from '../mail-bulk-unflag-service'
import { triggerManualPoll, setActivePollFolder } from '../mail-poll-runner'
import { assertAppOnline } from '../network-status'
import { findFolderById, findFolderByWellKnown } from '../db/folders-repo'
import { peekLastUndoable, markUndone } from '../db/message-actions-repo'
import {
  listMessagesByAccount,
  getMessageById,
  setMessageHasAttachmentsLocal,
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
  removeMailTodoRecordsForMessage,
  listTodoMessagesMerged,
  listAllOpenTodoMessages,
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
  graphCreateMasterCategory,
  graphUpdateMasterCategory,
  graphDeleteMasterCategory
} from '../graph/master-categories'
import {
  invalidateMasterCategoriesSyncState,
  listMasterCategoriesCached,
  syncMasterCategoriesForAccount
} from '../master-categories-cache-service'
import { sendMail as graphSendMail, saveMailDraft as graphSaveMailDraft } from '../graph/compose'
import {
  graphListDriveExplorer,
  graphSearchPeopleForCompose,
  graphSearchDirectoryUsersForCompose,
  graphSearchMailEnabledGroupsForCompose
} from '../graph/compose-recipient-graph'
import {
  addDriveExplorerFavorite,
  listDriveExplorerFavorites,
  removeDriveExplorerFavorite,
  updateDriveExplorerFavoriteCache,
  renameDriveExplorerFavorite,
  reorderDriveExplorerFavorites
} from '../drive-explorer-favorites-store'
import {
  fetchInlineImages as graphFetchInlineImages,
  listAttachmentsMeta,
  downloadAttachmentBytes
} from '../graph/attachments'
import { isGraphItemNotFound } from '../graph/graph-request-errors'
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
import { registerMailComposeIpc } from './register-mail-compose-ipc'
import { registerMailFoldersIpc } from './register-mail-folders-ipc'
import { registerMailListIpc } from './register-mail-list-ipc'
import { registerMailMetaIpc } from './register-mail-meta-ipc'

export function registerMailIpc(): void {
  registerMailComposeIpc()
  registerMailFoldersIpc()
  registerMailListIpc()
  registerMailMetaIpc()

  ipcMain.handle(IPC.mail.getMessage, async (_event, id: number): Promise<MailFull | null> => {
    const { ensureMessageBodyLoaded } = await import('../message-body-fetch')
    const msg = await ensureMessageBodyLoaded(id)
    return decorateMailFull(msg)
  })
  
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
        if (!isGraphItemNotFound(e)) {
          console.warn('[ipc] fetchInlineImages fehlgeschlagen:', e)
        }
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
        if (!isGraphItemNotFound(e)) {
          console.warn('[ipc] listAttachments fehlgeschlagen:', e)
        }
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
        const safeName = sanitizeFileName(file.name)
        const target = await writeAttachmentCacheFile(
          args.attachmentId,
          safeName,
          file.bytes
        )
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
    assertAppOnline()
    return runInitialSync(accountId)
  })

  ipcMain.handle(IPC.mail.clearLocalMailCache, async (_event, accountId: string) => {
    return clearMailAccountLocalCacheAndResync(accountId)
  })
  
  ipcMain.handle(IPC.mail.syncFolder, async (_event, folderId: number) => {
    assertAppOnline()
    return runFolderSync(folderId)
  })
  
  ipcMain.handle(
    IPC.mail.refreshNow,
    async (_event, args: { folderId: number | null }): Promise<void> => {
      assertAppOnline()
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

  ipcMain.removeHandler(IPC.mail.bulkUnflagFlaggedMessages)
  ipcMain.handle(
    IPC.mail.bulkUnflagFlaggedMessages,
    async (_event, input: MailBulkUnflagInput): Promise<MailBulkUnflagResult> => {
      if (!input?.dryRun) assertAppOnline()
      return runBulkUnflagFlaggedMessages(input)
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
    IPC.mail.listAllOpenTodoMessages,
    (_event, args?: { accountId?: string | null; limit?: number }): MailListItem[] =>
      decorateMailList(
        listAllOpenTodoMessages(args?.accountId ?? null, args?.limit ?? 2000)
      )
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
    IPC.mail.removeMailTodoRecordsForMessage,
    async (_event, messageId: number): Promise<RemoveMailTodoRecordsResult> =>
      removeMailTodoRecordsForMessage(messageId)
  )
  
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
      return listMasterCategoriesCached(accountId)
    }
  )
  
  ipcMain.handle(
    IPC.mail.createMasterCategory,
    async (
      _event,
      args: { accountId: string; displayName: string; color: string }
    ): Promise<MailMasterCategory> => {
      const created = await graphCreateMasterCategory(args.accountId, args.displayName, args.color)
      invalidateMasterCategoriesSyncState(args.accountId)
      void syncMasterCategoriesForAccount(args.accountId).catch((e) =>
        console.warn('[master-categories] Nach Anlegen Sync fehlgeschlagen:', e)
      )
      return created
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
      invalidateMasterCategoriesSyncState(args.accountId)
      void syncMasterCategoriesForAccount(args.accountId).catch((e) =>
        console.warn('[master-categories] Nach Aktualisieren Sync fehlgeschlagen:', e)
      )
    }
  )
  
  ipcMain.handle(
    IPC.mail.deleteMasterCategory,
    async (_event, args: { accountId: string; categoryId: string }): Promise<void> => {
      await graphDeleteMasterCategory(args.accountId, args.categoryId)
      invalidateMasterCategoriesSyncState(args.accountId)
      void syncMasterCategoriesForAccount(args.accountId).catch((e) =>
        console.warn('[master-categories] Nach Loeschen Sync fehlgeschlagen:', e)
      )
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
}
