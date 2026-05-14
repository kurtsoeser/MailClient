import { create } from 'zustand'
import type {
  MailFolder,
  MailListItem,
  MailFull,
  SyncStatus,
  ConnectedAccount,
  TodoDueKindList,
  TodoDueKindOpen,
  TodoCountsAll,
  MetaFolderSummary,
  MetaFolderCreateInput
} from '@shared/types'
import { threadGroupingKey } from '@/lib/thread-group'
import type { MailListArrangeBy, MailListChronoOrder } from '@/lib/mail-list-arrange'
import { useUndoStore } from './undo'
import {
  readLastMailNav,
  lastMailNavIsRestorable,
  type SelectMailNavOptions
} from './mail-nav-persist'
import type { AccountListMetaEntry, MailFilter, MailListKind } from './mail-store-types'
import {
  buildNavigableMessageIds,
  formatSnoozeWake,
  isMailInDeletedItemsFolder,
  pickInitialMessageId,
  shorten,
  snapshotMailNavForPersist,
  todoDueKindShortLabel
} from './mail-store-helpers'
import { touchRecentMailMoveFolder } from '@/lib/mail-move-recent'

export type { MailFilter, MailListKind, AccountListMetaEntry } from './mail-store-types'
export { mailListUsesCrossAccountThreadScope } from './mail-store-types'
export type { MailListArrangeBy, MailListChronoOrder } from '@/lib/mail-list-arrange'

interface MailState {
  foldersByAccount: Record<string, MailFolder[]>
  messages: MailListItem[]
  /**
   * Pro Thread-Key alle Mails dieses Threads ueber ALLE Ordner des Accounts
   * hinweg (insbesondere "Gesendet"). Damit zeigt die Konversationsansicht
   * im Posteingang auch eigene Antworten als Teil des Threads.
   */
  threadMessages: Record<string, MailListItem[]>
  selectedFolderId: number | null
  selectedFolderAccountId: string | null
  /** Ordner-, ToDo- oder Snoozed-Ansicht der Mailliste. */
  listKind: MailListKind
  /** Aktiver ToDo-Bucket, wenn `listKind === 'todo'`. */
  todoDueKind: TodoDueKindList | null
  /** Zaehler fuer Schnellzugriff / Sidebar. */
  todoCounts: TodoCountsAll
  /** ID der einzelnen Mail im Lesebereich. */
  selectedMessageId: number | null
  selectedMessage: MailFull | null
  /** ThreadKeys, die in der Mailliste aufgeklappt sind. */
  expandedThreads: Set<string>
  /** Gruppierungs-Koepfe (z. B. nach Datum), die eingeklappt sind. */
  collapsedMailListGroupKeys: Set<string>
  messageLoading: boolean
  syncByAccount: Record<string, SyncStatus>
  loading: boolean
  error: string | null

  /** Virtuelle Meta-Ordner (Such-/Filteransichten, alle Konten). */
  metaFolders: MetaFolderSummary[]
  selectedMetaFolderId: number | null

  initialize: () => void
  refreshAccounts: (accounts: ConnectedAccount[]) => Promise<void>
  selectFolder: (accountId: string, folderId: number, opts?: SelectMailNavOptions) => Promise<void>
  /**
   * Triage-Ansicht: zeigt Mails mit ToDo-Bucket.
   * - `dueKind = null` (Standard fuer Sidebar): alle offenen Buckets gebuendelt,
   *   gruppiert nach Bucket (arrangeBy = 'todo_bucket').
   * - `dueKind = <bucket>`: nur ein einzelner Bucket (z.B. Workflow-Quickstep).
   */
  selectTodoView: (
    dueKind?: TodoDueKindList | null,
    opts?: SelectMailNavOptions
  ) => Promise<void>
  selectSnoozedView: (opts?: SelectMailNavOptions) => Promise<void>
  selectWaitingView: (opts?: SelectMailNavOptions) => Promise<void>
  selectUnifiedInbox: (opts?: SelectMailNavOptions) => Promise<void>
  selectMetaFolder: (metaFolderId: number, opts?: SelectMailNavOptions) => Promise<void>
  createMetaFolder: (input: MetaFolderCreateInput) => Promise<MetaFolderSummary>
  deleteMetaFolder: (metaFolderId: number) => Promise<void>
  reorderMetaFolders: (orderedIds: number[]) => Promise<void>
  selectMessage: (messageId: number) => Promise<void>
  /** Kalender: gewaehlte Mail plus Thread-Nachrichten fuer die Vorschau-Leiste. */
  selectMessageWithThreadPreview: (messageId: number) => Promise<void>
  /** Lesebereich leeren (z. B. Kalender: Termin-Vorschau statt Mail). */
  clearSelectedMessage: () => void
  /** `selectedMessage` aus der DB neu laden (z. B. nach Batch-ToDo-Termin im Kalender). */
  reloadSelectedMessageFromDb: () => Promise<void>
  toggleThreadExpanded: (threadKey: string) => void
  toggleMailListGroupCollapsed: (key: string) => void
  triggerSync: (accountId: string) => Promise<void>
  refreshNow: () => Promise<void>
  openMessageInFolder: (messageId: number) => Promise<void>
  setMessageRead: (messageId: number, isRead: boolean) => Promise<void>
  toggleMessageFlag: (messageId: number) => Promise<void>
  archiveMessage: (messageId: number) => Promise<void>
  deleteMessage: (messageId: number) => Promise<void>
  moveMessagesToFolder: (
    messageIds: number[],
    targetFolderId: number
  ) => Promise<void>
  snoozeMessage: (messageId: number, wakeAtIso: string, preset?: string) => Promise<void>
  unsnoozeMessage: (messageId: number) => Promise<void>
  setTodoForMessage: (messageId: number, dueKind: TodoDueKindOpen) => Promise<void>
  setTodoScheduleForMessage: (
    messageId: number,
    startIso: string,
    endIso: string,
    opts?: { skipSelectedRefresh?: boolean }
  ) => Promise<void>
  completeTodoForMessage: (messageId: number) => Promise<void>
  setWaitingForMessage: (messageId: number, days?: number) => Promise<void>
  clearWaitingForMessage: (messageId: number) => Promise<void>
  createFolder: (
    accountId: string,
    parentFolderId: number | null,
    name: string
  ) => Promise<MailFolder>
  renameFolder: (folderId: number, name: string) => Promise<void>
  deleteFolder: (folderId: number) => Promise<void>
  emptyTrashFolder: (folderId: number) => Promise<{ deletedRemote: number }>
  moveFolder: (folderId: number, destinationFolderId: number | null) => Promise<void>
  toggleFolderFavorite: (folderId: number, value: boolean) => Promise<void>

