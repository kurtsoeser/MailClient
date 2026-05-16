import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  IPC,
  type AppConfig,
  type AppConnectivityState,
  type GlobalSearchResult,
  type AttachmentMeta,
  type ConnectedAccount,
  type MailFolder,
  type MailListItem,
  type MailFull,
  type SearchHit,
  type SnoozedMessageItem,
  type SyncStatus,
  type ComposeSendInput,
  type ComposeSaveDraftInput,
  type ComposeSaveDraftResult,
  type UndoableActionSummary,
  type ComposeRecipientSuggestion,
  type ComposeListDriveExplorerInput,
  type ComposeDriveExplorerEntry,
  type ComposeDriveExplorerFavorite,
  type ComposeAddDriveExplorerFavoriteInput,
  type ComposeRemoveDriveExplorerFavoriteInput,
  type ComposeUpdateDriveExplorerFavoriteCacheInput,
  type ComposeRenameDriveExplorerFavoriteInput,
  type ComposeReorderDriveExplorerFavoritesInput,
  type UndoResult,
  type RemoveMailTodoRecordsResult,
  type TodoDueKindOpen,
  type TodoDueKindList,
  type TodoCountsAll,
  type MailTemplate,
  type MailQuickStep,
  type CalendarEventView,
  type CalendarSuggestionFromMail,
  type CalendarSaveEventInput,
  type CalendarSaveEventResult,
  type CalendarUpdateEventInput,
  type CalendarGetEventInput,
  type CalendarGetEventResult,
  type CalendarDeleteEventInput,
  type CalendarGraphCalendarRow,
  type CalendarListCalendarsInput,
  type CalendarM365GroupCalendarsPage,
  type CalendarListEventsInput,
  type CalendarPatchEventIconInput,
  type CalendarPatchScheduleInput,
  type CalendarPatchCalendarColorInput,
  type PatchAccountInput,
  type TaskItemRow,
  type TaskListRow,
  type TasksCreateTaskInput,
  type TasksDeleteTaskInput,
  type TasksBulkDeleteCompletedFlaggedEmailInput,
  type TasksBulkDeleteCompletedFlaggedEmailResult,
  type TasksListListsInput,
  type TasksListTasksInput,
  type TasksPatchTaskDisplayInput,
  type TasksPatchTaskInput,
  type TasksClearPlannedScheduleInput,
  type TasksListPlannedSchedulesInput,
  type TasksSetPlannedScheduleInput,
  type TaskPlannedScheduleDto,
  type TasksUpdateTaskInput,
  type TasksCreateMailCloudTaskFromMessageInput,
  type MailCloudTaskLinkDto,
  type WorkflowBoard,
  type WorkflowColumn,
  type MailMasterCategory,
  type WorkflowMailFolderUiState,
  type EnsureWorkflowMailFoldersResult,
  type MetaFolderSummary,
  type MetaFolderCreateInput,
  type MetaFolderUpdateInput,
  type TeamsChatSummary,
  type TeamsChatMessageView,
  type TeamsChatPopoutOpenInput,
  type TeamsChatPopoutRef,
  type TeamsChatPopoutListItem,
  type SettingsBackupExportResult,
  type SettingsBackupPickResult,
  type SettingsBackupPayload,
  type AppConfigWeatherLocation,
  type OpenMeteoForecast,
  type OpenMeteoGeocodeHit,
  type LocationSuggestion,
  type NoteSection,
  type NoteSectionCreateInput,
  type NoteSectionReorderInput,
  type NoteSectionUpdateInput,
  type UserNote,
  type UserNoteCalendarKey,
  type UserNoteCalendarUpsertInput,
  type UserNoteKind,
  type NoteLinksBundle,
  type NoteEntityLinkTarget,
  type NoteLinkTargetCandidate,
  type UserNoteLinkAddInput,
  type UserNoteLinkRemoveInput,
  type UserNoteListFilters,
  type UserNoteSearchFilters,
  type UserNoteListInRangeFilters,
  type UserNoteListItem,
  type UserNoteMailUpsertInput,
  type UserNoteMoveToSectionInput,
  type UserNoteScheduleInput,
  type UserNoteStandaloneCreateInput,
  type UserNotePatchDisplayInput,
  type UserNoteStandaloneUpdateInput,
  type UserNoteAttachment,
  type UserNoteAttachmentAddLocalInput,
  type UserNoteAttachmentAddCloudInput,
  type PeopleContactView,
  type PeopleCreateContactInput,
  type PeopleListInput,
  type PeopleNavCounts,
  type PeopleSetContactPhotoInput,
  type PeopleSetFavoriteInput,
  type PeopleSyncAccountResult,
  type PeopleUpdateContactInput,
  type ClearLocalMailCacheResult,
  type MailBulkUnflagInput,
  type MailBulkUnflagResult,
  type MailBulkUnflagProgressPayload,
  type ClearLocalTasksCacheResult,
  type NotionAppendEventInput,
  type NotionAppendMailInput,
  type NotionAppendResult,
  type NotionConnectionStatus,
  type NotionCreateEventPageInput,
  type NotionCreateMailPageInput,
  type NotionCreatePageInput,
  type NotionCreatePageResult,
  type NotionDestinationsConfig,
  type NotionSearchPageHit,
  type NotionSavedDestination
} from '@shared/types'
import type {
  MailRuleDefinition,
  MailRuleTrigger,
  MailRuleDto,
  MailRuleDryRunResult,
  AutomationInboxEntry
} from '@shared/mail-rules'

