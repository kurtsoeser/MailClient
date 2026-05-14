import { useCallback, useMemo, useState } from 'react'
import { GroupedVirtuoso } from 'react-virtuoso'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { outlookCategoryDotClass } from '@/lib/outlook-category-colors'
import { useMailStore, type MailFilter, type MailListKind, mailListUsesCrossAccountThreadScope } from '@/stores/mail'
import { showAppConfirm } from '@/stores/app-dialog'
import { useAccountsStore } from '@/stores/accounts'
import { useComposeStore } from '@/stores/compose'
import { useSnoozeUiStore } from '@/stores/snooze-ui'
import { useUndoStore } from '@/stores/undo'
import { indexMessagesByThread, type ThreadGroup } from '@/lib/thread-group'
import {
  dedupeMailListThreadMessagesById,
  MAIL_LIST_UNIFIED_INBOX_STRIPE_BAR
} from '@/lib/mail-list-ui'
import { MIME_THREAD_IDS } from '@/lib/workflow-dnd'
import {
  computeMailListLayout,
  filterMailListLayoutForCollapsedGroups,
  mailListGroupCollapseKey
} from '@/lib/mail-list-arrange'
import { ContextMenu, type ContextMenuItem } from '@/components/ContextMenu'
import {
  buildMailContextItems,
  buildMailCategorySubmenuItems,
  type MailContextHandlers
} from '@/lib/mail-context-menu'
import { MailMoveSubmenuPanel } from '@/components/MailMoveSubmenuPanel'
import { MailDestinationFolderDialog } from '@/components/MailDestinationFolderDialog'
import { ObjectNoteDialog, type ObjectNoteTarget } from '@/components/ObjectNoteEditor'
import { Avatar } from '@/components/Avatar'
import { AccountColorStripe } from '@/components/AccountColorStripe'
import { resolvedAccountColorCss } from '@/lib/avatar-color'
import { profilePhotoSrcForEmail } from '@/lib/contact-avatar'
import { StatusDot } from '@/components/StatusDot'
import { MailListViewMenu } from '@/components/MailListViewMenu'
import { moduleColumnHeaderMailListRowClass } from '@/components/ModuleColumnHeader'
import { TodoDueBucketBadge } from '@/components/TodoDueBucketBadge'
import { parseOpenTodoDueKind } from '@/lib/todo-due-bucket'
import type { ConnectedAccount, MailFolder, MailListItem, TodoDueKindList } from '@shared/types'
import i18n from '@/i18n'
import {
  Paperclip,
  Star,
  Loader2,
  ChevronRight,
  ChevronDown,
  MessagesSquare,
  Reply,
  Archive,
  Trash2,
  Clock
} from 'lucide-react'

interface MailContextState {
  x: number
  y: number
  items: ContextMenuItem[]
}

type MailListContextOpts = {
  applyToMessageIds?: number[]
  threadMessagesForContext?: MailListItem[]
}

function resolveContextTargetIds(message: MailListItem, applyToMessageIds?: number[]): number[] {
  const raw = applyToMessageIds?.filter((id) => Number.isFinite(id)) ?? []
  if (raw.length === 0) return [message.id]
  return [...new Set(raw)]
}

function resolveContextMsgs(
  message: MailListItem,
  threadMessagesForContext?: MailListItem[]
): MailListItem[] {
  if (threadMessagesForContext && threadMessagesForContext.length > 0) return threadMessagesForContext
  return [message]
}

interface MailRowHandlers {
  onReply: (e: React.MouseEvent, msg: MailListItem) => void
  onArchive: (e: React.MouseEvent, msg: MailListItem, bulkThread?: MailListItem[]) => void
  onDelete: (e: React.MouseEvent, msg: MailListItem, bulkThread?: MailListItem[]) => void
  onToggleFlag: (e: React.MouseEvent, msg: MailListItem, bulkThread?: MailListItem[]) => void
}

