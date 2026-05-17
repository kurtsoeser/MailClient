import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal, flushSync } from 'react-dom'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import multiMonthPlugin from '@fullcalendar/multimonth'
import interactionPlugin from '@fullcalendar/interaction'
import luxonPlugin from '@fullcalendar/luxon'
import deLocale from '@fullcalendar/core/locales/de'
import enGbLocale from '@fullcalendar/core/locales/en-gb'
import type { EventChangeArg, EventInput, EventSourceInput } from '@fullcalendar/core'
import {
  addMonths,
  compareAsc,
  format,
  isSameDay,
  parseISO,
  startOfDay,
  startOfMonth,
  differenceInCalendarDays
} from 'date-fns'
import { de as deFns, enUS as enUSFns } from 'date-fns/locale'
import type { Locale } from 'date-fns'
import {
  CheckSquare,
  Eye,
  EyeOff,
  Mails,
  StickyNote,
  PanelLeftClose,
  PanelRightClose,
  Search,
  SquareArrowOutUpRight,
  CalendarPlus
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAccountsStore } from '@/stores/accounts'
import { useCalendarPendingFocusStore } from '@/stores/calendar-pending-focus'
import { useMailStore } from '@/stores/mail'
import { useComposeStore } from '@/stores/compose'
import { useSnoozeUiStore } from '@/stores/snooze-ui'
import { CalendarEventSearchDialog } from '@/app/calendar/CalendarEventSearchDialog'
import { showAppConfirm } from '@/stores/app-dialog'
import type {
  CalendarEventView,
  CalendarGraphCalendarRow,
  ConnectedAccount,
  MailListItem,
  TodoDueKindOpen,
  UserNoteListItem
} from '@shared/types'
import {
  graphCalendarColorToDisplayHex,
  resolveCalendarDisplayHex,
  GRAPH_CALENDAR_COLOR_PRESET_IDS,
  type GraphCalendarColorPresetId
} from '@shared/graph-calendar-colors'
import {
  CALENDAR_KIND_MAIL_TODO,
  mailTodoItemsToFullCalendarEvents,
  computePersistIsoRangeForMailTodo
} from '@/app/calendar/mail-todo-calendar'
import {
  CALENDAR_KIND_CLOUD_TASK,
  cloudTaskEventId,
  cloudTasksToFullCalendarEvents,
  computePersistTargetForCloudTask
} from '@/app/calendar/cloud-task-calendar'
import {
  CALENDAR_KIND_USER_NOTE,
  computePersistTargetForUserNote,
  notesToFullCalendarEvents,
  userNoteEventId
} from '@/app/calendar/notes-calendar'
import {
  scheduleRemoveCloudTaskCalendarEventsByTaskKey,
  scheduleRemoveDuplicateFullCalendarEventsById
} from '@/app/calendar/calendar-fc-event-source'
import { applyCloudTaskPersistTarget } from '@/app/calendar/apply-cloud-task-persist'
import {
  applyOptimisticCloudTaskPersistToLayer,
  syncFullCalendarCloudTaskEventFromLayer
} from '@/app/calendar/optimistic-cloud-task-calendar'
import { useCalendarFcEventContent } from '@/app/calendar/use-calendar-fc-event-content'
import {
  applyMultiMonthEventDotMount,
  capEventInputsForMultiMonthView,
  isMultiMonthFcView,
  multiMonthDatesSetKey,
  MULTI_MONTH_QUARTER_VIEW_ID,
  MULTI_MONTH_YEAR_VIEW_ID,
  shouldSkipHeavyCalendarLayersForMultiMonth
} from '@/app/calendar/calendar-fc-multimonth'
import {
  QUICK_CREATE_PLACEHOLDER_EVENT_ID,
  quickCreateRangeToFcPlaceholder
} from '@/app/calendar/calendar-quick-create-placeholder'
import type { CalendarCreateRange } from '@/app/tasks/tasks-calendar-create-range'
import { useCalendarSyncStore } from '@/stores/calendar-sync'
import { useAppModeStore } from '@/stores/app-mode'
import { useNotesPendingFocusStore } from '@/stores/notes-pending-focus'
import { CloudTaskItemPreview } from '@/app/calendar/CloudTaskItemPreview'
import { loadPlannedScheduleMapForTasks } from '@/app/work-items/load-planned-schedules'
import {
  cloudTaskCalendarDisplaySignature,
  filterCloudTasksInCalendarRange,
  loadCloudTasksForAccount,
  loadUnifiedCloudTasks
} from '@/app/tasks/tasks-calendar-load'
import type { TaskItemWithContext } from '@/app/tasks/tasks-types'
import { cloudTaskStableKey } from '@shared/work-item-keys'
import type { WorkItemPlannedSchedule, WorkItem } from '@shared/work-item'
import { cn } from '@/lib/utils'
import { openExternalUrl } from '@/lib/open-external'
import { buildAccountColorAndNewContextItems } from '@/lib/account-sidebar-context-menu'
import { CalendarEventDialog } from '@/app/calendar/CalendarEventDialog'
import {
  CalendarCreateQuickPopover,
  type CalendarCreateQuickDraft
} from '@/app/calendar/CalendarCreateQuickPopover'
import { CalendarEventPreview } from '@/app/calendar/CalendarEventPreview'
import { ContextMenu, type ContextMenuItem } from '@/components/ContextMenu'
import {
  ModuleColumnHeaderIconButton,
  ModuleColumnHeaderStackedTitle,
  moduleColumnHeaderDockBarRowClass,
  moduleColumnHeaderIconGlyphClass,
  moduleColumnHeaderUppercaseLabelClass
} from '@/components/ModuleColumnHeader'
import { CalendarRightZeitlistePanel } from '@/app/calendar/CalendarRightZeitlistePanel'
import { ObjectNoteDialog, type ObjectNoteTarget } from '@/components/ObjectNoteEditor'
import {
  buildCalendarEventCategorySubmenuItems,
  buildCalendarEventTransferSubmenuItems,
  buildCalendarEventContextItems,
  formatCalendarEventClipboardText
} from '@/lib/calendar-event-context-menu'
import {
  pickAndSendCalendarEventToNotion,
  runNotionSendWithErrorHandling,
  sendCalendarEventAsNewNotionPage
} from '@/lib/notion-ui'
import {
  buildMailCategorySubmenuItems,
  buildMailContextItems,
  type MailContextHandlers
} from '@/lib/mail-context-menu'
import { accountSupportsCloudTasks } from '@/lib/cloud-task-accounts'
import { deleteCalendarEventIpc } from '@/lib/calendar-ipc'
import { applyCalendarEventDomColors } from '@/lib/calendar-event-chip-style'
import { accountColorToCssBackground } from '@/lib/avatar-color'
import { ReadingPane } from '@/app/layout/ReadingPane'
import { GLOBAL_CREATE_EVENT, useGlobalCreateNavigateStore } from '@/lib/global-create'
import { VerticalSplitter, useResizableWidth } from '@/components/ResizableSplitter'
import { useCalendarPanelLayoutStore } from '@/stores/calendar-panel-layout'
import { CalendarFloatingPanel } from '@/app/calendar/CalendarFloatingPanel'
import { CalendarDockPanelSlide } from '@/app/calendar/CalendarDockPanelSlide'
import { CalendarDockStripFrame } from '@/app/calendar/CalendarDockStripFrame'
import { useCalendarMailExternalDrop } from '@/lib/use-calendar-mail-external-drop'
import { useCalendarCloudTaskExternalDrop } from '@/lib/use-calendar-cloud-task-external-drop'
import type { CloudTaskDragPayload } from '@/app/tasks/tasks-cloud-task-dnd'
import { buildCalendarIncludeCalendars } from '@/lib/build-calendar-include-calendars'
import {
  CALENDAR_VISIBILITY_CHANGED_EVENT,
  calendarVisibilityKey,
  dispatchCalendarVisibilityChanged,
  HIDDEN_CALENDARS_STORAGE_KEY,
  parseCalendarVisibilityKey,
  readHiddenCalendarKeysFromStorage,
  readM365GroupCalVisibilitySeededKeys,
  readSidebarHiddenCalendarKeysFromStorage,
  persistM365GroupCalVisibilitySeededKeys,
  SIDEBAR_HIDDEN_CALENDARS_STORAGE_KEY
} from '@/lib/calendar-visibility-storage'
import { ModuleNavMiniMonth } from '@/components/ModuleNavMiniMonth'
import {
  CalendarShellHeader,
  type CalendarSidebarHiddenRestoreEntry
} from '@/app/calendar/CalendarShellHeader'
import { CalendarShellAlerts } from '@/app/calendar/CalendarShellAlerts'
import { CalendarShellLoadingOverlay } from '@/app/calendar/CalendarShellLoadingOverlay'
import { CalendarShellSidebarCalendars } from '@/app/calendar/CalendarShellSidebarCalendars'
import { CalendarShellOverlayToggles } from '@/app/calendar/shell/CalendarShellOverlayToggles'
import {
  CAL_FLOAT_INBOX_SIZE_KEY,
  CAL_FLOAT_PREVIEW_SIZE_KEY,
  migrateLegacyCalendarShellSource,
  parseAccountSidebarOpenFromStorage,
  parseGroupCalSidebarOpenFromStorage,
  persistAccountSidebarOpen,
  persistGroupCalSidebarOpen,
  persistMailTodoOverlay,
  persistCloudTaskOverlay,
  persistUserNoteOverlay,
  persistRightInboxOpen,
  persistRightPreviewOpen,
  persistTimeGridSlotMinutes,
  readLeftSidebarCollapsedFromStorage,
  readMailTodoOverlayFromStorage,
  readCloudTaskOverlayFromStorage,
  readUserNoteOverlayFromStorage,
  readRightInboxOpenFromStorage,
  readRightPreviewOpenFromStorage,
  readTimeGridSlotMinutesFromStorage,
  persistLeftSidebarCollapsed,
  SIDEBAR_DEFAULT_CAL_ID,
  stepTimeGridSlotMinutes,
  timeGridSlotMinutesToDuration,
  type TimeGridSlotMinutes
} from '@/app/calendar/calendar-shell-storage'
import {
  fullCalendarEventToPatchSchedule,
  MAX_TIME_GRID_SPAN_DAYS
} from '@/app/calendar/calendar-shell-view-helpers'
import './notion-calendar.css'

function sameStringSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const x of a) {
    if (!b.has(x)) return false
  }
  return true
}

