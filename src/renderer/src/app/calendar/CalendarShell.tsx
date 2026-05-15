import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin from '@fullcalendar/interaction'
import luxonPlugin from '@fullcalendar/luxon'
import deLocale from '@fullcalendar/core/locales/de'
import enGbLocale from '@fullcalendar/core/locales/en-gb'
import type { EventChangeArg } from '@fullcalendar/core'
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
import { Eye, EyeOff, Mails, PanelLeftClose, PanelRightClose, Plus, Search, SquareArrowOutUpRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAccountsStore } from '@/stores/accounts'
import { useCalendarPendingFocusStore } from '@/stores/calendar-pending-focus'
import { useMailStore } from '@/stores/mail'
import { useComposeStore } from '@/stores/compose'
import { useSnoozeUiStore } from '@/stores/snooze-ui'
import { showAppConfirm } from '@/stores/app-dialog'
import type {
  CalendarEventView,
  CalendarGraphCalendarRow,
  MailListItem,
  TodoDueKindOpen
} from '@shared/types'
import {
  graphCalendarColorToDisplayHex,
  GRAPH_CALENDAR_COLOR_PRESET_IDS,
  type GraphCalendarColorPresetId
} from '@shared/graph-calendar-colors'
import {
  CALENDAR_KIND_MAIL_TODO,
  mailTodoConversationsToFullCalendarEvents,
  computePersistIsoRangeForMailTodo
} from '@/app/calendar/mail-todo-calendar'
import { cn } from '@/lib/utils'
import { openExternalUrl } from '@/lib/open-external'
import { CalendarEventDialog } from '@/app/calendar/CalendarEventDialog'
import { CalendarEventPreview } from '@/app/calendar/CalendarEventPreview'
import { ContextMenu, type ContextMenuItem } from '@/components/ContextMenu'
import {
  ModuleColumnHeaderIconButton,
  ModuleColumnHeaderStackedTitle,
  moduleColumnHeaderDockBarRowClass,
  moduleColumnHeaderIconGlyphClass,
  moduleColumnHeaderUppercaseLabelClass
} from '@/components/ModuleColumnHeader'
import { ObjectNoteDialog, type ObjectNoteTarget } from '@/components/ObjectNoteEditor'
import {
  buildCalendarEventCategorySubmenuItems,
  buildCalendarEventContextItems,
  formatCalendarEventClipboardText
} from '@/lib/calendar-event-context-menu'
import {
  buildMailCategorySubmenuItems,
  buildMailContextItems,
  type MailContextHandlers
} from '@/lib/mail-context-menu'
import { deleteCalendarEventIpc } from '@/lib/calendar-ipc'
import { applyCalendarEventDomColors } from '@/lib/calendar-event-chip-style'
import { accountColorToCssBackground } from '@/lib/avatar-color'
import { ReadingPane } from '@/app/layout/ReadingPane'
import { VerticalSplitter, useResizableWidth } from '@/components/ResizableSplitter'
import { CalendarRightPosteingangPanel } from '@/app/calendar/CalendarRightPosteingang'
import { useCalendarPanelLayoutStore } from '@/stores/calendar-panel-layout'
import { CalendarFloatingPanel } from '@/app/calendar/CalendarFloatingPanel'
import { CalendarDockPanelSlide } from '@/app/calendar/CalendarDockPanelSlide'
import { CalendarDockStripFrame } from '@/app/calendar/CalendarDockStripFrame'
import { useCalendarMailExternalDrop } from '@/lib/use-calendar-mail-external-drop'
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
import { MiniMonthGrid } from '@/app/calendar/MiniMonthGrid'
import {
  CalendarShellHeader,
  type CalendarSidebarHiddenRestoreEntry
} from '@/app/calendar/CalendarShellHeader'
import { CalendarShellAlerts } from '@/app/calendar/CalendarShellAlerts'
import { CalendarShellLoadingOverlay } from '@/app/calendar/CalendarShellLoadingOverlay'
import { CalendarShellSidebarCalendars } from '@/app/calendar/CalendarShellSidebarCalendars'
import {
  CAL_FLOAT_INBOX_SIZE_KEY,
  CAL_FLOAT_PREVIEW_SIZE_KEY,
  migrateLegacyCalendarShellSource,
  parseAccountSidebarOpenFromStorage,
  parseGroupCalSidebarOpenFromStorage,
  persistAccountSidebarOpen,
  persistGroupCalSidebarOpen,
  persistMailTodoOverlay,
  persistRightInboxOpen,
  persistRightPreviewOpen,
  persistTimeGridSlotMinutes,
  readLeftSidebarCollapsedFromStorage,
  readMailTodoOverlayFromStorage,
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
  const profilePhotoDataUrls = useAccountsStore((s) => s.profilePhotoDataUrls)
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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Erzwingt Reload der rechten ToDo-Spalte nach Kalender-Zug (mail:changed allein reicht nicht zuverlässig). */
  const [todoSideListRefreshKey, setTodoSideListRefreshKey] = useState(0)

  const [activeViewId, setActiveViewId] = useState<string>('timeGridWeek')
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
      }
    | { mode: 'edit'; event: CalendarEventView }

  const [eventDialog, setEventDialog] = useState<EventDialogState>(null)
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
    if (migrateLegacyCalendarShellSource()) {
      setMailTodoOverlay(true)
      persistMailTodoOverlay(true)
    }
  }, [])

  useEffect(() => {
    if (selectedMessageId != null) {
      setPreviewCalendarEvent(null)
    }
  }, [selectedMessageId])

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

  const reloadCalendarsForAccount = useCallback(async (accountId: string): Promise<void> => {
    try {
      const rows = await window.mailClient.calendar.listCalendars({ accountId, forceRefresh: true })
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

  /** Kurzer Hinweis zur Termin-Erstellung per Maus/Touch (FullCalendar dateSelecting). */
  const dragCreateHint = useMemo(() => {
    if (calendarLinkedAccounts.length === 0) return null
    if (activeViewId === 'listWeek') {
      return t('calendar.shell.dragHintList')
    }
    if (activeViewId === 'dayGridMonth') {
      return t('calendar.shell.dragHintMonth')
    }
    return null
  }, [activeViewId, calendarLinkedAccounts.length, t])

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

  const calendarPreviewBody = useMemo(
    () => (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {previewCalendarEvent ? (
          <CalendarEventPreview
            event={previewCalendarEvent}
            onEdit={(): void => setEventDialog({ mode: 'edit', event: previewCalendarEvent })}
          />
        ) : (
          <ReadingPane
            emptySelectionTitle={t('calendar.shell.emptyPreviewTitle')}
            emptySelectionBody={t('calendar.shell.emptyPreviewBody')}
          />
        )}
      </div>
    ),
    [previewCalendarEvent, t]
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

  const loadRange = useCallback(
    async (start: Date, end: Date): Promise<void> => {
      setLoading(true)
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
          includeCalendars
        })
        setEvents(list)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        setEvents([])
      } finally {
        setLoading(false)
      }
    },
    [calendarLinkedAccounts, calendarsByAccount, hiddenCalendarKeys, sidebarHiddenCalendarKeys]
  )

  const reloadVisibleRange = useCallback((): void => {
    const api = calendarRef.current?.getApi()
    if (api) {
      const { activeStart, activeEnd } = api.view
      void loadRange(activeStart, activeEnd)
      if (mailTodoOverlayRef.current) void loadMailTodosForRange(activeStart, activeEnd)
      return
    }
    const { start, end } = lastRangeRef.current
    void loadRange(start, end)
    if (mailTodoOverlayRef.current) void loadMailTodosForRange(start, end)
  }, [loadRange, loadMailTodosForRange])

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

  useCalendarMailExternalDrop(calendarDropRootRef, {
    timeZone: fcTimeZone,
    enabled: true,
    onScheduleMany: scheduleMailsOnCalendar
  })

  /** Startseite / extern: Termin vormerken und beim Oeffnen des Kalenders anzeigen + Datum setzen; oder nur Zieldatum (Mini-Monat). */
  useEffect(() => {
    const st = useCalendarPendingFocusStore.getState()
    const ev = st.peekPendingEvent()
    if (ev) {
      clearSelectedMessage()
      setError(null)
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
      const canEdit = cal.canEdit !== false
      if (!canEdit) {
        return [
          {
            id: 'cal-readonly',
            label: t('calendar.shell.colorReadonlyExplanation'),
            disabled: true
          },
          ...tail
        ]
      }
      const curPreset: GraphCalendarColorPresetId | null = (() => {
        const raw = (cal.color ?? 'auto').trim().toLowerCase()
        if (!raw || raw === 'auto') return 'auto'
        const found = GRAPH_CALENDAR_COLOR_PRESET_IDS.find((id) => id.toLowerCase() === raw)
        return found ?? null
      })()
      const hexFallback = '#94a3b8'
      return [
        {
          id: 'cal-color-submenu',
          label: t('calendar.shell.colorMicrosoftLabel'),
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
                    await reloadCalendarsForAccount(accountId)
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
      if (kind === CALENDAR_KIND_MAIL_TODO) {
        const m = info.event.extendedProps.mailMessage as MailListItem | undefined
        const range = computePersistIsoRangeForMailTodo(info.event, info.oldEvent, fcTimeZone)
        if (!m || !range) {
          info.revert()
          return
        }
        try {
          const tk = m.remoteThreadId?.trim()
          let ids: number[] = [m.id]
          if (tk) {
            const list = await window.mailClient.mail.listMessagesByThreads({
              accountId: m.accountId,
              threadKeys: [tk]
            })
            ids = [...new Set(list.map((x) => x.id))]
            if (ids.length === 0) ids = [m.id]
          }
          for (const id of ids) {
            await setTodoScheduleForMessage(id, range.startIso, range.endIso, {
              skipSelectedRefresh: true
            })
          }
          await useMailStore.getState().reloadSelectedMessageFromDb()
          setError(null)
          setTodoSideListRefreshKey((k) => k + 1)
          const api = calendarRef.current?.getApi()
          if (api) {
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
        void reloadVisibleRange()
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        info.revert()
      }
    },
    [reloadVisibleRange, fcTimeZone, setTodoScheduleForMessage, loadMailTodosForRange, t]
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
        inner[row.id] = graphCalendarColorToDisplayHex(row.hexColor, row.color)
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
        const resolvedDisplayHex = ev.displayColorHex ?? fromCalList ?? null
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
          editable: Boolean(ev.graphEventId && ev.source === 'microsoft'),
          startEditable: Boolean(ev.graphEventId && ev.source === 'microsoft'),
          durationEditable: Boolean(ev.graphEventId && ev.source === 'microsoft')
        }
      }),
    [visibleGraphEvents, defaultGraphCalendarIdByAccount, calendarDisplayHexByKey]
  )

  const mailTodoFcEvents = useMemo(
    () => mailTodoConversationsToFullCalendarEvents(mailTodoItems, accountColorById),
    [mailTodoItems, accountColorById]
  )

  const fcEvents = useMemo(
    () => (mailTodoOverlay ? [...graphFcEvents, ...mailTodoFcEvents] : graphFcEvents),
    [graphFcEvents, mailTodoFcEvents, mailTodoOverlay]
  )

  const fcEventsDisplayed = useMemo(() => {
    const q = calendarEventSearchQuery.trim().toLowerCase()
    if (!q) return fcEvents
    return fcEvents.filter((ev) => {
      if (
        String(ev.title ?? '')
          .toLowerCase()
          .includes(q)
      )
        return true
      const cal = ev.extendedProps?.calendarEvent as CalendarEventView | undefined
      const loc = (cal?.location ?? '').trim().toLowerCase()
      return loc.includes(q)
    })
  }, [fcEvents, calendarEventSearchQuery])

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
              <div className="flex w-[272px] shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-foreground">
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
                  dragCreateHint={dragCreateHint}
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
                  onNewEventClick={(): void => {
                    if (calendarLinkedAccounts.length === 0) return
                    setError(null)
                    setPreviewCalendarEvent(null)
                    setEventDialog({
                      mode: 'create',
                      range: null
                    })
                  }}
                  newEventDisabled={calendarLinkedAccounts.length === 0}
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
                        {previewCalendarEvent
                          ? t('calendar.shell.previewBadgeEvent')
                          : t('calendar.shell.previewBadgeMail')}
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
                `cal-slot-${timeGridSlotMinutes}`
              )}
            >
              {!leftSidebarCollapsed ? (
                <aside className="flex w-[272px] shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-foreground">
                  <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-4">
                <MiniMonthGrid
                  monthAnchor={miniMonth}
                  today={new Date()}
                  onSelectDayRange={applyMiniCalendarDayRange}
                  onPrevMonth={(): void => setMiniMonth((m) => addMonths(m, -1))}
                  onNextMonth={(): void => setMiniMonth((m) => addMonths(m, 1))}
                />

                <div>
                  <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('calendar.shell.emailsSection')}
                  </p>
                  <ul
                    className={cn(
                      'relative ml-3 mt-1 space-y-0.5 pl-2',
                      'before:absolute before:bottom-1 before:left-0 before:top-1 before:w-0.5 before:rounded-full before:bg-primary/55'
                    )}
                  >
                    <li>
                      <div
                        className={cn(
                          'flex w-full items-center gap-1 rounded-md px-1 py-1.5 text-left text-[12px] text-muted-foreground'
                        )}
                      >
                        <button
                          type="button"
                          onClick={(): void => {
                            setMailTodoOverlay((prev) => {
                              const next = !prev
                              persistMailTodoOverlay(next)
                              return next
                            })
                          }}
                          className={cn(
                            'flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors',
                            'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                            !mailTodoOverlay && 'opacity-60'
                          )}
                          title={
                            mailTodoOverlay
                              ? t('calendar.shell.mailTodoHideTooltip')
                              : t('calendar.shell.mailTodoShowTooltip')
                          }
                          aria-label={
                            mailTodoOverlay
                              ? t('calendar.shell.mailTodoHideTooltip')
                              : t('calendar.shell.mailTodoShowTooltip')
                          }
                        >
                          {!mailTodoOverlay ? (
                            <EyeOff className="h-3.5 w-3.5" />
                          ) : (
                            <Eye className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <Mails className="h-3.5 w-3.5 shrink-0 opacity-70" />
                        <span className="min-w-0 flex-1 truncate text-foreground">
                          {t('calendar.shell.mailTodosLabel')}
                        </span>
                      </div>
                    </li>
                  </ul>
                </div>

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
                />
                </div>

                <div className="space-y-2 border-t border-border p-3">
                  <button
                    type="button"
                    disabled={calendarLinkedAccounts.length === 0}
                    onClick={(ev): void => {
                      if (calendarLinkedAccounts.length === 0) {
                        setError(t('calendar.shell.noLinkedAccount'))
                        return
                      }
                      setError(null)
                      setPreviewCalendarEvent(null)
                      setEventDialog({
                        mode: 'create',
                        range: null
                      })
                    }}
                    className={cn(
                      'flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/90',
                      calendarLinkedAccounts.length === 0 && 'cursor-not-allowed opacity-45'
                    )}
                  >
                    <Plus className="h-4 w-4" />
                    {t('calendar.shell.newEvent')}
                  </button>
                </div>
            </aside>
          ) : null}

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <CalendarShellAlerts error={error} />

            <div ref={calendarDropRootRef} className="relative z-0 min-h-0 flex-1 px-3 pb-3 pt-2">
              <CalendarShellLoadingOverlay visible={loading} />
              {/* selectLongPressDelay: Touch — kurzes Halten vor Ziehen (sonst oft ~1s). */}
              <FullCalendar
                key={`${fcTimeZone}-${i18n.language}-${timeGridSlotMinutes}`}
                ref={calendarRef}
                plugins={[
                  dayGridPlugin,
                  timeGridPlugin,
                  listPlugin,
                  interactionPlugin,
                  luxonPlugin
                ]}
                locale={fcLocale}
                height="100%"
                timeZone={fcTimeZone}
                headerToolbar={false}
                firstDay={1}
                views={{
                  ...multiDayViews
                }}
                initialView="timeGridWeek"
                slotMinTime="07:00:00"
                slotMaxTime="20:00:00"
                slotDuration={timeGridSlotDurationIso}
                slotLabelInterval="01:00:00"
                nowIndicator
                editable={calendarLinkedAccounts.length > 0 || mailTodoOverlay}
                eventResizableFromStart={calendarLinkedAccounts.length > 0 || mailTodoOverlay}
                eventChange={(info): void => {
                  void handleGraphEventChange(info)
                }}
                eventAllow={(_span, movingEvent): boolean => {
                  if (!movingEvent) return true
                  const kind = movingEvent.extendedProps?.calendarKind as string | undefined
                  if (kind === CALENDAR_KIND_MAIL_TODO) return true
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
                selectable={calendarLinkedAccounts.length > 0}
                selectMirror
                selectLongPressDelay={380}
                selectAllow={(): boolean => calendarLinkedAccounts.length > 0}
                select={(sel): void => {
                  if (calendarLinkedAccounts.length === 0) return
                  setError(null)
                  setPreviewCalendarEvent(null)
                  setEventDialog({
                    mode: 'create',
                    range: { start: sel.start, end: sel.end, allDay: sel.allDay }
                  })
                  calendarRef.current?.getApi().unselect()
                }}
                dayMaxEvents
                events={fcEventsDisplayed}
                eventDidMount={(info): void => {
                  const kind = info.event.extendedProps.calendarKind as string | undefined
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
                          const items = buildMailContextItems(m, mailContextHandlersRef.current, {
                            ...ui,
                            categorySubmenu: cat.length > 0 ? cat : undefined,
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
                      const canMutateEvent =
                        calEv.calendarCanEdit !== false &&
                        Boolean(calEv.graphEventId?.trim() && calEv.graphCalendarId?.trim()) &&
                        (calEv.source === 'microsoft' || calEv.source === 'google')
                      const items = buildCalendarEventContextItems(
                        calEv,
                        canMutateEvent,
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
                        { categorySubmenu: cat.length > 0 ? cat : undefined }
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
                  const el = info.el as HTMLElement & { _calCtxMenu?: (ev: MouseEvent) => void }
                  if (el._calCtxMenu) {
                    info.el.removeEventListener('contextmenu', el._calCtxMenu)
                    delete el._calCtxMenu
                  }
                }}
                datesSet={(arg): void => {
                  lastRangeRef.current = { start: arg.start, end: arg.end }
                  setVisibleStart(arg.view.currentStart)
                  setMiniMonth(startOfMonth(arg.view.currentStart))
                  setRangeTitle(arg.view.title)
                  setActiveViewId(arg.view.type)
                  void loadRange(arg.start, arg.end)
                  if (mailTodoOverlayRef.current) void loadMailTodosForRange(arg.start, arg.end)
                }}
                eventClick={(info): boolean => {
                  info.jsEvent.preventDefault()
                  const kind = info.event.extendedProps.calendarKind as string | undefined
                  if (kind === CALENDAR_KIND_MAIL_TODO) {
                    const m = info.event.extendedProps.mailMessage as MailListItem | undefined
                    if (m) {
                      setError(null)
                      setPreviewCalendarEvent(null)
                      void selectMessageWithThreadPreview(m.id)
                      persistRightPreviewOpen(true)
                      setRightPreviewOpen(true)
                    }
                    return false
                  }
                  const ev = info.event.extendedProps.calendarEvent as CalendarEventView | undefined
                  if (ev) {
                    setError(null)
                    clearSelectedMessage()
                    setPreviewCalendarEvent(ev)
                    persistRightPreviewOpen(true)
                    setRightPreviewOpen(true)
                  }
                  return false
                }}
              />
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
              <CalendarRightPosteingangPanel
                open
                sideListRefreshKey={todoSideListRefreshKey}
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
            title={t('calendar.shell.todoPanelTitle')}
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
            <CalendarRightPosteingangPanel
              open
              sideListRefreshKey={todoSideListRefreshKey}
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
            title={
              previewCalendarEvent
                ? t('calendar.shell.floatPreviewEvent')
                : t('calendar.shell.floatPreviewMail')
            }
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

      <CalendarEventDialog
        open={eventDialog != null}
        mode={eventDialog?.mode === 'edit' ? 'edit' : 'create'}
        accounts={accounts}
        defaultAccountId={
          eventDialog?.mode === 'create' && eventDialog.createAccountId
            ? eventDialog.createAccountId
            : calendarLinkedAccounts[0]?.id
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
        initialEvent={eventDialog?.mode === 'edit' ? eventDialog.event : null}
        onClose={(): void => setEventDialog(null)}
        onSaved={reloadVisibleRange}
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

      {calendarEventSearchOpen ? (
        <div
          className="fixed inset-0 z-[95] flex items-start justify-center bg-black/40 p-4 pt-[12vh]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cal-event-search-title"
          onMouseDown={(e): void => {
            if (e.target === e.currentTarget) {
              setCalendarEventSearchOpen(false)
              setCalendarEventSearchQuery('')
            }
          }}
        >
          <div
            className="flex w-full max-w-md flex-col gap-2 rounded-xl border border-border bg-popover p-4 shadow-xl"
            onMouseDown={(e): void => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <h2 id="cal-event-search-title" className="text-sm font-semibold text-foreground">
                {t('calendar.shell.eventSearchTitle')}
              </h2>
            </div>
            <input
              ref={calendarSearchInputRef}
              type="search"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              placeholder={t('calendar.shell.eventSearchPlaceholder')}
              value={calendarEventSearchQuery}
              onChange={(e): void => setCalendarEventSearchQuery(e.target.value)}
              onKeyDown={(e): void => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  setCalendarEventSearchOpen(false)
                }
              }}
            />
            <p className="text-[11px] leading-snug text-muted-foreground">
              {t('calendar.shell.eventSearchHint')}
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                onClick={(): void => {
                  setCalendarEventSearchOpen(false)
                }}
              >
                {t('calendar.shell.eventSearchClose')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
