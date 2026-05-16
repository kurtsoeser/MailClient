import type { MailFolder, MailListItem, TodoDueKindList, TodoDueKindOpen } from '@shared/types'
import {
  computeMailListLayout,
  filterMailListLayoutForCollapsedGroups,
  navigableIdsFromFlatRows,
  type MailListArrangeBy,
  type MailListChronoOrder
} from '@/lib/mail-list-arrange'
import { indexMessagesByThread } from '@/lib/thread-group'
import {
  buildMailboxFlagExcludedFolderIds,
  threadMatchesMailboxFlaggedFilter
} from '@/lib/mail-flagged-mailbox-view'
import { writeLastMailNav } from './mail-nav-persist'
import {
  mailListUsesCrossAccountThreadScope,
  type AccountListMetaEntry,
  type MailFilter,
  type MailListKind
} from './mail-store-types'

export interface MailNavPersistSlice {
  listKind: MailListKind
  todoDueKind: TodoDueKindList | null
  selectedFolderAccountId: string | null
  selectedFolderId: number | null
  selectedMetaFolderId: number | null
  selectedMessageId: number | null
}

export interface MailNavigableLayoutState {
  mailFilter: MailFilter
  listKind: MailListKind
  messages: MailListItem[]
  threadMessages: Record<string, MailListItem[]>
  selectedFolderAccountId: string | null
  selectedFolderId: number | null
  foldersByAccount: Record<string, MailFolder[]>
  expandedThreads: Set<string>
  mailListArrangeBy: MailListArrangeBy
  mailListChronoOrder: MailListChronoOrder
  /** Eingeklappte Gruppen in der Mailliste (Schluessel via `mailListGroupCollapseKey`). */
  collapsedMailListGroupKeys: Set<string>
  accountListMeta: Record<string, AccountListMetaEntry>
  /** Filter „Kennzeichnung (Postfach)“: Geloescht/Junk ausblenden. */
  flaggedFilterExcludeDeletedJunk: boolean
}

export function pickInitialMessageId(
  messages: MailListItem[],
  preferred?: number | null
): number | null {
  if (preferred != null && preferred > 0 && messages.some((m) => m.id === preferred)) {
    return preferred
  }
  return messages[0]?.id ?? null
}

export function snapshotMailNavForPersist(state: MailNavPersistSlice): void {
  writeLastMailNav({
    v: 1,
    listKind: state.listKind,
    todoDueKind: state.todoDueKind,
    folderAccountId: state.selectedFolderAccountId,
    folderId: state.selectedFolderId,
    metaFolderId: state.listKind === 'meta_folder' ? state.selectedMetaFolderId : null,
    selectedMessageId: state.selectedMessageId
  })
}

export function isMailInDeletedItemsFolder(
  folderId: number | null | undefined,
  foldersByAccount: Record<string, MailFolder[]>
): boolean {
  if (folderId == null) return false
  for (const folders of Object.values(foldersByAccount)) {
    const f = folders.find((x) => x.id === folderId)
    if (f) return f.wellKnown === 'deleteditems'
  }
  return false
}

export function shorten(text: string, max = 50): string {
  if (text.length <= max) return text
  return text.slice(0, max - 1) + '...'
}

export function todoDueKindShortLabel(kind: TodoDueKindOpen): string {
  switch (kind) {
    case 'today':
      return 'Heute'
    case 'tomorrow':
      return 'Morgen'
    case 'this_week':
      return 'Woche'
    case 'later':
      return 'Später'
    default:
      return kind
  }
}

export function formatSnoozeWake(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleString('de-DE', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return iso
  }
}

/**
 * Baut die Liste navigierbarer Message-IDs in der Reihenfolge auf, in der
 * sie in der Mailliste sichtbar sind.
 */
export function buildNavigableMessageIds(state: MailNavigableLayoutState): number[] {
  const filter = state.mailFilter
  const scoped = mailListUsesCrossAccountThreadScope(state.listKind)
  const { threads, messagesByThread } = indexMessagesByThread(
    state.messages,
    state.threadMessages,
    scoped
  )
  const excludedFolderIds = buildMailboxFlagExcludedFolderIds(state.foldersByAccount)
  const filtered = threads.filter((t) => {
    if (filter === 'unread') return t.unreadCount > 0
    if (filter === 'flagged')
      return threadMatchesMailboxFlaggedFilter(
        t,
        messagesByThread,
        excludedFolderIds,
        state.flaggedFilterExcludeDeletedJunk
      )
    if (filter === 'with_todo') return t.openTodoDueKind != null
    return true
  })

  const folderWellKnown =
    state.listKind === 'folder' && state.selectedFolderAccountId && state.selectedFolderId
      ? state.foldersByAccount[state.selectedFolderAccountId]?.find(
          (f) => f.id === state.selectedFolderId
        )?.wellKnown ?? null
      : null

  const ctx = {
    folderWellKnown,
    accountLabel: (accountId: string): string => {
      const m = state.accountListMeta[accountId]
      return m?.email || m?.displayName || accountId
    }
  }

  const { groupLabels, groupCounts, flatRows } = computeMailListLayout(
    filtered,
    messagesByThread,
    state.expandedThreads,
    state.mailListArrangeBy,
    state.mailListChronoOrder,
    ctx
  )
  const { visibleFlatRows } = filterMailListLayoutForCollapsedGroups(
    groupLabels,
    groupCounts,
    flatRows,
    state.mailListArrangeBy,
    state.collapsedMailListGroupKeys
  )
  return navigableIdsFromFlatRows(visibleFlatRows)
}
