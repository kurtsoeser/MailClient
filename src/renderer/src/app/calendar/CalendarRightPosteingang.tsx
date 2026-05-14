import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { GroupedVirtuoso } from 'react-virtuoso'
import type { MailListItem, TodoDueKindList, TodoDueKindOpen } from '@shared/types'
import { useAccountsStore } from '@/stores/accounts'
import {
  loadAllOpenTodoMessages,
  useMailStore,
  type MailFilter,
  type MailListArrangeBy,
  type MailListChronoOrder
} from '@/stores/mail'
import { useComposeStore } from '@/stores/compose'
import { useSnoozeUiStore } from '@/stores/snooze-ui'
import { indexMessagesByThread } from '@/lib/thread-group'
import {
  computeMailListLayout,
  filterMailListLayoutForCollapsedGroups,
  mailListGroupCollapseKey
} from '@/lib/mail-list-arrange'
import {
  buildMailContextItems,
  buildMailCategorySubmenuItems,
  type MailContextHandlers
} from '@/lib/mail-context-menu'
import { ContextMenu, type ContextMenuItem } from '@/components/ContextMenu'
import { ObjectNoteDialog, type ObjectNoteTarget } from '@/components/ObjectNoteEditor'
import { TodoDueBucketBadge } from '@/components/TodoDueBucketBadge'
import { WorkflowThreadBlock, WorkflowSubMessageRow } from '@/app/workflow/WorkflowThreadBlock'
import { cn } from '@/lib/utils'
import {
  ModuleColumnHeaderIconButton,
  moduleColumnHeaderDockBarRowClass,
  moduleColumnHeaderIconGlyphClass,
  moduleColumnHeaderLabelWithIconClass,
  moduleColumnHeaderToolbarToggleClass
} from '@/components/ModuleColumnHeader'
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  ListTodo,
  PanelRightClose,
  PanelRightOpen,
  SquareArrowOutUpRight
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

const CAL_INBOX_EXPAND_KEY = 'mailclient.calendar.inboxExpandedThreads'
const CAL_INBOX_FILTER_KEY = 'mailclient.calendar.inboxMailFilter'
const CAL_INBOX_ARRANGE_KEY = 'mailclient.calendar.inboxMailListArrangeBy'
const CAL_INBOX_CHRONO_KEY = 'mailclient.calendar.inboxMailListChronoOrder'
const CAL_INBOX_COLLAPSED_GROUPS_KEY = 'mailclient.calendar.inboxCollapsedMailListGroups'

const CALENDAR_INBOX_COLUMN_ID = 'calendar-shell-inbox'

async function fetchInboxTriageThreadExtras(
  messages: MailListItem[]
): Promise<Record<string, MailListItem[]>> {
  const byAccount = new Map<string, Set<string>>()
  for (const m of messages) {
    const k = m.remoteThreadId
    if (!k) continue
    let s = byAccount.get(m.accountId)
    if (!s) {
      s = new Set()
      byAccount.set(m.accountId, s)
    }
    s.add(k)
  }
  const merged: Record<string, MailListItem[]> = {}
  for (const [accountId, keys] of byAccount) {
    if (keys.size === 0) continue
    const list = await window.mailClient.mail
      .listMessagesByThreads({ accountId, threadKeys: [...keys] })
      .catch(() => [] as MailListItem[])
    for (const m of list) {
      const tk = m.remoteThreadId
      if (!tk) continue
      const arr = merged[tk] ?? (merged[tk] = [])
      if (!arr.some((x) => x.id === m.id)) arr.push(m)
    }
  }
  for (const arr of Object.values(merged)) {
    arr.sort((a, b) => {
      const ad = a.receivedAt ?? a.sentAt ?? ''
      const bd = b.receivedAt ?? b.sentAt ?? ''
      if (ad === bd) return 0
      return ad < bd ? 1 : -1
    })
  }
  return merged
}

function readExpandedThreadKeys(): Set<string> {
  try {
    const raw = window.localStorage.getItem(CAL_INBOX_EXPAND_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((x): x is string => typeof x === 'string'))
  } catch {
    return new Set()
  }
}

