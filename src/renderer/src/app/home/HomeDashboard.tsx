import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Locale } from 'date-fns'
import { addDays, addMonths, format, formatDistanceToNow, formatISO, parseISO, startOfDay, startOfMonth, startOfWeek } from 'date-fns'
import { de, enUS } from 'date-fns/locale'
import { useTranslation } from 'react-i18next'
import {
  AlarmClock,
  Calendar,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  Globe,
  Inbox,
  Infinity as InfinityIcon,
  ListTodo,
  Loader2,
  Moon,
  PanelTop,
  Paperclip,
  PenLine,
  Reply,
  Search,
  Star,
  Sun,
  Sunrise,
  CloudSun,
  Clock,
  StickyNote,
  Video
} from 'lucide-react'
import type {
  CalendarEventView,
  ConnectedAccount,
  MailFolder,
  MailListItem,
  SearchHit,
  SnoozedMessageItem,
  TodoDueKindList
} from '@shared/types'
import { cn } from '@/lib/utils'
import { requestFocusMainSearch } from '@/lib/search-focus'
import { indexMessagesByThread, type ThreadGroup } from '@/lib/thread-group'
import { computeMailListLayout } from '@/lib/mail-list-arrange'
import { resolvedAccountColorCss } from '@/lib/avatar-color'
import {
  buildMailCategorySubmenuItems,
  buildMailContextItems,
  type MailContextHandlers
} from '@/lib/mail-context-menu'
import { accountSupportsCloudTasks } from '@/lib/cloud-task-accounts'
import { useAccountsStore } from '@/stores/accounts'
import { useInboxCalendarAgendaCacheStore } from '@/stores/inbox-calendar-agenda-cache'
import { useMailStore, mailListUsesCrossAccountThreadScope } from '@/stores/mail'
import {
  buildMailboxFlagExcludedFolderIds,
  threadMatchesMailboxFlaggedFilter
} from '@/lib/mail-flagged-mailbox-view'
import { useAppModeStore } from '@/stores/app-mode'
import { useCalendarPendingFocusStore } from '@/stores/calendar-pending-focus'
import { useComposeStore } from '@/stores/compose'
import { useSnoozeUiStore } from '@/stores/snooze-ui'
import { AccountColorStripe } from '@/components/AccountColorStripe'
import { ContextMenu, type ContextMenuItem } from '@/components/ContextMenu'
import { ObjectNoteDialog, type ObjectNoteTarget } from '@/components/ObjectNoteEditor'
import { StatusDot } from '@/components/StatusDot'
import { TodoDueBucketBadge } from '@/components/TodoDueBucketBadge'
import { DashboardTileGrid } from '@/app/home/DashboardTileGrid'
import { DashboardComposeTile } from '@/app/home/DashboardComposeTile'
import { DashboardCustomTileBody } from '@/app/home/DashboardCustomTileBody'
import {
  DASHBOARD_SECOND_CLOCK_TIME_ZONE_STORAGE_KEY,
  DashboardTodayClock
} from '@/app/home/DashboardTodayClock'
import { DashboardTodayTimeline } from '@/app/home/DashboardTodayTimeline'
import { DashboardMiniMonth } from '@/app/home/DashboardMiniMonth'
import { DashboardMiniWeek } from '@/app/home/DashboardMiniWeek'
import { DashboardWeatherTile } from '@/app/home/DashboardWeatherTile'
import { DashboardNextMeetingTile } from '@/app/home/DashboardNextMeetingTile'
import { DashboardDeskNoteTile } from '@/app/home/DashboardDeskNoteTile'
import { pushRecentSearch, readRecentSearches } from '@/app/home/dashboard-recent-searches'
import type { DashboardCustomTileStored } from '@/app/home/dashboard-custom-tiles'
import {
  filterCalendarEventsForMonth,
  filterCalendarEventsForWeek,
  pickNextOnlineMeetingFromEvents
} from '@/lib/calendar-dashboard-range'
import { CALENDAR_VISIBILITY_CHANGED_EVENT } from '@/lib/calendar-visibility-storage'

const UNIFIED_STRIPE = 'pointer-events-none absolute left-0 top-0 bottom-0 z-[1] w-[3px] rounded-r opacity-90'

/** Max. Konversationen in der Posteingangs-Kachel; Rest per Scrollen in der Kachel. */
const DASHBOARD_INBOX_MAX_CONVERSATIONS = 20
/** Kompakte Listen (Warten, Snooze, Fristen, Mini-Suche). */
const DASHBOARD_COMPACT_MAX = 12

/** ToDo-Kacheln: Abruf pro Bucket und max. Zeilen pro Kachel. */
const DASHBOARD_TODO_FETCH_LIMIT = 120
const DASHBOARD_TODO_TILE_MAX = 12
const DASHBOARD_TODO_MERGE_BUCKETS: TodoDueKindList[] = [
  'overdue',
  'today',
  'tomorrow',
  'this_week',
  'later'
]

interface MailContextState {
  x: number
  y: number
  items: ContextMenuItem[]
}

type DashboardMailContextOpts = {
  applyToMessageIds?: number[]
  threadMessagesForContext?: MailListItem[]
}