  mailFilter: MailFilter
  setMailFilter: (filter: MailFilter) => void

  accountListMeta: Record<string, AccountListMetaEntry>
  mailListArrangeBy: MailListArrangeBy
  mailListChronoOrder: MailListChronoOrder
  setMailListArrangeBy: (v: MailListArrangeBy) => void
  setMailListChronoOrder: (v: MailListChronoOrder) => void
  /** Waehlt die naechste/vorige Mail in der gefilterten, ggf. aufgeklappten Mailliste. */
  selectNextMessage: () => void
  selectPrevMessage: () => void
}

let unsubscribers: Array<() => void> = []

export const useMailStore = create<MailState>((set, get) => ({
  foldersByAccount: {},
  messages: [],
  threadMessages: {},
  selectedFolderId: null,
  selectedFolderAccountId: null,
  listKind: 'folder',
  todoDueKind: null,
  todoCounts: { today: 0, tomorrow: 0, this_week: 0, later: 0, overdue: 0, done: 0, waiting: 0 },
  metaFolders: [],
  selectedMetaFolderId: null,
  selectedMessageId: null,
  selectedMessage: null,
  expandedThreads: new Set<string>(),
  collapsedMailListGroupKeys: new Set<string>(),
  messageLoading: false,
  syncByAccount: {},
  loading: false,
  error: null,
  mailFilter: 'all',
  accountListMeta: {},
  mailListArrangeBy: 'date_conversations',
  mailListChronoOrder: 'newest_on_top',

  initialize(): void {
    for (const u of unsubscribers) u()
    unsubscribers = []

    unsubscribers.push(
      window.mailClient.events.onSyncStatus((status) => {
        set((s) => ({
          syncByAccount: { ...s.syncByAccount, [status.accountId]: status }
        }))
      })
    )

    unsubscribers.push(
      window.mailClient.events.onMailChanged(async ({ accountId }) => {
        const folders = await window.mailClient.mail.listFolders(accountId)
        set((s) => ({
          foldersByAccount: { ...s.foldersByAccount, [accountId]: folders }
        }))

        let todoCounts: TodoCountsAll | undefined
        try {
          todoCounts = await window.mailClient.mail.listTodoCounts()
        } catch (e) {
          console.warn('[mail-store] listTodoCounts failed', e)
        }
        if (todoCounts) set({ todoCounts })

        const state = get()
        if (state.listKind === 'todo') {
          try {
            const messages = state.todoDueKind
              ? await window.mailClient.mail.listTodoMessages({
                  accountId: null,
                  dueKind: state.todoDueKind
                })
              : await loadAllOpenTodoMessages()
            set({ messages, threadMessages: {} })
            if (state.selectedMessageId) {
              const fresh = await window.mailClient.mail.getMessage(state.selectedMessageId)
              if (fresh) set({ selectedMessage: fresh })
            }
          } catch (e) {
            console.error('[mail-store] listTodoMessages on mail:changed', e)
          }
          return
        }

        if (state.listKind === 'snoozed') {
          try {
            const messages = await window.mailClient.mail.listSnoozed(200)
            set({ messages, threadMessages: {} })
            if (state.selectedMessageId) {
              const fresh = await window.mailClient.mail.getMessage(state.selectedMessageId)
              if (fresh) set({ selectedMessage: fresh })
            }
          } catch (e) {
            console.error('[mail-store] listSnoozed on mail:changed', e)
          }
          return
        }

        if (state.listKind === 'waiting') {
          try {
            const messages = await window.mailClient.mail.listWaitingMessages({ limit: 200 })
            set({ messages, threadMessages: {} })
            if (state.selectedMessageId) {
              const fresh = await window.mailClient.mail.getMessage(state.selectedMessageId)
              if (fresh) set({ selectedMessage: fresh })
            }
          } catch (e) {
            console.error('[mail-store] listWaitingMessages on mail:changed', e)
          }
          return
        }

        if (state.listKind === 'unified_inbox') {
          try {
            const messages = await window.mailClient.mail.listUnifiedInbox()
            set({ messages })
            void loadCrossFolderThreadsUnified(messages, set)
            if (state.selectedMessageId) {
              const fresh = await window.mailClient.mail.getMessage(state.selectedMessageId)
              if (fresh) set({ selectedMessage: fresh })
            }
          } catch (e) {
            console.error('[mail-store] unified inbox on mail:changed', e)
          }
          return
        }

        if (state.listKind === 'meta_folder' && state.selectedMetaFolderId != null) {
          try {
            const messages = await window.mailClient.mail.listMetaFolderMessages(
              state.selectedMetaFolderId
            )
            set({ messages })
            void loadCrossFolderThreadsUnified(messages, set)
            if (state.selectedMessageId) {
              const fresh = await window.mailClient.mail.getMessage(state.selectedMessageId)
              if (fresh) set({ selectedMessage: fresh })
            }
          } catch (e) {
            console.error('[mail-store] meta folder on mail:changed', e)
          }
          return
        }

        if (state.selectedFolderId && state.selectedFolderAccountId === accountId) {
          const messages = await window.mailClient.mail.listMessages({
            folderId: state.selectedFolderId
          })
          set({ messages })

          void loadCrossFolderThreads(accountId, messages, set)

          if (state.selectedMessageId) {
            const fresh = await window.mailClient.mail.getMessage(state.selectedMessageId)
            if (fresh) set({ selectedMessage: fresh })
          }
        } else if (state.listKind === 'folder' && !state.selectedFolderId) {
          const inbox = folders.find((f) => f.wellKnown === 'inbox')
          if (inbox) {
            await get().selectFolder(accountId, inbox.id)
          }
        }
      })
    )

    void window.mailClient.mail
      .listTodoCounts()
      .then((todoCounts) => set({ todoCounts }))
      .catch(() => undefined)
  },

  async refreshAccounts(accounts: ConnectedAccount[]): Promise<void> {
    const next: Record<string, MailFolder[]> = {}
    await Promise.all(
      accounts.map(async (acc) => {
        next[acc.id] = await window.mailClient.mail.listFolders(acc.id)
      })
    )
    let metaFolders: MetaFolderSummary[] = []
    try {
      metaFolders = await window.mailClient.mail.listMetaFolders()
    } catch (e) {
      console.warn('[mail-store] listMetaFolders', e)
    }
    const metaIds = new Set(metaFolders.map((m) => m.id))

    set({
      foldersByAccount: next,
      accountListMeta: Object.fromEntries(
        accounts.map((a) => [
          a.id,
          { email: a.email, displayName: a.displayName }
        ])
      ),
      metaFolders
    })

    const knownAccountIds = new Set(accounts.map((a) => a.id))
    const stored = readLastMailNav()
    if (stored && lastMailNavIsRestorable(stored, next, knownAccountIds, metaIds)) {
      const pm = stored.selectedMessageId
      let restored = false
      try {
        switch (stored.listKind) {
          case 'folder':
            if (stored.folderAccountId != null && stored.folderId != null) {
              await get().selectFolder(stored.folderAccountId, stored.folderId, {
                preferredMessageId: pm
              })
              restored = true
            }
            break
          case 'todo':
            await get().selectTodoView(stored.todoDueKind, { preferredMessageId: pm })
            restored = true
            break
          case 'snoozed':
            await get().selectSnoozedView({ preferredMessageId: pm })
            restored = true
            break
          case 'waiting':
            await get().selectWaitingView({ preferredMessageId: pm })
            restored = true
            break
          case 'unified_inbox':
            await get().selectUnifiedInbox({ preferredMessageId: pm })
            restored = true
            break
          case 'meta_folder':
            if (stored.metaFolderId != null) {
              await get().selectMetaFolder(stored.metaFolderId, { preferredMessageId: pm })
              restored = true
            }
            break
          default:
            break
        }
      } catch (e) {
        console.warn('[mail-store] restore last mail nav failed', e)
      }
      if (restored) return
    }

    const state = get()
    if (state.listKind === 'unified_inbox') {
      await get().selectUnifiedInbox()
      return
    }
    if (state.listKind === 'meta_folder' && state.selectedMetaFolderId != null) {
      await get().selectMetaFolder(state.selectedMetaFolderId)
      return
    }
    if (state.listKind === 'folder' && !state.selectedFolderId) {
      for (const acc of accounts) {
        const inbox = next[acc.id]?.find((f) => f.wellKnown === 'inbox')
        if (inbox) {
          await get().selectFolder(acc.id, inbox.id)
          return
        }
      }
    }
  },

  async selectFolder(
    accountId: string,
    folderId: number,
    opts?: SelectMailNavOptions
  ): Promise<void> {
    set({
      listKind: 'folder',
      todoDueKind: null,
      selectedFolderId: folderId,
      selectedFolderAccountId: accountId,
      selectedMetaFolderId: null,
      selectedMessageId: null,
      selectedMessage: null,
      expandedThreads: new Set<string>(),
      collapsedMailListGroupKeys: new Set<string>(),
      threadMessages: {},
      loading: true,
      error: null
    })

    void window.mailClient.mail.setActiveFolder(folderId).catch(() => undefined)

    try {
      const messages = await window.mailClient.mail.listMessages({ folderId })
      set({ messages, loading: false })

      void loadCrossFolderThreads(accountId, messages, set)

      const pick = pickInitialMessageId(messages, opts?.preferredMessageId ?? null)
      if (pick != null) {
        await get().selectMessage(pick)
      } else {
        snapshotMailNavForPersist(get())
      }

      void window.mailClient.mail
        .syncFolder(folderId)
        .catch((e) => console.error('[mail] folder sync failed:', e))
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) })
    }
  },

  async selectTodoView(
    dueKind: TodoDueKindList | null = null,
    opts?: SelectMailNavOptions
  ): Promise<void> {
    const unified = dueKind == null
    set((s) => ({
      listKind: 'todo',
      todoDueKind: dueKind,
      selectedFolderId: null,
      selectedFolderAccountId: null,
      selectedMetaFolderId: null,
      selectedMessageId: null,
      selectedMessage: null,
      expandedThreads: new Set<string>(),
      collapsedMailListGroupKeys: new Set<string>(),
      threadMessages: {},
      loading: true,
      error: null,
      // Einheitliche ToDo-Ansicht: nach Bucket gruppieren, damit "Überfällig",
      // "Heute", "Morgen" … als Gruppen-Köpfe in der Liste sichtbar werden.
      mailListArrangeBy: unified ? 'todo_bucket' : s.mailListArrangeBy
    }))

    void window.mailClient.mail.setActiveFolder(null).catch(() => undefined)

    try {
      const messages = unified
        ? await loadAllOpenTodoMessages()
        : await window.mailClient.mail.listTodoMessages({ accountId: null, dueKind })
      set({ messages, loading: false })

      const pick = pickInitialMessageId(messages, opts?.preferredMessageId ?? null)
      if (pick != null) {
        await get().selectMessage(pick)
      } else {
        snapshotMailNavForPersist(get())
      }

      try {
        const todoCounts = await window.mailClient.mail.listTodoCounts()
        set({ todoCounts })
      } catch (e) {
        console.warn('[mail-store] listTodoCounts', e)
      }
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) })
    }
  },

  async selectSnoozedView(opts?: SelectMailNavOptions): Promise<void> {
    set({
      listKind: 'snoozed',
      todoDueKind: null,
      selectedFolderId: null,
      selectedFolderAccountId: null,
      selectedMetaFolderId: null,
      selectedMessageId: null,
      selectedMessage: null,
      expandedThreads: new Set<string>(),
      collapsedMailListGroupKeys: new Set<string>(),
      threadMessages: {},
      loading: true,
      error: null
    })

    void window.mailClient.mail.setActiveFolder(null).catch(() => undefined)

    try {
      const messages = await window.mailClient.mail.listSnoozed(200)
      set({ messages, loading: false })

      const pick = pickInitialMessageId(messages, opts?.preferredMessageId ?? null)
      if (pick != null) {
        await get().selectMessage(pick)
      } else {
        snapshotMailNavForPersist(get())
      }

      try {
        const todoCounts = await window.mailClient.mail.listTodoCounts()
        set({ todoCounts })
      } catch (e) {
        console.warn('[mail-store] listTodoCounts', e)
      }
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) })
    }
  },

  async selectWaitingView(opts?: SelectMailNavOptions): Promise<void> {
    set({
      listKind: 'waiting',
      todoDueKind: null,
      selectedFolderId: null,
      selectedFolderAccountId: null,
      selectedMetaFolderId: null,
      selectedMessageId: null,
      selectedMessage: null,
      expandedThreads: new Set<string>(),
      collapsedMailListGroupKeys: new Set<string>(),
      threadMessages: {},
      loading: true,
      error: null
    })

    void window.mailClient.mail.setActiveFolder(null).catch(() => undefined)

    try {
      const messages = await window.mailClient.mail.listWaitingMessages({ limit: 200 })
      set({ messages, loading: false })

      const pick = pickInitialMessageId(messages, opts?.preferredMessageId ?? null)
      if (pick != null) {
        await get().selectMessage(pick)
      } else {
        snapshotMailNavForPersist(get())
      }

      try {
        const todoCounts = await window.mailClient.mail.listTodoCounts()
        set({ todoCounts })
      } catch (e) {
        console.warn('[mail-store] listTodoCounts', e)
      }
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) })
    }
  },

  async selectUnifiedInbox(opts?: SelectMailNavOptions): Promise<void> {
    set({
      listKind: 'unified_inbox',
      todoDueKind: null,
      selectedFolderId: null,
      selectedFolderAccountId: null,
      selectedMetaFolderId: null,
      selectedMessageId: null,
      selectedMessage: null,
      expandedThreads: new Set<string>(),
      collapsedMailListGroupKeys: new Set<string>(),
      threadMessages: {},
      messages: [],
      loading: true,
      error: null
    })

    void window.mailClient.mail.setActiveFolder(null).catch(() => undefined)

    try {
      const messages = await window.mailClient.mail.listUnifiedInbox()
      set({ messages, loading: false })

      void loadCrossFolderThreadsUnified(messages, set)

      const pick = pickInitialMessageId(messages, opts?.preferredMessageId ?? null)
      if (pick != null) {
        await get().selectMessage(pick)
      } else {
        snapshotMailNavForPersist(get())
      }

      try {
        const todoCounts = await window.mailClient.mail.listTodoCounts()
        set({ todoCounts })
      } catch (e) {
        console.warn('[mail-store] listTodoCounts', e)
      }
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) })
    }
  },

  async selectMetaFolder(metaFolderId: number, opts?: SelectMailNavOptions): Promise<void> {
    set({
      listKind: 'meta_folder',
      todoDueKind: null,
      selectedFolderId: null,
      selectedFolderAccountId: null,
      selectedMetaFolderId: metaFolderId,
      selectedMessageId: null,
      selectedMessage: null,
      expandedThreads: new Set<string>(),
      collapsedMailListGroupKeys: new Set<string>(),
      threadMessages: {},
      messages: [],
      loading: true,
      error: null
    })

    void window.mailClient.mail.setActiveFolder(null).catch(() => undefined)

    try {
      const messages = await window.mailClient.mail.listMetaFolderMessages(metaFolderId)
      set({ messages, loading: false })

      void loadCrossFolderThreadsUnified(messages, set)

      const pick = pickInitialMessageId(messages, opts?.preferredMessageId ?? null)
      if (pick != null) {
        await get().selectMessage(pick)
      } else {
        snapshotMailNavForPersist(get())
      }

      try {
        const todoCounts = await window.mailClient.mail.listTodoCounts()
        set({ todoCounts })
      } catch (e) {
        console.warn('[mail-store] listTodoCounts', e)
      }
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) })
    }
  },

  async createMetaFolder(input: MetaFolderCreateInput): Promise<MetaFolderSummary> {
    const created = await window.mailClient.mail.createMetaFolder(input)
    set((s) => {
      const next = [...s.metaFolders, created]
      next.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
      return { metaFolders: next }
    })
    return created
  },

  async deleteMetaFolder(metaFolderId: number): Promise<void> {
    await window.mailClient.mail.deleteMetaFolder(metaFolderId)
    const mf = await window.mailClient.mail.listMetaFolders()
    set({ metaFolders: mf })
    const st = get()
    if (st.listKind === 'meta_folder' && st.selectedMetaFolderId === metaFolderId) {
      await get().selectUnifiedInbox()
    }
  },

  async reorderMetaFolders(orderedIds: number[]): Promise<void> {
    await window.mailClient.mail.reorderMetaFolders(orderedIds)
    const mf = await window.mailClient.mail.listMetaFolders()
    set({ metaFolders: mf })
  },

  async selectMessage(messageId: number): Promise<void> {
    set({ selectedMessageId: messageId, messageLoading: true })
    try {
      const msg = await window.mailClient.mail.getMessage(messageId)
      set({ selectedMessage: msg, messageLoading: false })
      if (msg) snapshotMailNavForPersist(get())
    } catch (e) {
      console.error('[mail-store] selectMessage failed', e)
      set({ messageLoading: false, error: e instanceof Error ? e.message : String(e) })
    }
  },

  clearSelectedMessage(): void {
    set({ selectedMessageId: null, selectedMessage: null, messageLoading: false, threadMessages: {} })
  },

  async reloadSelectedMessageFromDb(): Promise<void> {
    const sid = get().selectedMessageId
    if (sid == null) return
    try {
      const fresh = await window.mailClient.mail.getMessage(sid)
      if (fresh) set({ selectedMessage: fresh })
    } catch (e) {
      console.warn('[mail-store] reloadSelectedMessageFromDb failed', e)
    }
  },

  async selectMessageWithThreadPreview(messageId: number): Promise<void> {
    set({ selectedMessageId: messageId, messageLoading: true })
    try {
      const msg = await window.mailClient.mail.getMessage(messageId)
      if (!msg) {
        set({ selectedMessage: null, messageLoading: false, threadMessages: {} })
        return
      }
      const tk = msg.remoteThreadId?.trim()
      if (!tk) {
        set({ selectedMessage: msg, messageLoading: false, threadMessages: {} })
        return
      }
      const list = await window.mailClient.mail
        .listMessagesByThreads({ accountId: msg.accountId, threadKeys: [tk] })
        .catch(() => [] as MailListItem[])
      const key = threadGroupingKey(msg, true)
      const sorted = [...list].sort((a, b) => {
        const ad = a.receivedAt ?? a.sentAt ?? ''
        const bd = b.receivedAt ?? b.sentAt ?? ''
        if (ad === bd) return 0
        return ad < bd ? 1 : -1
      })
      set({
        selectedMessage: msg,
        messageLoading: false,
        threadMessages: { [key]: sorted }
      })
    } catch (e) {
      console.error('[mail-store] selectMessageWithThreadPreview failed', e)
      set({ messageLoading: false, error: e instanceof Error ? e.message : String(e) })
    }
  },

  toggleThreadExpanded(threadKey: string): void {
    set((s) => {
      const next = new Set(s.expandedThreads)
      if (next.has(threadKey)) next.delete(threadKey)
      else next.add(threadKey)
      return { expandedThreads: next }
    })
  },

  toggleMailListGroupCollapsed(key: string): void {
    set((s) => {
      const next = new Set(s.collapsedMailListGroupKeys)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return { collapsedMailListGroupKeys: next }
    })
  },

  async triggerSync(accountId: string): Promise<void> {
    try {
      await window.mailClient.mail.syncAccount(accountId)
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },

  async refreshNow(): Promise<void> {
    const before = get()
    try {
      const folderId = before.listKind === 'folder' ? before.selectedFolderId : null
      await window.mailClient.mail.refreshNow(folderId)
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
      return
    }

    const st = get()
    const sid = st.selectedMessageId

    async function reloadCrossAccountView(load: () => Promise<MailListItem[]>): Promise<void> {
      const messages = await load()
      set({ messages })
      void loadCrossFolderThreadsUnified(messages, set)
      if (sid != null) {
        if (!messages.some((m) => m.id === sid)) {
          set({ selectedMessageId: null, selectedMessage: null })
        } else {
          const fresh = await window.mailClient.mail.getMessage(sid)
          if (fresh) set({ selectedMessage: fresh })
        }
      }
    }

    try {
      if (st.listKind === 'unified_inbox') {
        await reloadCrossAccountView(() => window.mailClient.mail.listUnifiedInbox())
      } else if (st.listKind === 'meta_folder' && st.selectedMetaFolderId != null) {
        const mfId = st.selectedMetaFolderId
        await reloadCrossAccountView(() => window.mailClient.mail.listMetaFolderMessages(mfId))
      }
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },

  async openMessageInFolder(messageId: number): Promise<void> {
    const full = await window.mailClient.mail.getMessage(messageId)
    if (!full) return
    const state = get()
    if (full.folderId == null) {
      // Mail hat (mehr) keinen Folder -> nur als single selection setzen.
      set({ selectedMessageId: messageId, selectedMessage: full })
      return
    }
    if (state.listKind === 'unified_inbox' || state.listKind === 'meta_folder') {
      await get().selectMessage(messageId)
      return
    }
    if (
      state.selectedFolderId !== full.folderId ||
      state.selectedFolderAccountId !== full.accountId
    ) {
      await get().selectFolder(full.accountId, full.folderId)
    }
    await get().selectMessage(messageId)
  },

  async setMessageRead(messageId: number, isRead: boolean): Promise<void> {
    const state = get()
    const previous = state.messages.find((m) => m.id === messageId)
    set((s) => ({
      messages: s.messages.map((m) => (m.id === messageId ? { ...m, isRead } : m)),
      selectedMessage:
        s.selectedMessage && s.selectedMessage.id === messageId
          ? { ...s.selectedMessage, isRead }
          : s.selectedMessage
    }))
    try {
      await window.mailClient.mail.setRead(messageId, isRead)
    } catch (e) {
      console.error('[mail-store] setMessageRead failed', e)
      if (previous) {
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === messageId ? { ...m, isRead: previous.isRead } : m
          ),
          selectedMessage:
            s.selectedMessage && s.selectedMessage.id === messageId
              ? { ...s.selectedMessage, isRead: previous.isRead }
              : s.selectedMessage,
          error: e instanceof Error ? e.message : String(e)
        }))
      }
    }
  },

  async toggleMessageFlag(messageId: number): Promise<void> {
    const state = get()
    const previous = state.messages.find((m) => m.id === messageId)
    const wasFlagged = previous?.isFlagged ?? false
    const nextFlagged = !wasFlagged

    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === messageId ? { ...m, isFlagged: nextFlagged } : m
      ),
      selectedMessage:
        s.selectedMessage && s.selectedMessage.id === messageId
          ? { ...s.selectedMessage, isFlagged: nextFlagged }
          : s.selectedMessage
    }))
    try {
      await window.mailClient.mail.setFlagged(messageId, nextFlagged)
    } catch (e) {
      console.error('[mail-store] toggleMessageFlag failed', e)
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === messageId ? { ...m, isFlagged: wasFlagged } : m
        ),
        selectedMessage:
          s.selectedMessage && s.selectedMessage.id === messageId
            ? { ...s.selectedMessage, isFlagged: wasFlagged }
            : s.selectedMessage,
        error: e instanceof Error ? e.message : String(e)
      }))
    }
  },

  async archiveMessage(messageId: number): Promise<void> {
    const state = get()
    const item = state.messages.find((m) => m.id === messageId)
    const subject = item?.subject ?? '(Mail)'
    advanceSelectionAfterRemoval(messageId, set, get)
    try {
      await window.mailClient.mail.archive(messageId)
      useUndoStore.getState().pushToast({
        label: `Archiviert: ${shorten(subject)}`,
        variant: 'success',
        onUndo: () => useUndoStore.getState().undoLast()
      })
    } catch (e) {
      console.error('[mail-store] archiveMessage failed', e)
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },

  async deleteMessage(messageId: number): Promise<void> {
    const state = get()
    const item = state.messages.find((m) => m.id === messageId)
    const subject = item?.subject ?? '(Mail)'
    const permanent =
      item != null && isMailInDeletedItemsFolder(item.folderId, state.foldersByAccount)
    advanceSelectionAfterRemoval(messageId, set, get)
    try {
      if (permanent) {
        await window.mailClient.mail.permanentDeleteMessage(messageId)
        useUndoStore.getState().pushToast({
          label: `Endgueltig geloescht: ${shorten(subject)}`,
          variant: 'success'
        })
      } else {
        await window.mailClient.mail.moveToTrash(messageId)
        useUndoStore.getState().pushToast({
          label: `Geloescht: ${shorten(subject)}`,
          variant: 'success',
          onUndo: () => useUndoStore.getState().undoLast()
        })
      }
    } catch (e) {
      console.error('[mail-store] deleteMessage failed', e)
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },

  async moveMessagesToFolder(messageIds: number[], targetFolderId: number): Promise<void> {
    const uniq = [...new Set(messageIds.filter((id) => Number.isFinite(id)))].map(Number)
    if (uniq.length === 0) return

    let targetFolder: MailFolder | null = null
    const st0 = get()
    for (const folders of Object.values(st0.foldersByAccount)) {
      const hit = folders.find((f) => f.id === targetFolderId)
      if (hit) {
        targetFolder = hit
        break
      }
    }
    if (!targetFolder) {
      const err = 'Zielordner nicht gefunden.'
      set({ error: err })
      useUndoStore.getState().pushToast({ label: err, variant: 'error' })
      return
    }

    const accountId = targetFolder.accountId
    let moved = 0
    const errs: string[] = []

    const ordered = [...uniq].sort((a, b) => {
      const ia = get().messages.findIndex((m) => m.id === a)
      const ib = get().messages.findIndex((m) => m.id === b)
      return (ia === -1 ? 99999 : ia) - (ib === -1 ? 99999 : ib)
    })

    for (const id of ordered) {
      const item = get().messages.find((m) => m.id === id)
      if (!item) continue
      if (item.accountId !== accountId) {
        if (!errs.some((x) => x.includes('Kontos')))
          errs.push('Nur Mails desselben Kontos wie der Zielordner koennen verschoben werden.')
        continue
      }
      if (item.folderId === targetFolderId) continue

      advanceSelectionAfterRemoval(id, set, get)
      try {
        await window.mailClient.mail.moveToFolder({ messageId: id, targetFolderId })
        moved++
      } catch (e) {
        console.error('[mail-store] moveMessagesToFolder failed', e)
        errs.push(e instanceof Error ? e.message : String(e))
      }
    }

    if (moved > 0) {
      touchRecentMailMoveFolder(accountId, targetFolderId)
      const fname = shorten(targetFolder.name, 44)
      useUndoStore.getState().pushToast({
        label:
          moved === 1
            ? `Nach „${fname}“ verschoben`
            : `${moved} Mails nach „${fname}“ verschoben`,
        variant: 'success',
        onUndo: moved === 1 ? () => useUndoStore.getState().undoLast() : undefined
      })
    }

    if (moved === 0 && errs.length > 0) {
      set({ error: errs[0] })
      useUndoStore.getState().pushToast({ label: errs[0] ?? 'Verschieben fehlgeschlagen', variant: 'error' })
    } else if (moved > 0 && errs.length > 0) {
      useUndoStore.getState().pushToast({
        label: `Teilweise verschoben (${moved} ok, ${errs.length} Fehler).`,
        variant: 'error'
      })
    }
  },

  async emptyTrashFolder(folderId: number): Promise<{ deletedRemote: number }> {
    try {
      const result = await window.mailClient.mail.emptyTrashFolder(folderId)
      await get().refreshNow()
      return result
    } catch (e) {
      console.error('[mail-store] emptyTrashFolder failed', e)
      set({ error: e instanceof Error ? e.message : String(e) })
      throw e
    }
  },

  async snoozeMessage(messageId: number, wakeAtIso: string, preset?: string): Promise<void> {
    const state = get()
    const item = state.messages.find((m) => m.id === messageId)
    const subject = item?.subject ?? '(Mail)'
    advanceSelectionAfterRemoval(messageId, set, get)
    try {
      await window.mailClient.mail.snooze(messageId, wakeAtIso, preset)
      const wake = formatSnoozeWake(wakeAtIso)
      useUndoStore.getState().pushToast({
        label: `Gesnoozt bis ${wake}: ${shorten(subject)}`,
        variant: 'success',
        onUndo: () => useUndoStore.getState().undoLast()
      })
    } catch (e) {
      console.error('[mail-store] snoozeMessage failed', e)
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },

  async unsnoozeMessage(messageId: number): Promise<void> {
    const state = get()
    const item = state.messages.find((m) => m.id === messageId)
    const subject = item?.subject ?? '(Mail)'
    advanceSelectionAfterRemoval(messageId, set, get)
    try {
      await window.mailClient.mail.unsnooze(messageId)
      useUndoStore.getState().pushToast({
        label: `Aus Snooze geholt: ${shorten(subject)}`,
        variant: 'success'
      })
    } catch (e) {
      console.error('[mail-store] unsnoozeMessage failed', e)
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },

  async setTodoForMessage(messageId: number, dueKind: TodoDueKindOpen): Promise<void> {
    const state = get()
    const item = state.messages.find((m) => m.id === messageId) ?? state.selectedMessage
    const subject = item?.subject ?? '(Mail)'
    try {
      await window.mailClient.mail.setTodoForMessage({ messageId, dueKind })
      useUndoStore.getState().pushToast({
        label: `ToDo (${todoDueKindShortLabel(dueKind)}): ${shorten(subject)}`,
        variant: 'success',
        onUndo: () => useUndoStore.getState().undoLast()
      })
      if (get().selectedMessageId === messageId) {
        const fresh = await window.mailClient.mail.getMessage(messageId)
        if (fresh) set({ selectedMessage: fresh })
      }
    } catch (e) {
      console.error('[mail-store] setTodoForMessage failed', e)
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },

  async setTodoScheduleForMessage(
    messageId: number,
    startIso: string,
    endIso: string,
    opts?: { skipSelectedRefresh?: boolean }
  ): Promise<void> {
    const state = get()
    const item = state.messages.find((m) => m.id === messageId) ?? state.selectedMessage
    const subject = item?.subject ?? '(Mail)'
    try {
      await window.mailClient.mail.setTodoScheduleForMessage({ messageId, startIso, endIso })
      useUndoStore.getState().pushToast({
        label: `ToDo-Termin: ${shorten(subject)}`,
        variant: 'success',
        onUndo: () => useUndoStore.getState().undoLast()
      })
      if (!opts?.skipSelectedRefresh) {
        await get().reloadSelectedMessageFromDb()
      }
    } catch (e) {
      console.error('[mail-store] setTodoScheduleForMessage failed', e)
      const msg = e instanceof Error ? e.message : String(e)
      set({ error: msg })
      throw e
    }
  },

  async completeTodoForMessage(messageId: number): Promise<void> {
    const state = get()
    const item = state.messages.find((m) => m.id === messageId) ?? state.selectedMessage
    const subject = item?.subject ?? '(Mail)'
    advanceSelectionAfterRemoval(messageId, set, get)
    try {
      await window.mailClient.mail.completeTodoForMessage(messageId)
      useUndoStore.getState().pushToast({
        label: `ToDo erledigt: ${shorten(subject)}`,
        variant: 'success',
        onUndo: () => useUndoStore.getState().undoLast()
      })
    } catch (e) {
      console.error('[mail-store] completeTodoForMessage failed', e)
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },

  async setWaitingForMessage(messageId: number, days = 7): Promise<void> {
    const state = get()
    const item = state.messages.find((m) => m.id === messageId) ?? state.selectedMessage
    const subject = item?.subject ?? '(Mail)'
    try {
      await window.mailClient.mail.setWaitingForMessage({ messageId, days })
      useUndoStore.getState().pushToast({
        label: `Warten auf Antwort (${days} T.): ${shorten(subject)}`,
        variant: 'success',
        onUndo: () => useUndoStore.getState().undoLast()
      })
      if (get().selectedMessageId === messageId) {
        const fresh = await window.mailClient.mail.getMessage(messageId)
        if (fresh) set({ selectedMessage: fresh })
      }
    } catch (e) {
      console.error('[mail-store] setWaitingForMessage failed', e)
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },

  async clearWaitingForMessage(messageId: number): Promise<void> {
    const state = get()
    const item = state.messages.find((m) => m.id === messageId) ?? state.selectedMessage
    const subject = item?.subject ?? '(Mail)'
    if (state.listKind === 'waiting') {
      advanceSelectionAfterRemoval(messageId, set, get)
    }
    try {
      await window.mailClient.mail.clearWaitingForMessage(messageId)
      useUndoStore.getState().pushToast({
        label: `Warten aufgehoben: ${shorten(subject)}`,
        variant: 'success',
        onUndo: () => useUndoStore.getState().undoLast()
      })
      if (get().selectedMessageId === messageId) {
        const fresh = await window.mailClient.mail.getMessage(messageId)
        if (fresh) set({ selectedMessage: fresh })
      }
    } catch (e) {
      console.error('[mail-store] clearWaitingForMessage failed', e)
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },

  async createFolder(
    accountId: string,
    parentFolderId: number | null,
    name: string
  ): Promise<MailFolder> {
    return window.mailClient.folder.create({ accountId, parentFolderId, name })
  },

  async renameFolder(folderId: number, name: string): Promise<void> {
    await window.mailClient.folder.rename(folderId, name)
  },

  async deleteFolder(folderId: number): Promise<void> {
    const state = get()
    const wasSelected = state.selectedFolderId === folderId
    if (wasSelected) {
      set({
        listKind: 'folder',
        todoDueKind: null,
        selectedFolderId: null,
        selectedFolderAccountId: null,
        selectedMetaFolderId: null,
        selectedMessageId: null,
        selectedMessage: null,
        messages: []
      })
      snapshotMailNavForPersist(get())
    }
    await window.mailClient.folder.delete(folderId)
  },

  async moveFolder(folderId: number, destinationFolderId: number | null): Promise<void> {
    await window.mailClient.folder.move(folderId, destinationFolderId)
  },

  setMailFilter(filter: MailFilter): void {
    set({ mailFilter: filter, collapsedMailListGroupKeys: new Set<string>() })
  },

  setMailListArrangeBy(v: MailListArrangeBy): void {
    set({ mailListArrangeBy: v, collapsedMailListGroupKeys: new Set<string>() })
  },

  setMailListChronoOrder(v: MailListChronoOrder): void {
    set({ mailListChronoOrder: v, collapsedMailListGroupKeys: new Set<string>() })
  },

  selectNextMessage(): void {
    const ids = buildNavigableMessageIds(get())
    if (ids.length === 0) return
    const currentId = get().selectedMessageId
    const idx = currentId != null ? ids.indexOf(currentId) : -1
    const nextId = idx === -1 ? ids[0]! : ids[Math.min(idx + 1, ids.length - 1)]!
    if (nextId === currentId) return
    void get().selectMessage(nextId)
  },

  selectPrevMessage(): void {
    const ids = buildNavigableMessageIds(get())
    if (ids.length === 0) return
    const currentId = get().selectedMessageId
    const idx = currentId != null ? ids.indexOf(currentId) : -1
    const prevId = idx === -1 ? ids[ids.length - 1]! : ids[Math.max(idx - 1, 0)]!
    if (prevId === currentId) return
    void get().selectMessage(prevId)
  },

  async toggleFolderFavorite(folderId: number, value: boolean): Promise<void> {
    // Optimistisch das Folder-Flag setzen, damit die Sidebar sofort umsortiert.
    set((s) => {
      const next: Record<string, MailFolder[]> = { ...s.foldersByAccount }
      for (const [accId, folders] of Object.entries(next)) {
        const idx = folders.findIndex((f) => f.id === folderId)
        if (idx !== -1) {
          next[accId] = folders.map((f) =>
            f.id === folderId ? { ...f, isFavorite: value } : f
          )
        }
      }
      return { foldersByAccount: next }
    })
    try {
      await window.mailClient.folder.toggleFavorite(folderId, value)
    } catch (e) {
      console.error('[mail-store] toggleFolderFavorite failed', e)
      // Rollback
      set((s) => {
        const next: Record<string, MailFolder[]> = { ...s.foldersByAccount }
        for (const [accId, folders] of Object.entries(next)) {
          const idx = folders.findIndex((f) => f.id === folderId)
          if (idx !== -1) {
            next[accId] = folders.map((f) =>
              f.id === folderId ? { ...f, isFavorite: !value } : f
            )
          }
        }
        return { foldersByAccount: next, error: e instanceof Error ? e.message : String(e) }
      })
    }
  }
}))

/** Offene ToDo-Buckets (ohne "done"), Reihenfolge entspricht der Sidebar. */
const OPEN_TODO_BUCKETS_FOR_UNIFIED_VIEW: TodoDueKindList[] = [
  'overdue',
  'today',
  'tomorrow',
  'this_week',
  'later'
]

/**
 * Lädt alle Mails mit gesetztem offenem ToDo-Bucket. Die Liste wird in der
 * Mailansicht über `mailListArrangeBy = 'todo_bucket'` nach Bucket gruppiert.
 */
export async function loadAllOpenTodoMessages(): Promise<MailListItem[]> {
  const lists = await Promise.all(
    OPEN_TODO_BUCKETS_FOR_UNIFIED_VIEW.map((dueKind) =>
      window.mailClient.mail
        .listTodoMessages({ accountId: null, dueKind, limit: 400 })
        .catch((e) => {
          console.warn('[mail-store] listTodoMessages bucket', dueKind, e)
          return [] as MailListItem[]
        })
    )
  )
  const seen = new Set<number>()
  const merged: MailListItem[] = []
  for (const list of lists) {
    for (const m of list) {
      if (seen.has(m.id)) continue
      seen.add(m.id)
      merged.push(m)
    }
  }
  return merged
}

type SetFn = (partial: Partial<MailState> | ((s: MailState) => Partial<MailState>)) => void

/**
 * Holt fuer alle Threads aus `messages` die zugehoerigen Mails ueber alle
 * Ordner des Accounts hinweg und schreibt sie in den `threadMessages`-Cache.
 * Damit werden gesendete Antworten im Posteingangs-Thread sichtbar.
 */
async function loadCrossFolderThreads(
  accountId: string,
  messages: MailListItem[],
  set: SetFn
): Promise<void> {
  const threadKeys = Array.from(
    new Set(
      messages
        .map((m) => m.remoteThreadId)
        .filter((k): k is string => typeof k === 'string' && k.length > 0)
    )
  )
  if (threadKeys.length === 0) {
    set({ threadMessages: {} })
    return
  }

  try {
    const all = await window.mailClient.mail.listMessagesByThreads({
      accountId,
      threadKeys
    })
    const grouped: Record<string, MailListItem[]> = {}
    for (const m of all) {
      const key = m.remoteThreadId
      if (!key) continue
      ;(grouped[key] ??= []).push(m)
    }
    for (const arr of Object.values(grouped)) {
      arr.sort((a, b) => {
        const ad = a.receivedAt ?? a.sentAt ?? ''
        const bd = b.receivedAt ?? b.sentAt ?? ''
        if (ad === bd) return 0
        return ad < bd ? 1 : -1
      })
    }
    set({ threadMessages: grouped })
  } catch (e) {
    console.warn('[mail-store] loadCrossFolderThreads failed:', e)
  }
}

async function loadCrossFolderThreadsUnified(
  messages: MailListItem[],
  set: SetFn
): Promise<void> {
  const byAccount = new Map<string, Set<string>>()
  for (const m of messages) {
    const tk = m.remoteThreadId
    if (!tk) continue
    let s = byAccount.get(m.accountId)
    if (!s) {
      s = new Set()
      byAccount.set(m.accountId, s)
    }
    s.add(tk)
  }
  if (byAccount.size === 0) {
    set({ threadMessages: {} })
    return
  }

  try {
    const grouped: Record<string, MailListItem[]> = {}
    for (const [accountId, keys] of byAccount) {
      const threadKeys = [...keys]
      if (threadKeys.length === 0) continue
      const all = await window.mailClient.mail.listMessagesByThreads({
        accountId,
        threadKeys
      })
      for (const m of all) {
        const composite = threadGroupingKey(m, true)
        ;(grouped[composite] ??= []).push(m)
      }
    }
    for (const k of Object.keys(grouped)) {
      const arr = grouped[k]!
      const seen = new Set<number>()
      const deduped = arr.filter((m) => {
        if (seen.has(m.id)) return false
        seen.add(m.id)
        return true
      })
      deduped.sort((a, b) => {
        const ad = a.receivedAt ?? a.sentAt ?? ''
        const bd = b.receivedAt ?? b.sentAt ?? ''
        if (ad === bd) return 0
        return ad < bd ? 1 : -1
      })
      grouped[k] = deduped
    }
    set({ threadMessages: grouped })
  } catch (e) {
    console.warn('[mail-store] loadCrossFolderThreadsUnified failed:', e)
    set({ threadMessages: {} })
  }
}

/**
 * Entfernt die Message optimistisch aus der Liste und waehlt die naechste
 * Mail als selectedMessage aus.
 */
function advanceSelectionAfterRemoval(
  messageId: number,
  set: (partial: Partial<MailState> | ((s: MailState) => Partial<MailState>)) => void,
  get: () => MailState
): void {
  const state = get()
  const idx = state.messages.findIndex((m) => m.id === messageId)
  if (idx === -1) return

  const nextList = state.messages.filter((m) => m.id !== messageId)
  const wasSelected = state.selectedMessageId === messageId

  let nextSelectedId: number | null = state.selectedMessageId
  if (wasSelected) {
    const next = nextList[idx] ?? nextList[idx - 1] ?? null
    nextSelectedId = next?.id ?? null
  }

  set({
    messages: nextList,
    selectedMessageId: nextSelectedId,
    selectedMessage: wasSelected ? null : state.selectedMessage
  })

  if (wasSelected && nextSelectedId != null) {
    void get().selectMessage(nextSelectedId)
  }
}