export function MailList(): JSX.Element {
  const { t } = useTranslation()
  const messages = useMailStore((s) => s.messages)
  const threadMessages = useMailStore((s) => s.threadMessages)
  const selectedMessageId = useMailStore((s) => s.selectedMessageId)
  const selectFolderId = useMailStore((s) => s.selectedFolderId)
  const selectFolderAccountId = useMailStore((s) => s.selectedFolderAccountId)
  const listKind = useMailStore((s) => s.listKind)
  const todoDueKind = useMailStore((s) => s.todoDueKind)
  const loading = useMailStore((s) => s.loading)
  const selectMessage = useMailStore((s) => s.selectMessage)
  const expandedThreads = useMailStore((s) => s.expandedThreads)
  const toggleThreadExpanded = useMailStore((s) => s.toggleThreadExpanded)
  const setMessageRead = useMailStore((s) => s.setMessageRead)
  const toggleMessageFlag = useMailStore((s) => s.toggleMessageFlag)
  const archiveMessage = useMailStore((s) => s.archiveMessage)
  const deleteMessage = useMailStore((s) => s.deleteMessage)
  const moveMessagesToFolder = useMailStore((s) => s.moveMessagesToFolder)
  const syncByAccount = useMailStore((s) => s.syncByAccount)
  const accounts = useAccountsStore((s) => s.accounts)
  const profilePhotoDataUrls = useAccountsStore((s) => s.profilePhotoDataUrls)
  const foldersByAccount = useMailStore((s) => s.foldersByAccount)
  const metaFolders = useMailStore((s) => s.metaFolders)
  const selectedMetaFolderId = useMailStore((s) => s.selectedMetaFolderId)
  const openReply = useComposeStore((s) => s.openReply)
  const openForward = useComposeStore((s) => s.openForward)
  const setWaitingForMessage = useMailStore((s) => s.setWaitingForMessage)
  const clearWaitingForMessage = useMailStore((s) => s.clearWaitingForMessage)
  const setTodoForMessage = useMailStore((s) => s.setTodoForMessage)
  const completeTodoForMessage = useMailStore((s) => s.completeTodoForMessage)
  const refreshNow = useMailStore((s) => s.refreshNow)
  const emptyTrashFolder = useMailStore((s) => s.emptyTrashFolder)
  const openSnoozePicker = useSnoozeUiStore((s) => s.open)

  const [contextMenu, setContextMenu] = useState<MailContextState | null>(null)
  const [moveFolderPicker, setMoveFolderPicker] = useState<{
    accountId: string
    messageIds: number[]
  } | null>(null)
  const [noteTarget, setNoteTarget] = useState<ObjectNoteTarget | null>(null)
  const [emptyingTrash, setEmptyingTrash] = useState(false)
  const filter = useMailStore((s) => s.mailFilter)
  const setFilter = useMailStore((s) => s.setMailFilter)
  const mailListArrangeBy = useMailStore((s) => s.mailListArrangeBy)
  const mailListChronoOrder = useMailStore((s) => s.mailListChronoOrder)
  const setMailListArrangeBy = useMailStore((s) => s.setMailListArrangeBy)
  const setMailListChronoOrder = useMailStore((s) => s.setMailListChronoOrder)
  const collapsedMailListGroupKeys = useMailStore((s) => s.collapsedMailListGroupKeys)
  const toggleMailListGroupCollapsed = useMailStore((s) => s.toggleMailListGroupCollapsed)

  async function withFullMessage<T>(
    messageId: number,
    fn: (msg: import('@shared/types').MailFull) => Promise<T> | T
  ): Promise<T | void> {
    const full = await window.mailClient.mail.getMessage(messageId)
    if (!full) return
    return fn(full)
  }

  function openReplyForMessage(messageId: number): void {
    void withFullMessage(messageId, (full) => openReply('reply', full))
  }

  const mailContextHandlers = useMemo<MailContextHandlers>(
    () => ({
      openReply,
      openForward,
      openNote: (message): void => {
        void selectMessage(message.id)
        setNoteTarget({
          kind: 'mail',
          messageId: message.id,
          title: message.subject || t('common.noSubject')
        })
      },
      setMessageRead,
      toggleMessageFlag,
      archiveMessage,
      deleteMessage,
      setTodoForMessage,
      completeTodoForMessage,
      setWaitingForMessage,
      clearWaitingForMessage,
      openSnoozePicker,
      refreshNow
    }),
    [
      openReply,
      openForward,
      selectMessage,
      t,
      setMessageRead,
      toggleMessageFlag,
      archiveMessage,
      deleteMessage,
      setTodoForMessage,
      completeTodoForMessage,
      setWaitingForMessage,
      clearWaitingForMessage,
      openSnoozePicker,
      refreshNow
    ]
  )

  const rowActions: MailRowHandlers = {
    onReply: (e, m): void => {
      e.stopPropagation()
      openReplyForMessage(m.id)
    },
    onArchive: (e, m, bulk): void => {
      e.stopPropagation()
      const targets =
        bulk && bulk.length > 1 ? dedupeMailListThreadMessagesById(bulk) : [m]
      void (async (): Promise<void> => {
        for (const x of targets) await archiveMessage(x.id)
      })()
    },
    onDelete: (e, m, bulk): void => {
      e.stopPropagation()
      const targets =
        bulk && bulk.length > 1 ? dedupeMailListThreadMessagesById(bulk) : [m]
      void (async (): Promise<void> => {
        for (const x of targets) await deleteMessage(x.id)
      })()
    },
    onToggleFlag: (e, m, bulk): void => {
      e.stopPropagation()
      const targets =
        bulk && bulk.length > 1 ? dedupeMailListThreadMessagesById(bulk) : [m]
      if (targets.length === 1) {
        void toggleMessageFlag(m.id)
        return
      }
      const allFlagged = targets.every((x) => x.isFlagged)
      void (async (): Promise<void> => {
        for (const x of targets) {
          if (allFlagged && x.isFlagged) await toggleMessageFlag(x.id)
          if (!allFlagged && !x.isFlagged) await toggleMessageFlag(x.id)
        }
      })()
    }
  }

  const account =
    listKind === 'folder'
      ? accounts.find((a) => a.id === selectFolderAccountId)
      : mailListUsesCrossAccountThreadScope(listKind)
        ? null
        : (accounts.find((a) => a.id === messages[0]?.accountId) ?? accounts[0])
  const folder =
    listKind === 'folder' && account
      ? foldersByAccount[account.id]?.find((f) => f.id === selectFolderId)
      : null

  const openMailContext = useCallback(
    async (
      e: React.MouseEvent,
      message: MailListItem,
      opts?: MailListContextOpts
    ): Promise<void> => {
      e.preventDefault()
      e.stopPropagation()
      const anchor = { x: e.clientX, y: e.clientY }
      const ui = {
        snoozeAnchor: anchor,
        applyToMessageIds: opts?.applyToMessageIds,
        threadMessagesForContext: opts?.threadMessagesForContext
      }
      const cat = await buildMailCategorySubmenuItems(message, ui, refreshNow)

      const ctxMsgs = resolveContextMsgs(message, opts?.threadMessagesForContext)
      const targetIds = resolveContextTargetIds(message, opts?.applyToMessageIds)
      const ctxAccountIds = new Set(ctxMsgs.map((m) => m.accountId))
      const primaryAcc = accounts.find((a) => a.id === message.accountId)
      const canMoveToFolder =
        ctxAccountIds.size === 1 &&
        (primaryAcc?.provider === 'microsoft' || primaryAcc?.provider === 'google')

      const moveSubmenuContent =
        canMoveToFolder && primaryAcc
          ? (
              <MailMoveSubmenuPanel
                messageIds={targetIds}
                accountId={message.accountId}
                folders={foldersByAccount[message.accountId] ?? []}
                isGmail={primaryAcc.provider === 'google'}
                onCloseRoot={(): void => setContextMenu(null)}
                onBrowseOther={(): void =>
                  setMoveFolderPicker({
                    accountId: message.accountId,
                    messageIds: targetIds
                  })
                }
              />
            )
          : undefined

      const items = buildMailContextItems(message, mailContextHandlers, {
        ...ui,
        categorySubmenu: cat.length > 0 ? cat : undefined,
        deletedItemsFolder: listKind === 'folder' && folder?.wellKnown === 'deleteditems',
        moveSubmenuContent,
        t
      })
      setContextMenu({ x: anchor.x, y: anchor.y, items })
    },
    [mailContextHandlers, refreshNow, listKind, folder, t, accounts, foldersByAccount]
  )

  const sync =
    mailListUsesCrossAccountThreadScope(listKind)
      ? (Object.values(syncByAccount).find((s) => s.state.startsWith('syncing')) ??
        Object.values(syncByAccount).find((s) => s.state === 'error') ??
        null)
      : account
        ? syncByAccount[account.id]
        : null

  const metaFolderTitle = useMemo((): string => {
    if (listKind !== 'meta_folder' || selectedMetaFolderId == null) return t('mail.list.metaFolder')
    return metaFolders.find((m) => m.id === selectedMetaFolderId)?.name ?? t('mail.list.metaFolder')
  }, [listKind, selectedMetaFolderId, metaFolders, t])

  const folderTitle =
    listKind === 'waiting'
      ? t('mail.list.waitingTitle')
      : listKind === 'snoozed'
        ? t('mail.list.snoozedTitle')
        : listKind === 'unified_inbox'
          ? t('mail.list.unifiedInbox')
          : listKind === 'meta_folder'
            ? metaFolderTitle
            : listKind === 'todo'
              ? todoDueKind
                ? t(`mail.todoViewTitle.${todoDueKind}`)
                : t('mail.todoViewTitle.unified')
              : folder
                ? folder.wellKnown === 'inbox'
                  ? t('mail.list.wellKnownInbox')
                  : folder.name
                : t('mail.list.noSelection')

  const { threads, messagesByThread } = useMemo(
    () =>
      indexMessagesByThread(messages, threadMessages, mailListUsesCrossAccountThreadScope(listKind)),
    [messages, threadMessages, listKind]
  )

  const filterCounts = useMemo(() => {
    let unread = 0
    let flagged = 0
    let withTodo = 0
    for (const t of threads) {
      if (t.unreadCount > 0) unread++
      if (t.isFlagged) flagged++
      if (t.openTodoDueKind != null) withTodo++
    }
    return { all: threads.length, unread, flagged, withTodo }
  }, [threads])

  const filteredThreads = useMemo(() => {
    if (filter === 'all') return threads
    if (filter === 'unread') return threads.filter((t) => t.unreadCount > 0)
    if (filter === 'flagged') return threads.filter((t) => t.isFlagged)
    if (filter === 'with_todo') return threads.filter((t) => t.openTodoDueKind != null)
    return threads
  }, [threads, filter])

  const accountById = useMemo(
    () => new Map(accounts.map((a) => [a.id, a] as const)),
    [accounts]
  )

  const arrangeCtx = useMemo(
    () => ({
      folderWellKnown:
        listKind === 'folder' && folder ? (folder.wellKnown ?? null) : null,
      accountLabel: (id: string): string => {
        const a = accountById.get(id)
        return a?.email ?? a?.displayName ?? id
      },
      todoDueBucketLabel: (kind: TodoDueKindList): string => t(`mail.todoBucket.${kind}`),
      noOpenTodoLabel: t('mail.noOpenTodo')
    }),
    [listKind, folder, accountById, t]
  )

  const { groupLabels, groupCounts, groupTodoDueKinds, flatRows } = useMemo(
    () =>
      computeMailListLayout(
        filteredThreads,
        messagesByThread,
        expandedThreads,
        mailListArrangeBy,
        mailListChronoOrder,
        arrangeCtx
      ),
    [
      filteredThreads,
      messagesByThread,
      expandedThreads,
      mailListArrangeBy,
      mailListChronoOrder,
      arrangeCtx
    ]
  )

  const { visibleGroupCounts, visibleFlatRows } = useMemo(
    () =>
      filterMailListLayoutForCollapsedGroups(
        groupLabels,
        groupCounts,
        flatRows,
        mailListArrangeBy,
        collapsedMailListGroupKeys
      ),
    [
      groupLabels,
      groupCounts,
      flatRows,
      mailListArrangeBy,
      collapsedMailListGroupKeys
    ]
  )

  return (
    <section className="glass-fill flex h-full w-full flex-col">
      <div className={moduleColumnHeaderMailListRowClass}>
        <div className="flex min-w-0 shrink-0 items-center gap-2">
          {mailListUsesCrossAccountThreadScope(listKind) ? (
            <span className="flex shrink-0 -space-x-0.5" title={t('mail.list.accountColorsTitle')}>
              {accounts.map((a) => (
                <span
                  key={a.id}
                  className="inline-block h-2 w-2 shrink-0 rounded-full ring-1 ring-card"
                  style={{ backgroundColor: resolvedAccountColorCss(a.color) }}
                  title={a.email}
                />
              ))}
            </span>
          ) : account ? (
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: resolvedAccountColorCss(account.color) }}
              title={account.email}
            />
          ) : null}
          <span className="shrink-0 font-semibold text-foreground">{folderTitle}</span>
          {sync && sync.state.startsWith('syncing') && (
            <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
          )}
          {listKind === 'folder' && folder?.wellKnown === 'deleteditems' && selectFolderId != null ? (
            <button
              type="button"
              disabled={loading || emptyingTrash || filteredThreads.length === 0}
              className={cn(
                'ml-1 shrink-0 rounded border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive',
                'hover:bg-destructive/20 disabled:pointer-events-none disabled:opacity-40'
              )}
              onClick={(): void => {
                void (async (): Promise<void> => {
                  const ok = await showAppConfirm(
                    t('mail.list.emptyTrashConfirm'),
                    {
                      title: t('mail.list.emptyTrashTitle'),
                      variant: 'danger',
                      confirmLabel: t('mail.list.emptyTrashConfirmLabel')
                    }
                  )
                  if (!ok) return
                  setEmptyingTrash(true)
                  void emptyTrashFolder(selectFolderId)
                    .then((r) => {
                      useUndoStore.getState().pushToast({
                        label:
                          r.deletedRemote === 0
                            ? t('mail.list.emptyTrashAlreadyEmpty')
                            : r.deletedRemote === 1
                              ? t('mail.list.emptyTrashDoneOne')
                              : t('mail.list.emptyTrashDoneMany', { count: r.deletedRemote }),
                        variant: 'success'
                      })
                    })
                    .catch(() => undefined)
                    .finally(() => setEmptyingTrash(false))
                })()
              }}
            >
              {emptyingTrash ? (
                <span className="inline-flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {t('mail.list.emptyTrashBusy')}
                </span>
              ) : (
                t('mail.list.emptyTrashButton')
              )}
            </button>
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <MailListViewMenu
            arrange={mailListArrangeBy}
            chrono={mailListChronoOrder}
            filter={filter}
            filterCounts={filterCounts}
            onArrangeChange={setMailListArrangeBy}
            onChronoChange={setMailListChronoOrder}
            onFilterChange={setFilter}
            disabled={loading}
          />
        </div>
        <div className="shrink-0 text-[10px] text-muted-foreground">
          {filteredThreads.length}{' '}
          {filteredThreads.length === 1
            ? t('mail.list.conversation_one')
            : t('mail.list.conversation_other')}
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t('mail.list.loadingMails')}
          </div>
        ) : flatRows.length === 0 ? (
          <EmptyHint
            sync={sync}
            hasFolder={Boolean(folder) || mailListUsesCrossAccountThreadScope(listKind)}
            filter={filter}
            totalThreads={threads.length}
            listKind={listKind}
          />
        ) : (
          <GroupedVirtuoso
            style={{ height: '100%' }}
            groupCounts={visibleGroupCounts}
            computeItemKey={(index): string => visibleFlatRows[index]?.key ?? `idx:${index}`}
            groupContent={(groupIndex): JSX.Element => {
              const todoKind =
                mailListArrangeBy === 'todo_bucket' ? groupTodoDueKinds[groupIndex] : null
              const label = groupLabels[groupIndex] ?? ''
              const collapseKey = mailListGroupCollapseKey(mailListArrangeBy, groupIndex, label)
              const collapsed = collapsedMailListGroupKeys.has(collapseKey)
              return (
                <button
                  type="button"
                  aria-expanded={!collapsed}
                  className="flex w-full items-center gap-1.5 bg-card/95 px-2 py-1.5 text-left backdrop-blur hover:bg-muted/20"
                  onClick={(e): void => {
                    e.preventDefault()
                    e.stopPropagation()
                    toggleMailListGroupCollapsed(collapseKey)
                  }}
                >
                  {collapsed ? (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                  {todoKind != null ? (
                    <TodoDueBucketBadge kind={todoKind} />
                  ) : (
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {label}
                    </span>
                  )}
                </button>
              )
            }}
            itemContent={(index): JSX.Element => {
              const row = visibleFlatRows[index]
              if (!row) return <div />
              if (row.kind === 'thread-head') {
                const t = row.thread
                const isExpanded = expandedThreads.has(t.threadKey)
                const threadSelected = row.threadMessages.some(
                  (m) => m.id === selectedMessageId
                )
                return (
                  <ThreadHeadRow
                    thread={t}
                    threadMessages={row.threadMessages}
                    account={accountById.get(t.accountId) ?? null}
                    accounts={accounts}
                    profilePhotoDataUrls={profilePhotoDataUrls}
                    showInboxAccountStripe={mailListUsesCrossAccountThreadScope(listKind)}
                    expanded={isExpanded}
                    threadSelected={threadSelected}
                    headSelected={t.latestMessage.id === selectedMessageId}
                    onToggleExpand={(): void => toggleThreadExpanded(t.threadKey)}
                    onSelectMessage={(id): void => {
                      void selectMessage(id)
                    }}
                    onContextMail={openMailContext}
                    rowActions={rowActions}
                  />
                )
              }
              // thread-sub
                return (
                  <ThreadSubRow
                    message={row.message}
                    accounts={accounts}
                    foldersByAccount={foldersByAccount}
                    showInboxAccountStripe={mailListUsesCrossAccountThreadScope(listKind)}
                    selected={row.message.id === selectedMessageId}
                    onSelectMessage={(id): void => {
                      void selectMessage(id)
                    }}
                    onContextMail={openMailContext}
                    rowActions={rowActions}
                  />
                )
            }}
          />
        )}
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={(): void => setContextMenu(null)}
        />
      )}
      <ObjectNoteDialog target={noteTarget} onClose={(): void => setNoteTarget(null)} />
      <MailDestinationFolderDialog
        open={moveFolderPicker != null}
        folders={moveFolderPicker ? foldersByAccount[moveFolderPicker.accountId] ?? [] : []}
        onClose={(): void => setMoveFolderPicker(null)}
        onPick={async (folderId): Promise<void> => {
          const pick = moveFolderPicker
          if (!pick) return
          await moveMessagesToFolder(pick.messageIds, folderId)
        }}
      />
    </section>
  )
}