export function CalendarShell(): JSX.Element {
  const { t, i18n } = useTranslation()
  const calendarFcEventContentRender = useCalendarFcEventContent()
  const fcLocale = useMemo(
    () => (i18n.language.startsWith('de') ? deLocale : enGbLocale),
    [i18n.language]
  )
  const clipboardDfLocale = useMemo(
    (): Locale => (i18n.language.startsWith('de') ? deFns : enUSFns),
    [i18n.language]
  )
  const calendarCollatorLocale = i18n.language.startsWith('de') ? 'de' : 'en'
  const isDeCalendar = i18n.language.startsWith('de')

  const accounts = useAccountsStore((s) => s.accounts)
  const calendarSyncByAccount = useCalendarSyncStore((s) => s.syncByAccount)
  const triggerCalendarAccountSync = useCalendarSyncStore((s) => s.triggerSync)
  const profilePhotoDataUrls = useAccountsStore((s) => s.profilePhotoDataUrls)
  const patchAccountColor = useAccountsStore((s) => s.patchAccountColor)
  const calendarTimeZoneConfig = useAccountsStore((s) => s.config?.calendarTimeZone)
  const selectedMessageId = useMailStore((s) => s.selectedMessageId)
  const selectMessage = useMailStore((s) => s.selectMessage)
  const selectMessageWithThreadPreview = useMailStore((s) => s.selectMessageWithThreadPreview)
  const clearSelectedMessage = useMailStore((s) => s.clearSelectedMessage)
  const setTodoScheduleForMessage = useMailStore((s) => s.setTodoScheduleForMessage)
  const refreshNow = useMailStore((s) => s.refreshNow)
  const setMessageRead = useMailStore((s) => s.setMessageRead)
  const toggleMessageFlag = useMailStore((s) => s.toggleMessageFlag)
  const archiveMessage = useMailStore((s) => s.archiveMessage)
  const deleteMessage = useMailStore((s) => s.deleteMessage)
  const setTodoForMessage = useMailStore((s) => s.setTodoForMessage)
  const completeTodoForMessage = useMailStore((s) => s.completeTodoForMessage)
  const setWaitingForMessage = useMailStore((s) => s.setWaitingForMessage)
  const clearWaitingForMessage = useMailStore((s) => s.clearWaitingForMessage)

  const openReply = useComposeStore((s) => s.openReply)
  const openForward = useComposeStore((s) => s.openForward)
  const openSnoozePicker = useSnoozeUiStore((s) => s.open)
  const calendarRef = useRef<FullCalendar>(null)
  const lastRangeRef = useRef<{ start: Date; end: Date }>({
    start: new Date(),
    end: new Date()
  })

  const [events, setEvents] = useState<CalendarEventView[]>([])
  const eventsRef = useRef<CalendarEventView[]>([])
  eventsRef.current = events
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Erzwingt Reload der rechten ToDo-Spalte nach Kalender-Zug (mail:changed allein reicht nicht zuverlässig). */
  const [todoSideListRefreshKey, setTodoSideListRefreshKey] = useState(0)

  const timelineReloadRef = useRef<(() => void) | null>(null)
  const reloadCalendarEventsOnlyRef = useRef<
    (opts?: { silent?: boolean; forceRefresh?: boolean }) => void
  >(() => {})
  const [timelineLoading, setTimelineLoading] = useState(false)

  const [activeViewId, setActiveViewId] = useState<string>('timeGridWeek')
  const activeViewIdRef = useRef(activeViewId)
  activeViewIdRef.current = activeViewId
  const lastDatesSetKeyRef = useRef('')
  const datesSetLoadTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>()
  const [rangeTitle, setRangeTitle] = useState('')
  const [visibleStart, setVisibleStart] = useState(() => new Date())
  const [miniMonth, setMiniMonth] = useState(() => startOfMonth(new Date()))
  const [viewMenuOpen, setViewMenuOpen] = useState(false)
  const [daysSubOpen, setDaysSubOpen] = useState(false)
  const [settingsSubOpen, setSettingsSubOpen] = useState(false)
  const [gotoDateOpen, setGotoDateOpen] = useState(false)
  const [gotoDateDraft, setGotoDateDraft] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [calendarEventSearchOpen, setCalendarEventSearchOpen] = useState(false)
  const [calendarEventSearchQuery, setCalendarEventSearchQuery] = useState('')
  const viewMenuRef = useRef<HTMLDivElement>(null)
  const calendarSearchInputRef = useRef<HTMLInputElement>(null)
  const gotoDateInputRef = useRef<HTMLInputElement>(null)

  type EventDialogState =
    | null
    | {
        mode: 'create'
        range?: { start: Date; end: Date; allDay: boolean } | null
        createPrefill?: { subject: string; location: string }
        createAccountId?: string
        createKind?: CalendarCreateQuickDraft['createKind']
        createGraphCalendarId?: string
        createTaskListId?: string
      }
    | { mode: 'edit'; event: CalendarEventView }

  const [eventDialog, setEventDialog] = useState<EventDialogState>(null)
  const [quickCreate, setQuickCreate] = useState<{
    anchor: { x: number; y: number }
    range: CalendarCreateRange
  } | null>(null)

  const dismissQuickCreate = useCallback((): void => {
    calendarRef.current?.getApi().unselect()
    setQuickCreate(null)
  }, [])

  const handleQuickCreateRangeChange = useCallback((range: CalendarCreateRange): void => {
    setQuickCreate((prev) => (prev ? { ...prev, range } : null))
  }, [])
  const [eventContextMenu, setEventContextMenu] = useState<{
    x: number
    y: number
    items: ContextMenuItem[]
  } | null>(null)
  const [eventNoteTarget, setEventNoteTarget] = useState<ObjectNoteTarget | null>(null)
  const [mailNoteTarget, setMailNoteTarget] = useState<Extract<ObjectNoteTarget, { kind: 'mail' }> | null>(
    null
  )
  const [calendarFolderContextMenu, setCalendarFolderContextMenu] = useState<{
    x: number
    y: number
    items: ContextMenuItem[]
  } | null>(null)

  const [mailTodoOverlay, setMailTodoOverlay] = useState<boolean>(readMailTodoOverlayFromStorage)
  const mailTodoOverlayRef = useRef(mailTodoOverlay)
  mailTodoOverlayRef.current = mailTodoOverlay

  const [mailTodoItems, setMailTodoItems] = useState<MailListItem[]>([])

  const [cloudTaskOverlay, setCloudTaskOverlay] = useState<boolean>(readCloudTaskOverlayFromStorage)
  const cloudTaskOverlayRef = useRef(cloudTaskOverlay)
  cloudTaskOverlayRef.current = cloudTaskOverlay

  const [userNoteOverlay, setUserNoteOverlay] = useState<boolean>(readUserNoteOverlayFromStorage)
  const userNoteOverlayRef = useRef(userNoteOverlay)
  userNoteOverlayRef.current = userNoteOverlay
  const [userNoteRangeItems, setUserNoteRangeItems] = useState<UserNoteListItem[]>([])
  const [cloudTaskAllItems, setCloudTaskAllItems] = useState<TaskItemWithContext[]>([])
  const [cloudTaskRangeItems, setCloudTaskRangeItems] = useState<TaskItemWithContext[]>([])
  const [cloudTaskPlannedByKey, setCloudTaskPlannedByKey] = useState(
    () => new Map<string, WorkItemPlannedSchedule>()
  )
  const cloudTaskAllItemsRef = useRef(cloudTaskAllItems)
  cloudTaskAllItemsRef.current = cloudTaskAllItems
  const cloudTaskPlannedByKeyRef = useRef(cloudTaskPlannedByKey)
  cloudTaskPlannedByKeyRef.current = cloudTaskPlannedByKey
  const cloudTaskLayerSigRef = useRef('')
  const cloudTaskFcEventsSigRef = useRef('')
  const cloudTaskByKeyRef = useRef(new Map<string, TaskItemWithContext>())
  const lastCloudFilterRangeKeyRef = useRef('')
  const cloudTaskElByKeyRef = useRef(new Map<string, HTMLElement>())
  const cloudTaskPersistInFlightRef = useRef(0)

  /** Ausgeblendete Kalender (Key `accountId|graphCalendarId`); leer = alle sichtbar. */
  const [hiddenCalendarKeys, setHiddenCalendarKeys] = useState<Set<string>>(
    readHiddenCalendarKeysFromStorage
  )
  /** Kalender, die in der linken Seitenleiste gar nicht mehr gelistet werden. */
  const [sidebarHiddenCalendarKeys, setSidebarHiddenCalendarKeys] = useState<Set<string>>(
    readSidebarHiddenCalendarKeysFromStorage
  )
  const [timeGridSlotMinutes, setTimeGridSlotMinutes] = useState<TimeGridSlotMinutes>(
    readTimeGridSlotMinutesFromStorage
  )
  /** `open[id] === false` = Konto in der Sidebar zugeklappt. */
  const [accountSidebarOpen, setAccountSidebarOpen] = useState<Record<string, boolean>>(
    parseAccountSidebarOpenFromStorage
  )
  /** Microsoft-Konten: Unterzweig «Gruppenkalender» (`true` = aufgeklappt). Standard zugeklappt. */
  const [accountGroupCalSidebarOpen, setAccountGroupCalSidebarOpen] = useState<
    Record<string, boolean>
  >(parseGroupCalSidebarOpenFromStorage)
  const [groupCalendarsLoading, setGroupCalendarsLoading] = useState<Record<string, boolean>>({})
  const [calendarsByAccount, setCalendarsByAccount] = useState<
    Record<string, CalendarGraphCalendarRow[]>
  >({})
  const calendarsLoadedRef = useRef<Set<string>>(new Set())
  /** Erste Seite Gruppenkalender fuer dieses Konto bereits erfolgreich geladen. */
  const m365GroupCalFirstPageLoadedRef = useRef<Set<string>>(new Set())
  /** Gesamtzahl Unified Groups + naechster Offset fuer «Weitere laden». */
  const [m365GroupCalPaging, setM365GroupCalPaging] = useState<
    Record<string, { total: number; nextOffset: number }>
  >({})

  const msAccounts = useMemo(() => accounts.filter((a) => a.provider === 'microsoft'), [accounts])

  const calendarLinkedAccounts = useMemo(
    () => accounts.filter((a) => a.provider === 'microsoft' || a.provider === 'google'),
    [accounts]
  )

  const taskAccounts = useMemo(
    () => accounts.filter((a) => a.provider === 'microsoft' || a.provider === 'google'),
    [accounts]
  )

  const canCreateCalendarEntry = calendarLinkedAccounts.length > 0 || taskAccounts.length > 0
  const isMultiMonthActive = isMultiMonthFcView(activeViewId)
  const canInteractInTimeGrid = canCreateCalendarEntry && !isMultiMonthActive

  const loadTaskListsForAccount = useCallback(async (accountId: string) => {
    return window.mailClient.tasks.listLists({ accountId })
  }, [])

  useEffect(() => {
    persistTimeGridSlotMinutes(timeGridSlotMinutes)
  }, [timeGridSlotMinutes])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey) || !e.shiftKey) return
      if (e.repeat) return
      const el = e.target
      if (el instanceof HTMLElement) {
        if (el.closest('[role="dialog"]')) return
        const tag = el.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable)
          return
      }
      if (e.code === 'Period') {
        e.preventDefault()
        setTimeGridSlotMinutes((m) => stepTimeGridSlotMinutes(m, 'finer'))
        return
      }
      if (e.code === 'Comma') {
        e.preventDefault()
        setTimeGridSlotMinutes((m) => stepTimeGridSlotMinutes(m, 'coarser'))
      }
    }
    window.addEventListener('keydown', onKey, true)
    return (): void => window.removeEventListener('keydown', onKey, true)
  }, [])

  useEffect(() => {
    useCalendarSyncStore.getState().initialize()
  }, [])

  useEffect(() => {
    if (migrateLegacyCalendarShellSource()) {
      setMailTodoOverlay(true)
      persistMailTodoOverlay(true)
    }
  }, [])

  const isAccountSidebarOpen = useCallback(
    (accountId: string) => accountSidebarOpen[accountId] !== false,
    [accountSidebarOpen]
  )

  const ensureCalendarsForAccount = useCallback(async (accountId: string) => {
    if (calendarsLoadedRef.current.has(accountId)) return
    calendarsLoadedRef.current.add(accountId)
    try {
      const rows = await window.mailClient.calendar.listCalendars({ accountId })
      setCalendarsByAccount((prev) => ({ ...prev, [accountId]: rows }))
    } catch {
      setCalendarsByAccount((prev) => ({ ...prev, [accountId]: [] }))
    }
  }, [])

  const reloadCalendarsForAccount = useCallback(
    async (accountId: string, opts?: { forceRefresh?: boolean }): Promise<void> => {
    try {
      const rows = await window.mailClient.calendar.listCalendars({
        accountId,
        forceRefresh: opts?.forceRefresh === true
      })
      setCalendarsByAccount((prev) => {
        const keepGroups = (prev[accountId] ?? []).filter((c) => c.calendarKind === 'm365Group')
        return { ...prev, [accountId]: [...rows, ...keepGroups] }
      })
    } catch {
      setCalendarsByAccount((prev) => ({ ...prev, [accountId]: [] }))
    }
  }, [])

  const fetchMicrosoft365GroupCalendarsIfNeeded = useCallback(
    async (accountId: string): Promise<void> => {
      if (m365GroupCalFirstPageLoadedRef.current.has(accountId)) return
      setGroupCalendarsLoading((prev) => ({ ...prev, [accountId]: true }))
      try {
        const page = await window.mailClient.calendar.listMicrosoft365GroupCalendars({
          accountId,
          offset: 0,
          limit: 10
        })
        m365GroupCalFirstPageLoadedRef.current.add(accountId)
        setM365GroupCalPaging((prev) => ({
          ...prev,
          [accountId]: { total: page.totalGroups, nextOffset: page.offset + page.limit }
        }))
        setCalendarsByAccount((prev) => {
          const personal = (prev[accountId] ?? []).filter((c) => c.calendarKind !== 'm365Group')
          return { ...prev, [accountId]: [...personal, ...page.calendars] }
        })
      } catch (e) {
        console.warn('[CalendarShell] Gruppenkalender laden fehlgeschlagen:', accountId, e)
      } finally {
        setGroupCalendarsLoading((prev) => ({ ...prev, [accountId]: false }))
      }
    },
    []
  )

  const fetchMoreMicrosoft365GroupCalendars = useCallback(
    async (accountId: string, offset: number): Promise<void> => {
      setGroupCalendarsLoading((prev) => ({ ...prev, [accountId]: true }))
      try {
        const page = await window.mailClient.calendar.listMicrosoft365GroupCalendars({
          accountId,
          offset,
          limit: 10
        })
        setCalendarsByAccount((prev) => {
          const personal = (prev[accountId] ?? []).filter((c) => c.calendarKind !== 'm365Group')
          const existingGroups = (prev[accountId] ?? []).filter(
            (c) => c.calendarKind === 'm365Group'
          )
          const seen = new Set(existingGroups.map((c) => c.id))
          const merged = [...existingGroups]
          for (const c of page.calendars) {
            if (!seen.has(c.id)) {
              seen.add(c.id)
              merged.push(c)
            }
          }
          return { ...prev, [accountId]: [...personal, ...merged] }
        })
        setM365GroupCalPaging((prev) => ({
          ...prev,
          [accountId]: { total: page.totalGroups, nextOffset: page.offset + page.limit }
        }))
      } catch (e) {
        console.warn('[CalendarShell] Weitere Gruppenkalender fehlgeschlagen:', accountId, e)
      } finally {
        setGroupCalendarsLoading((prev) => ({ ...prev, [accountId]: false }))
      }
    },
    []
  )

  useEffect(() => {
    for (const a of calendarLinkedAccounts) {
      if (isAccountSidebarOpen(a.id)) void ensureCalendarsForAccount(a.id)
    }
  }, [calendarLinkedAccounts, accountSidebarOpen, ensureCalendarsForAccount, isAccountSidebarOpen])

  useEffect(() => {
    if (calendarLinkedAccounts.length === 0) return
    setHiddenCalendarKeys((prev) => {
      const accIds = new Set(calendarLinkedAccounts.map((a) => a.id))
      let changed = false
      const next = new Set<string>()
      for (const k of prev) {
        const pipe = k.indexOf('|')
        const accId = pipe >= 0 ? k.slice(0, pipe) : k
        if (accIds.has(accId)) next.add(k)
        else changed = true
      }
      return changed ? next : prev
    })
  }, [calendarLinkedAccounts])

  useEffect(() => {
    if (calendarLinkedAccounts.length === 0) return
    setSidebarHiddenCalendarKeys((prev) => {
      const accIds = new Set(calendarLinkedAccounts.map((a) => a.id))
      let changed = false
      const next = new Set<string>()
      for (const k of prev) {
        const parsed = parseCalendarVisibilityKey(k)
        if (!parsed) {
          changed = true
          continue
        }
        if (accIds.has(parsed.accountId)) next.add(k)
        else changed = true
      }
      return changed ? next : prev
    })
  }, [calendarLinkedAccounts])

  useEffect(() => {
    if (calendarLinkedAccounts.length === 0) return
    setAccountSidebarOpen((prev) => {
      const accIds = new Set(calendarLinkedAccounts.map((a) => a.id))
      let changed = false
      const next: Record<string, boolean> = { ...prev }
      for (const id of Object.keys(next)) {
        if (!accIds.has(id)) {
          delete next[id]
          changed = true
        }
      }
      return changed ? next : prev
    })
    setAccountGroupCalSidebarOpen((prev) => {
      const accIds = new Set(calendarLinkedAccounts.map((a) => a.id))
      let changed = false
      const next: Record<string, boolean> = { ...prev }
      for (const id of Object.keys(next)) {
        if (!accIds.has(id)) {
          delete next[id]
          changed = true
        }
      }
      return changed ? next : prev
    })
    setGroupCalendarsLoading((prev) => {
      const accIds = new Set(calendarLinkedAccounts.map((a) => a.id))
      let changed = false
      const next = { ...prev }
      for (const id of Object.keys(next)) {
        if (!accIds.has(id)) {
          delete next[id]
          changed = true
        }
      }
      return changed ? next : prev
    })
    setM365GroupCalPaging((prev) => {
      const accIds = new Set(calendarLinkedAccounts.map((a) => a.id))
      let changed = false
      const next: Record<string, { total: number; nextOffset: number }> = { ...prev }
      for (const id of Object.keys(next)) {
        if (!accIds.has(id)) {
          delete next[id]
          changed = true
        }
      }
      return changed ? next : prev
    })
    const accIds = new Set(calendarLinkedAccounts.map((a) => a.id))
    for (const id of [...m365GroupCalFirstPageLoadedRef.current]) {
      if (!accIds.has(id)) m365GroupCalFirstPageLoadedRef.current.delete(id)
    }
  }, [calendarLinkedAccounts])

  useEffect(() => {
    try {
      window.localStorage.setItem(
        HIDDEN_CALENDARS_STORAGE_KEY,
        JSON.stringify(Array.from(hiddenCalendarKeys))
      )
    } catch {
      // ignore
    }
    dispatchCalendarVisibilityChanged()
  }, [hiddenCalendarKeys])

  useEffect(() => {
    try {
      window.localStorage.setItem(
        SIDEBAR_HIDDEN_CALENDARS_STORAGE_KEY,
        JSON.stringify(Array.from(sidebarHiddenCalendarKeys))
      )
    } catch {
      // ignore
    }
    dispatchCalendarVisibilityChanged()
  }, [sidebarHiddenCalendarKeys])

  /** Sichtbarkeit aus Einstellungen / anderem Code via localStorage + Event — State nachziehen. */
  useEffect(() => {
    const onVis = (): void => {
      setHiddenCalendarKeys((prev) => {
        const next = readHiddenCalendarKeysFromStorage()
        return sameStringSet(prev, next) ? prev : next
      })
      setSidebarHiddenCalendarKeys((prev) => {
        const next = readSidebarHiddenCalendarKeysFromStorage()
        return sameStringSet(prev, next) ? prev : next
      })
    }
    window.addEventListener(CALENDAR_VISIBILITY_CHANGED_EVENT, onVis)
    return (): void => window.removeEventListener(CALENDAR_VISIBILITY_CHANGED_EVENT, onVis)
  }, [])

  useEffect(() => {
    persistAccountSidebarOpen(accountSidebarOpen)
  }, [accountSidebarOpen])

  useEffect(() => {
    persistGroupCalSidebarOpen(accountGroupCalSidebarOpen)
  }, [accountGroupCalSidebarOpen])

  /** Neue M365-Gruppenkalender standardmaessig ausblenden (einmalig pro Sichtbarkeits-Key). */
  useEffect(() => {
    const seeded = readM365GroupCalVisibilitySeededKeys()
    const nextSeeded = new Set(seeded)
    let seededChanged = false
    const toHide: string[] = []
    for (const a of msAccounts) {
      for (const cal of calendarsByAccount[a.id] ?? []) {
        if (cal.calendarKind !== 'm365Group') continue
        const vk = calendarVisibilityKey(a.id, cal.id)
        if (!nextSeeded.has(vk)) {
          nextSeeded.add(vk)
          seededChanged = true
          toHide.push(vk)
        }
      }
    }
    if (toHide.length > 0) {
      setHiddenCalendarKeys((prev) => {
        const next = new Set(prev)
        for (const vk of toHide) next.add(vk)
        return next
      })
    }
    if (seededChanged) persistM365GroupCalVisibilitySeededKeys(nextSeeded)
  }, [calendarsByAccount, msAccounts])

  useEffect(() => {
    if (eventDialog != null) {
      setEventContextMenu(null)
      setCalendarFolderContextMenu(null)
    }
  }, [eventDialog])

  const multiDayViews = useMemo(() => {
    const o: Record<string, { type: 'timeGrid'; duration: { days: number }; buttonText: string }> =
      {}
    for (let n = 2; n <= MAX_TIME_GRID_SPAN_DAYS; n++) {
      o[`timeGrid${n}Day`] = {
        type: 'timeGrid',
        duration: { days: n },
        buttonText: t('calendar.views.nDays', { count: n })
      }
    }
    return o
  }, [t])

  const multiMonthViews = useMemo(
    () => ({
      [MULTI_MONTH_YEAR_VIEW_ID]: {
        type: 'multiMonthYear' as const,
        /** 4×3-Raster: alle 12 Monate auf einen Blick */
        multiMonthMaxColumns: 4,
        multiMonthMinWidth: 108,
        /** Etwas hoeher als 2.15 — Platz fuer groessere Monats-/Tages-Typo */
        aspectRatio: 1.82,
        fixedWeekCount: true,
        showNonCurrentDates: true,
        dayHeaderFormat: { weekday: 'narrow' } as const,
        multiMonthTitleFormat: { month: 'long' } as const,
        dayMaxEvents: 3,
        dayMaxEventRows: 1,
        moreLinkClick: 'day' as const
      },
      [MULTI_MONTH_QUARTER_VIEW_ID]: {
        type: 'multiMonth' as const,
        duration: { months: 3 },
        multiMonthMaxColumns: 3,
        multiMonthMinWidth: 180,
        aspectRatio: 1.75,
        fixedWeekCount: true,
        showNonCurrentDates: true,
        dayHeaderFormat: { weekday: 'narrow' } as const,
        dayMaxEvents: 5,
        dayMaxEventRows: 2,
        moreLinkClick: 'day' as const
      }
    }),
    []
  )

  const fcTimeZone = useMemo(
    () => (calendarTimeZoneConfig?.trim() ? calendarTimeZoneConfig.trim() : 'local'),
    [calendarTimeZoneConfig]
  )

  const timeGridSlotDurationIso = useMemo(
    () => timeGridSlotMinutesToDuration(timeGridSlotMinutes),
    [timeGridSlotMinutes]
  )

  const calendarDropRootRef = useRef<HTMLDivElement>(null)
  const [rightInboxOpen, setRightInboxOpen] = useState(readRightInboxOpenFromStorage)
  const [rightPreviewOpen, setRightPreviewOpen] = useState(readRightPreviewOpenFromStorage)
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(
    readLeftSidebarCollapsedFromStorage
  )
  const [previewCalendarEvent, setPreviewCalendarEvent] = useState<CalendarEventView | null>(null)
  const [previewCloudTask, setPreviewCloudTask] = useState<TaskItemWithContext | null>(null)
  const [previewCloudTaskPlannedFromTimeline, setPreviewCloudTaskPlannedFromTimeline] =
    useState<WorkItemPlannedSchedule | null>(null)
  const [inboxColumnWidth, setInboxColumnWidth] = useResizableWidth({
    storageKey: 'mailclient.calendarShell.rightInboxWidth',
    defaultWidth: 300,
    minWidth: 220,
    maxWidth: 520
  })
  const [previewPaneWidth, setPreviewPaneWidth] = useResizableWidth({
    storageKey: 'mailclient.calendarShell.readingWidth',
    defaultWidth: 400,
    minWidth: 280,
    maxWidth: 900
  })

  useEffect(() => {
    if (selectedMessageId != null) {
      setPreviewCalendarEvent(null)
      setPreviewCloudTask(null)
      setPreviewCloudTaskPlannedFromTimeline(null)
    }
  }, [selectedMessageId])

  const openCreateCalendarEventDialog = useCallback((): void => {
    if (!canCreateCalendarEntry) return
    setError(null)
    setPreviewCloudTask(null)
    setPreviewCloudTaskPlannedFromTimeline(null)
    setPreviewCalendarEvent(null)
    setEventDialog({ mode: 'create', range: null })
  }, [canCreateCalendarEntry])

  useEffect(() => {
    const pending = useGlobalCreateNavigateStore.getState().takePendingAfterNavigate()
    if (pending === 'calendar_event') {
      window.setTimeout((): void => openCreateCalendarEventDialog(), 0)
    }
  }, [openCreateCalendarEventDialog])

  useEffect(() => {
    function onGlobalCreate(e: Event): void {
      const ce = e as CustomEvent<{ kind?: string }>
      if (ce.detail?.kind !== 'calendar_event') return
      openCreateCalendarEventDialog()
    }
    window.addEventListener(GLOBAL_CREATE_EVENT, onGlobalCreate as EventListener)
    return (): void => window.removeEventListener(GLOBAL_CREATE_EVENT, onGlobalCreate as EventListener)
  }, [openCreateCalendarEventDialog])

  const openCalendarAccountContextMenu = useCallback(
    (clientX: number, clientY: number, account: ConnectedAccount): void => {
      setEventContextMenu(null)
      setCalendarFolderContextMenu({
        x: clientX,
        y: clientY,
        items: buildAccountColorAndNewContextItems({
          account,
          patchAccountColor,
          onPatchError: (msg) => setError(msg),
          newItem: {
            id: `cal-new-event-${account.id}`,
            label: t('calendar.shell.newEvent'),
            icon: CalendarPlus,
            onSelect: (): void => {
              setCalendarFolderContextMenu(null)
              setEventDialog({ mode: 'create', range: null, createAccountId: account.id })
            }
          }
        })
      })
    },
    [patchAccountColor, t]
  )

  const inboxPlacement = useCalendarPanelLayoutStore((s) => s.inboxPlacement)
  const previewPlacement = useCalendarPanelLayoutStore((s) => s.previewPlacement)
  const setInboxPlacement = useCalendarPanelLayoutStore((s) => s.setInboxPlacement)
  const setPreviewPlacement = useCalendarPanelLayoutStore((s) => s.setPreviewPlacement)

  const inboxDockShow = rightInboxOpen && inboxPlacement === 'dock'
  const previewDockShow = rightPreviewOpen && previewPlacement === 'dock'

  const [inboxDockStripInDom, setInboxDockStripInDom] = useState(inboxDockShow)
  const [previewDockStripInDom, setPreviewDockStripInDom] = useState(previewDockShow)
  const [inboxDockHeaderSlotEl, setInboxDockHeaderSlotEl] = useState<HTMLDivElement | null>(null)
  const bindInboxDockHeaderSlot = useCallback((node: HTMLDivElement | null) => {
    setInboxDockHeaderSlotEl((prev) => (prev === node ? prev : node))
  }, [])

  useEffect(() => {
    persistLeftSidebarCollapsed(leftSidebarCollapsed)
  }, [leftSidebarCollapsed])

  useEffect(() => {
    if (inboxPlacement !== 'dock') {
      setInboxDockStripInDom(false)
      return
    }
    if (rightInboxOpen) {
      setInboxDockStripInDom(true)
    }
  }, [rightInboxOpen, inboxPlacement])

  useEffect(() => {
    if (previewPlacement !== 'dock') {
      setPreviewDockStripInDom(false)
      return
    }
    if (rightPreviewOpen) {
      setPreviewDockStripInDom(true)
    }
  }, [rightPreviewOpen, previewPlacement])

  const inboxFloatWidth = useMemo(
    () => Math.min(520, Math.max(260, Math.round(inboxColumnWidth))),
    [inboxColumnWidth]
  )
  const previewFloatWidth = useMemo(
    () => Math.min(560, Math.max(300, Math.round(previewPaneWidth))),
    [previewPaneWidth]
  )

  const bothPanelsFloating = useMemo(
    () =>
      rightInboxOpen &&
      inboxPlacement === 'float' &&
      rightPreviewOpen &&
      previewPlacement === 'float',
    [rightInboxOpen, inboxPlacement, rightPreviewOpen, previewPlacement]
  )

  const previewFloatPos = useMemo(() => {
    const x = Math.max(12, window.innerWidth - previewFloatWidth - 20)
    return { x, y: 68 }
  }, [previewFloatWidth])

  const inboxFloatPos = useMemo(() => {
    if (bothPanelsFloating) {
      const px = previewFloatPos.x
      return { x: Math.max(12, px - inboxFloatWidth - 12), y: 68 }
    }
    return { x: Math.max(12, window.innerWidth - inboxFloatWidth - 20), y: 68 }
  }, [bothPanelsFloating, inboxFloatWidth, previewFloatPos.x, previewFloatWidth])

  const previewCloudTaskPlanned = useMemo(() => {
    if (!previewCloudTask) return null
    const key = cloudTaskStableKey(
      previewCloudTask.accountId,
      previewCloudTask.listId,
      previewCloudTask.id
    )
    return cloudTaskPlannedByKey.get(key) ?? previewCloudTaskPlannedFromTimeline ?? null
  }, [previewCloudTask, cloudTaskPlannedByKey, previewCloudTaskPlannedFromTimeline])

  const previewCloudTaskAccountName = useMemo(() => {
    if (!previewCloudTask) return undefined
    return accounts.find((a) => a.id === previewCloudTask.accountId)?.displayName
  }, [previewCloudTask, accounts])

  const previewColumnLabel = useMemo((): string => {
    if (previewCloudTask) return t('calendar.shell.previewBadgeCloudTask')
    if (previewCalendarEvent) return t('calendar.shell.previewBadgeEvent')
    if (selectedMessageId != null) return t('calendar.shell.previewBadgeMail')
    return t('calendar.shell.previewBadgeDefault')
  }, [previewCloudTask, previewCalendarEvent, selectedMessageId, t])

  const previewCalendarName = useMemo((): string | null => {
    if (!previewCalendarEvent) return null
    const calId = previewCalendarEvent.graphCalendarId?.trim()
    if (!calId) return null
    const rows = calendarsByAccount[previewCalendarEvent.accountId] ?? []
    return rows.find((c) => c.id === calId)?.name?.trim() || null
  }, [previewCalendarEvent, calendarsByAccount])

  const patchPreviewCloudTaskDisplay = useCallback(
    async (patch: import('@/app/work/CloudTaskWorkItemDetail').CloudTaskDisplayPatch): Promise<void> => {
      if (!previewCloudTask) return
      const next = await window.mailClient.tasks.patchTaskDisplay({
        accountId: previewCloudTask.accountId,
        listId: previewCloudTask.listId,
        taskId: previewCloudTask.id,
        ...patch
      })
      const merged: TaskItemWithContext = {
        ...next,
        accountId: previewCloudTask.accountId,
        listName: previewCloudTask.listName
      }
      const key = cloudTaskStableKey(merged.accountId, merged.listId, merged.id)
      cloudTaskByKeyRef.current.set(key, merged)
      const replace = (rows: TaskItemWithContext[]): TaskItemWithContext[] =>
        rows.map((row) =>
          cloudTaskStableKey(row.accountId, row.listId, row.id) === key ? merged : row
        )
      setCloudTaskAllItems(replace)
      setCloudTaskRangeItems(replace)
      setPreviewCloudTask(merged)
    },
    [previewCloudTask]
  )

  const calendarPreviewBody = useMemo(
    () => (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {previewCloudTask ? (
          <CloudTaskItemPreview
            task={previewCloudTask}
            planned={previewCloudTaskPlanned}
            accountDisplayName={previewCloudTaskAccountName}
            onDisplayChange={patchPreviewCloudTaskDisplay}
          />
        ) : previewCalendarEvent ? (
          <CalendarEventPreview
            event={previewCalendarEvent}
            calendarName={previewCalendarName}
            onEdit={(): void => setEventDialog({ mode: 'edit', event: previewCalendarEvent })}
            onEventChange={(updated): void => {
              setPreviewCalendarEvent(updated)
              setEvents((prev) =>
                prev.map((row) =>
                  row.accountId === updated.accountId && row.graphEventId === updated.graphEventId
                    ? updated
                    : row
                )
              )
            }}
            onSaved={(): void => reloadCalendarEventsOnlyRef.current({ silent: true })}
          />
        ) : (
          <ReadingPane
            hideChromeWhenEmpty
            emptySelectionTitle={t('calendar.shell.previewBadgeDefault')}
            emptySelectionBody={t('calendar.shell.emptyPreviewBody')}
          />
        )}
      </div>
    ),
    [
      previewCloudTask,
      previewCloudTaskPlanned,
      previewCloudTaskAccountName,
      patchPreviewCloudTaskDisplay,
      previewCalendarEvent,
      previewCalendarName,
      t
    ]
  )

  const accountColorById = useMemo(
    () => Object.fromEntries(accounts.map((a) => [a.id, a.color])),
    [accounts]
  )

  const loadMailTodosForRange = useCallback(async (start: Date, end: Date): Promise<void> => {
    if (!mailTodoOverlayRef.current) return
    try {
      const list = await window.mailClient.mail.listTodoMessagesInRange({
        accountId: null,
        rangeStartIso: start.toISOString(),
        rangeEndIso: end.toISOString(),
        limit: 500
      })
      setMailTodoItems(list)
    } catch {
      setMailTodoItems([])
    }
  }, [])

  const loadUserNotesForRange = useCallback(async (start: Date, end: Date): Promise<void> => {
    if (!userNoteOverlayRef.current) return
    try {
      const list = await window.mailClient.notes.listInRange({
        startIso: start.toISOString(),
        endIso: end.toISOString(),
        limit: 500
      })
      setUserNoteRangeItems(list)
    } catch {
      setUserNoteRangeItems([])
    }
  }, [])

  const reloadCloudTasksAll = useCallback(async (): Promise<{
    items: TaskItemWithContext[]
    planned: Map<string, WorkItemPlannedSchedule>
  }> => {
    if (taskAccounts.length === 0) {
      setCloudTaskAllItems([])
      setCloudTaskPlannedByKey(new Map())
      cloudTaskByKeyRef.current = new Map()
      cloudTaskLayerSigRef.current = ''
      cloudTaskFcEventsSigRef.current = ''
      return { items: [], planned: new Map() }
    }
    try {
      const items = await loadUnifiedCloudTasks(taskAccounts, { cacheOnly: true })
      const planned = await loadPlannedScheduleMapForTasks(items)
      const map = new Map<string, TaskItemWithContext>()
      for (const t of items) {
        map.set(cloudTaskStableKey(t.accountId, t.listId, t.id), t)
      }
      setCloudTaskAllItems(items)
      setCloudTaskPlannedByKey(planned)
      cloudTaskByKeyRef.current = map
      return { items, planned }
    } catch {
      setCloudTaskAllItems([])
      setCloudTaskPlannedByKey(new Map())
      cloudTaskByKeyRef.current = new Map()
      cloudTaskLayerSigRef.current = ''
      cloudTaskFcEventsSigRef.current = ''
      return { items: [], planned: new Map() }
    }
  }, [taskAccounts])

  const commitCloudTaskLayer = useCallback(
    (
      merged: TaskItemWithContext[],
      planned: Map<string, WorkItemPlannedSchedule>,
      rangeStart: Date,
      rangeEnd: Date,
      opts?: { force?: boolean }
    ): void => {
      const map = new Map<string, TaskItemWithContext>()
      for (const t of merged) {
        map.set(cloudTaskStableKey(t.accountId, t.listId, t.id), t)
      }
      cloudTaskByKeyRef.current = map

      const filtered = filterCloudTasksInCalendarRange(
        merged,
        planned,
        rangeStart,
        rangeEnd,
        'open',
        fcTimeZone
      )
      const sig = cloudTaskCalendarDisplaySignature(filtered, planned)
      if (!opts?.force && sig === cloudTaskLayerSigRef.current) return

      cloudTaskLayerSigRef.current = sig
      cloudTaskFcEventsSigRef.current = ''
      setCloudTaskAllItems(merged)
      setCloudTaskPlannedByKey(planned)
      setCloudTaskRangeItems(filtered)
    },
    [fcTimeZone]
  )

  const applyCloudTaskRangeFilter = useCallback(
    (
      items: TaskItemWithContext[],
      planned: Map<string, WorkItemPlannedSchedule>,
      start: Date,
      end: Date
    ): void => {
      const rangeKey = `${start.toISOString()}|${end.toISOString()}`
      const filtered = filterCloudTasksInCalendarRange(items, planned, start, end, 'open', fcTimeZone)
      const sig = cloudTaskCalendarDisplaySignature(filtered, planned)
      if (sig === cloudTaskLayerSigRef.current && rangeKey === lastCloudFilterRangeKeyRef.current) {
        return
      }
      lastCloudFilterRangeKeyRef.current = rangeKey
      cloudTaskLayerSigRef.current = sig
      setCloudTaskRangeItems(filtered)
    },
    [fcTimeZone]
  )

  /** Konten aus lokalem Cache (ohne Hintergrund-Sync) → ein Commit für alle betroffenen Konten. */
  const reloadCloudTasksForAccounts = useCallback(
    async (accountIds: string[]): Promise<void> => {
      const ids = accountIds.filter((id) => taskAccounts.some((a) => a.id === id))
      if (ids.length === 0) return
      try {
        let merged = cloudTaskAllItemsRef.current
        for (const accountId of ids) {
          const accountItems = await loadCloudTasksForAccount(accountId, { cacheOnly: true })
          merged = [...merged.filter((t) => t.accountId !== accountId), ...accountItems]
        }
        const planned = await loadPlannedScheduleMapForTasks(merged)
        if (!cloudTaskOverlayRef.current) return
        const api = calendarRef.current?.getApi()
        const { start, end } = api
          ? { start: api.view.activeStart, end: api.view.activeEnd }
          : lastRangeRef.current
        commitCloudTaskLayer(merged, planned, start, end)
      } catch {
        // Cache-Lesen fehlgeschlagen
      }
    },
    [taskAccounts, commitCloudTaskLayer]
  )

  const loadCloudTasksForRange = useCallback(
    async (start: Date, end: Date): Promise<void> => {
      if (!cloudTaskOverlayRef.current) return
      let items = cloudTaskAllItemsRef.current
      let planned = cloudTaskPlannedByKeyRef.current
      if (items.length === 0 && taskAccounts.length > 0) {
        const loaded = await reloadCloudTasksAll()
        items = loaded.items
        planned = loaded.planned
      }
      applyCloudTaskRangeFilter(items, planned, start, end)
    },
    [taskAccounts.length, reloadCloudTasksAll, applyCloudTaskRangeFilter]
  )
  const loadCloudTasksForRangeRef = useRef(loadCloudTasksForRange)
  loadCloudTasksForRangeRef.current = loadCloudTasksForRange

  const loadRange = useCallback(
    async (
      start: Date,
      end: Date,
      opts?: { silent?: boolean; forceRefresh?: boolean }
    ): Promise<void> => {
      const silent = opts?.silent === true
      if (!silent) setLoading(true)
      setError(null)
      try {
        const includeCalendars = await buildCalendarIncludeCalendars(
          calendarLinkedAccounts,
          calendarsByAccount,
          hiddenCalendarKeys,
          sidebarHiddenCalendarKeys
        )
        const list = await window.mailClient.calendar.listEvents({
          startIso: start.toISOString(),
          endIso: end.toISOString(),
          focusCalendar: null,
          includeCalendars,
          forceRefresh: opts?.forceRefresh === true
        })
        setEvents(list)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        if (!silent) setEvents([])
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [calendarLinkedAccounts, calendarsByAccount, hiddenCalendarKeys, sidebarHiddenCalendarKeys]
  )

  const reloadVisibleRange = useCallback(
    (opts?: { silent?: boolean; forceRefresh?: boolean }): void => {
      const silent = opts?.silent ?? eventsRef.current.length > 0
      const api = calendarRef.current?.getApi()
      if (api) {
        const { activeStart, activeEnd } = api.view
        void loadRange(activeStart, activeEnd, { silent, forceRefresh: opts?.forceRefresh })
        if (mailTodoOverlayRef.current) void loadMailTodosForRange(activeStart, activeEnd)
        if (cloudTaskOverlayRef.current) void loadCloudTasksForRange(activeStart, activeEnd)
        if (userNoteOverlayRef.current) void loadUserNotesForRange(activeStart, activeEnd)
        return
      }
      const { start, end } = lastRangeRef.current
      void loadRange(start, end, { silent, forceRefresh: opts?.forceRefresh })
      if (mailTodoOverlayRef.current) void loadMailTodosForRange(start, end)
      if (cloudTaskOverlayRef.current) void loadCloudTasksForRange(start, end)
      if (userNoteOverlayRef.current) void loadUserNotesForRange(start, end)
    },
    [loadRange, loadMailTodosForRange, loadCloudTasksForRange, loadUserNotesForRange]
  )

  /** Nur Graph-Termine + Mail-ToDos (Aufgaben-Layer nicht bei jedem Termin-Cache-Tick). */
  const reloadCalendarEventsOnly = useCallback(
    (opts?: { silent?: boolean; forceRefresh?: boolean }): void => {
      const silent = opts?.silent ?? eventsRef.current.length > 0
      const api = calendarRef.current?.getApi()
      if (api) {
        const { activeStart, activeEnd } = api.view
        void loadRange(activeStart, activeEnd, { silent, forceRefresh: opts?.forceRefresh })
        if (mailTodoOverlayRef.current) void loadMailTodosForRange(activeStart, activeEnd)
        return
      }
      const { start, end } = lastRangeRef.current
      void loadRange(start, end, { silent, forceRefresh: opts?.forceRefresh })
      if (mailTodoOverlayRef.current) void loadMailTodosForRange(start, end)
    },
    [loadRange, loadMailTodosForRange]
  )
  reloadCalendarEventsOnlyRef.current = reloadCalendarEventsOnly

  /** Ein-/Ausblenden in der Sidebar: `includeCalendars` aendert sich — Cloud-Termine neu laden (z. B. Gruppenkalender). */
  useEffect(() => {
    if (calendarLinkedAccounts.length === 0) return
    const api = calendarRef.current?.getApi()
    if (api) {
      void loadRange(api.view.activeStart, api.view.activeEnd)
    } else {
      const { start, end } = lastRangeRef.current
      void loadRange(start, end)
    }
  }, [hiddenCalendarKeys, sidebarHiddenCalendarKeys, calendarLinkedAccounts, loadRange])

  const scheduleMailsOnCalendar = useCallback(
    async (messageIds: number[], startIso: string, endIso: string): Promise<void> => {
      for (const id of messageIds) {
        await setTodoScheduleForMessage(id, startIso, endIso, { skipSelectedRefresh: true })
      }
      await useMailStore.getState().reloadSelectedMessageFromDb()
      setTodoSideListRefreshKey((k) => k + 1)
      timelineReloadRef.current?.()
      const api = calendarRef.current?.getApi()
      if (api) {
        void loadMailTodosForRange(api.view.activeStart, api.view.activeEnd)
      } else {
        const { start, end } = lastRangeRef.current
        void loadMailTodosForRange(start, end)
      }
    },
    [setTodoScheduleForMessage, loadMailTodosForRange]
  )

  const bumpTodoOverlayAndSideList = useCallback((): void => {
    setTodoSideListRefreshKey((k) => k + 1)
    timelineReloadRef.current?.()
    const api = calendarRef.current?.getApi()
    if (api) {
      void loadMailTodosForRange(api.view.activeStart, api.view.activeEnd)
      return
    }
    const { start, end } = lastRangeRef.current
    void loadMailTodosForRange(start, end)
  }, [loadMailTodosForRange])

  const setTodoForCalendarShell = useCallback(
    async (messageId: number, dueKind: TodoDueKindOpen): Promise<void> => {
      await setTodoForMessage(messageId, dueKind)
      bumpTodoOverlayAndSideList()
    },
    [setTodoForMessage, bumpTodoOverlayAndSideList]
  )

  const completeTodoForCalendarShell = useCallback(
    async (messageId: number): Promise<void> => {
      await completeTodoForMessage(messageId)
      bumpTodoOverlayAndSideList()
    },
    [completeTodoForMessage, bumpTodoOverlayAndSideList]
  )

  const mailContextHandlers = useMemo<MailContextHandlers>(
    () => ({
      openReply,
      openForward,
      openNote: (message): void => {
        setEventNoteTarget(null)
        setMailNoteTarget({
          kind: 'mail',
          messageId: message.id,
          title: message.subject || t('common.noSubject')
        })
        void selectMessage(message.id)
      },
      setMessageRead,
      toggleMessageFlag,
      archiveMessage,
      deleteMessage,
      setTodoForMessage: setTodoForCalendarShell,
      completeTodoForMessage: completeTodoForCalendarShell,
      setWaitingForMessage,
      clearWaitingForMessage,
      openSnoozePicker,
      refreshNow: async (): Promise<void> => {
        await refreshNow()
        bumpTodoOverlayAndSideList()
      }
    }),
    [
      openReply,
      openForward,
      t,
      selectMessage,
      setMessageRead,
      toggleMessageFlag,
      archiveMessage,
      deleteMessage,
      setTodoForCalendarShell,
      completeTodoForCalendarShell,
      setWaitingForMessage,
      clearWaitingForMessage,
      openSnoozePicker,
      refreshNow,
      bumpTodoOverlayAndSideList
    ]
  )

  const mailContextHandlersRef = useRef<MailContextHandlers>(mailContextHandlers)
  mailContextHandlersRef.current = mailContextHandlers

  const applyTimelineWorkItemToPreview = useCallback(
    (item: WorkItem): void => {
      setError(null)
      if (item.kind === 'cloud_task') {
        setPreviewCalendarEvent(null)
        clearSelectedMessage()
        const task: TaskItemWithContext = {
          ...item.task,
          accountId: item.accountId,
          listName: item.listName
        }
        setPreviewCloudTaskPlannedFromTimeline(item.planned)
        setPreviewCloudTask(task)
        persistRightPreviewOpen(true)
        setRightPreviewOpen(true)
        return
      }
      if (item.kind === 'mail_todo') {
        setPreviewCalendarEvent(null)
        setPreviewCloudTask(null)
        setPreviewCloudTaskPlannedFromTimeline(null)
        void selectMessageWithThreadPreview(item.messageId)
        persistRightPreviewOpen(true)
        setRightPreviewOpen(true)
        return
      }
      clearSelectedMessage()
      setPreviewCloudTask(null)
      setPreviewCloudTaskPlannedFromTimeline(null)
      setPreviewCalendarEvent(item.event)
      persistRightPreviewOpen(true)
      setRightPreviewOpen(true)
    },
    [clearSelectedMessage, selectMessageWithThreadPreview]
  )

  useCalendarMailExternalDrop(calendarDropRootRef, {
    timeZone: fcTimeZone,
    enabled: true,
    onScheduleMany: scheduleMailsOnCalendar
  })

  const scheduleCloudTaskFromExternalDrop = useCallback(
    async (payload: CloudTaskDragPayload, startIso: string, endIso: string): Promise<void> => {
      const taskPick = { accountId: payload.accountId, listId: payload.listId, id: payload.taskId }
      const target = {
        kind: 'planned' as const,
        taskKey: payload.taskKey,
        plannedStartIso: startIso,
        plannedEndIso: endIso
      }
      try {
        await applyCloudTaskPersistTarget(target, taskPick, fcTimeZone)
        setError(null)
        const items = await loadUnifiedCloudTasks(taskAccounts, { cacheOnly: true })
        const planned = await loadPlannedScheduleMapForTasks(items)
        const api = calendarRef.current?.getApi()
        const { start, end } = api
          ? { start: api.view.activeStart, end: api.view.activeEnd }
          : lastRangeRef.current
        cloudTaskLayerSigRef.current = ''
        cloudTaskFcEventsSigRef.current = ''
        commitCloudTaskLayer(items, planned, start, end)
        setTodoSideListRefreshKey((k) => k + 1)
        timelineReloadRef.current?.()
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    },
    [fcTimeZone, taskAccounts, commitCloudTaskLayer]
  )

  useCalendarCloudTaskExternalDrop(calendarDropRootRef, {
    timeZone: fcTimeZone,
    enabled: true,
    onSchedulePlanned: scheduleCloudTaskFromExternalDrop
  })

  /** Startseite / extern: Termin vormerken und beim Oeffnen des Kalenders anzeigen + Datum setzen; oder nur Zieldatum (Mini-Monat). */
  useEffect(() => {
    const st = useCalendarPendingFocusStore.getState()
    const ev = st.peekPendingEvent()
    if (ev) {
      clearSelectedMessage()
      setError(null)
      setPreviewCloudTask(null)
      setPreviewCloudTaskPlannedFromTimeline(null)
      setPreviewCalendarEvent(ev)
      persistRightPreviewOpen(true)
      setRightPreviewOpen(true)

      const start = parseISO(ev.startIso)
      if (Number.isNaN(start.getTime())) {
        useCalendarPendingFocusStore.getState().clearPendingEvent()
        return
      }

      let raf = 0
      let cancelled = false
      const step = (): void => {
        if (cancelled) return
        const api = calendarRef.current?.getApi()
        if (api) {
          api.gotoDate(start)
          useCalendarPendingFocusStore.getState().clearPendingEvent()
          return
        }
        raf = window.requestAnimationFrame(step)
      }
      raf = window.requestAnimationFrame(step)
      return (): void => {
        cancelled = true
        window.cancelAnimationFrame(raf)
      }
    }

    const createOnDay = st.peekPendingCreateOnDay()
    if (createOnDay) {
      clearSelectedMessage()
      setError(null)
      setPreviewCloudTask(null)
      setPreviewCloudTaskPlannedFromTimeline(null)
      setPreviewCalendarEvent(null)

      const parsed = parseISO(createOnDay.dateIso)
      if (Number.isNaN(parsed.getTime())) {
        useCalendarPendingFocusStore.getState().clearPendingCreateOnDay()
        return
      }
      const dayStart = startOfDay(parsed)

      let rafC = 0
      let cancelledC = false
      const stepCreate = (): void => {
        if (cancelledC) return
        const api = calendarRef.current?.getApi()
        if (api) {
          api.gotoDate(dayStart)
          setEventDialog({
            mode: 'create',
            range: { start: dayStart, end: dayStart, allDay: true }
          })
          useCalendarPendingFocusStore.getState().clearPendingCreateOnDay()
          return
        }
        rafC = window.requestAnimationFrame(stepCreate)
      }
      rafC = window.requestAnimationFrame(stepCreate)
      return (): void => {
        cancelledC = true
        window.cancelAnimationFrame(rafC)
      }
    }

    const iso = st.peekPendingGotoDate()
    if (!iso) return

    const day = parseISO(iso)
    if (Number.isNaN(day.getTime())) {
      useCalendarPendingFocusStore.getState().clearPendingGotoDate()
      return
    }

    let raf2 = 0
    let cancelled2 = false
    const step2 = (): void => {
      if (cancelled2) return
      const api = calendarRef.current?.getApi()
      if (api) {
        api.gotoDate(day)
        useCalendarPendingFocusStore.getState().clearPendingGotoDate()
        return
      }
      raf2 = window.requestAnimationFrame(step2)
    }
    raf2 = window.requestAnimationFrame(step2)
    return (): void => {
      cancelled2 = true
      window.cancelAnimationFrame(raf2)
    }
  }, [clearSelectedMessage])

  const hideCalendarFromSidebar = useCallback(
    (accountId: string, graphCalendarId: string): void => {
      const key = calendarVisibilityKey(accountId, graphCalendarId)
      setSidebarHiddenCalendarKeys((prev) => {
        const next = new Set(prev)
        next.add(key)
        return next
      })
      setHiddenCalendarKeys((prev) => {
        const next = new Set(prev)
        next.add(key)
        return next
      })
    },
    []
  )

  const restoreCalendarToSidebar = useCallback((visibilityKey: string): void => {
    setSidebarHiddenCalendarKeys((prev) => {
      const next = new Set(prev)
      next.delete(visibilityKey)
      return next
    })
    setHiddenCalendarKeys((prev) => {
      const next = new Set(prev)
      next.delete(visibilityKey)
      return next
    })
  }, [])

  const buildCalendarFolderColorMenuItems = useCallback(
    (accountId: string, cal: CalendarGraphCalendarRow): ContextMenuItem[] => {
      const tail: ContextMenuItem[] = [
        { id: 'sep-cal-sidebar', label: '', separator: true },
        {
          id: 'hide-from-sidebar',
          label: t('calendar.shell.contextHideFromSidebar'),
          icon: PanelLeftClose,
          disabled: cal.id === SIDEBAR_DEFAULT_CAL_ID,
          onSelect: (): void => {
            if (cal.id === SIDEBAR_DEFAULT_CAL_ID) return
            hideCalendarFromSidebar(accountId, cal.id)
          }
        }
      ]
      const canEditRemote = cal.canEdit !== false && cal.calendarKind !== 'm365Group'
      const curPreset: GraphCalendarColorPresetId | null = (() => {
        const overrideHex = resolveCalendarDisplayHex(cal)
        if (overrideHex && cal.displayColorOverrideHex) {
          const match = GRAPH_CALENDAR_COLOR_PRESET_IDS.find(
            (id) => id !== 'auto' && graphCalendarColorToDisplayHex(null, id) === overrideHex
          )
          if (match) return match
        }
        const raw = (cal.color ?? 'auto').trim().toLowerCase()
        if (!raw || raw === 'auto') return cal.displayColorOverrideHex ? null : 'auto'
        const found = GRAPH_CALENDAR_COLOR_PRESET_IDS.find((id) => id.toLowerCase() === raw)
        return found ?? null
      })()
      const hexFallback = '#94a3b8'
      return [
        {
          id: 'cal-color-submenu',
          label: canEditRemote
            ? t('calendar.shell.colorMicrosoftLabel')
            : t('calendar.shell.colorLocalLabel'),
          submenu: [...GRAPH_CALENDAR_COLOR_PRESET_IDS].map((presetId) => {
            const solidHex =
              presetId === 'auto'
                ? undefined
                : (graphCalendarColorToDisplayHex(null, presetId) ?? hexFallback)
            return {
              id: `cal-col-${presetId}`,
              label: t(`calendar.graphColor.${presetId}` as 'calendar.graphColor.auto'),
              swatchAuto: presetId === 'auto',
              swatchHex: presetId === 'auto' ? undefined : solidHex,
              selected: curPreset !== null && presetId === curPreset,
              onSelect: (): void => {
                void (async (): Promise<void> => {
                  try {
                    setError(null)
                    await window.mailClient.calendar.patchCalendarColor({
                      accountId,
                      graphCalendarId: cal.id,
                      color: presetId
                    })
                    await reloadCalendarsForAccount(accountId, { forceRefresh: canEditRemote })
                    void reloadVisibleRange()
                  } catch (err) {
                    setError(err instanceof Error ? err.message : String(err))
                  }
                })()
              }
            }
          })
        },
        ...tail
      ]
    },
    [hideCalendarFromSidebar, reloadCalendarsForAccount, reloadVisibleRange, t]
  )

  const handleGraphEventChange = useCallback(
    async (info: EventChangeArg): Promise<void> => {
      const kind = info.event.extendedProps.calendarKind as string | undefined
      if (kind === CALENDAR_KIND_CLOUD_TASK) {
        const taskKey =
          (typeof info.event.extendedProps.taskKey === 'string' && info.event.extendedProps.taskKey) ||
          null
        if (!taskKey) {
          info.revert()
          return
        }
        const task = cloudTaskByKeyRef.current.get(taskKey)
        if (!task) {
          info.revert()
          return
        }
        const target = computePersistTargetForCloudTask(info.event, info.oldEvent, fcTimeZone)
        if (!target) {
          info.revert()
          return
        }
        try {
          cloudTaskPersistInFlightRef.current += 1
          await applyCloudTaskPersistTarget(target, task, fcTimeZone)
          setError(null)

          const optimistic = applyOptimisticCloudTaskPersistToLayer(
            target,
            task,
            cloudTaskAllItemsRef.current,
            cloudTaskPlannedByKeyRef.current,
            fcTimeZone
          )
          const api = calendarRef.current?.getApi()
          const { start, end } = api
            ? { start: api.view.activeStart, end: api.view.activeEnd }
            : lastRangeRef.current
          const optimisticTask =
            optimistic.items.find(
              (row) => cloudTaskStableKey(row.accountId, row.listId, row.id) === taskKey
            ) ?? task
          const optimisticPlanned = optimistic.plannedByKey.get(taskKey)

          flushSync(() => {
            commitCloudTaskLayer(optimistic.items, optimistic.plannedByKey, start, end, {
              force: true
            })
          })

          syncFullCalendarCloudTaskEventFromLayer(
            api,
            optimisticTask,
            optimisticPlanned,
            fcTimeZone
          )
          if (taskKey) {
            scheduleRemoveCloudTaskCalendarEventsByTaskKey(
              api,
              taskKey,
              cloudTaskEventId(taskKey)
            )
          }

          const items = await loadUnifiedCloudTasks(taskAccounts, { cacheOnly: true })
          const planned = await loadPlannedScheduleMapForTasks(items)
          commitCloudTaskLayer(items, planned, start, end, { force: true })
          if (taskKey) {
            scheduleRemoveCloudTaskCalendarEventsByTaskKey(
              calendarRef.current?.getApi(),
              taskKey,
              cloudTaskEventId(taskKey)
            )
          }
          if (taskKey) {
            const updated = cloudTaskByKeyRef.current.get(taskKey)
            if (updated) {
              setPreviewCloudTaskPlannedFromTimeline(null)
              setPreviewCloudTask(updated)
            }
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e))
          info.revert()
        }
        return
      }
      if (kind === CALENDAR_KIND_USER_NOTE) {
        const target = computePersistTargetForUserNote(info.event, fcTimeZone)
        if (!target) {
          info.revert()
          return
        }
        try {
          await window.mailClient.notes.setSchedule({
            id: target.noteId,
            scheduledStartIso: target.scheduledStartIso,
            scheduledEndIso: target.scheduledEndIso,
            scheduledAllDay: target.scheduledAllDay
          })
          setError(null)
          const api = calendarRef.current?.getApi()
          if (api) {
            scheduleRemoveDuplicateFullCalendarEventsById(api, [userNoteEventId(target.noteId)])
            void loadUserNotesForRange(api.view.activeStart, api.view.activeEnd)
          } else {
            const { start, end } = lastRangeRef.current
            void loadUserNotesForRange(start, end)
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e))
          info.revert()
        } finally {
          cloudTaskPersistInFlightRef.current = Math.max(0, cloudTaskPersistInFlightRef.current - 1)
        }
        return
      }
      if (kind === CALENDAR_KIND_MAIL_TODO) {
        const m = info.event.extendedProps.mailMessage as MailListItem | undefined
        const range = computePersistIsoRangeForMailTodo(info.event, info.oldEvent, fcTimeZone)
        if (!m || !range) {
          info.revert()
          return
        }
        try {
          await setTodoScheduleForMessage(m.id, range.startIso, range.endIso, {
            skipSelectedRefresh: true
          })
          await useMailStore.getState().reloadSelectedMessageFromDb()
          setError(null)
          setTodoSideListRefreshKey((k) => k + 1)
          timelineReloadRef.current?.()
          const api = calendarRef.current?.getApi()
          if (api) {
            scheduleRemoveDuplicateFullCalendarEventsById(api, [`mail-todo:${m.id}`])
            void loadMailTodosForRange(api.view.activeStart, api.view.activeEnd)
          } else {
            const { start, end } = lastRangeRef.current
            void loadMailTodosForRange(start, end)
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e))
          info.revert()
        }
        return
      }
      const calEv = info.event.extendedProps.calendarEvent as CalendarEventView | undefined
      if (!calEv?.graphEventId) {
        info.revert()
        return
      }
      if (!calEv.graphCalendarId?.trim()) {
        info.revert()
        setError(t('calendar.errors.missingGraphCalendarId'))
        return
      }
      if (calEv.calendarCanEdit === false) {
        info.revert()
        setError(t('calendar.errors.calendarReadOnlyEdit'))
        return
      }
      const sched = fullCalendarEventToPatchSchedule({
        start: info.event.start,
        end: info.event.end,
        allDay: info.event.allDay
      })
      if (!sched) {
        info.revert()
        setError(t('calendar.errors.scheduleParseFailed'))
        return
      }
      try {
        await window.mailClient.calendar.patchEventSchedule({
          accountId: calEv.accountId,
          graphEventId: calEv.graphEventId,
          graphCalendarId: calEv.graphCalendarId ?? null,
          startIso: sched.startIso,
          endIso: sched.endIso,
          isAllDay: sched.isAllDay
        })
        setError(null)
        const updatedCalEv: CalendarEventView = {
          ...calEv,
          startIso: sched.startIso,
          endIso: sched.endIso,
          isAllDay: sched.isAllDay
        }
        info.event.setExtendedProp('calendarEvent', updatedCalEv)
        flushSync(() => {
          setEvents((prev) =>
            prev.map((ev) =>
              ev.accountId === calEv.accountId && ev.graphEventId === calEv.graphEventId
                ? updatedCalEv
                : ev
            )
          )
          setPreviewCalendarEvent((prev) =>
            prev &&
            prev.accountId === calEv.accountId &&
            prev.graphEventId === calEv.graphEventId
              ? updatedCalEv
              : prev
          )
        })
        scheduleRemoveDuplicateFullCalendarEventsById(calendarRef.current?.getApi(), [calEv.id])
        reloadCalendarEventsOnly({ silent: true })
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        info.revert()
      }
    },
    [
      reloadCalendarEventsOnly,
      fcTimeZone,
      setTodoScheduleForMessage,
      loadMailTodosForRange,
      taskAccounts,
      commitCloudTaskLayer,
      t
    ]
  )

  const defaultGraphCalendarIdByAccount = useMemo(() => {
    const m: Record<string, string | null> = {}
    for (const acc of calendarLinkedAccounts) {
      const rows = calendarsByAccount[acc.id]
      if (!rows?.length) {
        m[acc.id] = null
        continue
      }
      m[acc.id] = rows.find((r) => r.isDefaultCalendar)?.id ?? rows[0]?.id ?? null
    }
    return m
  }, [calendarLinkedAccounts, calendarsByAccount])

  /** Hex aus Sidebar-Kalenderliste (Outlook-Farben), falls Graph beim Termin keine liefert. */
  const calendarDisplayHexByKey = useMemo(() => {
    const m: Record<string, Record<string, string | null>> = {}
    for (const acc of calendarLinkedAccounts) {
      const inner: Record<string, string | null> = {}
      for (const row of calendarsByAccount[acc.id] ?? []) {
        inner[row.id] = resolveCalendarDisplayHex(row)
      }
      m[acc.id] = inner
    }
    return m
  }, [calendarLinkedAccounts, calendarsByAccount])

  const visibleGraphEvents = useMemo(() => {
    if (hiddenCalendarKeys.size === 0 && sidebarHiddenCalendarKeys.size === 0) return events
    return events.filter((ev) => {
      const defId = defaultGraphCalendarIdByAccount[ev.accountId]
      const calId = (ev.graphCalendarId?.trim() || defId || SIDEBAR_DEFAULT_CAL_ID).trim()
      const key = calendarVisibilityKey(ev.accountId, calId)
      if (hiddenCalendarKeys.has(key)) return false
      if (sidebarHiddenCalendarKeys.has(key)) return false
      return true
    })
  }, [events, hiddenCalendarKeys, sidebarHiddenCalendarKeys, defaultGraphCalendarIdByAccount])

  const toggleCalendarVisibility = useCallback(
    (accountId: string, graphCalendarId: string): void => {
      const key = calendarVisibilityKey(accountId, graphCalendarId)
      setHiddenCalendarKeys((prev) => {
        const next = new Set(prev)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        return next
      })
    },
    []
  )

  const showAllCalendarsInView = useCallback((): void => {
    setHiddenCalendarKeys(new Set())
    setSidebarHiddenCalendarKeys(new Set())
  }, [])

  const calendarSidebarHiddenRestoreEntries = useMemo((): CalendarSidebarHiddenRestoreEntry[] => {
    const out: CalendarSidebarHiddenRestoreEntry[] = []
    for (const key of sidebarHiddenCalendarKeys) {
      const parsed = parseCalendarVisibilityKey(key)
      if (!parsed) continue
      const acc = calendarLinkedAccounts.find((a) => a.id === parsed.accountId)
      const rows = calendarsByAccount[parsed.accountId]
      const cal = rows?.find((c) => c.id === parsed.graphCalendarId)
      const accountLabel = acc?.displayName?.trim() || acc?.email || parsed.accountId
      const calendarName = cal?.name?.trim() || parsed.graphCalendarId
      out.push({ key, accountLabel, calendarName })
    }
    out.sort((a, b) => {
      const cmp = a.accountLabel.localeCompare(b.accountLabel, calendarCollatorLocale)
      if (cmp !== 0) return cmp
      return a.calendarName.localeCompare(b.calendarName, calendarCollatorLocale)
    })
    return out
  }, [
    sidebarHiddenCalendarKeys,
    calendarLinkedAccounts,
    calendarsByAccount,
    calendarCollatorLocale
  ])

  const graphFcEvents = useMemo(
    () =>
      visibleGraphEvents.map((ev) => {
        const defId = defaultGraphCalendarIdByAccount[ev.accountId]
        const calIdRaw = (ev.graphCalendarId?.trim() || defId || SIDEBAR_DEFAULT_CAL_ID).trim()
        const lookupId =
          calIdRaw === SIDEBAR_DEFAULT_CAL_ID && defId
            ? defId
            : calIdRaw !== SIDEBAR_DEFAULT_CAL_ID
              ? calIdRaw
              : null
        const fromCalList =
          lookupId && ev.source === 'microsoft'
            ? (calendarDisplayHexByKey[ev.accountId]?.[lookupId] ?? null)
            : null
        const resolvedDisplayHex = fromCalList ?? ev.displayColorHex ?? null
        return {
          id: ev.id,
          title: ev.title,
          start: ev.startIso,
          end: ev.endIso,
          allDay: ev.isAllDay,
          url: ev.joinUrl ?? ev.webLink ?? undefined,
          extendedProps: {
            accountColor: ev.accountColorClass,
            displayColorHex: resolvedDisplayHex,
            joinUrl: ev.joinUrl,
            calendarEvent: ev
          },
          editable: Boolean(
            ev.graphEventId && (ev.source === 'microsoft' || ev.source === 'google')
          ),
          startEditable: Boolean(
            ev.graphEventId && (ev.source === 'microsoft' || ev.source === 'google')
          ),
          durationEditable: Boolean(
            ev.graphEventId && (ev.source === 'microsoft' || ev.source === 'google')
          )
        }
      }),
    [visibleGraphEvents, defaultGraphCalendarIdByAccount, calendarDisplayHexByKey]
  )

  const mailTodoFcEvents = useMemo(
    () => mailTodoItemsToFullCalendarEvents(mailTodoItems, accountColorById),
    [mailTodoItems, accountColorById]
  )

  const userNoteFcEvents = useMemo(
    () => notesToFullCalendarEvents(userNoteRangeItems, { defaultTitle: t('notes.shell.untitled') }),
    [userNoteRangeItems, t]
  )

  const cloudTaskFcEventsRef = useRef<EventInput[]>([])
  const cloudTaskFcEvents = useMemo((): EventInput[] => {
    const sig = cloudTaskCalendarDisplaySignature(cloudTaskRangeItems, cloudTaskPlannedByKey)
    if (sig === cloudTaskFcEventsSigRef.current && cloudTaskFcEventsRef.current.length > 0) {
      return cloudTaskFcEventsRef.current
    }
    cloudTaskFcEventsSigRef.current = sig
    const next = cloudTasksToFullCalendarEvents(
      cloudTaskRangeItems,
      accountColorById,
      cloudTaskPlannedByKey
    )
    cloudTaskFcEventsRef.current = next
    return next
  }, [cloudTaskRangeItems, accountColorById, cloudTaskPlannedByKey])

  const filterCalendarSearchEvents = useCallback(
    (evs: EventInput[]): EventInput[] => {
      const q = calendarEventSearchQuery.trim().toLowerCase()
      if (!q) return evs
      return evs.filter((ev) => {
        if (
          String(ev.title ?? '')
            .toLowerCase()
            .includes(q)
        )
          return true
        const cal = ev.extendedProps?.calendarEvent as CalendarEventView | undefined
        const loc = (cal?.location ?? '').trim().toLowerCase()
        if (loc.includes(q)) return true
        const task = (ev.extendedProps as { cloudTask?: TaskItemWithContext } | undefined)?.cloudTask
        if ((task?.title ?? '').trim().toLowerCase().includes(q)) return true
        const note = (ev.extendedProps as { userNote?: UserNoteListItem } | undefined)?.userNote
        return (note?.title ?? note?.body ?? '').trim().toLowerCase().includes(q)
      })
    },
    [calendarEventSearchQuery]
  )

  const graphFcEventsDisplayed = useMemo(
    () => filterCalendarSearchEvents(graphFcEvents),
    [graphFcEvents, filterCalendarSearchEvents]
  )
  const graphFcEventsForFc = useMemo(() => {
    if (!isMultiMonthFcView(activeViewId)) return graphFcEventsDisplayed
    return capEventInputsForMultiMonthView(graphFcEventsDisplayed, activeViewId)
  }, [graphFcEventsDisplayed, activeViewId])
  const mailTodoFcEventsDisplayed = useMemo(
    () => filterCalendarSearchEvents(mailTodoFcEvents),
    [mailTodoFcEvents, filterCalendarSearchEvents]
  )
  const cloudTaskFcEventsDisplayed = useMemo(
    () => filterCalendarSearchEvents(cloudTaskFcEvents),
    [cloudTaskFcEvents, filterCalendarSearchEvents]
  )
  const userNoteFcEventsDisplayed = useMemo(
    () => filterCalendarSearchEvents(userNoteFcEvents),
    [userNoteFcEvents, filterCalendarSearchEvents]
  )

  const quickCreatePlaceholderEvents = useMemo((): EventInput[] => {
    if (!quickCreate) return []
    return [quickCreateRangeToFcPlaceholder(quickCreate.range)]
  }, [quickCreate])

  const fcEventSources = useMemo((): EventSourceInput[] => {
    const skipHeavyLayers = shouldSkipHeavyCalendarLayersForMultiMonth(activeViewId)
    const sources: EventSourceInput[] = [{ id: 'graph-calendar', events: graphFcEventsForFc }]
    if (mailTodoOverlay && !skipHeavyLayers) {
      sources.push({ id: 'mail-todo', events: mailTodoFcEventsDisplayed })
    }
    if (cloudTaskOverlay && !skipHeavyLayers) {
      sources.push({ id: 'cloud-task', events: cloudTaskFcEventsDisplayed })
    }
    if (userNoteOverlay && !skipHeavyLayers) {
      sources.push({ id: 'user-note', events: userNoteFcEventsDisplayed })
    }
    if (quickCreate) {
      sources.push({ id: 'quick-create-placeholder', events: quickCreatePlaceholderEvents })
    }
    return sources
  }, [
    graphFcEventsForFc,
    mailTodoFcEventsDisplayed,
    cloudTaskFcEventsDisplayed,
    userNoteFcEventsDisplayed,
    mailTodoOverlay,
    cloudTaskOverlay,
    userNoteOverlay,
    activeViewId,
    quickCreate,
    quickCreatePlaceholderEvents
  ])

  useEffect(() => {
    if (!mailTodoOverlay) {
      setMailTodoItems([])
      return
    }
    const { start, end } = lastRangeRef.current
    void loadMailTodosForRange(start, end)
  }, [mailTodoOverlay, loadMailTodosForRange])

  useEffect(() => {
    if (!mailTodoOverlay) return
    const off = window.mailClient.events.onMailChanged(() => {
      const { start, end } = lastRangeRef.current
      void loadMailTodosForRange(start, end)
    })
    return off
  }, [mailTodoOverlay, loadMailTodosForRange])

  useEffect(() => {
    if (!userNoteOverlay) {
      setUserNoteRangeItems([])
      return
    }
    const { start, end } = lastRangeRef.current
    void loadUserNotesForRange(start, end)
  }, [userNoteOverlay, loadUserNotesForRange])

  useEffect(() => {
    if (!userNoteOverlay) return
    const off = window.mailClient.events.onNotesChanged(() => {
      const { start, end } = lastRangeRef.current
      void loadUserNotesForRange(start, end)
    })
    return off
  }, [userNoteOverlay, loadUserNotesForRange])

  useEffect(() => {
    const off = window.mailClient.events.onCalendarChanged(() => {
      reloadCalendarEventsOnly({ silent: true })
    })
    return off
  }, [reloadCalendarEventsOnly])

  useEffect(() => {
    return (): void => {
      if (datesSetLoadTimerRef.current) clearTimeout(datesSetLoadTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!cloudTaskOverlay) return
    let debounceTimer: ReturnType<typeof setTimeout> | undefined
    const pendingAccountIds = new Set<string>()
    const off = window.mailClient.events.onTasksChanged(({ accountId }) => {
      if (cloudTaskPersistInFlightRef.current > 0) return
      pendingAccountIds.add(accountId)
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        if (cloudTaskPersistInFlightRef.current > 0) return
        const ids = [...pendingAccountIds]
        pendingAccountIds.clear()
        void reloadCloudTasksForAccounts(ids)
      }, 400)
    })
    return (): void => {
      off()
      if (debounceTimer) clearTimeout(debounceTimer)
    }
  }, [cloudTaskOverlay, reloadCloudTasksForAccounts])

  useEffect(() => {
    if (!cloudTaskOverlay) return
    const previewKey = previewCloudTask
      ? cloudTaskStableKey(previewCloudTask.accountId, previewCloudTask.listId, previewCloudTask.id)
      : null
    for (const [key, el] of cloudTaskElByKeyRef.current) {
      const active = previewKey != null && key === previewKey
      el.classList.toggle('ring-2', active)
      el.classList.toggle('ring-primary', active)
    }
  }, [previewCloudTask, cloudTaskOverlay])

  useEffect(() => {
    if (!cloudTaskOverlay) {
      setCloudTaskAllItems([])
      setCloudTaskRangeItems([])
      setCloudTaskPlannedByKey(new Map())
      cloudTaskByKeyRef.current = new Map()
      cloudTaskLayerSigRef.current = ''
      cloudTaskFcEventsSigRef.current = ''
      lastCloudFilterRangeKeyRef.current = ''
      cloudTaskElByKeyRef.current.clear()
      return
    }
    const { start, end } = lastRangeRef.current
    void loadCloudTasksForRangeRef.current(start, end)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nur Overlay-Toggle, nicht bei jedem Task-Cache-Update
  }, [cloudTaskOverlay])

  const applyMiniCalendarDayRange = useCallback(
    (startInclusive: Date, endInclusive: Date): void => {
      const api = calendarRef.current?.getApi()
      if (!api) return
      const lo = compareAsc(startInclusive, endInclusive) <= 0 ? startInclusive : endInclusive
      const hi = compareAsc(startInclusive, endInclusive) <= 0 ? endInclusive : startInclusive
      const span = differenceInCalendarDays(hi, lo) + 1
      const capped = Math.min(Math.max(span, 1), MAX_TIME_GRID_SPAN_DAYS)
      const viewId = capped === 1 ? 'timeGridDay' : `timeGrid${capped}Day`
      api.gotoDate(lo)
      api.changeView(viewId)
      setActiveViewId(viewId)
      setViewMenuOpen(false)
      setDaysSubOpen(false)
      setSettingsSubOpen(false)
      setMiniMonth(startOfMonth(lo))
    },
    []
  )

  const changeView = useCallback((viewId: string): void => {
    const api = calendarRef.current?.getApi()
    if (!api) return
    api.changeView(viewId)
    setActiveViewId(viewId)
    setViewMenuOpen(false)
    setDaysSubOpen(false)
    setSettingsSubOpen(false)
  }, [])

  const scrollCalendarTodayIntoView = useCallback((): void => {
    const root = calendarDropRootRef.current
    if (!root) return
    const col = root.querySelector('.fc-timegrid-col.fc-day-today') as HTMLElement | null
    if (col) {
      col.scrollIntoView({ inline: 'start', block: 'nearest', behavior: 'smooth' })
      return
    }
    const dayCell = root.querySelector('.fc-daygrid-day.fc-day-today') as HTMLElement | null
    dayCell?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' })
  }, [])

  useEffect(() => {
    if (!calendarEventSearchOpen) return
    const id = window.requestAnimationFrame(() => {
      calendarSearchInputRef.current?.focus()
      calendarSearchInputRef.current?.select()
    })
    return (): void => window.cancelAnimationFrame(id)
  }, [calendarEventSearchOpen])

  useEffect(() => {
    if (!gotoDateOpen) return
    const id = window.requestAnimationFrame(() => {
      gotoDateInputRef.current?.focus()
      gotoDateInputRef.current?.select()
    })
    return (): void => window.cancelAnimationFrame(id)
  }, [gotoDateOpen])

  useEffect(() => {
    if (!viewMenuOpen) return
    const onDoc = (e: MouseEvent): void => {
      if (viewMenuRef.current?.contains(e.target as Node)) return
      setViewMenuOpen(false)
      setDaysSubOpen(false)
      setSettingsSubOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return (): void => document.removeEventListener('mousedown', onDoc)
  }, [viewMenuOpen])

  useEffect(() => {
    const blockNav = (target: EventTarget | null): boolean => {
      const el = target instanceof HTMLElement ? target : null
      if (!el) return false
      if (el.closest('input, textarea, select, [contenteditable="true"]')) return true
      if (el.closest('[role="dialog"]')) return true
      return false
    }

    const onKey = (e: KeyboardEvent): void => {
      if (e.repeat) return

      if (e.key === 'Escape') {
        if (gotoDateOpen) {
          e.preventDefault()
          setGotoDateOpen(false)
          return
        }
        if (calendarEventSearchOpen) {
          e.preventDefault()
          setCalendarEventSearchOpen(false)
          setCalendarEventSearchQuery('')
          return
        }
      }

      if (blockNav(e.target)) return

      const api = calendarRef.current?.getApi()
      if (!api) return

      const noMods = !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey

      if (e.altKey && (e.key === 't' || e.key === 'T') && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault()
        api.today()
        setMiniMonth(startOfMonth(new Date()))
        window.setTimeout((): void => {
          scrollCalendarTodayIntoView()
        }, 0)
        return
      }

      if (noMods && (e.key === 't' || e.key === 'T')) {
        e.preventDefault()
        api.today()
        setMiniMonth(startOfMonth(new Date()))
        return
      }

      if (noMods && (e.key === 'j' || e.key === 'J')) {
        e.preventDefault()
        api.next()
        return
      }

      if (noMods && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        api.prev()
        return
      }

      const isPeriodGoToDate =
        noMods &&
        (e.key === '.' ||
          (e.code === 'Period' && e.location === KeyboardEvent.DOM_KEY_LOCATION_STANDARD))
      if (isPeriodGoToDate) {
        e.preventDefault()
        setGotoDateDraft(format(new Date(), 'yyyy-MM-dd'))
        setGotoDateOpen(true)
        return
      }

      if (noMods && e.key === '/') {
        e.preventDefault()
        setCalendarEventSearchOpen(true)
        return
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F') && !e.altKey) {
        e.preventDefault()
        setCalendarEventSearchOpen(true)
        return
      }

      if (e.key === 'd' || e.key === 'D' || e.key === '1') {
        if (!noMods) return
        changeView('timeGridDay')
        e.preventDefault()
      } else if (e.key === 'w' || e.key === 'W' || e.key === '0') {
        if (!noMods) return
        changeView('timeGridWeek')
        e.preventDefault()
      } else if (e.key === 'm' || e.key === 'M') {
        if (!noMods) return
        changeView('dayGridMonth')
        e.preventDefault()
      } else if (e.key === 'y' || e.key === 'Y') {
        if (!noMods) return
        changeView(MULTI_MONTH_YEAR_VIEW_ID)
        e.preventDefault()
      } else if (e.key === 'l' || e.key === 'L') {
        if (!noMods) return
        changeView('listWeek')
        e.preventDefault()
      } else if (/^[2-9]$/.test(e.key)) {
        if (!noMods) return
        changeView(`timeGrid${e.key}Day`)
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey)
    return (): void => window.removeEventListener('keydown', onKey)
  }, [changeView, gotoDateOpen, calendarEventSearchOpen, scrollCalendarTodayIntoView])

  return (
    <>
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <div className="calendar-shell-workspace flex min-h-0 flex-1 flex-col">
          <div className="calendar-shell-dock-header-row flex shrink-0 flex-row items-stretch border-b border-border">
            {!leftSidebarCollapsed ? (
              <div className="module-nav-column w-[272px]">
                <div className="calendar-shell-column-header flex h-10 min-h-0 shrink-0 items-center px-2 text-xs">
                  <ModuleColumnHeaderStackedTitle
                    className="min-w-0 flex-1"
                    kicker={t('calendar.shell.sidebarBrand')}
                    title={t('calendar.shell.eventsTitle')}
                  />
                </div>
              </div>
            ) : (
              <div className="w-0 shrink-0 overflow-hidden" aria-hidden />
            )}
            <div className="flex min-w-0 flex-1 flex-col border-r border-border bg-background">
              <div className="calendar-shell-header-container flex min-h-0 min-w-0 flex-1 flex-col">
                <CalendarShellHeader
                  rangeTitle={rangeTitle}
                  visibleStart={visibleStart}
                  rightInboxOpen={rightInboxOpen}
                  onRightInboxOpenChange={(next): void => {
                    persistRightInboxOpen(next)
                    setRightInboxOpen(next)
                  }}
                  rightPreviewOpen={rightPreviewOpen}
                  onRightPreviewOpenChange={(next): void => {
                    persistRightPreviewOpen(next)
                    setRightPreviewOpen(next)
                  }}
                  viewMenuRef={viewMenuRef}
                  viewMenuOpen={viewMenuOpen}
                  setViewMenuOpen={setViewMenuOpen}
                  activeViewId={activeViewId}
                  changeView={changeView}
                  daysSubOpen={daysSubOpen}
                  setDaysSubOpen={setDaysSubOpen}
                  settingsSubOpen={settingsSubOpen}
                  setSettingsSubOpen={setSettingsSubOpen}
                  calendarSidebarHiddenRestoreEntries={calendarSidebarHiddenRestoreEntries}
                  onRestoreCalendarToSidebar={restoreCalendarToSidebar}
                  timeGridSlotMinutes={timeGridSlotMinutes}
                  onTimeGridSlotMinutesChange={(min): void => setTimeGridSlotMinutes(min)}
                  onCalendarToday={(): void => calendarRef.current?.getApi().today()}
                  onCalendarPrev={(): void => calendarRef.current?.getApi().prev()}
                  onCalendarNext={(): void => calendarRef.current?.getApi().next()}
                  leftSidebarCollapsed={leftSidebarCollapsed}
                  onLeftSidebarCollapsedChange={setLeftSidebarCollapsed}
                />
              </div>
            </div>
            {inboxDockStripInDom && inboxPlacement === 'dock' ? (
              <CalendarDockStripFrame
                visible={inboxDockShow}
                panelWidthPx={inboxColumnWidth}
                className="self-stretch"
                splitter={<div className="w-px shrink-0 self-stretch bg-border" aria-hidden />}
              >
                <div
                  style={{ width: inboxColumnWidth }}
                  className="flex h-full min-h-0 shrink-0 flex-col border-l border-border bg-card"
                >
                  <div
                    ref={bindInboxDockHeaderSlot}
                    className="calendar-shell-dock-inbox-header-slot min-h-0 w-full flex-1 shrink-0"
                  />
                </div>
              </CalendarDockStripFrame>
            ) : null}
            {previewDockStripInDom && previewPlacement === 'dock' ? (
              <CalendarDockStripFrame
                visible={previewDockShow}
                panelWidthPx={previewPaneWidth}
                className="self-stretch"
                splitter={<div className="w-px shrink-0 self-stretch bg-border" aria-hidden />}
              >
                <div
                  style={{ width: previewPaneWidth }}
                  className="flex h-full min-h-0 shrink-0 flex-col border-l border-border bg-card"
                >
                  <div className="calendar-shell-column-header flex h-full min-h-0 flex-1 flex-col justify-center">
                    <div className={moduleColumnHeaderDockBarRowClass}>
                      <span
                        className={cn(
                          moduleColumnHeaderUppercaseLabelClass,
                          'min-w-0 flex-1 text-left'
                        )}
                      >
                        {previewColumnLabel}
                      </span>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <ModuleColumnHeaderIconButton
                          title={t('calendar.shell.undockPreviewTitle')}
                          onClick={(): void => setPreviewPlacement('float')}
                        >
                          <SquareArrowOutUpRight className={moduleColumnHeaderIconGlyphClass} />
                        </ModuleColumnHeaderIconButton>
                        <ModuleColumnHeaderIconButton
                          title={t('calendar.shell.hidePreviewTitle')}
                          onClick={(): void => {
                            persistRightPreviewOpen(false)
                            setRightPreviewOpen(false)
                          }}
                        >
                          <PanelRightClose className={moduleColumnHeaderIconGlyphClass} />
                        </ModuleColumnHeaderIconButton>
                      </div>
                    </div>
                  </div>
                </div>
              </CalendarDockStripFrame>
            ) : null}
          </div>

          <div className="flex min-h-0 flex-1 flex-row">
            <div
              className={cn(
                'calendar-notion-shell flex h-full min-h-0 min-w-0 flex-1 bg-background text-foreground',
                `cal-slot-${timeGridSlotMinutes}`,
                activeViewId === MULTI_MONTH_YEAR_VIEW_ID &&
                  'calendar-notion-shell--multimonth-year',
                quickCreate != null && 'calendar-notion-shell--quick-create-open'
              )}
            >
              {!leftSidebarCollapsed ? (
                <aside className="module-nav-column w-[272px]">
                  <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-4">
                <ModuleNavMiniMonth
                  monthAnchor={miniMonth}
                  today={new Date()}
                  onSelectDayRange={applyMiniCalendarDayRange}
                  onPrevMonth={(): void => setMiniMonth((m) => addMonths(m, -1))}
                  onNextMonth={(): void => setMiniMonth((m) => addMonths(m, 1))}
                />

                <CalendarShellOverlayToggles
                  mailTodoOverlay={mailTodoOverlay}
                  setMailTodoOverlay={setMailTodoOverlay}
                  cloudTaskOverlay={cloudTaskOverlay}
                  setCloudTaskOverlay={setCloudTaskOverlay}
                  userNoteOverlay={userNoteOverlay}
                  setUserNoteOverlay={setUserNoteOverlay}
                  taskAccountsCount={taskAccounts.length}
                />

                <CalendarShellSidebarCalendars
                  calendarLinkedAccounts={calendarLinkedAccounts}
                  calendarsByAccount={calendarsByAccount}
                  sidebarHiddenCalendarKeys={sidebarHiddenCalendarKeys}
                  hiddenCalendarKeys={hiddenCalendarKeys}
                  toggleCalendarVisibility={toggleCalendarVisibility}
                  showAllCalendarsInView={showAllCalendarsInView}
                  onCalendarRowContextMenu={(clientX, clientY, accountId, cal): void => {
                    setEventContextMenu(null)
                    setCalendarFolderContextMenu({
                      x: clientX,
                      y: clientY,
                      items: buildCalendarFolderColorMenuItems(accountId, cal)
                    })
                  }}
                  profilePhotoDataUrls={profilePhotoDataUrls}
                  setAccountSidebarOpen={setAccountSidebarOpen}
                  isAccountSidebarOpen={isAccountSidebarOpen}
                  accountGroupCalSidebarOpen={accountGroupCalSidebarOpen}
                  setAccountGroupCalSidebarOpen={setAccountGroupCalSidebarOpen}
                  groupCalendarsLoading={groupCalendarsLoading}
                  m365GroupCalPaging={m365GroupCalPaging}
                  fetchMicrosoft365GroupCalendarsIfNeeded={fetchMicrosoft365GroupCalendarsIfNeeded}
                  fetchMoreMicrosoft365GroupCalendars={fetchMoreMicrosoft365GroupCalendars}
                  onAccountHeaderContextMenu={openCalendarAccountContextMenu}
                  syncByAccount={calendarSyncByAccount}
                  onAccountSync={(accountId): void => {
                    void (async (): Promise<void> => {
                      await triggerCalendarAccountSync(accountId)
                      await reloadCalendarsForAccount(accountId)
                      reloadVisibleRange({ forceRefresh: true })
                    })()
                  }}
                />
                </div>

            </aside>
          ) : null}

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <CalendarShellAlerts error={error} />

            <div
              ref={calendarDropRootRef}
              className="relative z-0 flex min-h-0 flex-1 flex-col px-3 pb-3 pt-2"
            >
              <>
                  <CalendarShellLoadingOverlay visible={loading} />
              {/* selectLongPressDelay: Touch — kurzes Halten vor Ziehen (sonst oft ~1s). */}
              <FullCalendar
                key={`${fcTimeZone}-${i18n.language}-${timeGridSlotMinutes}`}
                ref={calendarRef}
                plugins={[
                  dayGridPlugin,
                  timeGridPlugin,
                  listPlugin,
                  multiMonthPlugin,
                  interactionPlugin,
                  luxonPlugin
                ]}
                locale={fcLocale}
                height="100%"
                timeZone={fcTimeZone}
                headerToolbar={false}
                firstDay={1}
                views={{
                  ...multiDayViews,
                  ...multiMonthViews
                }}
                initialView="timeGridWeek"
                slotMinTime="00:00:00"
                slotMaxTime="24:00:00"
                scrollTime="07:00:00"
                slotDuration={timeGridSlotDurationIso}
                slotLabelInterval="01:00:00"
                nowIndicator
                editable={
                  !isMultiMonthActive &&
                  (calendarLinkedAccounts.length > 0 ||
                    mailTodoOverlay ||
                    cloudTaskOverlay ||
                    userNoteOverlay)
                }
                eventResizableFromStart={
                  !isMultiMonthActive &&
                  (calendarLinkedAccounts.length > 0 ||
                    mailTodoOverlay ||
                    cloudTaskOverlay ||
                    userNoteOverlay)
                }
                eventDrop={(info): void => {
                  void handleGraphEventChange(info)
                }}
                eventResize={(info): void => {
                  void handleGraphEventChange(info)
                }}
                eventAllow={(_span, movingEvent): boolean => {
                  if (!movingEvent) return true
                  const kind = movingEvent.extendedProps?.calendarKind as string | undefined
                  if (kind === CALENDAR_KIND_MAIL_TODO) return true
                  if (kind === CALENDAR_KIND_CLOUD_TASK) return true
                  if (kind === CALENDAR_KIND_USER_NOTE) return true
                  const calEv = movingEvent.extendedProps?.calendarEvent as
                    | CalendarEventView
                    | undefined
                  return Boolean(
                    calEv?.calendarCanEdit !== false &&
                    calEv?.graphEventId &&
                    calEv.graphCalendarId?.trim() &&
                    (calEv.source === 'microsoft' || calEv.source === 'google')
                  )
                }}
                selectable={canInteractInTimeGrid}
                selectMirror={false}
                selectLongPressDelay={380}
                selectAllow={(): boolean => canInteractInTimeGrid}
                dateClick={(info): void => {
                  if (!isMultiMonthFcView(info.view.type)) return
                  const api = calendarRef.current?.getApi()
                  if (!api) return
                  api.gotoDate(info.date)
                  api.changeView('dayGridMonth')
                  setActiveViewId('dayGridMonth')
                }}
                select={(sel): void => {
                  if (!canInteractInTimeGrid) return
                  setError(null)
                  setPreviewCloudTask(null)
                  setPreviewCloudTaskPlannedFromTimeline(null)
                  setPreviewCalendarEvent(null)
                  const js = sel.jsEvent as MouseEvent | undefined
                  setQuickCreate({
                    anchor: {
                      x: js?.clientX ?? window.innerWidth / 2,
                      y: js?.clientY ?? window.innerHeight / 2
                    },
                    range: { start: sel.start, end: sel.end, allDay: sel.allDay }
                  })
                  queueMicrotask(() => calendarRef.current?.getApi().unselect())
                }}
                dayMaxEvents
                eventSources={fcEventSources}
                eventContent={calendarFcEventContentRender}
                eventDidMount={(info): void => {
                  if (
                    info.event.id === QUICK_CREATE_PLACEHOLDER_EVENT_ID ||
                    info.el.classList.contains('fc-event-mirror')
                  ) {
                    return
                  }
                  if (isMultiMonthFcView(info.view.type)) {
                    applyMultiMonthEventDotMount(info)
                    return
                  }
                  const kind = info.event.extendedProps.calendarKind as string | undefined
                  if (kind === CALENDAR_KIND_CLOUD_TASK) {
                    const el = info.el as HTMLElement & {
                      _cloudTaskBaseStyled?: boolean
                      _cloudTaskPreviewKey?: string | null
                    }
                    const raw = info.event.extendedProps.accountColor as string | undefined
                    const bg = accountColorToCssBackground(raw)
                    const key =
                      typeof info.event.extendedProps.taskKey === 'string'
                        ? info.event.extendedProps.taskKey
                        : ''
                    const previewKey = previewCloudTask
                      ? cloudTaskStableKey(
                          previewCloudTask.accountId,
                          previewCloudTask.listId,
                          previewCloudTask.id
                        )
                      : null
                    if (!el._cloudTaskBaseStyled) {
                      el._cloudTaskBaseStyled = true
                      if (bg) {
                        el.style.backgroundColor = bg
                        el.style.borderColor = 'transparent'
                        el.style.color = '#fafafa'
                      } else {
                        el.style.borderLeft = '4px solid hsl(var(--primary))'
                      }
                    }
                    if (key) cloudTaskElByKeyRef.current.set(key, el)
                    return
                  }
                  if (kind === CALENDAR_KIND_MAIL_TODO) {
                    const raw = info.event.extendedProps.accountColor as string | undefined
                    const bg = accountColorToCssBackground(raw)
                    if (bg) {
                      info.el.style.backgroundColor = bg
                      info.el.style.borderColor = 'transparent'
                      info.el.style.color = '#fafafa'
                    } else {
                      info.el.style.borderLeft = '4px solid hsl(var(--secondary))'
                    }
                    const m = info.event.extendedProps.mailMessage as MailListItem | undefined
                    if (m) {
                      const onMailCtx = (e: MouseEvent): void => {
                        e.preventDefault()
                        e.stopPropagation()
                        setError(null)
                        setCalendarFolderContextMenu(null)
                        void (async (): Promise<void> => {
                          const anchor = { x: e.clientX, y: e.clientY }
                          const ui = { snoozeAnchor: anchor }
                          const cat = await buildMailCategorySubmenuItems(m, ui, () =>
                            useMailStore.getState().refreshNow()
                          )
                          const mailAcc = accounts.find((a) => a.id === m.accountId)
                          const items = buildMailContextItems(m, mailContextHandlersRef.current, {
                            ...ui,
                            categorySubmenu: cat.length > 0 ? cat : undefined,
                            allowsCloudTaskCreate: accountSupportsCloudTasks(mailAcc),
                            t
                          })
                          setEventContextMenu({ x: anchor.x, y: anchor.y, items })
                        })()
                      }
                      info.el.addEventListener('contextmenu', onMailCtx)
                      const mailEl = info.el as HTMLElement & { _calCtxMenu?: (ev: MouseEvent) => void }
                      mailEl._calCtxMenu = onMailCtx
                    }
                    return
                  }
                  if (kind === CALENDAR_KIND_USER_NOTE) {
                    info.el.classList.add('fc-user-note-event')
                    info.el.style.borderLeft = '4px solid #a855f7'
                    return
                  }
                  const calEv = info.event.extendedProps.calendarEvent as
                    | CalendarEventView
                    | undefined
                  const displayHex =
                    (info.event.extendedProps.displayColorHex as string | null | undefined) ??
                    calEv?.displayColorHex
                  const tw =
                    (info.event.extendedProps.accountColor as string | undefined) ??
                    calEv?.accountColorClass
                  applyCalendarEventDomColors(info.el as HTMLElement, {
                    displayColorHex: displayHex ?? null,
                    accountTailwindBgClass: tw ?? null
                  })
                  if (!calEv) return
                  const onCtx = (e: MouseEvent): void => {
                    e.preventDefault()
                    e.stopPropagation()
                    setError(null)
                    void (async (): Promise<void> => {
                      const cat = await buildCalendarEventCategorySubmenuItems(
                        calEv,
                        reloadVisibleRange,
                        t,
                        calendarCollatorLocale
                      )
                      const copyTo = await buildCalendarEventTransferSubmenuItems(
                        calEv,
                        'copy',
                        calendarLinkedAccounts,
                        reloadVisibleRange,
                        t,
                        calendarCollatorLocale
                      )
                      const moveTo = await buildCalendarEventTransferSubmenuItems(
                        calEv,
                        'move',
                        calendarLinkedAccounts,
                        reloadVisibleRange,
                        t,
                        calendarCollatorLocale
                      )
                      const hasGraphEvent = Boolean(calEv.graphEventId?.trim())
                      const canMutateEvent =
                        calEv.calendarCanEdit !== false &&
                        hasGraphEvent &&
                        (calEv.source === 'microsoft' || calEv.source === 'google')
                      const canCopyToOtherCalendar =
                        hasGraphEvent &&
                        copyTo.length > 0 &&
                        (calEv.source === 'microsoft' || calEv.source === 'google')
                      const canMoveToOtherCalendar =
                        canMutateEvent && moveTo.length > 0
                      const items = buildCalendarEventContextItems(
                        calEv,
                        canMutateEvent,
                        canCopyToOtherCalendar,
                        canMoveToOtherCalendar,
                        calendarLinkedAccounts.length > 0,
                        {
                          onEdit: (): void => {
                            setError(null)
                            setEventDialog({ mode: 'edit', event: calEv })
                          },
                          onDuplicate: (): void => {
                            const titleTrim = calEv.title?.trim()
                            setError(null)
                            setEventDialog({
                              mode: 'create',
                              range: {
                                start: new Date(calEv.startIso),
                                end: new Date(calEv.endIso),
                                allDay: calEv.isAllDay
                              },
                              createPrefill: {
                                subject: titleTrim
                                  ? `${titleTrim}${t('calendar.context.duplicateSuffix')}`
                                  : t('calendar.context.duplicateEmptyTitle'),
                                location: calEv.location ?? ''
                              },
                              createAccountId: calEv.accountId
                            })
                          },
                          onOpenNote: (): void => {
                            const eventRemoteId = calEv.graphEventId?.trim()
                            if (!eventRemoteId) return
                            setError(null)
                            setMailNoteTarget(null)
                            setEventNoteTarget({
                              kind: 'calendar',
                              accountId: calEv.accountId,
                              calendarSource: calEv.source,
                              calendarRemoteId: calEv.graphCalendarId?.trim() || 'default',
                              eventRemoteId,
                              title: calEv.title,
                              eventTitleSnapshot: calEv.title,
                              eventStartIsoSnapshot: calEv.startIso
                            })
                          },
                          onSendToNotion: (): void => {
                            void runNotionSendWithErrorHandling(() =>
                              pickAndSendCalendarEventToNotion(
                                calEv,
                                isDeCalendar ? 'de' : 'en'
                              )
                            )
                          },
                          onSendToNotionAsNewPage: (): void => {
                            void runNotionSendWithErrorHandling(() =>
                              sendCalendarEventAsNewNotionPage(
                                calEv,
                                isDeCalendar ? 'de' : 'en'
                              )
                            )
                          },
                          onCopyDetails: (): void => {
                            const text = formatCalendarEventClipboardText(
                              calEv,
                              t,
                              clipboardDfLocale,
                              isDeCalendar
                            )
                            if (!navigator.clipboard?.writeText) {
                              setError(t('calendar.errors.clipboardUnsupported'))
                              return
                            }
                            void navigator.clipboard.writeText(text).catch(() => {
                              setError(t('calendar.errors.clipboardWriteFailed'))
                            })
                          },
                          onCopyWebLink: (): void => {
                            const u = calEv.webLink?.trim()
                            if (!u) return
                            if (!navigator.clipboard?.writeText) {
                              setError(t('calendar.errors.clipboardUnsupported'))
                              return
                            }
                            void navigator.clipboard.writeText(u).catch(() => {
                              setError(t('calendar.errors.clipboardWriteFailed'))
                            })
                          },
                          onCopyJoinUrl: (): void => {
                            const u = calEv.joinUrl?.trim()
                            if (!u) return
                            if (!navigator.clipboard?.writeText) {
                              setError(t('calendar.errors.clipboardUnsupported'))
                              return
                            }
                            void navigator.clipboard.writeText(u).catch(() => {
                              setError(t('calendar.errors.clipboardWriteFailed'))
                            })
                          },
                          onOpenWeb: (): void => {
                            const u = calEv.webLink?.trim()
                            if (u) {
                              void openExternalUrl(u).catch((err) => {
                                setError(err instanceof Error ? err.message : String(err))
                              })
                            }
                          },
                          onOpenTeams: (): void => {
                            const u = calEv.joinUrl?.trim()
                            if (u) {
                              void openExternalUrl(u).catch((err) => {
                                setError(err instanceof Error ? err.message : String(err))
                              })
                            }
                          },
                          onDelete: (): void => {
                            const gid = calEv.graphEventId
                            if (!gid) return
                            void (async (): Promise<void> => {
                              const ok = await showAppConfirm(
                                t('calendar.confirm.deleteEventBody'),
                                {
                                  title: t('calendar.confirm.deleteEventTitle'),
                                  variant: 'danger',
                                  confirmLabel: t('calendar.confirm.deleteEventConfirm')
                                }
                              )
                              if (!ok) return
                              try {
                                setError(null)
                                await deleteCalendarEventIpc({
                                  accountId: calEv.accountId,
                                  graphEventId: gid,
                                  graphCalendarId: calEv.graphCalendarId ?? null
                                })
                                reloadVisibleRange()
                              } catch (err) {
                                setError(err instanceof Error ? err.message : String(err))
                              }
                            })()
                          }
                        },
                        t,
                        {
                          categorySubmenu: cat.length > 0 ? cat : undefined,
                          copyToSubmenu: copyTo.length > 0 ? copyTo : undefined,
                          moveToSubmenu: moveTo.length > 0 ? moveTo : undefined
                        }
                      )
                      setCalendarFolderContextMenu(null)
                      setEventContextMenu({ x: e.clientX, y: e.clientY, items })
                    })()
                  }
                  info.el.addEventListener('contextmenu', onCtx)
                  const el = info.el as HTMLElement & { _calCtxMenu?: (ev: MouseEvent) => void }
                  el._calCtxMenu = onCtx
                }}
                eventWillUnmount={(info): void => {
                  const kind = info.event.extendedProps.calendarKind as string | undefined
                  if (kind === CALENDAR_KIND_CLOUD_TASK) {
                    const key =
                      typeof info.event.extendedProps.taskKey === 'string'
                        ? info.event.extendedProps.taskKey
                        : ''
                    if (key) cloudTaskElByKeyRef.current.delete(key)
                  }
                  const el = info.el as HTMLElement & { _calCtxMenu?: (ev: MouseEvent) => void }
                  if (el._calCtxMenu) {
                    info.el.removeEventListener('contextmenu', el._calCtxMenu)
                    delete el._calCtxMenu
                  }
                }}
                datesSet={(arg): void => {
                  const datesKey = multiMonthDatesSetKey(arg.view.type, arg.start, arg.end)
                  const rangeUnchanged = datesKey === lastDatesSetKeyRef.current
                  lastDatesSetKeyRef.current = datesKey
                  lastRangeRef.current = { start: arg.start, end: arg.end }

                  if (arg.view.type !== activeViewIdRef.current) {
                    setActiveViewId(arg.view.type)
                  }
                  setVisibleStart(arg.view.currentStart)
                  setMiniMonth(startOfMonth(arg.view.currentStart))
                  setRangeTitle(arg.view.title)

                  if (rangeUnchanged) return

                  if (datesSetLoadTimerRef.current) clearTimeout(datesSetLoadTimerRef.current)
                  const isOverview = isMultiMonthFcView(arg.view.type)
                  const runLoads = (): void => {
                    void loadRange(arg.start, arg.end, { silent: true })
                    if (
                      mailTodoOverlayRef.current &&
                      !shouldSkipHeavyCalendarLayersForMultiMonth(arg.view.type)
                    ) {
                      void loadMailTodosForRange(arg.start, arg.end)
                    }
                    if (
                      cloudTaskOverlayRef.current &&
                      !shouldSkipHeavyCalendarLayersForMultiMonth(arg.view.type)
                    ) {
                      void loadCloudTasksForRange(arg.start, arg.end)
                    }
                    if (
                      userNoteOverlayRef.current &&
                      !shouldSkipHeavyCalendarLayersForMultiMonth(arg.view.type)
                    ) {
                      void loadUserNotesForRange(arg.start, arg.end)
                    }
                  }
                  if (isOverview) {
                    datesSetLoadTimerRef.current = setTimeout(runLoads, 100)
                  } else {
                    void loadRange(arg.start, arg.end, {
                      silent: eventsRef.current.length > 0
                    })
                    if (mailTodoOverlayRef.current) void loadMailTodosForRange(arg.start, arg.end)
                    if (cloudTaskOverlayRef.current) void loadCloudTasksForRange(arg.start, arg.end)
                    if (userNoteOverlayRef.current) void loadUserNotesForRange(arg.start, arg.end)
                  }
                }}
                eventClick={(info): boolean => {
                  info.jsEvent.preventDefault()
                  if (info.event.id === QUICK_CREATE_PLACEHOLDER_EVENT_ID) return false
                  const kind = info.event.extendedProps.calendarKind as string | undefined
                  if (kind === CALENDAR_KIND_CLOUD_TASK) {
                    const task = info.event.extendedProps.cloudTask as TaskItemWithContext | undefined
                    if (task) {
                      setError(null)
                      setPreviewCalendarEvent(null)
                      clearSelectedMessage()
                      setPreviewCloudTaskPlannedFromTimeline(null)
                      setPreviewCloudTask(task)
                      persistRightPreviewOpen(true)
                      setRightPreviewOpen(true)
                    }
                    return false
                  }
                  if (kind === CALENDAR_KIND_MAIL_TODO) {
                    const m = info.event.extendedProps.mailMessage as MailListItem | undefined
                    if (m) {
                      setError(null)
                      setPreviewCalendarEvent(null)
                      setPreviewCloudTask(null)
                      setPreviewCloudTaskPlannedFromTimeline(null)
                      void selectMessageWithThreadPreview(m.id)
                      persistRightPreviewOpen(true)
                      setRightPreviewOpen(true)
                    }
                    return false
                  }
                  if (kind === CALENDAR_KIND_USER_NOTE) {
                    const note = info.event.extendedProps.userNote as UserNoteListItem | undefined
                    if (note) {
                      useNotesPendingFocusStore.getState().setPendingNoteId(note.id)
                      useAppModeStore.getState().setMode('notes')
                    }
                    return false
                  }
                  const ev = info.event.extendedProps.calendarEvent as CalendarEventView | undefined
                  if (ev) {
                    setError(null)
                    clearSelectedMessage()
                    setPreviewCloudTask(null)
                    setPreviewCloudTaskPlannedFromTimeline(null)
                    setPreviewCalendarEvent(ev)
                    persistRightPreviewOpen(true)
                    setRightPreviewOpen(true)
                  }
                  return false
                }}
              />
                </>
            </div>
          </div>
        </div>

        {inboxDockStripInDom ? (
          <CalendarDockPanelSlide
            visible={inboxDockShow}
            panelWidthPx={inboxColumnWidth}
            onExitTransitionComplete={(): void => {
              if (!rightInboxOpen) setInboxDockStripInDom(false)
            }}
            splitter={
              <VerticalSplitter
                onDrag={(delta): void => setInboxColumnWidth((w) => w - delta)}
                ariaLabel={t('calendar.shell.splitterInboxAria')}
              />
            }
          >
            <div style={{ width: inboxColumnWidth }} className="h-full min-h-0 shrink-0">
              <CalendarRightZeitlistePanel
                open
                reloadSignal={todoSideListRefreshKey}
                reloadRef={timelineReloadRef}
                onWorkItemFocused={applyTimelineWorkItemToPreview}
                onTimelineLoadingChange={setTimelineLoading}
                listRefreshing={timelineLoading}
                dockHeaderSlotEl={
                  inboxPlacement === 'dock' && inboxDockStripInDom ? inboxDockHeaderSlotEl : null
                }
                shellDockHeaderRow={inboxPlacement === 'dock' && inboxDockStripInDom}
                onRequestClose={(): void => {
                  persistRightInboxOpen(false)
                  setRightInboxOpen(false)
                }}
                onRequestUndock={(): void => setInboxPlacement('float')}
              />
            </div>
          </CalendarDockPanelSlide>
        ) : null}
        {inboxPlacement === 'float' ? (
          <CalendarFloatingPanel
            open={rightInboxOpen}
            title={t('mega.shell.title')}
            widthPx={inboxFloatWidth}
            minHeightPx={320}
            persistSizeKey={CAL_FLOAT_INBOX_SIZE_KEY}
            defaultPosition={inboxFloatPos}
            zIndex={88}
            onClose={(): void => {
              persistRightInboxOpen(false)
              setRightInboxOpen(false)
            }}
            onDock={(): void => setInboxPlacement('dock')}
          >
            <CalendarRightZeitlistePanel
              open
              reloadSignal={todoSideListRefreshKey}
              reloadRef={timelineReloadRef}
              onWorkItemFocused={applyTimelineWorkItemToPreview}
              onTimelineLoadingChange={setTimelineLoading}
              listRefreshing={timelineLoading}
              hideChrome
              onRequestClose={(): void => {
                persistRightInboxOpen(false)
                setRightInboxOpen(false)
              }}
            />
          </CalendarFloatingPanel>
        ) : null}
        {previewDockStripInDom ? (
          <CalendarDockPanelSlide
            visible={previewDockShow}
            panelWidthPx={previewPaneWidth}
            onExitTransitionComplete={(): void => {
              if (!rightPreviewOpen) setPreviewDockStripInDom(false)
            }}
            splitter={
              <VerticalSplitter
                onDrag={(delta): void => setPreviewPaneWidth((w) => w - delta)}
                ariaLabel={t('calendar.shell.splitterPreviewAria')}
              />
            }
          >
            <div
              style={{ width: previewPaneWidth }}
              className="flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-l border-border bg-card"
            >
              {calendarPreviewBody}
            </div>
          </CalendarDockPanelSlide>
        ) : null}
        {previewPlacement === 'float' ? (
          <CalendarFloatingPanel
            open={rightPreviewOpen}
            title={previewColumnLabel}
            widthPx={previewFloatWidth}
            minHeightPx={360}
            persistSizeKey={CAL_FLOAT_PREVIEW_SIZE_KEY}
            defaultPosition={previewFloatPos}
            zIndex={92}
            onClose={(): void => {
              persistRightPreviewOpen(false)
              setRightPreviewOpen(false)
            }}
            onDock={(): void => setPreviewPlacement('dock')}
          >
            {calendarPreviewBody}
          </CalendarFloatingPanel>
        ) : null}
        </div>
      </div>
      </div>

      {eventContextMenu && (
        <ContextMenu
          x={eventContextMenu.x}
          y={eventContextMenu.y}
          items={eventContextMenu.items}
          onClose={(): void => setEventContextMenu(null)}
        />
      )}

      {calendarFolderContextMenu && (
        <ContextMenu
          x={calendarFolderContextMenu.x}
          y={calendarFolderContextMenu.y}
          items={calendarFolderContextMenu.items}
          onClose={(): void => setCalendarFolderContextMenu(null)}
        />
      )}

      <ObjectNoteDialog
        target={mailNoteTarget ?? eventNoteTarget}
        onClose={(): void => {
          setMailNoteTarget(null)
          setEventNoteTarget(null)
        }}
      />

      {quickCreate &&
        createPortal(
          <CalendarCreateQuickPopover
            anchor={quickCreate.anchor}
            range={quickCreate.range}
            calendarAccounts={calendarLinkedAccounts}
            taskAccounts={taskAccounts}
            defaultAccountId={calendarLinkedAccounts[0]?.id ?? taskAccounts[0]?.id}
            loadListsForAccount={loadTaskListsForAccount}
            onRangeChange={handleQuickCreateRangeChange}
            onClose={dismissQuickCreate}
            onSaved={(): void => reloadVisibleRange({ silent: true })}
            onOpenDetails={(draft): void => {
              dismissQuickCreate()
              setEventDialog({
                mode: 'create',
                range: draft.range,
                createPrefill: { subject: draft.subject, location: '' },
                createAccountId: draft.accountId,
                createKind: draft.createKind,
                createGraphCalendarId: draft.graphCalendarId || undefined,
                createTaskListId: draft.taskListId || undefined
              })
            }}
          />,
          document.body
        )}

      <CalendarEventDialog
        open={eventDialog != null}
        mode={eventDialog?.mode === 'edit' ? 'edit' : 'create'}
        accounts={accounts}
        defaultAccountId={
          eventDialog?.mode === 'create' && eventDialog.createAccountId
            ? eventDialog.createAccountId
            : calendarLinkedAccounts[0]?.id ?? taskAccounts[0]?.id
        }
        initialRange={
          eventDialog && eventDialog.mode === 'create'
            ? (eventDialog.range ?? undefined)
            : undefined
        }
        createPrefill={
          eventDialog && eventDialog.mode === 'create' && eventDialog.createPrefill
            ? eventDialog.createPrefill
            : undefined
        }
        initialCreateKind={
          eventDialog?.mode === 'create' ? eventDialog.createKind : undefined
        }
        initialGraphCalendarId={
          eventDialog?.mode === 'create' ? eventDialog.createGraphCalendarId : undefined
        }
        initialTaskListId={
          eventDialog?.mode === 'create' ? eventDialog.createTaskListId : undefined
        }
        initialEvent={eventDialog?.mode === 'edit' ? eventDialog.event : null}
        taskAccounts={taskAccounts}
        loadListsForAccount={loadTaskListsForAccount}
        onClose={(): void => setEventDialog(null)}
        onSaved={(): void => reloadVisibleRange({ silent: true })}
      />

      {gotoDateOpen ? (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cal-goto-date-title"
          onMouseDown={(e): void => {
            if (e.target === e.currentTarget) setGotoDateOpen(false)
          }}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-border bg-popover p-4 shadow-xl"
            onMouseDown={(e): void => e.stopPropagation()}
          >
            <h2 id="cal-goto-date-title" className="mb-3 text-sm font-semibold text-foreground">
              {t('calendar.shell.gotoDateTitle')}
            </h2>
            <input
              ref={gotoDateInputRef}
              type="date"
              className="mb-3 w-full rounded-md border border-border bg-background px-2 py-2 text-sm text-foreground"
              value={gotoDateDraft}
              onChange={(e): void => setGotoDateDraft(e.target.value)}
              onKeyDown={(e): void => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  const d = parseISO(gotoDateDraft)
                  if (!Number.isNaN(d.getTime())) {
                    const api = calendarRef.current?.getApi()
                    api?.gotoDate(startOfDay(d))
                    setMiniMonth(startOfMonth(d))
                    setGotoDateOpen(false)
                  }
                }
              }}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary/80"
                onClick={(): void => setGotoDateOpen(false)}
              >
                {t('calendar.shell.gotoDateCancel')}
              </button>
              <button
                type="button"
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                onClick={(): void => {
                  const d = parseISO(gotoDateDraft)
                  if (Number.isNaN(d.getTime())) return
                  const api = calendarRef.current?.getApi()
                  api?.gotoDate(startOfDay(d))
                  setMiniMonth(startOfMonth(d))
                  setGotoDateOpen(false)
                }}
              >
                {t('calendar.shell.gotoDateApply')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <CalendarEventSearchDialog
        open={calendarEventSearchOpen}
        query={calendarEventSearchQuery}
        inputRef={calendarSearchInputRef}
        onQueryChange={setCalendarEventSearchQuery}
        onClose={(): void => {
          setCalendarEventSearchOpen(false)
          setCalendarEventSearchQuery('')
        }}
      />
    </>
  )
}