const api = {
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke(IPC.app.getVersion),
    getPlatform: (): Promise<NodeJS.Platform> => ipcRenderer.invoke(IPC.app.getPlatform),
    getConnectivity: (): Promise<AppConnectivityState> => ipcRenderer.invoke(IPC.app.getConnectivity),
    setLaunchOnLogin: (enabled: boolean): Promise<void> =>
      ipcRenderer.invoke(IPC.app.setLaunchOnLogin, enabled),
    showTestNotification: (): Promise<void> =>
      ipcRenderer.invoke(IPC.app.showTestNotification),
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke(IPC.app.openExternal, url),
    globalSearch: (args: {
      query: string
      limitPerKind?: number
    }): Promise<GlobalSearchResult> => ipcRenderer.invoke(IPC.app.globalSearch, args)
  },
  config: {
    get: (): Promise<AppConfig> => ipcRenderer.invoke(IPC.config.get),
    setMicrosoftClientId: (clientId: string): Promise<AppConfig> =>
      ipcRenderer.invoke(IPC.config.setMicrosoftClientId, clientId),
    setGoogleClientId: (clientId: string, clientSecret?: string | null): Promise<AppConfig> =>
      ipcRenderer.invoke(IPC.config.setGoogleClientId, clientId, clientSecret),
    setSyncWindowDays: (days: number | null): Promise<AppConfig> =>
      ipcRenderer.invoke(IPC.config.setSyncWindowDays, days),
    setAutoLoadImages: (value: boolean): Promise<AppConfig> =>
      ipcRenderer.invoke(IPC.config.setAutoLoadImages, value),
    setCalendarTimeZone: (iana: string | null): Promise<AppConfig> =>
      ipcRenderer.invoke(IPC.config.setCalendarTimeZone, iana),
    setWeatherLocation: (loc: AppConfigWeatherLocation | null): Promise<AppConfig> =>
      ipcRenderer.invoke(IPC.config.setWeatherLocation, loc),
    setWorkflowMailFoldersIntroDismissed: (value: boolean): Promise<AppConfig> =>
      ipcRenderer.invoke(IPC.config.setWorkflowMailFoldersIntroDismissed, value),
    setFirstRunSetupCompleted: (value: boolean): Promise<AppConfig> =>
      ipcRenderer.invoke(IPC.config.setFirstRunSetupCompleted, value),
    setNotionCredentials: (clientId: string, clientSecret?: string | null): Promise<AppConfig> =>
      ipcRenderer.invoke(IPC.config.setNotionCredentials, clientId, clientSecret)
  },
  settingsBackup: {
    exportToFile: (localStorage: Record<string, string>): Promise<SettingsBackupExportResult> =>
      ipcRenderer.invoke(IPC.settingsBackup.exportToFile, localStorage),
    pickAndRead: (): Promise<SettingsBackupPickResult> =>
      ipcRenderer.invoke(IPC.settingsBackup.pickAndRead),
    applyFull: (backup: SettingsBackupPayload): Promise<void> =>
      ipcRenderer.invoke(IPC.settingsBackup.applyFull, backup)
  },
  weather: {
    geocode: (query: string, language: 'de' | 'en'): Promise<OpenMeteoGeocodeHit | null> =>
      ipcRenderer.invoke(IPC.weather.geocode, { query, language }),
    forecast: (
      latitude: number,
      longitude: number,
      timeZone: string | null
    ): Promise<OpenMeteoForecast | null> =>
      ipcRenderer.invoke(IPC.weather.forecast, { latitude, longitude, timeZone })
  },
  location: {
    search: (query: string, language: 'de' | 'en'): Promise<LocationSuggestion[]> =>
      ipcRenderer.invoke(IPC.location.search, { query, language }),
    reverse: (
      latitude: number,
      longitude: number,
      language: 'de' | 'en'
    ): Promise<LocationSuggestion | null> =>
      ipcRenderer.invoke(IPC.location.reverse, { latitude, longitude, language })
  },
  notion: {
    getStatus: (): Promise<NotionConnectionStatus> => ipcRenderer.invoke(IPC.notion.getStatus),
    connect: (): Promise<NotionConnectionStatus> => ipcRenderer.invoke(IPC.notion.connect),
    connectInternal: (token: string): Promise<NotionConnectionStatus> =>
      ipcRenderer.invoke(IPC.notion.connectInternal, token),
    disconnect: (): Promise<NotionConnectionStatus> => ipcRenderer.invoke(IPC.notion.disconnect),
    searchPages: (query: string): Promise<NotionSearchPageHit[]> =>
      ipcRenderer.invoke(IPC.notion.searchPages, query),
    getDestinations: (): Promise<NotionDestinationsConfig> =>
      ipcRenderer.invoke(IPC.notion.getDestinations),
    setDestinations: (config: NotionDestinationsConfig): Promise<void> =>
      ipcRenderer.invoke(IPC.notion.setDestinations, config),
    appendMail: (input: NotionAppendMailInput): Promise<NotionAppendResult> =>
      ipcRenderer.invoke(IPC.notion.appendMail, input),
    appendEvent: (input: NotionAppendEventInput): Promise<NotionAppendResult> =>
      ipcRenderer.invoke(IPC.notion.appendEvent, input),
    addFavorite: (hit: NotionSearchPageHit): Promise<NotionSavedDestination[]> =>
      ipcRenderer.invoke(IPC.notion.addFavorite, hit),
    removeFavorite: (pageId: string): Promise<NotionSavedDestination[]> =>
      ipcRenderer.invoke(IPC.notion.removeFavorite, pageId),
    createPage: (input: NotionCreatePageInput): Promise<NotionCreatePageResult> =>
      ipcRenderer.invoke(IPC.notion.createPage, input),
    createMailPage: (input: NotionCreateMailPageInput): Promise<NotionAppendResult> =>
      ipcRenderer.invoke(IPC.notion.createMailPage, input),
    createEventPage: (input: NotionCreateEventPageInput): Promise<NotionAppendResult> =>
      ipcRenderer.invoke(IPC.notion.createEventPage, input)
  },
  auth: {
    listAccounts: (): Promise<ConnectedAccount[]> => ipcRenderer.invoke(IPC.auth.listAccounts),
    addMicrosoft: (): Promise<ConnectedAccount> => ipcRenderer.invoke(IPC.auth.addMicrosoft),
    addGoogle: (): Promise<ConnectedAccount> => ipcRenderer.invoke(IPC.auth.addGoogle),
    refreshMicrosoft: (accountId: string): Promise<ConnectedAccount> =>
      ipcRenderer.invoke(IPC.auth.refreshMicrosoft, accountId),
    refreshGoogle: (accountId: string): Promise<ConnectedAccount> =>
      ipcRenderer.invoke(IPC.auth.refreshGoogle, accountId),
    remove: (id: string): Promise<ConnectedAccount[]> =>
      ipcRenderer.invoke(IPC.auth.remove, id),
    reorderAccounts: (accountIds: string[]): Promise<ConnectedAccount[]> =>
      ipcRenderer.invoke(IPC.auth.reorderAccounts, accountIds),
    getProfilePhotoDataUrl: (accountId: string): Promise<string | null> =>
      ipcRenderer.invoke(IPC.auth.getProfilePhotoDataUrl, accountId),
    patchAccount: (args: PatchAccountInput): Promise<ConnectedAccount> =>
      ipcRenderer.invoke(IPC.auth.patchAccount, args)
  },
  graph: {
    getMe: (id: string): Promise<unknown> => ipcRenderer.invoke(IPC.graph.getMe, id),
    listTeamsChats: (accountId: string): Promise<TeamsChatSummary[]> =>
      ipcRenderer.invoke(IPC.graph.listTeamsChats, accountId),
    listTeamsChatMessages: (args: {
      accountId: string
      chatId: string
      limit?: number
    }): Promise<TeamsChatMessageView[]> =>
      ipcRenderer.invoke(IPC.graph.listTeamsChatMessages, args),
    sendTeamsChatMessage: (args: {
      accountId: string
      chatId: string
      text: string
    }): Promise<void> => ipcRenderer.invoke(IPC.graph.sendTeamsChatMessage, args)
  },
  teamsChatPopout: {
    open: (input: TeamsChatPopoutOpenInput): Promise<void> =>
      ipcRenderer.invoke(IPC.teamsChatPopout.open, input),
    close: (ref: TeamsChatPopoutRef): Promise<void> =>
      ipcRenderer.invoke(IPC.teamsChatPopout.close, ref),
    closeAll: (): Promise<void> => ipcRenderer.invoke(IPC.teamsChatPopout.closeAll),
    focus: (ref: TeamsChatPopoutRef): Promise<boolean> =>
      ipcRenderer.invoke(IPC.teamsChatPopout.focus, ref),
    isOpen: (ref: TeamsChatPopoutRef): Promise<boolean> =>
      ipcRenderer.invoke(IPC.teamsChatPopout.isOpen, ref),
    listOpen: (): Promise<TeamsChatPopoutListItem[]> =>
      ipcRenderer.invoke(IPC.teamsChatPopout.listOpen),
    getAlwaysOnTop: (ref: TeamsChatPopoutRef): Promise<boolean> =>
      ipcRenderer.invoke(IPC.teamsChatPopout.getAlwaysOnTop, ref),
    setAlwaysOnTop: (ref: TeamsChatPopoutRef & { alwaysOnTop: boolean }): Promise<void> =>
      ipcRenderer.invoke(IPC.teamsChatPopout.setAlwaysOnTop, ref)
  },
  notes: {
    getMail: (messageId: number): Promise<UserNote | null> =>
      ipcRenderer.invoke(IPC.notes.getMail, messageId),
    upsertMail: (input: UserNoteMailUpsertInput): Promise<UserNote> =>
      ipcRenderer.invoke(IPC.notes.upsertMail, input),
    getCalendar: (key: UserNoteCalendarKey): Promise<UserNote | null> =>
      ipcRenderer.invoke(IPC.notes.getCalendar, key),
    upsertCalendar: (input: UserNoteCalendarUpsertInput): Promise<UserNote> =>
      ipcRenderer.invoke(IPC.notes.upsertCalendar, input),
    createStandalone: (input: UserNoteStandaloneCreateInput): Promise<UserNote> =>
      ipcRenderer.invoke(IPC.notes.createStandalone, input),
    updateStandalone: (input: UserNoteStandaloneUpdateInput): Promise<UserNote> =>
      ipcRenderer.invoke(IPC.notes.updateStandalone, input),
    delete: (id: number): Promise<void> => ipcRenderer.invoke(IPC.notes.delete, id),
    list: (filters?: UserNoteListFilters): Promise<UserNoteListItem[]> =>
      ipcRenderer.invoke(IPC.notes.list, filters ?? {}),
    search: (filters: UserNoteSearchFilters): Promise<UserNoteListItem[]> =>
      ipcRenderer.invoke(IPC.notes.search, filters),
    getById: (id: number): Promise<UserNote | null> => ipcRenderer.invoke(IPC.notes.getById, id),
    patchDisplay: (input: UserNotePatchDisplayInput): Promise<UserNote> =>
      ipcRenderer.invoke(IPC.notes.patchDisplay, input),
    listInRange: (filters: UserNoteListInRangeFilters): Promise<UserNoteListItem[]> =>
      ipcRenderer.invoke(IPC.notes.listInRange, filters),
    setSchedule: (input: UserNoteScheduleInput): Promise<UserNote> =>
      ipcRenderer.invoke(IPC.notes.setSchedule, input),
    clearSchedule: (id: number): Promise<UserNote> => ipcRenderer.invoke(IPC.notes.clearSchedule, id),
    moveToSection: (input: UserNoteMoveToSectionInput): Promise<UserNote> =>
      ipcRenderer.invoke(IPC.notes.moveToSection, input),
    sections: {
      list: (): Promise<NoteSection[]> => ipcRenderer.invoke(IPC.notes.sectionsList),
      create: (input: NoteSectionCreateInput): Promise<NoteSection> =>
        ipcRenderer.invoke(IPC.notes.sectionsCreate, input),
      update: (input: NoteSectionUpdateInput): Promise<NoteSection> =>
        ipcRenderer.invoke(IPC.notes.sectionsUpdate, input),
      delete: (id: number): Promise<void> => ipcRenderer.invoke(IPC.notes.sectionsDelete, id),
      reorder: (input: NoteSectionReorderInput): Promise<void> =>
        ipcRenderer.invoke(IPC.notes.sectionsReorder, input)
    },
    links: {
      list: (fromNoteId: number): Promise<NoteLinksBundle> =>
        ipcRenderer.invoke(IPC.notes.linksList, fromNoteId),
      add: (input: UserNoteLinkAddInput): Promise<void> =>
        ipcRenderer.invoke(IPC.notes.linksAdd, input),
      remove: (input: UserNoteLinkRemoveInput): Promise<void> =>
        ipcRenderer.invoke(IPC.notes.linksRemove, input),
      searchTargets: (args: {
        query?: string
        excludeNoteId?: number
        limit?: number
      }): Promise<NoteLinkTargetCandidate[]> =>
        ipcRenderer.invoke(IPC.notes.linksSearchTargets, args)
    },
    attachments: {
      list: (noteId: number): Promise<UserNoteAttachment[]> =>
        ipcRenderer.invoke(IPC.notes.attachmentsList, noteId),
      addLocal: (input: UserNoteAttachmentAddLocalInput): Promise<UserNoteAttachment> =>
        ipcRenderer.invoke(IPC.notes.attachmentsAddLocal, input),
      addCloud: (input: UserNoteAttachmentAddCloudInput): Promise<UserNoteAttachment> =>
        ipcRenderer.invoke(IPC.notes.attachmentsAddCloud, input),
      remove: (args: { noteId: number; attachmentId: number }): Promise<void> =>
        ipcRenderer.invoke(IPC.notes.attachmentsRemove, args),
      open: (args: {
        noteId: number
        attachmentId: number
      }): Promise<{ ok: boolean; error?: string }> =>
        ipcRenderer.invoke(IPC.notes.attachmentsOpen, args),
      saveAs: (args: {
        noteId: number
        attachmentId: number
        suggestedName?: string
      }): Promise<{ ok: boolean; path?: string; error?: string; cancelled?: boolean }> =>
        ipcRenderer.invoke(IPC.notes.attachmentsSaveAs, args)
    }
  },
  mail: {
    listFolders: (accountId: string): Promise<MailFolder[]> =>
      ipcRenderer.invoke(IPC.mail.listFolders, accountId),
    listMessages: (options: {
      folderId?: number
      accountId?: string
      limit?: number
    }): Promise<MailListItem[]> => ipcRenderer.invoke(IPC.mail.listMessages, options),
    listInboxTriage: (limit?: number | null): Promise<MailListItem[]> =>
      limit === undefined
        ? ipcRenderer.invoke(IPC.mail.listInboxTriage, {})
        : ipcRenderer.invoke(IPC.mail.listInboxTriage, { limit }),
    listUnifiedInbox: (): Promise<MailListItem[]> =>
      ipcRenderer.invoke(IPC.mail.listUnifiedInbox),
    listMetaFolders: (): Promise<MetaFolderSummary[]> =>
      ipcRenderer.invoke(IPC.mail.listMetaFolders),
    getMetaFolder: (id: number): Promise<MetaFolderSummary | null> =>
      ipcRenderer.invoke(IPC.mail.getMetaFolder, id),
    createMetaFolder: (input: MetaFolderCreateInput): Promise<MetaFolderSummary> =>
      ipcRenderer.invoke(IPC.mail.createMetaFolder, input),
    updateMetaFolder: (input: MetaFolderUpdateInput): Promise<MetaFolderSummary> =>
      ipcRenderer.invoke(IPC.mail.updateMetaFolder, input),
    deleteMetaFolder: (id: number): Promise<void> => ipcRenderer.invoke(IPC.mail.deleteMetaFolder, id),
    reorderMetaFolders: (orderedIds: number[]): Promise<void> =>
      ipcRenderer.invoke(IPC.mail.reorderMetaFolders, orderedIds),
    listMetaFolderMessages: (metaFolderId: number): Promise<MailListItem[]> =>
      ipcRenderer.invoke(IPC.mail.listMetaFolderMessages, metaFolderId),
    getMessage: (id: number): Promise<MailFull | null> =>
      ipcRenderer.invoke(IPC.mail.getMessage, id),
    listThreadMessages: (args: { accountId: string; threadKey: string }): Promise<MailFull[]> =>
      ipcRenderer.invoke(IPC.mail.listThreadMessages, args),
    listMessagesByThreads: (args: {
      accountId: string
      threadKeys: string[]
    }): Promise<MailListItem[]> =>
      ipcRenderer.invoke(IPC.mail.listMessagesByThreads, args),
    fetchInlineImages: (messageId: number): Promise<Record<string, string>> =>
      ipcRenderer.invoke(IPC.mail.fetchInlineImages, { messageId }),
    listAttachments: (messageId: number): Promise<AttachmentMeta[]> =>
      ipcRenderer.invoke(IPC.mail.listAttachments, { messageId }),
    openAttachment: (
      messageId: number,
      attachmentId: string
    ): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.mail.openAttachment, { messageId, attachmentId }),
    saveAttachmentAs: (
      messageId: number,
      attachmentId: string,
      suggestedName?: string
    ): Promise<{ ok: boolean; path?: string; error?: string; cancelled?: boolean }> =>
      ipcRenderer.invoke(IPC.mail.saveAttachmentAs, {
        messageId,
        attachmentId,
        suggestedName
      }),
    syncAttachmentsFlag: (messageId: number, value: boolean): Promise<void> =>
      ipcRenderer.invoke(IPC.mail.syncAttachmentsFlag, { messageId, value }),
    refreshNow: (folderId: number | null): Promise<void> =>
      ipcRenderer.invoke(IPC.mail.refreshNow, { folderId }),
    setActiveFolder: (folderId: number | null): Promise<void> =>
      ipcRenderer.invoke(IPC.mail.setActiveFolder, { folderId }),
    search: (query: string, limit?: number): Promise<SearchHit[]> =>
      ipcRenderer.invoke(IPC.mail.search, { query, limit }),
    syncAccount: (accountId: string): Promise<{ folders: number; inboxMessages: number }> =>
      ipcRenderer.invoke(IPC.mail.syncAccount, accountId),
    clearLocalMailCache: (accountId: string): Promise<ClearLocalMailCacheResult> =>
      ipcRenderer.invoke(IPC.mail.clearLocalMailCache, accountId),
    bulkUnflagFlaggedMessages: (input: MailBulkUnflagInput): Promise<MailBulkUnflagResult> =>
      ipcRenderer.invoke(IPC.mail.bulkUnflagFlaggedMessages, input),
    syncFolder: (folderId: number): Promise<number> =>
      ipcRenderer.invoke(IPC.mail.syncFolder, folderId),
    setRead: (messageId: number, isRead: boolean): Promise<void> =>
      ipcRenderer.invoke(IPC.mail.setRead, { messageId, isRead }),
    setFlagged: (messageId: number, flagged: boolean): Promise<void> =>
      ipcRenderer.invoke(IPC.mail.setFlagged, { messageId, flagged }),
    archive: (messageId: number): Promise<void> =>
      ipcRenderer.invoke(IPC.mail.archive, messageId),
    moveToTrash: (messageId: number): Promise<void> =>
      ipcRenderer.invoke(IPC.mail.moveToTrash, messageId),
    moveToFolder: (args: { messageId: number; targetFolderId: number }): Promise<void> =>
      ipcRenderer.invoke(IPC.mail.moveToFolder, args),
    permanentDeleteMessage: (messageId: number): Promise<void> =>
      ipcRenderer.invoke(IPC.mail.permanentDeleteMessage, messageId),
    emptyTrashFolder: (folderId: number): Promise<{ deletedRemote: number }> =>
      ipcRenderer.invoke(IPC.mail.emptyTrashFolder, folderId),
    snooze: (messageId: number, wakeAt: string, preset?: string): Promise<void> =>
      ipcRenderer.invoke(IPC.mail.snooze, { messageId, wakeAt, preset }),
    unsnooze: (messageId: number): Promise<void> =>
      ipcRenderer.invoke(IPC.mail.unsnooze, messageId),
    listSnoozed: (limit?: number): Promise<SnoozedMessageItem[]> =>
      ipcRenderer.invoke(IPC.mail.listSnoozed, { limit }),
    listTodoMessages: (args: {
      accountId: string | null
      dueKind: TodoDueKindList
      limit?: number
    }): Promise<MailListItem[]> => ipcRenderer.invoke(IPC.mail.listTodoMessages, args),
    listTodoMessagesInRange: (args: {
      accountId: string | null
      rangeStartIso: string
      rangeEndIso: string
      limit?: number
    }): Promise<MailListItem[]> => ipcRenderer.invoke(IPC.mail.listTodoMessagesInRange, args),
    listTodoCounts: (): Promise<TodoCountsAll> => ipcRenderer.invoke(IPC.mail.listTodoCounts),
    listTemplates: (): Promise<MailTemplate[]> => ipcRenderer.invoke(IPC.mail.listTemplates),
    listQuickSteps: (): Promise<MailQuickStep[]> => ipcRenderer.invoke(IPC.mail.listQuickSteps),
    runQuickStep: (args: { quickStepId: number; messageId: number }): Promise<void> =>
      ipcRenderer.invoke(IPC.mail.runQuickStep, args),
    setTodoForMessage: (args: {
      messageId: number
      dueKind: TodoDueKindOpen
    }): Promise<void> => ipcRenderer.invoke(IPC.mail.setTodoForMessage, args),
    setTodoScheduleForMessage: (args: {
      messageId: number
      startIso: string
      endIso: string
    }): Promise<void> => ipcRenderer.invoke(IPC.mail.setTodoScheduleForMessage, args),
    completeTodoForMessage: (messageId: number): Promise<void> =>
      ipcRenderer.invoke(IPC.mail.completeTodoForMessage, messageId),
    removeMailTodoRecordsForMessage: (messageId: number): Promise<RemoveMailTodoRecordsResult> =>
      ipcRenderer.invoke(IPC.mail.removeMailTodoRecordsForMessage, messageId),
    listWaitingMessages: (args?: { limit?: number }): Promise<MailListItem[]> =>
      ipcRenderer.invoke(IPC.mail.listWaitingMessages, args ?? {}),
    setWaitingForMessage: (args: {
      messageId: number
      days?: number
    }): Promise<void> => ipcRenderer.invoke(IPC.mail.setWaitingForMessage, args),
    clearWaitingForMessage: (messageId: number): Promise<void> =>
      ipcRenderer.invoke(IPC.mail.clearWaitingForMessage, messageId),
    undoLast: (): Promise<UndoResult> => ipcRenderer.invoke(IPC.mail.undoLast),
    peekUndo: (): Promise<UndoableActionSummary | null> =>
      ipcRenderer.invoke(IPC.mail.peekUndo),
    unsubscribeOneClick: (messageId: number): Promise<void> =>
      ipcRenderer.invoke(IPC.mail.unsubscribeOneClick, messageId),
    setMessageCategories: (args: {
      messageId: number
      categories: string[]
    }): Promise<void> => ipcRenderer.invoke(IPC.mail.setMessageCategories, args),
    listMasterCategories: (accountId: string): Promise<MailMasterCategory[]> =>
      ipcRenderer.invoke(IPC.mail.listMasterCategories, accountId),
    createMasterCategory: (args: {
      accountId: string
      displayName: string
      color: string
    }): Promise<MailMasterCategory> =>
      ipcRenderer.invoke(IPC.mail.createMasterCategory, args),
    updateMasterCategory: (args: {
      accountId: string
      categoryId: string
      displayName?: string
      color?: string
    }): Promise<void> => ipcRenderer.invoke(IPC.mail.updateMasterCategory, args),
    deleteMasterCategory: (args: { accountId: string; categoryId: string }): Promise<void> =>
      ipcRenderer.invoke(IPC.mail.deleteMasterCategory, args),
    listDistinctMessageTags: (accountId: string): Promise<string[]> =>
      ipcRenderer.invoke(IPC.mail.listDistinctMessageTags, accountId),
    getWorkflowMailFolderState: (accountId: string): Promise<WorkflowMailFolderUiState> =>
      ipcRenderer.invoke(IPC.mail.getWorkflowMailFolderState, accountId),
    ensureWorkflowMailFolders: (accountId: string): Promise<EnsureWorkflowMailFoldersResult> =>
      ipcRenderer.invoke(IPC.mail.ensureWorkflowMailFolders, accountId),
    setWorkflowMailFolderMapping: (args: {
      accountId: string
      wipFolderId: number | null
      doneFolderId: number | null
    }): Promise<void> => ipcRenderer.invoke(IPC.mail.setWorkflowMailFolderMapping, args)
  },
  folder: {
    create: (args: {
      accountId: string
      parentFolderId: number | null
      name: string
    }): Promise<MailFolder> => ipcRenderer.invoke(IPC.folder.create, args),
    rename: (folderId: number, name: string): Promise<void> =>
      ipcRenderer.invoke(IPC.folder.rename, { folderId, name }),
    delete: (folderId: number): Promise<void> =>
      ipcRenderer.invoke(IPC.folder.delete, folderId),
    move: (folderId: number, destinationFolderId: number | null): Promise<void> =>
      ipcRenderer.invoke(IPC.folder.move, { folderId, destinationFolderId }),
    toggleFavorite: (folderId: number, value: boolean): Promise<MailFolder> =>
      ipcRenderer.invoke(IPC.folder.toggleFavorite, { folderId, value })
  },
  compose: {
    send: (input: ComposeSendInput): Promise<void> =>
      ipcRenderer.invoke(IPC.compose.send, input),
    saveDraft: (input: ComposeSaveDraftInput): Promise<ComposeSaveDraftResult> =>
      ipcRenderer.invoke(IPC.compose.saveDraft, input),
    recipientSuggestions: (args: {
      accountId: string
      query: string
    }): Promise<ComposeRecipientSuggestion[]> =>
      ipcRenderer.invoke(IPC.compose.recipientSuggestions, args),
    listDriveExplorer: (args: ComposeListDriveExplorerInput): Promise<ComposeDriveExplorerEntry[]> =>
      ipcRenderer.invoke(IPC.compose.listDriveExplorer, args),
    listDriveExplorerFavorites: (accountId: string): Promise<ComposeDriveExplorerFavorite[]> =>
      ipcRenderer.invoke(IPC.compose.listDriveExplorerFavorites, { accountId }),
    addDriveExplorerFavorite: (
      args: ComposeAddDriveExplorerFavoriteInput
    ): Promise<ComposeDriveExplorerFavorite> =>
      ipcRenderer.invoke(IPC.compose.addDriveExplorerFavorite, args),
    removeDriveExplorerFavorite: (args: ComposeRemoveDriveExplorerFavoriteInput): Promise<void> =>
      ipcRenderer.invoke(IPC.compose.removeDriveExplorerFavorite, args),
    updateDriveExplorerFavoriteCache: (args: ComposeUpdateDriveExplorerFavoriteCacheInput): Promise<void> =>
      ipcRenderer.invoke(IPC.compose.updateDriveExplorerFavoriteCache, args),
    renameDriveExplorerFavorite: (args: ComposeRenameDriveExplorerFavoriteInput): Promise<void> =>
      ipcRenderer.invoke(IPC.compose.renameDriveExplorerFavorite, args),
    reorderDriveExplorerFavorites: (args: ComposeReorderDriveExplorerFavoritesInput): Promise<void> =>
      ipcRenderer.invoke(IPC.compose.reorderDriveExplorerFavorites, args)
  },
  calendar: {
    listEvents: (args: CalendarListEventsInput): Promise<CalendarEventView[]> =>
      ipcRenderer.invoke(IPC.calendar.listEvents, args),
    listCalendars: (args: CalendarListCalendarsInput): Promise<CalendarGraphCalendarRow[]> =>
      ipcRenderer.invoke(IPC.calendar.listCalendars, args),
    listMicrosoft365GroupCalendars: (args: {
      accountId: string
      offset?: number
      limit?: number
    }): Promise<CalendarM365GroupCalendarsPage> =>
      ipcRenderer.invoke(IPC.calendar.listMicrosoft365GroupCalendars, args),
    patchCalendarColor: (args: CalendarPatchCalendarColorInput): Promise<void> =>
      ipcRenderer.invoke(IPC.calendar.patchCalendarColor, args),
    createTeamsMeeting: (args: {
      accountId: string
      subject: string
      startIso: string
      endIso: string
      bodyHtml?: string
      graphCalendarId?: string | null
      attendeeEmails?: string[] | null
    }): Promise<{ id: string; webLink: string | null; joinUrl: string | null }> =>
      ipcRenderer.invoke(IPC.calendar.createTeamsMeeting, args),
    suggestFromMessage: (messageId: number): Promise<CalendarSuggestionFromMail> =>
      ipcRenderer.invoke(IPC.calendar.suggestFromMessage, messageId),
    createEvent: (input: CalendarSaveEventInput): Promise<CalendarSaveEventResult> =>
      ipcRenderer.invoke(IPC.calendar.createEvent, input),
    updateEvent: (input: CalendarUpdateEventInput): Promise<void> =>
      ipcRenderer.invoke(IPC.calendar.updateEvent, input),
    getEvent: (input: CalendarGetEventInput): Promise<CalendarGetEventResult> =>
      ipcRenderer.invoke(IPC.calendar.getEvent, input),
    deleteEvent: (input: CalendarDeleteEventInput): Promise<void> =>
      ipcRenderer.invoke(IPC.calendar.deleteEvent, input),
    transferEvent: (
      input: import('@shared/types').CalendarTransferEventInput
    ): Promise<import('@shared/types').CalendarSaveEventResult> =>
      ipcRenderer.invoke(IPC.calendar.transferEvent, input),
    patchEventSchedule: (input: CalendarPatchScheduleInput): Promise<void> =>
      ipcRenderer.invoke(IPC.calendar.patchEventSchedule, input),
    patchEventIcon: (input: CalendarPatchEventIconInput): Promise<void> =>
      ipcRenderer.invoke(IPC.calendar.patchEventIcon, input),
    patchEventCategories: (args: {
      accountId: string
      graphEventId: string
      categories: string[]
      graphCalendarId?: string | null
    }): Promise<void> => ipcRenderer.invoke(IPC.calendar.patchEventCategories, args),
    syncAccount: (accountId: string): Promise<void> =>
      ipcRenderer.invoke(IPC.calendar.syncAccount, accountId),
    getAccountSyncStates: (): Promise<import('@shared/types').CalendarAccountSyncStateRow[]> =>
      ipcRenderer.invoke(IPC.calendar.getAccountSyncStates)
  },
  tasks: {
    listLists: (args: TasksListListsInput): Promise<TaskListRow[]> =>
      ipcRenderer.invoke(IPC.tasks.listLists, args),
    listTasks: (args: TasksListTasksInput): Promise<TaskItemRow[]> =>
      ipcRenderer.invoke(IPC.tasks.listTasks, args),
    clearLocalTasksCache: (accountId: string): Promise<ClearLocalTasksCacheResult> =>
      ipcRenderer.invoke(IPC.tasks.clearLocalTasksCache, accountId),
    createTask: (input: TasksCreateTaskInput): Promise<TaskItemRow> =>
      ipcRenderer.invoke(IPC.tasks.createTask, input),
    updateTask: (input: TasksUpdateTaskInput): Promise<TaskItemRow> =>
      ipcRenderer.invoke(IPC.tasks.updateTask, input),
    patchTask: (input: TasksPatchTaskInput): Promise<TaskItemRow> =>
      ipcRenderer.invoke(IPC.tasks.patchTask, input),
    patchTaskDisplay: (input: TasksPatchTaskDisplayInput): Promise<TaskItemRow> =>
      ipcRenderer.invoke(IPC.tasks.patchTaskDisplay, input),
    deleteTask: (input: TasksDeleteTaskInput): Promise<void> =>
      ipcRenderer.invoke(IPC.tasks.deleteTask, input),
    bulkDeleteCompletedFlaggedEmailTasks: (
      input: TasksBulkDeleteCompletedFlaggedEmailInput
    ): Promise<TasksBulkDeleteCompletedFlaggedEmailResult> =>
      ipcRenderer.invoke(IPC.tasks.bulkDeleteCompletedFlaggedEmailTasks, input),
    listPlannedSchedules: (args: TasksListPlannedSchedulesInput): Promise<TaskPlannedScheduleDto[]> =>
      ipcRenderer.invoke(IPC.tasks.listPlannedSchedules, args),
    setPlannedSchedule: (input: TasksSetPlannedScheduleInput): Promise<void> =>
      ipcRenderer.invoke(IPC.tasks.setPlannedSchedule, input),
    clearPlannedSchedule: (input: TasksClearPlannedScheduleInput): Promise<void> =>
      ipcRenderer.invoke(IPC.tasks.clearPlannedSchedule, input),
    listMailCloudTaskLinks: (): Promise<MailCloudTaskLinkDto[]> =>
      ipcRenderer.invoke(IPC.tasks.listMailCloudTaskLinks),
    createMailCloudTaskFromMessage: (
      input: TasksCreateMailCloudTaskFromMessageInput
    ): Promise<TaskItemRow> => ipcRenderer.invoke(IPC.tasks.createMailCloudTaskFromMessage, input)
  },
  people: {
    list: (input: PeopleListInput): Promise<PeopleContactView[]> =>
      ipcRenderer.invoke(IPC.people.list, input),
    getById: (contactId: number): Promise<PeopleContactView | null> =>
      ipcRenderer.invoke(IPC.people.getById, contactId),
    getNavCounts: (): Promise<PeopleNavCounts> => ipcRenderer.invoke(IPC.people.getNavCounts),
    syncAccount: (accountId: string): Promise<PeopleSyncAccountResult> =>
      ipcRenderer.invoke(IPC.people.syncAccount, accountId),
    syncAll: (): Promise<PeopleSyncAccountResult[]> => ipcRenderer.invoke(IPC.people.syncAll),
    setFavorite: (input: PeopleSetFavoriteInput): Promise<void> =>
      ipcRenderer.invoke(IPC.people.setFavorite, input),
    getPhotoDataUrl: (contactId: number): Promise<string | null> =>
      ipcRenderer.invoke(IPC.people.getPhotoDataUrl, contactId),
    updateContact: (input: PeopleUpdateContactInput): Promise<void> =>
      ipcRenderer.invoke(IPC.people.updateContact, input),
    setContactPhoto: (input: PeopleSetContactPhotoInput): Promise<PeopleContactView> =>
      ipcRenderer.invoke(IPC.people.setContactPhoto, input),
    createContact: (input: PeopleCreateContactInput): Promise<PeopleContactView> =>
      ipcRenderer.invoke(IPC.people.createContact, input),
    deleteContact: (contactId: number): Promise<void> => ipcRenderer.invoke(IPC.people.deleteContact, contactId)
  },
  workflow: {
    listBoards: (): Promise<WorkflowBoard[]> => ipcRenderer.invoke(IPC.workflow.listBoards),
    updateBoardColumns: (args: {
      boardId: number
      columns: WorkflowColumn[]
    }): Promise<void> => ipcRenderer.invoke(IPC.workflow.updateBoardColumns, args)
  },
  vip: {
    list: (accountId: string): Promise<string[]> => ipcRenderer.invoke(IPC.vip.list, accountId),
    add: (args: { accountId: string; email: string }): Promise<void> =>
      ipcRenderer.invoke(IPC.vip.add, args),
    remove: (args: { accountId: string; email: string }): Promise<void> =>
      ipcRenderer.invoke(IPC.vip.remove, args)
  },
  rules: {
    list: (): Promise<MailRuleDto[]> => ipcRenderer.invoke(IPC.rules.list),
    get: (id: number): Promise<MailRuleDto | null> => ipcRenderer.invoke(IPC.rules.get, id),
    create: (input: {
      name: string
      enabled: boolean
      trigger: MailRuleTrigger
      definition: MailRuleDefinition
    }): Promise<MailRuleDto> => ipcRenderer.invoke(IPC.rules.create, input),
    update: (args: {
      id: number
      patch: Partial<{
        name: string
        enabled: boolean
        trigger: MailRuleTrigger
        sortOrder: number
        definition: MailRuleDefinition
      }>
    }): Promise<MailRuleDto> => ipcRenderer.invoke(IPC.rules.update, args),
    delete: (id: number): Promise<void> => ipcRenderer.invoke(IPC.rules.delete, id),
    dryRun: (args: {
      ruleId: number
      accountId: string | null
      limit?: number
    }): Promise<MailRuleDryRunResult> => ipcRenderer.invoke(IPC.rules.dryRun, args),
    applyManual: (args: {
      ruleId: number
      accountId: string | null
      limit?: number
    }): Promise<{ applied: number }> => ipcRenderer.invoke(IPC.rules.applyManual, args),
    listAutomation: (limit?: number): Promise<AutomationInboxEntry[]> =>
      ipcRenderer.invoke(IPC.rules.listAutomation, limit),
    undoAutomation: (actionId: number): Promise<UndoResult> =>
      ipcRenderer.invoke(IPC.rules.undoAutomation, actionId)
  },
  events: {
    onAccountsChanged: (handler: (accounts: ConnectedAccount[]) => void): (() => void) => {
      const listener = (_e: IpcRendererEvent, accounts: ConnectedAccount[]): void =>
        handler(accounts)
      ipcRenderer.on('accounts:changed', listener)
      return (): void => {
        ipcRenderer.off('accounts:changed', listener)
      }
    },
    onSyncStatus: (handler: (status: SyncStatus) => void): (() => void) => {
      const listener = (_e: IpcRendererEvent, status: SyncStatus): void => handler(status)
      ipcRenderer.on('sync:status', listener)
      return (): void => {
        ipcRenderer.off('sync:status', listener)
      }
    },
    onConnectivityChange: (handler: (payload: { online: boolean }) => void): (() => void) => {
      const listener = (_e: IpcRendererEvent, payload: { online: boolean }): void => handler(payload)
      ipcRenderer.on('app:connectivity', listener)
      return (): void => {
        ipcRenderer.off('app:connectivity', listener)
      }
    },
    onMailChanged: (handler: (payload: { accountId: string }) => void): (() => void) => {
      const listener = (_e: IpcRendererEvent, payload: { accountId: string }): void =>
        handler(payload)
      ipcRenderer.on('mail:changed', listener)
      return (): void => {
        ipcRenderer.off('mail:changed', listener)
      }
    },
    onMailBulkUnflagProgress: (handler: (payload: MailBulkUnflagProgressPayload) => void): (() => void) => {
      const listener = (_e: IpcRendererEvent, payload: MailBulkUnflagProgressPayload): void =>
        handler(payload)
      ipcRenderer.on('mail:bulk-unflag-progress', listener)
      return (): void => {
        ipcRenderer.off('mail:bulk-unflag-progress', listener)
      }
    },
    onCalendarChanged: (handler: (payload: { accountId: string }) => void): (() => void) => {
      const listener = (_e: IpcRendererEvent, payload: { accountId: string }): void =>
        handler(payload)
      ipcRenderer.on('calendar:changed', listener)
      return (): void => {
        ipcRenderer.off('calendar:changed', listener)
      }
    },
    onCalendarSyncStatus: (handler: (status: SyncStatus) => void): (() => void) => {
      const listener = (_e: IpcRendererEvent, status: SyncStatus): void => handler(status)
      ipcRenderer.on('calendar:sync-status', listener)
      return (): void => {
        ipcRenderer.off('calendar:sync-status', listener)
      }
    },
    onTasksChanged: (handler: (payload: { accountId: string }) => void): (() => void) => {
      const listener = (_e: IpcRendererEvent, payload: { accountId: string }): void =>
        handler(payload)
      ipcRenderer.on('tasks:changed', listener)
      return (): void => {
        ipcRenderer.off('tasks:changed', listener)
      }
    },
    onNotesChanged: (
      handler: (payload: {
        kind?: UserNoteKind
        noteId?: number
        messageId?: number | null
        accountId?: string | null
      }) => void
    ): (() => void) => {
      const listener = (
        _e: IpcRendererEvent,
        payload: {
          kind?: UserNoteKind
          noteId?: number
          messageId?: number | null
          accountId?: string | null
        }
      ): void => handler(payload)
      ipcRenderer.on('notes:changed', listener)
      return (): void => {
        ipcRenderer.off('notes:changed', listener)
      }
    },
    onTeamsChatPopoutClosed: (handler: (payload: TeamsChatPopoutRef) => void): (() => void) => {
      const listener = (_e: IpcRendererEvent, payload: TeamsChatPopoutRef): void => handler(payload)
      ipcRenderer.on('teams-chat-popout:closed', listener)
      return (): void => {
        ipcRenderer.off('teams-chat-popout:closed', listener)
      }
    }
  },
  /**
   * Generischer `ipcRenderer.invoke`-Aufruf.
   * Hilft, wenn der Renderer (z. B. nach Vite-HMR) neue APIs nutzt, das Preload aber noch
   * vom Fensterstart stammt — dann kann z. B. `invoke(IPC.calendar.deleteEvent, …)` trotzdem funktionieren.
   */
  invoke: (channel: string, payload?: unknown): Promise<unknown> =>
    ipcRenderer.invoke(channel, payload)
}

contextBridge.exposeInMainWorld('mailClient', api)

export type MailClientApi = typeof api