function findFolderForMessage(
  message: MailListItem,
  foldersByAccount: Record<string, MailFolder[]>
): MailFolder | null {
  const fid = message.folderId
  if (fid == null) return null
  return foldersByAccount[message.accountId]?.find((f) => f.id === fid) ?? null
}

function wellKnownFolderTitle(wellKnown: string | null, fallbackName: string, tr: (k: string) => string): string {
  const w = (wellKnown ?? '').toLowerCase()
  if (w === 'inbox') return tr('topbar.folderInbox')
  if (w === 'sentitems') return tr('topbar.folderSent')
  if (w === 'drafts') return tr('topbar.folderDrafts')
  if (w === 'deleteditems') return tr('topbar.folderDeleted')
  if (w === 'junkemail') return tr('mail.list.folderJunk')
  if (w === 'archive') return tr('topbar.folderArchive')
  return fallbackName
}

function threadSubFirstToDisplay(toAddrs: string | null | undefined): string {
  if (!toAddrs?.trim()) return ''
  const first = toAddrs.split(/[;,]/)[0]?.trim() ?? ''
  if (!first) return ''
  const m = first.match(/<([^>]+)>/)
  const raw = (m?.[1] ?? first).trim()
  return raw.length > 0 ? raw : ''
}

function messageListDateIso(m: MailListItem): string | null {
  const iso = m.receivedAt ?? m.sentAt
  return iso && iso.trim().length > 0 ? iso : null
}