function persistExpandedThreadKeys(ids: Set<string>): void {
  try {
    window.localStorage.setItem(CAL_INBOX_EXPAND_KEY, JSON.stringify([...ids]))
  } catch {
    // ignore
  }
}

function threadExpandKey(columnId: string, threadKey: string): string {
  return `${columnId}\t${threadKey}`
}

function readCalInboxMailFilter(): MailFilter {
  try {
    const raw = window.localStorage.getItem(CAL_INBOX_FILTER_KEY)
    if (raw === 'unread' || raw === 'flagged' || raw === 'with_todo' || raw === 'all') return raw
  } catch {
    // ignore
  }
  return 'all'
}

function readCalInboxArrangeBy(): MailListArrangeBy {
  try {
    const raw = window.localStorage.getItem(CAL_INBOX_ARRANGE_KEY)
    if (raw && raw.length > 0) return raw as MailListArrangeBy
  } catch {
    // ignore
  }
  return 'todo_bucket'
}

function readCalInboxChrono(): MailListChronoOrder {
  try {
    const raw = window.localStorage.getItem(CAL_INBOX_CHRONO_KEY)
    if (raw === 'newest_on_top' || raw === 'oldest_on_top') return raw
  } catch {
    // ignore
  }
  return 'newest_on_top'
}

function readCalInboxCollapsedGroupKeys(): Set<string> {
  try {
    const raw = window.localStorage.getItem(CAL_INBOX_COLLAPSED_GROUPS_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((x): x is string => typeof x === 'string'))
  } catch {
    return new Set()
  }
}

function persistCalInboxCollapsedGroupKeys(keys: Set<string>): void {
  try {
    window.localStorage.setItem(CAL_INBOX_COLLAPSED_GROUPS_KEY, JSON.stringify([...keys]))
  } catch {
    // ignore
  }
}

interface MailContextState {
  x: number
  y: number
  items: ContextMenuItem[]
}

export function CalendarPosteingangToolbarButton(props: {
  open: boolean
  onOpenChange: (next: boolean) => void
}): JSX.Element {
  const { open, onOpenChange } = props
  const { t } = useTranslation()
  return (
    <button
      type="button"
      title={open ? t('calendar.posteingangUi.toggleInboxHide') : t('calendar.posteingangUi.toggleInboxShow')}
      aria-pressed={open}
      onClick={(): void => onOpenChange(!open)}
      className={moduleColumnHeaderToolbarToggleClass(open)}
    >
      {open ? (
        <PanelRightClose className={moduleColumnHeaderIconGlyphClass} />
      ) : (
        <PanelRightOpen className={moduleColumnHeaderIconGlyphClass} />
      )}
    </button>
  )
}

export function CalendarPreviewPaneToolbarButton(props: {
  open: boolean
  onOpenChange: (next: boolean) => void
}): JSX.Element {
  const { open, onOpenChange } = props
  const { t } = useTranslation()
  return (
    <button
      type="button"
      title={
        open ? t('calendar.posteingangUi.togglePreviewHide') : t('calendar.posteingangUi.togglePreviewShow')
      }
      aria-pressed={open}
      onClick={(): void => onOpenChange(!open)}
      className={moduleColumnHeaderToolbarToggleClass(open)}
    >
      <BookOpen className={moduleColumnHeaderIconGlyphClass} />
    </button>
  )
}

interface PanelProps {
  open: boolean
  /** Kalender-Shell: nach ToDo-Zeit-Verschiebung hochzählen → Liste neu laden. */
  sideListRefreshKey?: number
  onRequestClose: () => void
  className?: string
  /** Abdocken: schwebendes Fenster (nur sinnvoll in der Kalender-Shell). */
  onRequestUndock?: () => void
  /** Keine eigene Titelzeile (Titel im schwebenden Rahmen). */
  hideChrome?: boolean
  /** Dock: Titelzeile in dieses Element portieren (gemeinsame Header-Zeile). */
  dockHeaderSlotEl?: HTMLElement | null
  /** True: Shell rendert die Kopfzeile oben — kein Inline-Chrome bis `dockHeaderSlotEl` gesetzt ist. */
  shellDockHeaderRow?: boolean
}