function mergeTodoListsUnique(lists: MailListItem[][]): MailListItem[] {
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

function sortMessagesForTodoDashboardPreview(msgs: MailListItem[]): MailListItem[] {
  return [...msgs].sort((a, b) => {
    const da = a.receivedAt ?? a.sentAt ?? ''
    const db = b.receivedAt ?? b.sentAt ?? ''
    if (da === db) return 0
    return da < db ? 1 : -1
  })
}

function DashboardTodoMessageList(props: {
  loading: boolean
  messages: MailListItem[]
  emptyLabel: string
  accountById: Map<string, ConnectedAccount>
  openFromDashboard: (messageId: number) => Promise<void>
  onContextMail: (e: React.MouseEvent, message: MailListItem) => void
  t: (key: string) => string
}): JSX.Element {
  const { loading, messages, emptyLabel, accountById, openFromDashboard, onContextMail, t } = props
  const capped = messages.slice(0, DASHBOARD_TODO_TILE_MAX)
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            {t('dashboard.loading.todo')}
          </div>
        ) : capped.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-muted-foreground">{emptyLabel}</div>
        ) : (
          <ul className="divide-y divide-border/40">
            {capped.map((m) => {
              const account = accountById.get(m.accountId) ?? null
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={(): void => void openFromDashboard(m.id)}
                    onContextMenu={(e): void => onContextMail(e, m)}
                    className={cn(
                      'group relative flex w-full items-start gap-2 px-3 py-2 text-left text-xs transition-colors',
                      'hover:bg-secondary/50'
                    )}
                  >
                    {account && (
                      <AccountColorStripe color={account.color} className={UNIFIED_STRIPE} />
                    )}
                    <StatusDot
                      variant={m.isRead ? 'read' : 'unread'}
                      size="sm"
                      className="mt-1 shrink-0"
                      title={m.isRead ? t('mail.list.read') : t('mail.list.unread')}
                    />
                    <div className="min-w-0 flex-1">
                      <div
                        className={cn(
                          'truncate',
                          m.isRead ? 'text-foreground/90' : 'font-semibold text-foreground'
                        )}
                      >
                        {m.fromName || m.fromAddr || t('common.unknown')}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {m.subject || t('common.noSubject')}
                      </div>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

function formatParticipants(names: string[]): string {
  if (names.length <= 2) return names.join(', ')
  return `${names.slice(0, 2).join(', ')} +${names.length - 2}`
}

function formatEventWhenShort(ev: CalendarEventView, locale: Locale, allDayWord: string): string {
  const start = parseISO(ev.startIso)
  const end = parseISO(ev.endIso)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return ''
  if (ev.isAllDay) {
    const a = format(start, 'EEE d. MMM', { locale })
    const b = format(addDays(end, -1), 'EEE d. MMM', { locale })
    if (a === b) return `${a} · ${allDayWord}`
    return `${a} – ${b}`
  }
  if (format(start, 'yyyy-MM-dd') === format(end, 'yyyy-MM-dd')) {
    return `${format(start, 'EEE d. MMM', { locale })} · ${format(start, 'HH:mm')}–${format(end, 'HH:mm')}`
  }
  return `${format(start, 'Pp', { locale })}`
}

function formatSnoozeWakeShort(iso: string | null, locale: Locale): string {
  if (!iso) return ''
  const d = parseISO(iso)
  if (Number.isNaN(d.getTime())) return ''
  return formatDistanceToNow(d, { addSuffix: true, locale })
}

function eventDotStyle(ev: CalendarEventView, accounts: ConnectedAccount[]): React.CSSProperties {
  const hex = ev.displayColorHex?.trim()
  if (hex) return { backgroundColor: hex }
  const acc = accounts.find((a) => a.id === ev.accountId)
  if (acc) return { backgroundColor: resolvedAccountColorCss(acc.color) }
  return { backgroundColor: 'hsl(var(--muted-foreground) / 0.35)' }
}

export function HomeDashboard(): JSX.Element {
  const { t, i18n } = useTranslation()
  const dfLocale: Locale = i18n.language.startsWith('de') ? de : enUS
  const accounts = useAccountsStore((s) => s.accounts)
  const weatherLatitude = useAccountsStore((s) => s.config?.weatherLatitude ?? null)
  const weatherLongitude = useAccountsStore((s) => s.config?.weatherLongitude ?? null)
  const weatherLocationName = useAccountsStore((s) => s.config?.weatherLocationName ?? null)
  const calendarTimeZoneConfig = useAccountsStore((s) => s.config?.calendarTimeZone ?? null)
  const calendarLinkedAccounts = useMemo(
    () => accounts.filter((a) => a.provider === 'microsoft' || a.provider === 'google'),
    [accounts]
  )
  const setAppMode = useAppModeStore((s) => s.setMode)

  const messages = useMailStore((s) => s.messages)
  const threadMessages = useMailStore((s) => s.threadMessages)
  const listKind = useMailStore((s) => s.listKind)
  const loading = useMailStore((s) => s.loading)
  const error = useMailStore((s) => s.error)
  const mailFilter = useMailStore((s) => s.mailFilter)
  const flaggedFilterExcludeDeletedJunk = useMailStore((s) => s.flaggedFilterExcludeDeletedJunk)
  const mailListChronoOrder = useMailStore((s) => s.mailListChronoOrder)
  const selectUnifiedInbox = useMailStore((s) => s.selectUnifiedInbox)
  const selectMessage = useMailStore((s) => s.selectMessage)
  const setMailListArrangeBy = useMailStore((s) => s.setMailListArrangeBy)
  const foldersByAccount = useMailStore((s) => s.foldersByAccount)
  const openMessageInFolder = useMailStore((s) => s.openMessageInFolder)
  const selectFolder = useMailStore((s) => s.selectFolder)
  const selectWaitingView = useMailStore((s) => s.selectWaitingView)
  const selectSnoozedView = useMailStore((s) => s.selectSnoozedView)
  const selectTodoView = useMailStore((s) => s.selectTodoView)
  const setMessageRead = useMailStore((s) => s.setMessageRead)
  const toggleMessageFlag = useMailStore((s) => s.toggleMessageFlag)
  const archiveMessage = useMailStore((s) => s.archiveMessage)
  const deleteMessage = useMailStore((s) => s.deleteMessage)
  const removeMailTodoRecordsForMessage = useMailStore((s) => s.removeMailTodoRecordsForMessage)
  const setTodoForMessage = useMailStore((s) => s.setTodoForMessage)
  const completeTodoForMessage = useMailStore((s) => s.completeTodoForMessage)
  const setWaitingForMessage = useMailStore((s) => s.setWaitingForMessage)
  const clearWaitingForMessage = useMailStore((s) => s.clearWaitingForMessage)
  const refreshNow = useMailStore((s) => s.refreshNow)
  const openReply = useComposeStore((s) => s.openReply)
  const openForward = useComposeStore((s) => s.openForward)
  const openSnoozePicker = useSnoozeUiStore((s) => s.open)

  const upcomingEvents = useInboxCalendarAgendaCacheStore((s) => s.dashboardUpcomingCalendar)
  const previewRangeEvents = useInboxCalendarAgendaCacheStore((s) => s.previewRangeEvents)
  const calendarError = useInboxCalendarAgendaCacheStore((s) => s.error)
  const calendarFetchInFlight = useInboxCalendarAgendaCacheStore((s) => s.inFlight)
  const loadLinkedCalendarPreview = useInboxCalendarAgendaCacheStore((s) => s.loadAgenda)
  const calendarLoading =
    calendarFetchInFlight && upcomingEvents.length === 0 && calendarError == null

  const weekEvents = useMemo(
    () => filterCalendarEventsForWeek(previewRangeEvents),
    [previewRangeEvents]
  )
  const monthEvents = useMemo(
    () => filterCalendarEventsForMonth(previewRangeEvents),
    [previewRangeEvents]
  )
  const nextOnlineMeeting = useMemo(
    () => pickNextOnlineMeetingFromEvents(previewRangeEvents),
    [previewRangeEvents]
  )
  const weekEventsLoading =
    calendarFetchInFlight && previewRangeEvents.length === 0 && calendarLinkedAccounts.length > 0
  const nextOnlineMeetingLoading =
    calendarFetchInFlight && previewRangeEvents.length === 0 && calendarLinkedAccounts.length > 0

  const [waitingMessages, setWaitingMessages] = useState<MailListItem[]>([])
  const [waitingLoading, setWaitingLoading] = useState(true)
  const [snoozedItems, setSnoozedItems] = useState<SnoozedMessageItem[]>([])
  const [snoozedLoading, setSnoozedLoading] = useState(true)
  const [dashSearchQuery, setDashSearchQuery] = useState('')
  const [dashSearchHits, setDashSearchHits] = useState<SearchHit[]>([])
  const [dashSearchLoading, setDashSearchLoading] = useState(false)
  const [recentSearchTick, setRecentSearchTick] = useState(0)
  const [contextMenu, setContextMenu] = useState<MailContextState | null>(null)
  const [noteTarget, setNoteTarget] = useState<ObjectNoteTarget | null>(null)
  const [dashTodoByKind, setDashTodoByKind] = useState<{
    all: MailListItem[]
    overdue: MailListItem[]
    today: MailListItem[]
    tomorrow: MailListItem[]
    week: MailListItem[]
    later: MailListItem[]
  }>({ all: [], overdue: [], today: [], tomorrow: [], week: [], later: [] })
  const [dashTodoLoading, setDashTodoLoading] = useState(true)

  useEffect(() => {
    const sid = useMailStore.getState().selectedMessageId
    void selectUnifiedInbox({ preferredMessageId: sid })
  }, [selectUnifiedInbox])

  const refreshLinkedCalendarPreview = useCallback(
    (opts?: { force?: boolean }): void => {
      void loadLinkedCalendarPreview(calendarLinkedAccounts, opts)
    },
    [calendarLinkedAccounts, loadLinkedCalendarPreview]
  )

  useEffect(() => {
    refreshLinkedCalendarPreview()
  }, [refreshLinkedCalendarPreview])

  const loadWaiting = useCallback(async (): Promise<void> => {
    setWaitingLoading(true)
    try {
      const list = await window.mailClient.mail.listWaitingMessages({ limit: 200 })
      setWaitingMessages(list)
    } catch {
      setWaitingMessages([])
    } finally {
      setWaitingLoading(false)
    }
  }, [])

  const loadSnoozed = useCallback(async (): Promise<void> => {
    setSnoozedLoading(true)
    try {
      const list = await window.mailClient.mail.listSnoozed(200)
      const sorted = [...list].sort((a, b) => {
        const ta = Date.parse(a.snoozedUntil ?? '')
        const tb = Date.parse(b.snoozedUntil ?? '')
        if (Number.isNaN(ta) && Number.isNaN(tb)) return 0
        if (Number.isNaN(ta)) return 1
        if (Number.isNaN(tb)) return -1
        return ta - tb
      })
      setSnoozedItems(sorted)
    } catch {
      setSnoozedItems([])
    } finally {
      setSnoozedLoading(false)
    }
  }, [])

  const loadDashboardTodos = useCallback(async (): Promise<void> => {
    setDashTodoLoading(true)
    try {
      const [overdue, today, tomorrow, thisWeek, later] = await Promise.all(
        DASHBOARD_TODO_MERGE_BUCKETS.map((dueKind) =>
          window.mailClient.mail
            .listTodoMessages({
              accountId: null,
              dueKind,
              limit: DASHBOARD_TODO_FETCH_LIMIT
            })
            .catch(() => [] as MailListItem[])
        )
      )
      const merged = mergeTodoListsUnique([overdue, today, tomorrow, thisWeek, later])
      setDashTodoByKind({
        all: sortMessagesForTodoDashboardPreview(merged),
        overdue: sortMessagesForTodoDashboardPreview(overdue),
        today: sortMessagesForTodoDashboardPreview(today),
        tomorrow: sortMessagesForTodoDashboardPreview(tomorrow),
        week: sortMessagesForTodoDashboardPreview(thisWeek),
        later: sortMessagesForTodoDashboardPreview(later)
      })
    } catch {
      setDashTodoByKind({
        all: [],
        overdue: [],
        today: [],
        tomorrow: [],
        week: [],
        later: []
      })
    } finally {
      setDashTodoLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadWaiting()
    void loadSnoozed()
    void loadDashboardTodos()
  }, [loadDashboardTodos, loadSnoozed, loadWaiting])

  useEffect(() => {
    const off = window.mailClient.events.onMailChanged(() => {
      void loadWaiting()
      void loadSnoozed()
      void loadDashboardTodos()
      refreshLinkedCalendarPreview({ force: true })
    })
    return (): void => {
      off()
    }
  }, [loadDashboardTodos, loadSnoozed, loadWaiting, refreshLinkedCalendarPreview])

  useEffect(() => {
    const offCal = window.mailClient.events.onCalendarChanged(() => {
      refreshLinkedCalendarPreview({ force: true })
    })
    return offCal
  }, [refreshLinkedCalendarPreview])

  useEffect(() => {
    const onVis = (): void => {
      refreshLinkedCalendarPreview({ force: true })
    }
    window.addEventListener(CALENDAR_VISIBILITY_CHANGED_EVENT, onVis)
    return () => window.removeEventListener(CALENDAR_VISIBILITY_CHANGED_EVENT, onVis)
  }, [refreshLinkedCalendarPreview])

  const refreshDashboardMailLists = useCallback((): void => {
    void refreshNow()
    void loadWaiting()
    void loadSnoozed()
    void loadDashboardTodos()
    refreshLinkedCalendarPreview({ force: true })
  }, [loadDashboardTodos, loadSnoozed, loadWaiting, refreshLinkedCalendarPreview, refreshNow])

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
      setMessageRead: async (messageId, isRead): Promise<void> => {
        try {
          await setMessageRead(messageId, isRead)
        } finally {
          refreshDashboardMailLists()
        }
      },
      toggleMessageFlag: async (messageId): Promise<void> => {
        try {
          await toggleMessageFlag(messageId)
        } finally {
          refreshDashboardMailLists()
        }
      },
      archiveMessage: async (messageId): Promise<void> => {
        try {
          await archiveMessage(messageId)
        } finally {
          refreshDashboardMailLists()
        }
      },
      deleteMessage: async (messageId): Promise<void> => {
        try {
          if (listKind === 'todo') {
            await removeMailTodoRecordsForMessage(messageId)
          } else {
            await deleteMessage(messageId)
          }
        } finally {
          refreshDashboardMailLists()
        }
      },
      setTodoForMessage: async (messageId, dueKind): Promise<void> => {
        try {
          await setTodoForMessage(messageId, dueKind)
        } finally {
          refreshDashboardMailLists()
        }
      },
      completeTodoForMessage: async (messageId): Promise<void> => {
        try {
          await completeTodoForMessage(messageId)
        } finally {
          refreshDashboardMailLists()
        }
      },
      setWaitingForMessage: async (messageId, days): Promise<void> => {
        try {
          await setWaitingForMessage(messageId, days)
        } finally {
          refreshDashboardMailLists()
        }
      },
      clearWaitingForMessage: async (messageId): Promise<void> => {
        try {
          await clearWaitingForMessage(messageId)
        } finally {
          refreshDashboardMailLists()
        }
      },
      openSnoozePicker,
      refreshNow: async (): Promise<void> => {
        await refreshNow()
        refreshDashboardMailLists()
      }
    }),
    [
      openReply,
      openForward,
      selectMessage,
      t,
      listKind,
      setMessageRead,
      toggleMessageFlag,
      archiveMessage,
      deleteMessage,
      removeMailTodoRecordsForMessage,
      setTodoForMessage,
      completeTodoForMessage,
      setWaitingForMessage,
      clearWaitingForMessage,
      openSnoozePicker,
      refreshNow,
      refreshDashboardMailLists
    ]
  )

  const openDashboardMailContext = useCallback(
    async (
      e: React.MouseEvent,
      message: MailListItem,
      opts?: DashboardMailContextOpts
    ): Promise<void> => {
      e.preventDefault()
      e.stopPropagation()
      const anchor = { x: e.clientX, y: e.clientY }
      const ui = {
        snoozeAnchor: anchor,
        applyToMessageIds: opts?.applyToMessageIds,
        threadMessagesForContext: opts?.threadMessagesForContext
      }
      const categorySubmenu = await buildMailCategorySubmenuItems(message, ui, async () => {
        refreshDashboardMailLists()
      })
      const primaryAcc = accounts.find((a) => a.id === message.accountId)
      const items = buildMailContextItems(message, mailContextHandlers, {
        ...ui,
        categorySubmenu: categorySubmenu.length > 0 ? categorySubmenu : undefined,
        allowsCloudTaskCreate: accountSupportsCloudTasks(primaryAcc),
        removeMailTodoOnly: listKind === 'todo',
        t
      })
      setContextMenu({ x: anchor.x, y: anchor.y, items })
    },
    [mailContextHandlers, refreshDashboardMailLists, accounts, t, listKind]
  )

  const accountById = useMemo(
    () => new Map(accounts.map((a) => [a.id, a] as const)),
    [accounts]
  )

  const arrangeCtx = useMemo(
    () => ({
      folderWellKnown: null as string | null,
      accountLabel: (id: string): string => {
        const a = accountById.get(id)
        return a?.email ?? a?.displayName ?? id
      },
      todoDueBucketLabel: (kind: TodoDueKindList): string => t(`mail.todoBucket.${kind}`),
      noOpenTodoLabel: t('mail.noOpenTodo')
    }),
    [accountById, t]
  )

  const { threads, messagesByThread } = useMemo(
    () => indexMessagesByThread(messages, threadMessages, mailListUsesCrossAccountThreadScope(listKind)),
    [messages, threadMessages, listKind]
  )

  const mailboxFlagExcludedFolderIds = useMemo(
    () => buildMailboxFlagExcludedFolderIds(foldersByAccount),
    [foldersByAccount]
  )

  const filteredThreads = useMemo(() => {
    if (mailFilter === 'all') return threads
    if (mailFilter === 'unread') return threads.filter((t) => t.unreadCount > 0)
    if (mailFilter === 'flagged')
      return threads.filter((t) =>
        threadMatchesMailboxFlaggedFilter(
          t,
          messagesByThread,
          mailboxFlagExcludedFolderIds,
          flaggedFilterExcludeDeletedJunk
        )
      )
    if (mailFilter === 'with_todo') return threads.filter((t) => t.openTodoDueKind != null)
    return threads
  }, [
    threads,
    mailFilter,
    messagesByThread,
    mailboxFlagExcludedFolderIds,
    flaggedFilterExcludeDeletedJunk
  ])

  const { groupLabels, groupCounts, groupTodoDueKinds, flatRows } = useMemo(
    () =>
      computeMailListLayout(
        filteredThreads,
        messagesByThread,
        new Set(),
        'todo_bucket',
        mailListChronoOrder,
        arrangeCtx
      ),
    [filteredThreads, messagesByThread, mailListChronoOrder, arrangeCtx]
  )

  const groupedInboxPreview = useMemo(() => {
    type Row = (typeof flatRows)[number]
    const groups: { label: string; todoKind: TodoDueKindList | null; rows: Row[] }[] = []
    let offset = 0
    for (let gi = 0; gi < groupCounts.length; gi++) {
      const n = groupCounts[gi] ?? 0
      const slice = flatRows.slice(offset, offset + n)
      offset += n
      groups.push({
        label: groupLabels[gi] ?? '',
        todoKind: groupTodoDueKinds[gi] ?? null,
        rows: slice
      })
    }
    return groups
  }, [flatRows, groupCounts, groupLabels, groupTodoDueKinds])

  const dashboardInboxSections = useMemo(() => {
    let n = 0
    const sections: {
      key: string
      label: string
      todoKind: TodoDueKindList | null
      threads: ThreadGroup[]
    }[] = []
    for (let gi = 0; gi < groupedInboxPreview.length; gi++) {
      if (n >= DASHBOARD_INBOX_MAX_CONVERSATIONS) break
      const g = groupedInboxPreview[gi]!
      const threads: ThreadGroup[] = []
      for (const row of g.rows) {
        if (row.kind !== 'thread-head') continue
        if (n >= DASHBOARD_INBOX_MAX_CONVERSATIONS) break
        threads.push(row.thread)
        n++
      }
      if (threads.length > 0) {
        sections.push({
          key: `g${gi}:${g.label}`,
          label: g.label,
          todoKind: g.todoKind,
          threads
        })
      }
    }
    return sections
  }, [groupedInboxPreview])

  const openInboxFullCb = useCallback(async (): Promise<void> => {
    setMailListArrangeBy('todo_bucket')
    const sid = useMailStore.getState().selectedMessageId
    await selectUnifiedInbox({ preferredMessageId: sid })
    setAppMode('mail')
  }, [selectUnifiedInbox, setAppMode, setMailListArrangeBy])

  const openThreadMessageCb = useCallback(
    async (m: MailListItem): Promise<void> => {
      setMailListArrangeBy('todo_bucket')
      await selectMessage(m.id)
      setAppMode('mail')
    },
    [selectMessage, setAppMode, setMailListArrangeBy]
  )

  const favoriteFolders = useMemo(() => {
    const all: Array<{ folder: MailFolder; account: ConnectedAccount }> = []
    for (const acc of accounts) {
      const folders = foldersByAccount[acc.id] ?? []
      for (const f of folders) {
        if (f.isFavorite) all.push({ folder: f, account: acc })
      }
    }
    return all.sort((a, b) => {
      const byAcc = a.account.email.localeCompare(b.account.email, i18n.language)
      if (byAcc !== 0) return byAcc
      return a.folder.name.localeCompare(b.folder.name, i18n.language)
    })
  }, [accounts, foldersByAccount, i18n.language])

  const deadlineSections = useMemo(() => {
    if (listKind !== 'unified_inbox') {
      return [] as { key: string; label: string; threads: ThreadGroup[] }[]
    }
    const dueSoon: ThreadGroup[] = []
    const dueLater: ThreadGroup[] = []
    const important: ThreadGroup[] = []
    for (const tg of threads) {
      const k = tg.openTodoDueKind
      if (k === 'overdue' || k === 'today' || k === 'tomorrow') {
        dueSoon.push(tg)
      } else if (k === 'this_week' || k === 'later') {
        dueLater.push(tg)
      } else {
        const imp = (tg.latestMessage.importance ?? '').toLowerCase()
        if (imp === 'high' || tg.isFlagged) important.push(tg)
      }
    }
    const cap = (arr: ThreadGroup[]): ThreadGroup[] => arr.slice(0, DASHBOARD_COMPACT_MAX)
    const out: { key: string; label: string; threads: ThreadGroup[] }[] = []
    if (dueSoon.length > 0) out.push({ key: 'dueSoon', label: t('dashboard.deadlineDueSoon'), threads: cap(dueSoon) })
    if (dueLater.length > 0) out.push({ key: 'dueLater', label: t('dashboard.deadlineDueLater'), threads: cap(dueLater) })
    if (important.length > 0)
      out.push({ key: 'imp', label: t('dashboard.deadlineImportant'), threads: cap(important) })
    return out
  }, [listKind, threads, t])

  const recentSearches = useMemo(() => readRecentSearches(), [recentSearchTick])

  const openFromDashboard = useCallback(
    async (messageId: number): Promise<void> => {
      await openMessageInFolder(messageId)
      setAppMode('mail')
    },
    [openMessageInFolder, setAppMode]
  )

  const openWaitingFullCb = useCallback(async (): Promise<void> => {
    const sid = useMailStore.getState().selectedMessageId
    await selectWaitingView({ preferredMessageId: sid })
    setAppMode('mail')
  }, [selectWaitingView, setAppMode])

  const openSnoozedFullCb = useCallback(async (): Promise<void> => {
    const sid = useMailStore.getState().selectedMessageId
    await selectSnoozedView({ preferredMessageId: sid })
    setAppMode('mail')
  }, [selectSnoozedView, setAppMode])

  const openTodoFullCb = useCallback(
    async (dueKind: TodoDueKindList | null): Promise<void> => {
      const sid = useMailStore.getState().selectedMessageId
      await selectTodoView(dueKind, { preferredMessageId: sid })
      setAppMode('mail')
    },
    [selectTodoView, setAppMode]
  )

  const runSearchWithQuery = useCallback(async (raw: string): Promise<void> => {
    const q = raw.trim()
    if (q.length < 2) return
    pushRecentSearch(q)
    setRecentSearchTick((x) => x + 1)
    setDashSearchLoading(true)
    try {
      const res = await window.mailClient.mail.search(q, 8)
      setDashSearchHits(res)
    } catch {
      setDashSearchHits([])
    } finally {
      setDashSearchLoading(false)
    }
  }, [])

  const runDashSearch = useCallback(async (): Promise<void> => {
    await runSearchWithQuery(dashSearchQuery)
  }, [dashSearchQuery, runSearchWithQuery])

  const openFullSearchCb = useCallback((): void => {
    const q = dashSearchQuery.trim()
    if (q.length >= 2) pushRecentSearch(q)
    setRecentSearchTick((x) => x + 1)
    setAppMode('mail')
    window.requestAnimationFrame(() => requestFocusMainSearch())
  }, [dashSearchQuery, setAppMode])

  const customWizardCalendarEvents = useMemo(() => {

    const m = new Map<string, CalendarEventView>()

    for (const e of upcomingEvents) m.set(e.id, e)

    for (const e of weekEvents) {

      if (!m.has(e.id)) m.set(e.id, e)

    }

    for (const e of monthEvents) {
      if (!m.has(e.id)) m.set(e.id, e)
    }

    return [...m.values()]

  }, [monthEvents, upcomingEvents, weekEvents])



  const getCustomTileBody = useCallback(

    (entry: DashboardCustomTileStored) => (

      <DashboardCustomTileBody

        entry={entry}

        accountById={accountById}

        onOpenInApp={(): void => {

          if (entry.kind === 'folder' && entry.folderId != null)

            void selectFolder(entry.accountId, entry.folderId).then(() => setAppMode('mail'))

          else if (entry.kind === 'calendar_event') setAppMode('calendar')

          else if (entry.kind === 'mail' && entry.messageId != null)

            void openMessageInFolder(entry.messageId).then(() => setAppMode('mail'))

        }}

      />

    ),

    [accountById, openMessageInFolder, selectFolder, setAppMode]

  )



  const dashboardTiles = useMemo(
    () => [
      {
        id: 'todo_all' as const,
        icon: ListTodo,
        title: t('dashboard.tiles.todoAllTitle'),
        subtitle: t('dashboard.tiles.todoAllSubtitle'),
        onOpenFull: (): void => void openTodoFullCb(null),
        body: (
          <DashboardTodoMessageList
            loading={dashTodoLoading}
            messages={dashTodoByKind.all}
            emptyLabel={t('dashboard.todoEmpty')}
            accountById={accountById}
            openFromDashboard={openFromDashboard}
            onContextMail={(e, message): void => {
              void openDashboardMailContext(e, message)
            }}
            t={t}
          />
        )
      },
      {
        id: 'todo_overdue' as const,
        icon: AlarmClock,
        title: t('dashboard.tiles.todoOverdueTitle'),
        subtitle: t('dashboard.tiles.todoOverdueSubtitle'),
        onOpenFull: (): void => void openTodoFullCb('overdue'),
        body: (
          <DashboardTodoMessageList
            loading={dashTodoLoading}
            messages={dashTodoByKind.overdue}
            emptyLabel={t('dashboard.todoEmpty')}
            accountById={accountById}
            openFromDashboard={openFromDashboard}
            onContextMail={(e, message): void => {
              void openDashboardMailContext(e, message)
            }}
            t={t}
          />
        )
      },
      {
        id: 'todo_today' as const,
        icon: Sun,
        title: t('dashboard.tiles.todoTodayTitle'),
        subtitle: t('dashboard.tiles.todoTodaySubtitle'),
        onOpenFull: (): void => void openTodoFullCb('today'),
        body: (
          <DashboardTodoMessageList
            loading={dashTodoLoading}
            messages={dashTodoByKind.today}
            emptyLabel={t('dashboard.todoEmpty')}
            accountById={accountById}
            openFromDashboard={openFromDashboard}
            onContextMail={(e, message): void => {
              void openDashboardMailContext(e, message)
            }}
            t={t}
          />
        )
      },
      {
        id: 'todo_tomorrow' as const,
        icon: Sunrise,
        title: t('dashboard.tiles.todoTomorrowTitle'),
        subtitle: t('dashboard.tiles.todoTomorrowSubtitle'),
        onOpenFull: (): void => void openTodoFullCb('tomorrow'),
        body: (
          <DashboardTodoMessageList
            loading={dashTodoLoading}
            messages={dashTodoByKind.tomorrow}
            emptyLabel={t('dashboard.todoEmpty')}
            accountById={accountById}
            openFromDashboard={openFromDashboard}
            onContextMail={(e, message): void => {
              void openDashboardMailContext(e, message)
            }}
            t={t}
          />
        )
      },
      {
        id: 'todo_week' as const,
        icon: CalendarRange,
        title: t('dashboard.tiles.todoWeekTitle'),
        subtitle: t('dashboard.tiles.todoWeekSubtitle'),
        onOpenFull: (): void => void openTodoFullCb('this_week'),
        body: (
          <DashboardTodoMessageList
            loading={dashTodoLoading}
            messages={dashTodoByKind.week}
            emptyLabel={t('dashboard.todoEmpty')}
            accountById={accountById}
            openFromDashboard={openFromDashboard}
            onContextMail={(e, message): void => {
              void openDashboardMailContext(e, message)
            }}
            t={t}
          />
        )
      },
      {
        id: 'todo_later' as const,
        icon: InfinityIcon,
        title: t('dashboard.tiles.todoLaterTitle'),
        subtitle: t('dashboard.tiles.todoLaterSubtitle'),
        onOpenFull: (): void => void openTodoFullCb('later'),
        body: (
          <DashboardTodoMessageList
            loading={dashTodoLoading}
            messages={dashTodoByKind.later}
            emptyLabel={t('dashboard.todoEmpty')}
            accountById={accountById}
            openFromDashboard={openFromDashboard}
            onContextMail={(e, message): void => {
              void openDashboardMailContext(e, message)
            }}
            t={t}
          />
        )
      },
      {
        id: 'inbox' as const,
        icon: Inbox,
        title: t('dashboard.tiles.inboxTitle'),
        subtitle: t('dashboard.tiles.inboxSubtitle'),
        onOpenFull: (): void => void openInboxFullCb(),
        body: (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  {t('dashboard.loading.inbox')}
                </div>
              ) : error ? (
                <div className="px-3 py-4 text-xs text-destructive">{error}</div>
              ) : listKind !== 'unified_inbox' && listKind !== 'meta_folder' ? (
                <div className="px-3 py-4 text-xs text-muted-foreground">
                  {t('dashboard.inboxHintOpenUnified')}
                </div>
              ) : dashboardInboxSections.length === 0 ? (
                <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                  {t('dashboard.inboxEmpty')}
                </div>
              ) : (
                dashboardInboxSections.map((g) => (
                  <div key={g.key} className="border-b border-border/60 last:border-b-0">
                    <div className="flex items-center gap-2 bg-muted/40 px-3 py-1.5">
                      {g.todoKind != null ? (
                        <TodoDueBucketBadge kind={g.todoKind} />
                      ) : (
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {g.label}
                        </span>
                      )}
                    </div>
                    <ul className="divide-y divide-border/40">
                      {g.threads.map((thread) => {
                        const latest = thread.latestMessage
                        const root = thread.rootMessage
                        const account = accountById.get(thread.accountId) ?? null
                        const isUnread = thread.unreadCount > 0
                        const threadMessagesForContext = messagesByThread.get(thread.threadKey) ?? [latest]
                        const threadContextOpts =
                          threadMessagesForContext.length > 1
                            ? {
                                applyToMessageIds: threadMessagesForContext.map((m) => m.id),
                                threadMessagesForContext
                              }
                            : undefined
                        const senderLabel =
                          thread.messageCount > 1 && thread.participantNames.length > 1
                            ? formatParticipants(thread.participantNames)
                            : root.fromName || root.fromAddr || t('common.unknown')
                        return (
                          <li key={thread.threadKey}>
                            <button
                              type="button"
                              onClick={(): void => void openThreadMessageCb(latest)}
                              onContextMenu={(e): void => {
                                void openDashboardMailContext(e, latest, threadContextOpts)
                              }}
                              className={cn(
                                'group relative flex w-full items-start gap-2 px-3 py-2 text-left text-xs transition-colors',
                                'hover:bg-secondary/50'
                              )}
                            >
                              {account && (
                                <AccountColorStripe color={account.color} className={UNIFIED_STRIPE} />
                              )}
                              <StatusDot
                                variant={isUnread ? 'unread' : 'read'}
                                size="sm"
                                className="mt-1 shrink-0"
                                title={isUnread ? t('mail.list.unread') : t('mail.list.read')}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span
                                    className={cn(
                                      'min-w-0 flex-1 truncate',
                                      isUnread ? 'font-semibold text-foreground' : 'text-foreground/90'
                                    )}
                                  >
                                    {senderLabel}
                                  </span>
                                  {thread.messageCount > 1 && (
                                    <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground">
                                      ({thread.messageCount})
                                    </span>
                                  )}
                                  {thread.isFlagged && (
                                    <Star className="h-3 w-3 shrink-0 fill-status-flagged text-status-flagged" />
                                  )}
                                  {thread.hasAttachments && (
                                    <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                                  )}
                                </div>
                                <div
                                  className={cn(
                                    'truncate text-[11px]',
                                    isUnread ? 'text-foreground/85' : 'text-muted-foreground'
                                  )}
                                >
                                  {root.subject || t('common.noSubject')}
                                </div>
                              </div>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ))
              )}
            </div>
          </div>
        )
      },
      {
        id: 'waiting' as const,
        icon: Reply,
        title: t('dashboard.tiles.waitingTitle'),
        subtitle: t('dashboard.tiles.waitingSubtitle'),
        onOpenFull: (): void => void openWaitingFullCb(),
        body: (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {waitingLoading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  {t('dashboard.loading.generic')}
                </div>
              ) : waitingMessages.length === 0 ? (
                <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                  {t('dashboard.waitingEmpty')}
                </div>
              ) : (
                <ul className="divide-y divide-border/40">
                  {waitingMessages.map((m) => {
                    const account = accountById.get(m.accountId) ?? null
                    return (
                      <li key={m.id}>
                        <button
                          type="button"
                          onClick={(): void => void openFromDashboard(m.id)}
                          className={cn(
                            'group relative flex w-full items-start gap-2 px-3 py-2 text-left text-xs transition-colors',
                            'hover:bg-secondary/50'
                          )}
                        >
                          {account && (
                            <AccountColorStripe color={account.color} className={UNIFIED_STRIPE} />
                          )}
                          <StatusDot
                            variant={m.isRead ? 'read' : 'unread'}
                            size="sm"
                            className="mt-1 shrink-0"
                            title={m.isRead ? t('mail.list.read') : t('mail.list.unread')}
                          />
                          <div className="min-w-0 flex-1">
                            <div
                              className={cn(
                                'truncate',
                                m.isRead ? 'text-foreground/90' : 'font-semibold text-foreground'
                              )}
                            >
                              {m.fromName || m.fromAddr || t('common.unknown')}
                            </div>
                            <div className="truncate text-[11px] text-muted-foreground">
                              {m.subject || t('common.noSubject')}
                            </div>
                            {m.waitingForReplyUntil ? (
                              <div className="mt-0.5 text-[10px] text-muted-foreground/90">
                                {t('dashboard.waitingUntil', {
                                  date: ((): string => {
                                    const d = parseISO(m.waitingForReplyUntil!)
                                    return Number.isNaN(d.getTime())
                                      ? m.waitingForReplyUntil!
                                      : format(d, 'P', { locale: dfLocale })
                                  })()
                                })}
                              </div>
                            ) : null}
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        )
      },
      {
        id: 'snoozed' as const,
        icon: Moon,
        title: t('dashboard.tiles.snoozedTitle'),
        subtitle: t('dashboard.tiles.snoozedSubtitle'),
        onOpenFull: (): void => void openSnoozedFullCb(),
        body: (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {snoozedLoading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  {t('dashboard.loading.generic')}
                </div>
              ) : snoozedItems.length === 0 ? (
                <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                  {t('dashboard.snoozedEmpty')}
                </div>
              ) : (
                <ul className="divide-y divide-border/40">
                  {snoozedItems.map((m) => {
                    const account = accountById.get(m.accountId) ?? null
                    return (
                      <li key={m.id}>
                        <button
                          type="button"
                          onClick={(): void => void openFromDashboard(m.id)}
                          className={cn(
                            'group relative flex w-full items-start gap-2 px-3 py-2 text-left text-xs transition-colors',
                            'hover:bg-secondary/50'
                          )}
                        >
                          {account && (
                            <AccountColorStripe color={account.color} className={UNIFIED_STRIPE} />
                          )}
                          <StatusDot
                            variant={m.isRead ? 'read' : 'unread'}
                            size="sm"
                            className="mt-1 shrink-0"
                            title={m.isRead ? t('mail.list.read') : t('mail.list.unread')}
                          />
                          <div className="min-w-0 flex-1">
                            <div
                              className={cn(
                                'truncate',
                                m.isRead ? 'text-foreground/90' : 'font-semibold text-foreground'
                              )}
                            >
                              {m.subject || t('common.noSubject')}
                            </div>
                            <div className="truncate text-[10px] text-muted-foreground">
                              {formatSnoozeWakeShort(m.snoozedUntil, dfLocale)}
                            </div>
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        )
      },
      {
        id: 'search' as const,
        icon: Search,
        title: t('dashboard.tiles.searchTitle'),
        subtitle: t('dashboard.tiles.searchSubtitle'),
        onOpenFull: openFullSearchCb,
        body: (
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-2 py-2">
            <div className="flex shrink-0 gap-1.5">
              <input
                type="search"
                value={dashSearchQuery}
                onChange={(e): void => setDashSearchQuery(e.target.value)}
                onKeyDown={(e): void => {
                  if (e.key === 'Enter') void runDashSearch()
                }}
                placeholder={t('dashboard.searchPlaceholder')}
                className="min-h-0 min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
              />
              <button
                type="button"
                onClick={(): void => void runDashSearch()}
                className="shrink-0 rounded-md border border-border bg-secondary/50 px-2 py-1.5 text-[11px] font-medium text-foreground hover:bg-secondary"
              >
                {t('dashboard.searchButton')}
              </button>
            </div>
            {recentSearches.length > 0 ? (
              <div className="min-h-0 shrink-0">
                <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t('dashboard.recent')}
                </div>
                <div className="flex flex-wrap gap-1">
                  {recentSearches.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={(): void => {
                        setDashSearchQuery(q)
                        void runSearchWithQuery(q)
                      }}
                      className="max-w-full truncate rounded-md border border-border/80 bg-muted/30 px-2 py-0.5 text-[10px] text-foreground hover:bg-muted/60"
                      title={q}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-border/50 pt-2">
              {dashSearchLoading ? (
                <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  {t('dashboard.loading.search')}
                </div>
              ) : dashSearchHits.length === 0 ? (
                <div className="py-3 text-center text-[11px] text-muted-foreground">
                  {t('dashboard.searchHitsEmpty')}
                </div>
              ) : (
                <ul className="divide-y divide-border/40">
                  {dashSearchHits.map((hit) => (
                    <li key={hit.id}>
                      <button
                        type="button"
                        onClick={(): void => void openFromDashboard(hit.id)}
                        className="flex w-full flex-col items-start gap-0.5 px-2 py-1.5 text-left text-[11px] transition-colors hover:bg-secondary/50"
                      >
                        <span className="truncate font-medium text-foreground">
                          {hit.subject || t('common.noSubject')}
                        </span>
                        <span className="truncate text-[10px] text-muted-foreground">
                          {hit.fromName || hit.fromAddr || ''}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )
      },
      {
        id: 'calendar' as const,
        icon: Calendar,
        title: t('dashboard.tiles.calendarTitle'),
        subtitle: undefined,
        onOpenFull: (): void => setAppMode('calendar'),
        body: (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {calendarLoading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  {t('dashboard.loading.calendar')}
                </div>
              ) : calendarError ? (
                <div className="px-3 py-4 text-xs text-destructive">{calendarError}</div>
              ) : upcomingEvents.length === 0 ? (
                <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                  {t('dashboard.calendarNoEvents')}
                </div>
              ) : (
                <ul className="divide-y divide-border/40">
                  {upcomingEvents.map((ev) => (
                    <li key={ev.id}>
                      <button
                        type="button"
                        onClick={(): void => {
                          useCalendarPendingFocusStore.getState().queueFocusEvent(ev)
                          setAppMode('calendar')
                        }}
                        className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left text-xs transition-colors hover:bg-secondary/50"
                      >
                        <span
                          className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                          style={eventDotStyle(ev, accounts)}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-foreground">
                            {ev.title || t('dashboard.noTitle')}
                          </div>
                          <div className="mt-0.5 text-[11px] text-muted-foreground">
                            {formatEventWhenShort(ev, dfLocale, t('dashboard.allDay'))}
                          </div>
                          <div className="mt-0.5 truncate text-[10px] text-muted-foreground/90">
                            {ev.accountEmail}
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )
      },
      {
        id: 'next_online_meeting' as const,
        icon: Video,
        title: t('dashboard.tiles.nextOnlineMeetingTitle'),
        subtitle: t('dashboard.tiles.nextOnlineMeetingSubtitle'),
        onOpenFull: (): void => {
          if (nextOnlineMeeting) {
            useCalendarPendingFocusStore.getState().queueFocusEvent(nextOnlineMeeting)
          }
          setAppMode('calendar')
        },
        body: (
          <DashboardNextMeetingTile
            event={nextOnlineMeeting}
            loading={nextOnlineMeetingLoading}
            error={calendarError}
            hasLinkedCalendars={calendarLinkedAccounts.length > 0}
          />
        )
      },
      {
        id: 'week' as const,
        icon: PanelTop,
        title: t('dashboard.tiles.weekTitle'),
        subtitle: t('dashboard.tiles.weekSubtitle'),
        onOpenFull: (): void => setAppMode('calendar'),
        body: (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <DashboardMiniWeek
              onOpenCalendarDay={(day): void => {
                useCalendarPendingFocusStore.getState().queueGotoDate(formatISO(startOfDay(day)))
                setAppMode('calendar')
              }}
              onCreateEventOnDay={(day): void => {
                useCalendarPendingFocusStore.getState().queueCreateEventOnDay(formatISO(startOfDay(day)))
                setAppMode('calendar')
              }}
            />
          </div>
        )
      },
      {
        id: 'month' as const,
        icon: CalendarDays,
        title: t('dashboard.tiles.monthTitle'),
        subtitle: t('dashboard.tiles.monthSubtitle'),
        onOpenFull: (): void => setAppMode('calendar'),
        body: (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <DashboardMiniMonth
              onOpenCalendarDay={(day): void => {
                useCalendarPendingFocusStore.getState().queueGotoDate(formatISO(startOfDay(day)))
                setAppMode('calendar')
              }}
              onCreateEventOnDay={(day): void => {
                useCalendarPendingFocusStore.getState().queueCreateEventOnDay(formatISO(startOfDay(day)))
                setAppMode('calendar')
              }}
            />
          </div>
        )
      },
      {
        id: 'today_timeline' as const,
        icon: CalendarClock,
        title: t('dashboard.tiles.todayTimelineTitle'),
        subtitle: t('dashboard.tiles.todayTimelineSubtitle'),
        onOpenFull: (): void => setAppMode('calendar'),
        body: (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <DashboardTodayTimeline
              events={weekEvents}
              accounts={accounts}
              loading={weekEventsLoading}
              hasLinkedCalendars={calendarLinkedAccounts.length > 0}
              onOpenEvent={(ev): void => {
                useCalendarPendingFocusStore.getState().queueFocusEvent(ev)
                setAppMode('calendar')
              }}
              onCreateEventOnDay={(day): void => {
                useCalendarPendingFocusStore.getState().queueCreateEventOnDay(formatISO(startOfDay(day)))
                setAppMode('calendar')
              }}
            />
          </div>
        )
      },
      {
        id: 'deadlines' as const,
        icon: AlarmClock,
        title: t('dashboard.tiles.deadlinesTitle'),
        subtitle: t('dashboard.tiles.deadlinesSubtitle'),
        onOpenFull: (): void => void openInboxFullCb(),
        body: (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {listKind !== 'unified_inbox' && listKind !== 'meta_folder' ? (
                <div className="px-3 py-4 text-xs text-muted-foreground">
                  {t('dashboard.deadlinesHintOpenUnified')}
                </div>
              ) : deadlineSections.length === 0 ? (
                <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                  {t('dashboard.deadlinesEmpty')}
                </div>
              ) : (
                deadlineSections.map((sec) => (
                  <div key={sec.key} className="border-b border-border/60 last:border-b-0">
                    <div className="bg-muted/40 px-3 py-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {sec.label}
                      </span>
                    </div>
                    <ul className="divide-y divide-border/40">
                      {sec.threads.map((thread) => {
                        const latest = thread.latestMessage
                        const root = thread.rootMessage
                        const account = accountById.get(thread.accountId) ?? null
                        const isUnread = thread.unreadCount > 0
                        const senderLabel =
                          thread.messageCount > 1 && thread.participantNames.length > 1
                            ? formatParticipants(thread.participantNames)
                            : root.fromName || root.fromAddr || t('common.unknown')
                        return (
                          <li key={thread.threadKey}>
                            <button
                              type="button"
                              onClick={(): void => void openThreadMessageCb(latest)}
                              className={cn(
                                'group relative flex w-full items-start gap-2 px-3 py-2 text-left text-xs transition-colors',
                                'hover:bg-secondary/50'
                              )}
                            >
                              {account && (
                                <AccountColorStripe color={account.color} className={UNIFIED_STRIPE} />
                              )}
                              <StatusDot
                                variant={isUnread ? 'unread' : 'read'}
                                size="sm"
                                className="mt-1 shrink-0"
                                title={isUnread ? t('mail.list.unread') : t('mail.list.read')}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span
                                    className={cn(
                                      'min-w-0 flex-1 truncate',
                                      isUnread ? 'font-semibold text-foreground' : 'text-foreground/90'
                                    )}
                                  >
                                    {senderLabel}
                                  </span>
                                  {thread.isFlagged && (
                                    <Star className="h-3 w-3 shrink-0 fill-status-flagged text-status-flagged" />
                                  )}
                                </div>
                                <div className="truncate text-[11px] text-muted-foreground">
                                  {root.subject || t('common.noSubject')}
                                </div>
                              </div>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ))
              )}
            </div>
          </div>
        )
      },
      {
        id: 'favorites' as const,
        icon: Star,
        title: t('dashboard.tiles.favoritesTitle'),
        subtitle: t('dashboard.tiles.favoritesSubtitle'),
        body: (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
              {favoriteFolders.length === 0 ? (
                <div className="px-2 py-6 text-center text-xs text-muted-foreground">
                  {t('dashboard.favoritesEmpty')}
                </div>
              ) : (
                <ul className="space-y-1">
                  {favoriteFolders.map(({ folder, account }) => {
                    const n = folder.unreadCount
                    return (
                      <li key={`${account.id}-${folder.id}`}>
                        <button
                          type="button"
                          onClick={(): void => {
                            void selectFolder(account.id, folder.id).then(() => setAppMode('mail'))
                          }}
                          className="flex w-full items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/20 px-2.5 py-2 text-left text-xs transition-colors hover:bg-secondary/50"
                        >
                          <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                            {folder.name}
                          </span>
                          <span className="shrink-0 truncate text-[10px] text-muted-foreground">
                            {account.email}
                          </span>
                          {n > 0 ? (
                            <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-primary">
                              {n > 99 ? '99+' : n}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        )
      },
      {
        id: 'weather' as const,
        icon: CloudSun,
        title: t('dashboard.tiles.weatherTitle'),
        subtitle: t('dashboard.tiles.weatherSubtitle'),
        body: (
          <DashboardWeatherTile
            latitude={weatherLatitude}
            longitude={weatherLongitude}
            locationName={weatherLocationName}
            calendarTimeZone={calendarTimeZoneConfig}
          />
        )
      },
      {
        id: 'today_clock' as const,
        icon: Clock,
        title: t('dashboard.tiles.todayClockTitle'),
        subtitle: t('dashboard.tiles.todayClockSubtitle'),
        onOpenFull: (): void => {
          useCalendarPendingFocusStore.getState().queueGotoDate(formatISO(startOfDay(new Date())))
          setAppMode('calendar')
        },
        body: <DashboardTodayClock />
      },
      {
        id: 'world_clock' as const,
        icon: Globe,
        title: t('dashboard.tiles.worldClockTitle'),
        subtitle: t('dashboard.tiles.worldClockSubtitle'),
        body: <DashboardTodayClock storageKey={DASHBOARD_SECOND_CLOCK_TIME_ZONE_STORAGE_KEY} />
      },
      {
        id: 'desk_note' as const,
        icon: StickyNote,
        title: t('dashboard.tiles.deskNoteTitle'),
        subtitle: t('dashboard.tiles.deskNoteSubtitle'),
        body: <DashboardDeskNoteTile />
      },
      {
        id: 'composer' as const,
        icon: PenLine,
        title: t('dashboard.tiles.composerTitle'),
        subtitle: t('dashboard.tiles.composerSubtitle'),
        body: <DashboardComposeTile />
      }
    ],
    [
      accountById,
      accounts,
      calendarError,
      calendarLinkedAccounts,
      calendarLoading,
      calendarTimeZoneConfig,
      dashSearchHits,
      dashSearchLoading,
      dashSearchQuery,
      dashTodoByKind,
      dashTodoLoading,
      deadlineSections,
      dashboardInboxSections,
      dfLocale,
      error,
      favoriteFolders,
      listKind,
      loading,
      messagesByThread,
      nextOnlineMeeting,
      nextOnlineMeetingLoading,
      previewRangeEvents,
      openDashboardMailContext,
      openFromDashboard,
      openFullSearchCb,
      openInboxFullCb,
      openSnoozedFullCb,
      openThreadMessageCb,
      openTodoFullCb,
      openWaitingFullCb,
      recentSearches,
      runDashSearch,
      runSearchWithQuery,
      selectFolder,
      setAppMode,
      snoozedItems,
      snoozedLoading,
      t,
      upcomingEvents,
      waitingLoading,
      waitingMessages,
      weekEvents,
      weatherLatitude,
      weatherLongitude,
      weatherLocationName
    ]
  )

  return (
    <main
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden"
      aria-label={t('dashboard.mainAria')}
    >
      <div className="relative isolate min-h-full min-w-0 w-full flex-1 flex flex-col">
        <div className="dashboard-glass-canvas" aria-hidden />
        <div className="relative z-[1] flex min-h-full min-w-0 flex-1 flex-col">
          <div className="flex w-full shrink-0 flex-col gap-1 px-4 pb-2 pt-4">
            <h1 className="text-lg font-semibold text-foreground">{t('dashboard.heading')}</h1>
          </div>
          <DashboardTileGrid
            tiles={dashboardTiles}
            getCustomTileBody={getCustomTileBody}
            customWizardCalendarEvents={customWizardCalendarEvents}
          />
        </div>
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
    </main>
  )
}