function ThreadHeadRow({
  thread,
  threadMessages,
  account,
  accounts,
  profilePhotoDataUrls,
  showInboxAccountStripe,
  expanded,
  threadSelected,
  headSelected,
  onToggleExpand,
  onSelectMessage,
  onContextMail,
  rowActions
}: {
  thread: ThreadGroup
  threadMessages: MailListItem[]
  account: ConnectedAccount | null
  accounts: ConnectedAccount[]
  profilePhotoDataUrls: Record<string, string>
  showInboxAccountStripe: boolean
  expanded: boolean
  threadSelected: boolean
  headSelected: boolean
  onToggleExpand: () => void
  onSelectMessage: (id: number) => void
  onContextMail: (e: React.MouseEvent, msg: MailListItem, opts?: MailListContextOpts) => void
  rowActions: MailRowHandlers
}): JSX.Element {
  const { t } = useTranslation()
  const latest = thread.latestMessage
  const root = thread.rootMessage
  const senderPhoto = profilePhotoSrcForEmail(accounts, profilePhotoDataUrls, root.fromAddr)
  const hasMultiple = thread.messageCount > 1
  const outlookExpandHeader = hasMultiple && expanded
  const dateIso = messageListDateIso(latest)
  const date = dateIso ? formatDate(dateIso) : ''
  const isUnread = thread.unreadCount > 0
  const senderLabel =
    hasMultiple && thread.participantNames.length > 1
      ? formatParticipants(thread.participantNames)
      : root.fromName || root.fromAddr || t('common.unknown')

  const threadBulkMsgs = useMemo((): MailListItem[] | undefined => {
    if (!hasMultiple) return undefined
    const deduped = dedupeMailListThreadMessagesById(threadMessages)
    return deduped.length > 1 ? deduped : undefined
  }, [hasMultiple, threadMessages])

  const threadContextOpts = useMemo((): MailListContextOpts | undefined => {
    if (!threadBulkMsgs) return undefined
    return {
      applyToMessageIds: threadBulkMsgs.map((m) => m.id),
      threadMessagesForContext: threadBulkMsgs
    }
  }, [threadBulkMsgs])

  const conversationDragIds = useMemo((): number[] => {
    const deduped = dedupeMailListThreadMessagesById(threadMessages)
    return deduped.map((m) => m.id)
  }, [threadMessages])

  function handleHeaderClick(): void {
    if (hasMultiple) {
      onToggleExpand()
      if (!expanded && !threadSelected) {
        onSelectMessage(latest.id)
      }
    } else {
      onSelectMessage(latest.id)
    }
  }

  return (
    <div
      draggable
      onDragStart={(e): void => {
        const payload = JSON.stringify(conversationDragIds)
        e.dataTransfer.setData(MIME_THREAD_IDS, payload)
        e.dataTransfer.setData('text/plain', conversationDragIds.join(','))
        e.dataTransfer.setData('text/mailclient-message-id', String(latest.id))
        e.dataTransfer.setData('application/x-mailclient-message-id', String(latest.id))
        e.dataTransfer.effectAllowed = 'move'
      }}
      onContextMenu={(e): void => {
        void onContextMail(e, latest, threadContextOpts)
      }}
      className={cn(
        'group/row relative flex w-full items-start gap-2.5 border-b border-border/40 px-3 transition-colors',
        outlookExpandHeader ? 'py-1.5' : 'py-2.5',
        latest.isVipSender && 'ring-1 ring-amber-500/35 ring-inset',
        headSelected
          ? 'bg-secondary'
          : threadSelected && !headSelected
            ? outlookExpandHeader
              ? 'bg-secondary/30'
              : 'bg-secondary/40'
            : 'hover:bg-secondary/40',
        'cursor-grab active:cursor-grabbing'
      )}
      title={
        showInboxAccountStripe && account
          ? t('mail.list.inboxStripeTitle', { name: account.displayName, email: account.email })
          : undefined
      }
    >
      {showInboxAccountStripe && account && (
        <AccountColorStripe color={account.color} className={MAIL_LIST_UNIFIED_INBOX_STRIPE_BAR} />
      )}
      <button
        type="button"
        onClick={(e): void => {
          e.stopPropagation()
          if (hasMultiple) onToggleExpand()
        }}
        className={cn(
          'flex h-4 w-3.5 shrink-0 items-center justify-center text-muted-foreground/70',
          outlookExpandHeader ? 'mt-0.5' : 'mt-2',
          !hasMultiple && 'pointer-events-none opacity-0'
        )}
        aria-label={expanded ? t('mail.list.expandThreadCollapse') : t('mail.list.expandThreadExpand')}
      >
        {hasMultiple &&
          (expanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          ))}
      </button>

      {!outlookExpandHeader && (
        <Avatar
          name={root.fromName}
          email={root.fromAddr}
          accountColor={account?.color}
          imageSrc={senderPhoto}
          useGravatar={Boolean(root.fromAddr?.trim())}
          size="md"
          className="mt-0.5"
        />
      )}

      <button
        type="button"
        onClick={handleHeaderClick}
        className={cn(
          'flex min-w-0 flex-1 text-left',
          outlookExpandHeader ? 'flex-row items-center gap-2 py-0.5' : 'flex-col gap-0.5'
        )}
      >
        {outlookExpandHeader ? (
          <>
            <StatusDot
              variant={isUnread ? 'unread' : 'read'}
              size="sm"
              className="shrink-0"
              title={isUnread ? t('mail.list.unread') : t('mail.list.read')}
            />
            <span
              className={cn(
                'min-w-0 flex-1 truncate text-sm',
                isUnread ? 'font-semibold text-foreground' : 'font-semibold text-foreground/95'
              )}
            >
              {root.subject || t('common.noSubject')}
            </span>
            {hasMultiple && (
              <span
                className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground"
                title={t('mail.list.messagesInThread', { count: thread.messageCount })}
              >
                <MessagesSquare className="h-2.5 w-2.5" />
                {thread.messageCount}
              </span>
            )}
            {thread.isFlagged && (
              <Star className="h-3 w-3 shrink-0 fill-status-flagged text-status-flagged group-hover/row:opacity-0" />
            )}
            {thread.hasAttachments && (
              <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground group-hover/row:opacity-0" />
            )}
            {thread.openTodoDueKind != null && (
              <TodoDueBucketBadge kind={thread.openTodoDueKind} className="shrink-0" />
            )}
            {latest.snoozedUntil ? (
              <span
                className="inline-flex shrink-0 items-center gap-1 rounded-md bg-status-unread/15 px-1.5 py-0.5 text-[10px] font-medium text-status-unread transition-opacity group-hover/row:opacity-0"
                title={t('mail.list.snoozeUntilTitle', { when: formatSnoozeWake(latest.snoozedUntil) })}
              >
                <Clock className="h-2.5 w-2.5" />
                <span className="tabular-nums">{formatSnoozeWake(latest.snoozedUntil)}</span>
              </span>
            ) : (
              <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums transition-opacity group-hover/row:opacity-0">
                {date}
              </span>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <StatusDot
                variant={isUnread ? 'unread' : 'read'}
                size="sm"
                className="shrink-0"
                title={isUnread ? t('mail.list.unread') : t('mail.list.read')}
              />
              <span
                className={cn(
                  'flex-1 truncate text-xs',
                  isUnread ? 'font-semibold text-foreground' : 'text-muted-foreground'
                )}
              >
                {senderLabel}
              </span>
              {hasMultiple && (
                <span
                  className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground"
                  title={t('mail.list.messagesInThread', { count: thread.messageCount })}
                >
                  <MessagesSquare className="h-2.5 w-2.5" />
                  {thread.messageCount}
                </span>
              )}
              {thread.isFlagged && (
                <Star className="h-3 w-3 shrink-0 fill-status-flagged text-status-flagged group-hover/row:opacity-0" />
              )}
              {thread.hasAttachments && (
                <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground group-hover/row:opacity-0" />
              )}
              {thread.openTodoDueKind != null && (
                <TodoDueBucketBadge kind={thread.openTodoDueKind} className="shrink-0" />
              )}
              {latest.snoozedUntil ? (
                <span
                  className="inline-flex shrink-0 items-center gap-1 rounded-md bg-status-unread/15 px-1.5 py-0.5 text-[10px] font-medium text-status-unread transition-opacity group-hover/row:opacity-0"
                  title={t('mail.list.snoozeUntilTitle', { when: formatSnoozeWake(latest.snoozedUntil) })}
                >
                  <Clock className="h-2.5 w-2.5" />
                  <span className="tabular-nums">{formatSnoozeWake(latest.snoozedUntil)}</span>
                </span>
              ) : (
                <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums transition-opacity group-hover/row:opacity-0">
                  {date}
                </span>
              )}
            </div>
            <div
              className={cn(
                'truncate text-xs',
                isUnread ? 'font-semibold text-foreground' : 'text-foreground/85'
              )}
            >
              {root.subject || t('common.noSubject')}
            </div>
            <MailCategoryBadges categories={latest.categories} />
            {latest.snippet && (
              <div className="line-clamp-1 text-[11px] text-muted-foreground/85">
                {latest.snippet}
              </div>
            )}
          </>
        )}
      </button>

      <MailRowActions
        message={latest}
        bulkThreadMessages={threadBulkMsgs}
        handlers={rowActions}
        alwaysVisible={false}
        position="top"
      />
    </div>
  )
}

function ThreadSubRow({
  message,
  accounts,
  foldersByAccount,
  showInboxAccountStripe,
  selected,
  onSelectMessage,
  onContextMail,
  rowActions
}: {
  message: MailListItem
  accounts: ConnectedAccount[]
  foldersByAccount: Record<string, MailFolder[]>
  showInboxAccountStripe: boolean
  selected: boolean
  onSelectMessage: (id: number) => void
  onContextMail: (e: React.MouseEvent, msg: MailListItem, opts?: MailListContextOpts) => void
  rowActions: MailRowHandlers
}): JSX.Element {
  const { t } = useTranslation()
  const folder = findFolderForMessage(message, foldersByAccount)
  const wk = (folder?.wellKnown ?? '').toLowerCase()
  const sentLike = wk === 'sentitems' || wk === 'drafts'
  const folderLabel = folder ? wellKnownFolderTitle(folder.wellKnown, folder.name, t) : ''
  const dateIso = messageListDateIso(message)
  const dateStr = dateIso ? formatDate(dateIso) : ''
  const primaryLabel = message.fromName || message.fromAddr || t('common.unknown')
  const toLine = threadSubFirstToDisplay(message.toAddrs)
  const subTodoKind =
    message.todoId != null ? parseOpenTodoDueKind(message.todoDueKind) : null
  const stripeAccount = showInboxAccountStripe
    ? accounts.find((a) => a.id === message.accountId)
    : undefined

  return (
    <div
      draggable
      onDragStart={(e): void => {
        const id = String(message.id)
        e.dataTransfer.setData(MIME_THREAD_IDS, JSON.stringify([message.id]))
        e.dataTransfer.setData('text/plain', id)
        e.dataTransfer.setData('text/mailclient-message-id', id)
        e.dataTransfer.setData('application/x-mailclient-message-id', id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      className={cn(
        'group/subrow relative cursor-grab border-b border-dotted border-border/55 bg-background/25 pb-0.5 pl-3 ml-7 active:cursor-grabbing',
        stripeAccount ? '' : 'border-l border-border/50',
        message.isVipSender && 'ring-1 ring-amber-500/25 ring-inset',
        selected && 'bg-secondary/35'
      )}
      title={
        stripeAccount
          ? t('mail.list.inboxStripeTitle', {
              name: stripeAccount.displayName,
              email: stripeAccount.email
            })
          : undefined
      }
    >
      {stripeAccount && (
        <AccountColorStripe color={stripeAccount.color} className={MAIL_LIST_UNIFIED_INBOX_STRIPE_BAR} />
      )}
      <button
        type="button"
        onClick={(): void => onSelectMessage(message.id)}
        onContextMenu={(e): void => onContextMail(e, message)}
        className={cn(
          'flex w-full flex-col gap-0.5 rounded py-1.5 pl-2 pr-2 text-left transition-colors',
          selected
            ? 'border-l-2 border-primary bg-secondary/45'
            : 'border-l-2 border-transparent hover:bg-secondary/40'
        )}
      >
        {sentLike ? (
          <>
            <div className="flex w-full items-center justify-between gap-2 text-[10px] italic text-muted-foreground">
              <span className="min-w-0 truncate">{primaryLabel}</span>
              <span className="shrink-0 text-right tabular-nums">{folderLabel}</span>
            </div>
            <div className="flex w-full items-start justify-between gap-2 text-[11px]">
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                <StatusDot
                  variant={!message.isRead ? 'unread' : 'read'}
                  size="xs"
                  className="shrink-0"
                />
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate',
                    message.isRead ? 'text-foreground/90' : 'font-semibold text-foreground'
                  )}
                >
                  {toLine || t('mail.list.noRecipient')}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {message.hasAttachments && (
                  <Paperclip className="h-3 w-3 text-muted-foreground group-hover/subrow:opacity-0" />
                )}
                {subTodoKind != null && (
                  <TodoDueBucketBadge kind={subTodoKind} compact className="shrink-0" />
                )}
                <MailCategoryDots categories={message.categories} />
                <span className="text-[10px] text-muted-foreground tabular-nums transition-opacity group-hover/subrow:opacity-0">
                  {dateStr}
                </span>
              </div>
            </div>
          </>
        ) : (
          <div className="flex w-full items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <StatusDot
                variant={!message.isRead ? 'unread' : 'read'}
                size="xs"
                className="shrink-0"
              />
              <span
                className={cn(
                  'min-w-0 flex-1 truncate text-[11px]',
                  message.isRead ? 'text-foreground/90' : 'font-semibold text-foreground'
                )}
              >
                {primaryLabel}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {message.hasAttachments && (
                <Paperclip className="h-3 w-3 text-muted-foreground group-hover/subrow:opacity-0" />
              )}
              {subTodoKind != null && (
                <TodoDueBucketBadge kind={subTodoKind} compact className="shrink-0" />
              )}
              <MailCategoryDots categories={message.categories} />
              <span className="text-[10px] text-muted-foreground tabular-nums transition-opacity group-hover/subrow:opacity-0">
                {dateStr}
              </span>
            </div>
          </div>
        )}
      </button>
      <MailRowActions
        message={message}
        handlers={rowActions}
        alwaysVisible={false}
        position="center"
        groupName="subrow"
      />
    </div>
  )
}

function MailCategoryBadges({ categories }: { categories?: string[] }): JSX.Element | null {
  const cats = (categories ?? []).map((c) => c.trim()).filter((c) => c.length > 0)
  if (cats.length === 0) return null
  const max = 4
  const shown = cats.slice(0, max)
  const extra = cats.length - shown.length
  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map((c, i) => (
        <span
          key={`${c}:${i}`}
          title={c}
          className="inline-flex max-w-[6rem] items-center gap-0.5 rounded border border-border/50 bg-secondary/30 px-1 py-px text-[9px] font-medium text-foreground/90"
        >
          <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', outlookCategoryDotClass(null))} />
          <span className="truncate">{c}</span>
        </span>
      ))}
      {extra > 0 && (
        <span className="text-[9px] text-muted-foreground" title={cats.slice(max).join(', ')}>
          +{extra}
        </span>
      )}
    </div>
  )
}