/**
 * Rechte Spalte: dieselbe Mail-Liste wie die einheitliche ToDo-Ansicht im Posteingang
 * (alle offenen ToDo-Buckets), zum Planen per Ziehen auf den Kalender.
 */
export function CalendarRightPosteingangPanel({
  open,
  sideListRefreshKey,
  onRequestClose,
  className,
  onRequestUndock,
  hideChrome,
  dockHeaderSlotEl,
  shellDockHeaderRow
}: PanelProps): JSX.Element | null {
  const { t } = useTranslation()
  const [inboxTriageMessages, setInboxTriageMessages] = useState<MailListItem[]>([])
  const [triageThreadExtras, setTriageThreadExtras] = useState<Record<string, MailListItem[]>>({})
  const [expandedThreadKeys, setExpandedThreadKeys] = useState<Set<string>>(readExpandedThreadKeys)
  const [mailFilter] = useState<MailFilter>(readCalInboxMailFilter)
  const [mailListArrangeBy] = useState<MailListArrangeBy>(readCalInboxArrangeBy)
  const [mailListChronoOrder] = useState<MailListChronoOrder>(readCalInboxChrono)
  const [collapsedMailListGroupKeys, setCollapsedMailListGroupKeys] = useState<Set<string>>(
    readCalInboxCollapsedGroupKeys
  )
  const [contextMenu, setContextMenu] = useState<MailContextState | null>(null)
  const [noteTarget, setNoteTarget] = useState<ObjectNoteTarget | null>(null)
  const fetchGen = useRef(0)

  const refreshNow = useMailStore((s) => s.refreshNow)
  const selectMessage = useMailStore((s) => s.selectMessage)
  const selectedMessageId = useMailStore((s) => s.selectedMessageId)
  const setMessageRead = useMailStore((s) => s.setMessageRead)
  const toggleMessageFlag = useMailStore((s) => s.toggleMessageFlag)
  const archiveMessage = useMailStore((s) => s.archiveMessage)
  const deleteMessage = useMailStore((s) => s.deleteMessage)
  const setTodoForMessage = useMailStore((s) => s.setTodoForMessage)
  const completeTodoForMessage = useMailStore((s) => s.completeTodoForMessage)
  const setWaitingForMessage = useMailStore((s) => s.setWaitingForMessage)
  const clearWaitingForMessage = useMailStore((s) => s.clearWaitingForMessage)

  const accounts = useAccountsStore((s) => s.accounts)
  const openReply = useComposeStore((s) => s.openReply)
  const openForward = useComposeStore((s) => s.openForward)
  const openSnoozePicker = useSnoozeUiStore((s) => s.open)

  const loadTodoPanelList = useCallback(async (): Promise<void> => {
    const gen = ++fetchGen.current
    try {
      const raw = await loadAllOpenTodoMessages()
      if (gen !== fetchGen.current) return
      const extras = await fetchInboxTriageThreadExtras(raw)
      if (gen !== fetchGen.current) return
      setInboxTriageMessages(raw)
      setTriageThreadExtras(extras)
    } catch {
      if (gen !== fetchGen.current) return
      setInboxTriageMessages([])
      setTriageThreadExtras({})
    }
  }, [])

  useEffect(() => {
    if (!open) return
    void loadTodoPanelList()
  }, [open, sideListRefreshKey, loadTodoPanelList])

  useEffect(() => {
    if (!open) return
    const off = window.mailClient.events.onMailChanged(() => {
      void loadTodoPanelList()
    })
    return off
  }, [open, loadTodoPanelList])

  const { threads: calendarInboxThreads, messagesByThread: calendarInboxByThread } = useMemo(
    () => indexMessagesByThread(inboxTriageMessages, triageThreadExtras),
    [inboxTriageMessages, triageThreadExtras]
  )

  const expandedThreadsForLayout = useMemo(() => {
    const prefix = `${CALENDAR_INBOX_COLUMN_ID}\t`
    const out = new Set<string>()
    for (const k of expandedThreadKeys) {
      if (k.startsWith(prefix)) out.add(k.slice(prefix.length))
      else out.add(k)
    }
    return out
  }, [expandedThreadKeys])

  const filteredThreads = useMemo(() => {
    if (mailFilter === 'all') return calendarInboxThreads
    if (mailFilter === 'unread') return calendarInboxThreads.filter((x) => x.unreadCount > 0)
    if (mailFilter === 'flagged') return calendarInboxThreads.filter((x) => x.isFlagged)
    if (mailFilter === 'with_todo') return calendarInboxThreads.filter((x) => x.openTodoDueKind != null)
    return calendarInboxThreads
  }, [calendarInboxThreads, mailFilter])

  const arrangeCtx = useMemo(
    () => ({
      folderWellKnown: 'inbox' as const,
      accountLabel: (id: string): string => {
        const a = accounts.find((x) => x.id === id)
        return a?.email ?? a?.displayName ?? id
      },
      todoDueBucketLabel: (kind: TodoDueKindList): string => t(`mail.todoBucket.${kind}`),
      noOpenTodoLabel: t('mail.noOpenTodo')
    }),
    [accounts, t]
  )

  const { groupLabels, groupCounts, groupTodoDueKinds, flatRows } = useMemo(
    () =>
      computeMailListLayout(
        filteredThreads,
        calendarInboxByThread,
        expandedThreadsForLayout,
        mailListArrangeBy,
        mailListChronoOrder,
        arrangeCtx
      ),
    [
      filteredThreads,
      calendarInboxByThread,
      expandedThreadsForLayout,
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
    [groupLabels, groupCounts, flatRows, mailListArrangeBy, collapsedMailListGroupKeys]
  )

  const setTodoForCalendar = useCallback(
    async (messageId: number, dueKind: TodoDueKindOpen): Promise<void> => {
      await setTodoForMessage(messageId, dueKind)
      void loadTodoPanelList()
    },
    [setTodoForMessage, loadTodoPanelList]
  )

  const completeTodoForCalendar = useCallback(
    async (messageId: number): Promise<void> => {
      await completeTodoForMessage(messageId)
      void loadTodoPanelList()
    },
    [completeTodoForMessage, loadTodoPanelList]
  )

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
      setTodoForMessage: setTodoForCalendar,
      completeTodoForMessage: completeTodoForCalendar,
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
      setTodoForCalendar,
      completeTodoForCalendar,
      setWaitingForMessage,
      clearWaitingForMessage,
      openSnoozePicker,
      refreshNow
    ]
  )

  const openMailContext = useCallback(
    async (
      e: MouseEvent,
      message: MailListItem,
      opts?: { applyToMessageIds?: number[]; threadMessagesForContext?: MailListItem[] }
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
      const items = buildMailContextItems(message, mailContextHandlers, {
        ...ui,
        categorySubmenu: cat.length > 0 ? cat : undefined,
        t
      })
      setContextMenu({ x: anchor.x, y: anchor.y, items })
    },
    [mailContextHandlers, refreshNow, t]
  )

  const toggleMailListGroupCollapsed = useCallback((key: string): void => {
    setCollapsedMailListGroupKeys((prev) => {
      const n = new Set(prev)
      if (n.has(key)) n.delete(key)
      else n.add(key)
      persistCalInboxCollapsedGroupKeys(n)
      return n
    })
  }, [])

  const toggleThreadExpanded = useCallback((threadKey: string): void => {
    const key = threadExpandKey(CALENDAR_INBOX_COLUMN_ID, threadKey)
    setExpandedThreadKeys((prev) => {
      const n = new Set(prev)
      if (n.has(key)) n.delete(key)
      else n.add(key)
      persistExpandedThreadKeys(n)
      return n
    })
  }, [])

  if (!open) return null

  const filterEmptyHint =
    mailFilter === 'with_todo'
      ? t('mail.list.noOpenTodoWithPlace', { place: t('mail.list.inThisView') })
      : mailFilter === 'unread'
        ? t('mail.list.noUnreadMailsPlace', { place: t('mail.list.inThisView') })
        : mailFilter === 'flagged'
          ? t('mail.list.noFlaggedMailsPlace', { place: t('mail.list.inThisView') })
          : t('calendar.posteingangUi.emptyList')

  const fullDockChrome =
    hideChrome ? null : (
      <div
        className={cn(
          'calendar-shell-column-header flex min-h-0 shrink-0 flex-col',
          dockHeaderSlotEl != null ? 'h-full justify-center' : 'shrink-0 border-b border-border'
        )}
      >
        <div className={moduleColumnHeaderDockBarRowClass}>
          <div className={moduleColumnHeaderLabelWithIconClass}>
            <ListTodo className={moduleColumnHeaderIconGlyphClass} />
            <span className="truncate">{t('calendar.shell.todoPanelTitle')}</span>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {onRequestUndock ? (
              <ModuleColumnHeaderIconButton
                title={t('calendar.shell.undockPreviewTitle')}
                onClick={onRequestUndock}
              >
                <SquareArrowOutUpRight className={moduleColumnHeaderIconGlyphClass} />
              </ModuleColumnHeaderIconButton>
            ) : null}
            <ModuleColumnHeaderIconButton
              title={t('calendar.posteingangUi.hideColumn')}
              onClick={onRequestClose}
            >
              <PanelRightClose className={moduleColumnHeaderIconGlyphClass} />
            </ModuleColumnHeaderIconButton>
          </div>
        </div>
      </div>
    )

  return (
    <div
      className={cn(
        'flex h-full min-h-0 w-full shrink-0 flex-col overflow-hidden bg-card',
        !hideChrome && 'border-l border-border',
        className
      )}
    >
      {fullDockChrome != null && dockHeaderSlotEl != null
        ? createPortal(fullDockChrome, dockHeaderSlotEl)
        : null}
      {fullDockChrome != null && dockHeaderSlotEl == null && !shellDockHeaderRow ? fullDockChrome : null}
      <div className="min-h-0 flex-1 overflow-hidden p-1">
        {calendarInboxThreads.length === 0 ? (
          <p className="px-2 py-3 text-center text-[11px] text-muted-foreground">{t('mail.todoEmpty')}</p>
        ) : filteredThreads.length === 0 ? (
          <p className="px-2 py-3 text-center text-[11px] text-muted-foreground">{filterEmptyHint}</p>
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
                const th = row.thread
                const tMsgs = row.threadMessages
                const convIds = [...new Set(tMsgs.map((m) => m.id))]
                const exKey = threadExpandKey(CALENDAR_INBOX_COLUMN_ID, th.threadKey)
                return (
                  <div key={row.key} className="px-0.5 pb-0.5">
                    <WorkflowThreadBlock
                      thread={th}
                      threadMessages={tMsgs}
                      conversationDragIds={convIds}
                      expanded={expandedThreadKeys.has(exKey)}
                      onToggleExpand={(): void => toggleThreadExpanded(th.threadKey)}
                      accounts={accounts}
                      selectedMessageId={selectedMessageId}
                      onSelectMessage={(id): void => void selectMessage(id)}
                      onOpenConversationContext={(e, latest, ids, ctxMsgs): void => {
                        void openMailContext(e, latest, {
                          applyToMessageIds: ids,
                          threadMessagesForContext: ctxMsgs
                        })
                      }}
                      onOpenMessageContext={(e, m): void => {
                        void openMailContext(e, m)
                      }}
                    />
                  </div>
                )
              }
              return (
                <div key={row.key} className="px-0.5 pb-0.5">
                  <WorkflowSubMessageRow
                    message={row.message}
                    accounts={accounts}
                    selected={row.message.id === selectedMessageId}
                    onSelect={(): void => void selectMessage(row.message.id)}
                    onContextMenu={(e): void => void openMailContext(e, row.message)}
                  />
                </div>
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
    </div>
  )
}