function MailCategoryDots({ categories }: { categories?: string[] }): JSX.Element | null {
  const { t } = useTranslation()
  const cats = (categories ?? []).map((c) => c.trim()).filter((c) => c.length > 0)
  if (cats.length === 0) return null
  const max = 6
  const shown = cats.slice(0, max)
  return (
    <span
      className="inline-flex shrink-0 items-center gap-px"
      title={cats.join(', ')}
      aria-label={t('mail.list.categoriesDotsAria', { list: cats.join(', ') })}
    >
      {shown.map((c, i) => (
        <span
          key={`${c}:${i}`}
          className={cn('h-1.5 w-1.5 rounded-full', outlookCategoryDotClass(null))}
        />
      ))}
      {cats.length > max && <span className="text-[8px] leading-none text-muted-foreground">+</span>}
    </span>
  )
}

function MailRowActions({
  message,
  bulkThreadMessages,
  handlers,
  alwaysVisible,
  position,
  groupName = 'row'
}: {
  message: MailListItem
  bulkThreadMessages?: MailListItem[]
  handlers: MailRowHandlers
  alwaysVisible: boolean
  position: 'top' | 'center'
  groupName?: 'row' | 'subrow'
}): JSX.Element {
  const { t } = useTranslation()
  const bulk =
    bulkThreadMessages && bulkThreadMessages.length > 1 ? bulkThreadMessages : undefined
  const n = bulk?.length ?? 0
  const allFlagged = Boolean(bulk && bulk.every((m) => m.isFlagged))
  const starHighlight = bulk ? allFlagged : message.isFlagged
  const starTitle = bulk
    ? allFlagged
      ? t('mail.list.starRemoveBulk', { count: n })
      : t('mail.list.starAddBulk', { count: n })
    : message.isFlagged
      ? t('mail.list.starRemove')
      : t('mail.list.starAdd')
  const archiveTitle = bulk ? t('mail.list.archiveTitleBulk', { count: n }) : t('mail.list.archiveTitle')
  const deleteTitle = bulk ? t('mail.list.deleteTitleBulk', { count: n }) : t('mail.list.deleteTitle')

  // group-hover-Klassen muessen statisch im Code stehen, damit Tailwind
  // sie beim Build sieht.
  const showClass =
    groupName === 'subrow'
      ? 'opacity-0 group-hover/subrow:opacity-100 focus-within:opacity-100'
      : 'opacity-0 group-hover/row:opacity-100 focus-within:opacity-100'

  const baseTop = position === 'top' ? 'top-2' : 'top-1/2 -translate-y-1/2'

  return (
    <div
      className={cn(
        'absolute right-1 flex items-center gap-0.5 rounded-md border border-border bg-popover/95 px-1 py-0.5 shadow-sm backdrop-blur-sm transition-opacity',
        baseTop,
        alwaysVisible ? 'opacity-100' : showClass
      )}
    >
      <RowActionButton
        title={t('mail.list.rowReplyTitle')}
        icon={Reply}
        onClick={(e): void => handlers.onReply(e, message)}
      />
      <RowActionButton
        title={starTitle}
        icon={Star}
        highlight={starHighlight}
        onClick={(e): void => handlers.onToggleFlag(e, message, bulk)}
      />
      <RowActionButton
        title={archiveTitle}
        icon={Archive}
        onClick={(e): void => handlers.onArchive(e, message, bulk)}
      />
      <RowActionButton
        title={deleteTitle}
        icon={Trash2}
        destructive
        onClick={(e): void => handlers.onDelete(e, message, bulk)}
      />
    </div>
  )
}

function RowActionButton({
  title,
  icon: Icon,
  highlight,
  destructive,
  onClick
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  highlight?: boolean
  destructive?: boolean
  onClick: (e: React.MouseEvent) => void
}): JSX.Element {
  const [animate, setAnimate] = useState(false)

  function handleClick(e: React.MouseEvent): void {
    setAnimate(true)
    window.setTimeout(() => setAnimate(false), 240)
    onClick(e)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title={title}
      className={cn(
        'flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors',
        destructive
          ? 'text-muted-foreground hover:bg-destructive/20 hover:text-destructive'
          : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
        highlight && 'text-status-flagged'
      )}
    >
      <Icon
        className={cn(
          'h-3.5 w-3.5 transition-transform',
          highlight && 'fill-status-flagged text-status-flagged',
          animate && 'animate-star-pop'
        )}
      />
    </button>
  )
}

function formatParticipants(names: string[]): string {
  const short = names.map((n) => n.split(' ')[0] ?? n)
  if (short.length <= 3) return short.join(', ')
  return `${short.slice(0, 2).join(', ')}, +${short.length - 2}`
}

function EmptyHint({
  sync,
  hasFolder,
  filter,
  totalThreads,
  listKind
}: {
  sync: { state: string; message?: string } | undefined | null
  hasFolder: boolean
  filter?: MailFilter
  totalThreads?: number
  listKind?: MailListKind
}): JSX.Element {
  const { t } = useTranslation()
  if (!hasFolder) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <div className="space-y-2 text-xs text-muted-foreground">{t('mail.list.connectOrSelectFolder')}</div>
      </div>
    )
  }
  if (filter && filter !== 'all' && (totalThreads ?? 0) > 0) {
    const place = mailListUsesCrossAccountThreadScope(listKind ?? 'folder')
      ? t('mail.list.inThisView')
      : t('mail.list.noTodoInFolder')
    if (filter === 'with_todo') {
      return (
        <div className="flex h-full items-center justify-center px-6 text-center">
          <div className="text-xs text-muted-foreground">{t('mail.list.noOpenTodoWithPlace', { place })}</div>
        </div>
      )
    }
    const labelMsg =
      filter === 'unread'
        ? t('mail.list.noUnreadMailsPlace', { place })
        : t('mail.list.noFlaggedMailsPlace', { place })
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <div className="text-xs text-muted-foreground">{labelMsg}</div>
      </div>
    )
  }
  if (sync?.state === 'error') {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <div className="space-y-2">
          <div className="text-sm font-medium text-destructive">{t('mail.list.syncFailed')}</div>
          <div className="text-xs text-muted-foreground">{sync.message}</div>
        </div>
      </div>
    )
  }
  if (sync?.state.startsWith('syncing')) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <Loader2 className="mr-2 h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">{t('mail.list.syncing')}</span>
      </div>
    )
  }
  return (
    <div className="flex h-full items-center justify-center px-6 text-center">
      <div className="text-xs text-muted-foreground">
        {listKind === 'unified_inbox'
          ? t('mail.list.emptyUnifiedInboxes')
          : listKind === 'meta_folder'
            ? t('mail.list.emptyMeta')
            : t('mail.list.emptyFolder')}
      </div>
    </div>
  )
}

function formatSnoozeWake(iso: string): string {
  const localeTag = i18n.language?.startsWith('de') ? 'de-DE' : 'en-GB'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    const now = new Date()
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    if (sameDay) {
      return d.toLocaleTimeString(localeTag, { hour: '2-digit', minute: '2-digit' })
    }
    const tomorrow = new Date(now)
    tomorrow.setDate(now.getDate() + 1)
    const isTomorrow =
      d.getFullYear() === tomorrow.getFullYear() &&
      d.getMonth() === tomorrow.getMonth() &&
      d.getDate() === tomorrow.getDate()
    if (isTomorrow) {
      return `${d.toLocaleDateString(localeTag, { weekday: 'short' })} ${d.toLocaleTimeString(localeTag, { hour: '2-digit', minute: '2-digit' })}`
    }
    return d.toLocaleString(localeTag, {
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

function formatDate(iso: string): string {
  const localeTag = i18n.language?.startsWith('de') ? 'de-DE' : 'en-GB'
  try {
    const d = new Date(iso)
    const now = new Date()
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    if (sameDay) {
      return d.toLocaleTimeString(localeTag, { hour: '2-digit', minute: '2-digit' })
    }
    const sameYear = d.getFullYear() === now.getFullYear()
    if (sameYear) {
      return d.toLocaleDateString(localeTag, { day: '2-digit', month: '2-digit' })
    }
    return d.toLocaleDateString(localeTag, { day: '2-digit', month: '2-digit', year: '2-digit' })
  } catch {
    return ''
  }
}