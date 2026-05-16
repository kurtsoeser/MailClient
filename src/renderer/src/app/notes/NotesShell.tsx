import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type FullCalendar from '@fullcalendar/react'
import {
  DndContext,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import {
  Loader2,
  Plus,
  Trash2,
  X
} from 'lucide-react'
import {
  addMonths,
  compareAsc,
  endOfDay,
  format,
  parseISO,
  startOfDay,
  startOfMonth
} from 'date-fns'
import { de as deFns, enUS as enUSFns } from 'date-fns/locale'
import { useTranslation } from 'react-i18next'
import type {
  CalendarEventView,
  ConnectedAccount,
  NoteSection,
  UserNote,
  UserNoteKind,
  UserNoteListItem
} from '@shared/types'
import type { MiniMonthSelectedRange } from '@/app/calendar/MiniMonthGrid'
import { ModuleNavMiniMonth } from '@/components/ModuleNavMiniMonth'
import { moduleNavColumnClass, moduleNavColumnInsetClass } from '@/components/module-shell-layout'
import { CalendarEventPreview } from '@/app/calendar/CalendarEventPreview'
import { ReadingPane } from '@/app/layout/ReadingPane'
import { NotesCalendarPane } from '@/app/notes/NotesCalendarPane'
import { NotesCalendarToolbar } from '@/app/notes/NotesCalendarToolbar'
import { readNotesCalendarFcView } from '@/app/notes/notes-calendar-view-storage'
import { NotesLinkedObjectsPanel } from '@/app/notes/NotesLinkedObjectsPanel'
import { NotesAttachmentsPanel } from '@/app/notes/NotesAttachmentsPanel'
import { NotesPagesPane } from '@/app/notes/NotesPagesPane'
import {
  readNotesPagesSort,
  sortNotesPages,
  type NotesPagesSortKey
} from '@/lib/notes-pages-sort'
import { NotesNoteScheduleBlock } from '@/app/notes/NotesNoteScheduleBlock'
import { NotesSidebarList } from '@/app/notes/NotesSidebarList'
import { NotesShellSearch } from '@/app/notes/NotesShellSearch'
import { NotesShellViewToggle, type NotesShellView } from '@/app/notes/NotesShellViewToggle'
import { formatNoteDate, noteTitle } from '@/app/notes/notes-display-helpers'
import { NoteDisplayIcon } from '@/components/NoteDisplayIcon'
import { CalendarEventIconPicker } from '@/components/CalendarEventIconPicker'
import { IconColorPickerFooter } from '@/components/IconColorPickerFooter'
import { resolveEntityIconColor } from '@shared/entity-icon-color'
import { MarkdownNoteEditor } from '@/components/MarkdownNoteEditor'
import {
  ModuleColumnHeaderIconButton,
  moduleColumnHeaderIconGlyphClass,
  moduleColumnHeaderOutlineSmClass,
  moduleColumnHeaderNavShellBarClass,
  moduleColumnHeaderShellBarClass,
  moduleColumnHeaderSubToolbarClass,
  moduleColumnHeaderTitleClass
} from '@/components/ModuleColumnHeader'
import { useResizableWidth, VerticalSplitter } from '@/components/ResizableSplitter'
import {
  defaultNavSelection,
  navSelectionLabel,
  notesForNavSelection,
  persistNotesNavSelection,
  readNotesNavSelection,
  type NotesNavSelection
} from '@/lib/notes-nav-selection'
import { parseNoteDragId, parseNoteNavDropId } from '@/lib/notes-sidebar-dnd'
import {
  readNotesSidebarListMode,
  type NotesSidebarListMode,
  persistNotesSidebarListMode
} from '@/lib/notes-sidebar-storage'
import { LOCAL_NOTES_ACCOUNT_KEY, buildNoteAccountBuckets } from '@/lib/notes-sidebar-accounts'
import { GLOBAL_CREATE_EVENT, useGlobalCreateNavigateStore } from '@/lib/global-create'
import { cn } from '@/lib/utils'
import { useAccountsStore } from '@/stores/accounts'
import { useMailStore } from '@/stores/mail'
import { useNotesPendingFocusStore } from '@/stores/notes-pending-focus'
import { useUndoStore } from '@/stores/undo'

const ALL_KINDS: UserNoteKind[] = ['mail', 'calendar', 'standalone']

const NOTES_NAV_WIDTH_KEY = 'mailclient.notesShell.navWidth'
const NOTES_DETAIL_WIDTH_KEY = 'mailclient.notesShell.detailWidth'
const NOTES_PREVIEW_WIDTH_KEY = 'mailclient.notesShell.previewWidth'

type ScheduleDraft = {
  scheduledStartIso: string | null
  scheduledEndIso: string | null
  scheduledAllDay: boolean
  clearSchedule?: boolean
}

function addMinutesIso(value: string, minutes: number): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  d.setMinutes(d.getMinutes() + minutes)
  return d.toISOString()
}

function calendarPreviewEvent(
  note: Pick<
    UserNote,
    | 'id'
    | 'accountId'
    | 'calendarSource'
    | 'calendarRemoteId'
    | 'eventRemoteId'
    | 'eventTitleSnapshot'
    | 'eventStartIsoSnapshot'
    | 'updatedAt'
  >,
  account: ConnectedAccount | null,
  fallbackTitle: string
): CalendarEventView | null {
  if (note.accountId == null || note.calendarSource == null) return null
  const startIso = note.eventStartIsoSnapshot ?? note.updatedAt
  const title = note.eventTitleSnapshot?.trim() || fallbackTitle
  return {
    id: `note:${note.id}:event`,
    source: note.calendarSource,
    accountId: note.accountId,
    accountEmail: account?.email ?? note.accountId,
    accountColorClass: account?.color ?? 'bg-primary',
    graphCalendarId: note.calendarRemoteId,
    graphEventId: note.eventRemoteId ?? undefined,
    title,
    startIso,
    endIso: addMinutesIso(startIso, 30),
    isAllDay: false,
    location: null,
    webLink: null,
    joinUrl: null,
    organizer: null,
    calendarCanEdit: false
  }
}

function notesSelectedRange(dateFrom: string, dateTo: string): MiniMonthSelectedRange | null {
  if (!dateFrom.trim() && !dateTo.trim()) return null
  const from = dateFrom.trim() || dateTo.trim()
  const to = dateTo.trim() || dateFrom.trim()
  const start = startOfDay(parseISO(from))
  const end = startOfDay(parseISO(to))
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
  return compareAsc(start, end) <= 0
    ? { startInclusive: start, endInclusive: end }
    : { startInclusive: end, endInclusive: start }
}

function notesDateRangeLabel(dateFrom: string, dateTo: string, locale: string): string {
  const range = notesSelectedRange(dateFrom, dateTo)
  if (!range) return ''
  const dfLocale = locale.startsWith('de') ? deFns : enUSFns
  const sameDay = range.startInclusive.getTime() === range.endInclusive.getTime()
  if (sameDay) {
    return format(range.startInclusive, 'd. MMM yyyy', { locale: dfLocale })
  }
  return `${format(range.startInclusive, 'd. MMM', { locale: dfLocale })} – ${format(range.endInclusive, 'd. MMM yyyy', { locale: dfLocale })}`
}

function applyNotesMiniCalendarRange(
  startInclusive: Date,
  endInclusive: Date,
  setDateFrom: (v: string) => void,
  setDateTo: (v: string) => void,
  setMiniMonth: (v: Date | ((prev: Date) => Date)) => void
): void {
  const lo = compareAsc(startInclusive, endInclusive) <= 0 ? startInclusive : endInclusive
  const hi = compareAsc(startInclusive, endInclusive) <= 0 ? endInclusive : startInclusive
  setDateFrom(format(lo, 'yyyy-MM-dd'))
  setDateTo(format(hi, 'yyyy-MM-dd'))
  setMiniMonth(startOfMonth(lo))
}

function clearNotesDateRange(
  setDateFrom: (v: string) => void,
  setDateTo: (v: string) => void
): void {
  setDateFrom('')
  setDateTo('')
}

function scheduleFieldsFromDraft(draft: ScheduleDraft | null): UserNoteScheduleFieldsForSave {
  if (!draft) return {}
  if (draft.clearSchedule) {
    return {
      scheduledStartIso: null,
      scheduledEndIso: null,
      scheduledAllDay: false,
      clearSchedule: true
    }
  }
  return {
    scheduledStartIso: draft.scheduledStartIso,
    scheduledEndIso: draft.scheduledEndIso,
    scheduledAllDay: draft.scheduledAllDay
  }
}

type UserNoteScheduleFieldsForSave = {
  scheduledStartIso?: string | null
  scheduledEndIso?: string | null
  scheduledAllDay?: boolean
  clearSchedule?: boolean
}

export function NotesShell(): JSX.Element {
  const { t, i18n } = useTranslation()
  const accounts = useAccountsStore((s) => s.accounts)
  const selectMessageWithThreadPreview = useMailStore((s) => s.selectMessageWithThreadPreview)
  const clearSelectedMessage = useMailStore((s) => s.clearSelectedMessage)
  const pushToast = useUndoStore((s) => s.pushToast)
  const takePendingNoteId = useNotesPendingFocusStore((s) => s.takePendingNoteId)

  const [notes, setNotes] = useState<UserNoteListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [miniMonth, setMiniMonth] = useState(() => startOfMonth(new Date()))
  const [editing, setEditing] = useState<UserNote | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editBody, setEditBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shellView, setShellView] = useState<NotesShellView>('list')
  const [sections, setSections] = useState<NoteSection[]>([])
  const [scheduleDraft, setScheduleDraft] = useState<ScheduleDraft | null>(null)
  const [listMode, setListMode] = useState<NotesSidebarListMode>(() => readNotesSidebarListMode())
  const [navSelection, setNavSelection] = useState<NotesNavSelection>(() =>
    readNotesNavSelection(readNotesSidebarListMode())
  )
  const [pagesSort, setPagesSort] = useState<NotesPagesSortKey>(() => readNotesPagesSort())

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  const notesCalendarRef = useRef<FullCalendar | null>(null)
  const [calendarFcView, setCalendarFcView] = useState(() => readNotesCalendarFcView())
  const [calendarTitle, setCalendarTitle] = useState('')

  const [navWidth, setNavWidth] = useResizableWidth({
    storageKey: NOTES_NAV_WIDTH_KEY,
    defaultWidth: 248,
    minWidth: 200,
    maxWidth: 400
  })
  const [detailColumnWidth, setDetailColumnWidth] = useResizableWidth({
    storageKey: NOTES_DETAIL_WIDTH_KEY,
    defaultWidth: 300,
    minWidth: 220,
    maxWidth: 480
  })
  const [previewColumnWidth, setPreviewColumnWidth] = useResizableWidth({
    storageKey: NOTES_PREVIEW_WIDTH_KEY,
    defaultWidth: 420,
    minWidth: 280,
    maxWidth: 560
  })

  const loadSections = useCallback(async (): Promise<void> => {
    try {
      setSections(await window.mailClient.notes.sections.list())
    } catch {
      setSections([])
    }
  }, [])

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.mailClient.notes.list({
        kinds: ALL_KINDS,
        accountIds: [],
        dateFrom: dateFrom ? startOfDay(parseISO(dateFrom)).toISOString() : null,
        dateTo: dateTo ? endOfDay(parseISO(dateTo)).toISOString() : null,
        scheduledOnly: false,
        limit: 500
      })
      setNotes(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setNotes([])
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo])

  const onNotesChanged = useCallback((): void => {
    void load()
    void loadSections()
  }, [load, loadSections])

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void load()
    }, 150)
    return (): void => window.clearTimeout(handle)
  }, [load])

  useEffect(() => {
    void loadSections()
  }, [loadSections])

  useEffect(() => {
    const off = window.mailClient.events.onNotesChanged(onNotesChanged)
    return off
  }, [onNotesChanged])

  const selectedRange = useMemo(
    () => notesSelectedRange(dateFrom, dateTo),
    [dateFrom, dateTo]
  )

  const dateRangeLabel = useMemo(
    () => notesDateRangeLabel(dateFrom, dateTo, i18n.language),
    [dateFrom, dateTo, i18n.language]
  )

  const pagesNotes = useMemo(() => {
    const filtered = notesForNavSelection(notes, navSelection)
    return sortNotesPages(filtered, pagesSort, t('notes.shell.untitled'))
  }, [notes, navSelection, pagesSort, t])

  const pagesColumnTitle = useMemo(
    () => navSelectionLabel(navSelection, sections, accounts, t),
    [navSelection, sections, accounts, t]
  )

  useEffect(() => {
    persistNotesSidebarListMode(listMode)
  }, [listMode])

  useEffect(() => {
    persistNotesNavSelection(navSelection)
  }, [navSelection])

  useEffect(() => {
    setNavSelection(readNotesNavSelection(listMode))
  }, [listMode])

  useEffect(() => {
    if (listMode === 'sections' && navSelection.kind === 'sections' && navSelection.sectionId != null) {
      const exists = sections.some((s) => s.id === navSelection.sectionId)
      if (!exists) {
        setNavSelection(defaultNavSelection('sections'))
      }
      return
    }
    if (listMode === 'accounts' && navSelection.kind === 'accounts') {
      const buckets = buildNoteAccountBuckets(accounts, notes)
      if (!buckets.some((b) => b.accountId === navSelection.accountKey)) {
        const first = buckets[0]?.accountId ?? LOCAL_NOTES_ACCOUNT_KEY
        setNavSelection({ kind: 'accounts', accountKey: first })
      }
    }
  }, [listMode, navSelection, sections, accounts, notes])

  const selectedAccount =
    editing?.accountId != null ? accounts.find((a) => a.id === editing.accountId) ?? null : null

  const selectedCalendarEvent =
    editing?.kind === 'calendar'
      ? calendarPreviewEvent(editing, selectedAccount, t('calendar.eventPreview.noTitle'))
      : null

  const showObjectPreview = editing?.kind === 'mail' || Boolean(selectedCalendarEvent)

  const applyNotePatch = useCallback((note: UserNote): void => {
    setEditing((prev) => (prev?.id === note.id ? { ...prev, ...note } : prev))
    setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, ...note } : n)))
  }, [])

  const patchNoteDisplay = useCallback(
    async (patch: { iconId?: string | null; iconColor?: string | null }): Promise<void> => {
      if (!editing) return
      try {
        const next = await window.mailClient.notes.patchDisplay({
          noteId: editing.id,
          ...patch
        })
        applyNotePatch(next)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    },
    [editing, applyNotePatch]
  )

  const patchNoteDisplayInList = useCallback(
    async (
      note: UserNoteListItem,
      patch: { iconId?: string | null; iconColor?: string | null }
    ): Promise<void> => {
      try {
        const next = await window.mailClient.notes.patchDisplay({
          noteId: note.id,
          ...patch
        })
        applyNotePatch(next)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    },
    [applyNotePatch]
  )

  const renameNoteTitleInList = useCallback(
    async (note: UserNoteListItem, title: string): Promise<void> => {
      setError(null)
      try {
        let saved: UserNote
        if (note.kind === 'standalone') {
          saved = await window.mailClient.notes.updateStandalone({
            id: note.id,
            title,
            body: note.body
          })
        } else if (note.kind === 'mail' && note.messageId != null) {
          saved = await window.mailClient.notes.upsertMail({
            messageId: note.messageId,
            title,
            body: note.body
          })
        } else if (
          note.kind === 'calendar' &&
          note.accountId &&
          note.calendarSource &&
          note.calendarRemoteId &&
          note.eventRemoteId
        ) {
          saved = await window.mailClient.notes.upsertCalendar({
            accountId: note.accountId,
            calendarSource: note.calendarSource,
            calendarRemoteId: note.calendarRemoteId,
            eventRemoteId: note.eventRemoteId,
            title,
            body: note.body,
            eventTitleSnapshot: note.eventTitleSnapshot,
            eventStartIsoSnapshot: note.eventStartIsoSnapshot
          })
        } else {
          throw new Error(t('notes.shell.invalidNote'))
        }
        applyNotePatch(saved)
        if (editing?.id === note.id) setEditTitle(title)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    },
    [applyNotePatch, editing?.id, t]
  )

  const openEdit = useCallback(
    (note: UserNoteListItem | UserNote): void => {
      setEditing(note)
      setEditTitle(note.title ?? '')
      setEditBody(note.body)
      setScheduleDraft(null)
      if (note.kind === 'mail' && note.messageId != null) {
        void selectMessageWithThreadPreview(note.messageId)
      } else {
        clearSelectedMessage()
      }
    },
    [clearSelectedMessage, selectMessageWithThreadPreview]
  )

  const openNoteById = useCallback(
    async (id: number): Promise<void> => {
      const fromList = notes.find((n) => n.id === id)
      if (fromList) {
        openEdit(fromList)
        return
      }
      try {
        const note = await window.mailClient.notes.getById(id)
        if (note) openEdit(note)
      } catch {
        // ignore
      }
    },
    [notes, openEdit]
  )

  useEffect(() => {
    const pendingId = takePendingNoteId()
    if (pendingId == null) return
    void openNoteById(pendingId)
  }, [notes, takePendingNoteId, openNoteById])

  const createStandalone = useCallback(async (): Promise<void> => {
    setSaving(true)
    setError(null)
    try {
      const sectionId =
        listMode === 'sections' && navSelection.kind === 'sections'
          ? navSelection.sectionId
          : null
      const note = await window.mailClient.notes.createStandalone({
        title: t('notes.shell.newStandaloneTitle'),
        body: '',
        sectionId
      })
      clearSelectedMessage()
      openEdit(note)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }, [t, clearSelectedMessage, openEdit, listMode, navSelection])

  useEffect(() => {
    const pending = useGlobalCreateNavigateStore.getState().takePendingAfterNavigate()
    if (pending === 'note') {
      window.setTimeout((): void => void createStandalone(), 0)
    }
  }, [createStandalone])

  useEffect(() => {
    function onGlobalCreate(e: Event): void {
      const ce = e as CustomEvent<{ kind?: string }>
      if (ce.detail?.kind !== 'note') return
      void createStandalone()
    }
    window.addEventListener(GLOBAL_CREATE_EVENT, onGlobalCreate as EventListener)
    return (): void => window.removeEventListener(GLOBAL_CREATE_EVENT, onGlobalCreate as EventListener)
  }, [createStandalone])

  async function saveEditing(): Promise<void> {
    if (!editing) return
    setSaving(true)
    setError(null)
    const schedule = scheduleFieldsFromDraft(scheduleDraft)
    try {
      let saved: UserNote
      if (editing.kind === 'standalone') {
        saved = await window.mailClient.notes.updateStandalone({
          id: editing.id,
          title: editTitle,
          body: editBody,
          ...(schedule.clearSchedule ? { clearSchedule: true } : {}),
          ...(!schedule.clearSchedule && scheduleDraft
            ? {
                scheduledStartIso: schedule.scheduledStartIso,
                scheduledEndIso: schedule.scheduledEndIso,
                scheduledAllDay: schedule.scheduledAllDay
              }
            : {})
        })
      } else if (editing.kind === 'mail' && editing.messageId != null) {
        saved = await window.mailClient.notes.upsertMail({
          messageId: editing.messageId,
          title: editTitle,
          body: editBody,
          ...(scheduleDraft
            ? {
                scheduledStartIso: schedule.scheduledStartIso,
                scheduledEndIso: schedule.scheduledEndIso,
                scheduledAllDay: schedule.scheduledAllDay
              }
            : {})
        })
      } else if (
        editing.kind === 'calendar' &&
        editing.accountId &&
        editing.calendarSource &&
        editing.calendarRemoteId &&
        editing.eventRemoteId
      ) {
        saved = await window.mailClient.notes.upsertCalendar({
          accountId: editing.accountId,
          calendarSource: editing.calendarSource,
          calendarRemoteId: editing.calendarRemoteId,
          eventRemoteId: editing.eventRemoteId,
          title: editTitle,
          body: editBody,
          eventTitleSnapshot: editing.eventTitleSnapshot,
          eventStartIsoSnapshot: editing.eventStartIsoSnapshot,
          ...(scheduleDraft
            ? {
                scheduledStartIso: schedule.scheduledStartIso,
                scheduledEndIso: schedule.scheduledEndIso,
                scheduledAllDay: schedule.scheduledAllDay
              }
            : {})
        })
      } else {
        throw new Error(t('notes.shell.invalidNote'))
      }
      setEditing({ ...editing, ...saved })
      setScheduleDraft(null)
      pushToast({ label: t('notes.editor.saved'), variant: 'success' })
      await load()
      await loadSections()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  async function deleteNote(note: UserNoteListItem): Promise<void> {
    const ok = window.confirm(t('notes.shell.deleteConfirm'))
    if (!ok) return
    setSaving(true)
    try {
      await window.mailClient.notes.delete(note.id)
      if (editing?.id === note.id) {
        setEditing(null)
        clearSelectedMessage()
      }
      pushToast({ label: t('notes.shell.deleted'), variant: 'success' })
      await load()
      await loadSections()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const handleNoteDragEnd = useCallback(
    (ev: DragEndEvent): void => {
      if (listMode !== 'sections') return
      const noteId = parseNoteDragId(String(ev.active.id))
      if (noteId == null || !ev.over) return
      const drop = parseNoteNavDropId(String(ev.over.id))
      if (!drop || !('sectionId' in drop)) return
      const note = notes.find((n) => n.id === noteId)
      if (!note) return
      const targetSectionId = drop.sectionId
      if ((note.sectionId ?? null) === targetSectionId) return
      void window.mailClient.notes.moveToSection({ noteId, sectionId: targetSectionId }).then(() => {
        setNavSelection({ kind: 'sections', sectionId: targetSectionId })
      })
    },
    [listMode, notes]
  )

  const selectedObjectPreview =
    editing?.kind === 'mail' ? (
      <ReadingPane
        emptySelectionTitle={t('notes.shell.linkedMailTitle')}
        emptySelectionBody={t('notes.shell.linkedMailEmpty')}
      />
    ) : selectedCalendarEvent ? (
      <CalendarEventPreview event={selectedCalendarEvent} onEdit={(): void => undefined} />
    ) : null

  const notesNavColumn = (
    <aside
        className={cn(moduleNavColumnClass, 'shrink-0')}
        style={{ width: navWidth }}
      >
        <header className={moduleColumnHeaderNavShellBarClass}>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-0.5 py-0.5">
            <div className="truncate text-xs font-semibold leading-tight text-foreground">
              {t('notes.shell.title')}
            </div>
            <div className="truncate text-[10px] leading-tight text-muted-foreground">
              {t('notes.shell.subtitle')}
            </div>
          </div>
          <ModuleColumnHeaderIconButton
            type="button"
            onClick={(): void => void createStandalone()}
            disabled={saving}
            aria-label={t('notes.shell.newStandalone')}
            title={t('notes.shell.newStandalone')}
          >
            <Plus className={moduleColumnHeaderIconGlyphClass} />
          </ModuleColumnHeaderIconButton>
        </header>

        <div className={cn(moduleNavColumnInsetClass, 'shrink-0 border-b border-border py-3')}>
          <ModuleNavMiniMonth
            monthAnchor={miniMonth}
            today={new Date()}
            selectedRange={selectedRange}
            onSelectDayRange={(start, end): void =>
              applyNotesMiniCalendarRange(start, end, setDateFrom, setDateTo, setMiniMonth)
            }
            onPrevMonth={(): void => setMiniMonth((m) => addMonths(m, -1))}
            onNextMonth={(): void => setMiniMonth((m) => addMonths(m, 1))}
            footer={
              selectedRange ? (
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-[10px] text-foreground">
                    {t('notes.shell.dateRangeActive', { range: dateRangeLabel })}
                  </span>
                  <button
                    type="button"
                    onClick={(): void => clearNotesDateRange(setDateFrom, setDateTo)}
                    className="shrink-0 text-[10px] font-medium text-primary hover:underline"
                  >
                    {t('notes.shell.clearDateRange')}
                  </button>
                </div>
              ) : undefined
            }
          />
        </div>

        {shellView === 'list' ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {loading && notes.length === 0 ? (
              <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t('common.loading')}
              </div>
            ) : (
              <NotesSidebarList
                accounts={accounts}
                sections={sections}
                notes={notes}
                listMode={listMode}
                onListModeChange={setListMode}
                navSelection={navSelection}
                onSelectSection={(sectionId): void =>
                  setNavSelection({ kind: 'sections', sectionId })
                }
                onSelectAccount={(accountKey): void =>
                  setNavSelection({ kind: 'accounts', accountKey })
                }
                onSectionsChanged={onNotesChanged}
              />
            )}
          </div>
        ) : null}
    </aside>
  )

  const notesListWorkspace = (
    <>
      <VerticalSplitter
        ariaLabel={t('notes.shell.splitterNavAria')}
        onDrag={(delta): void => setNavWidth((w) => w + delta)}
      />

      <aside
        className="flex min-h-0 shrink-0 flex-col border-r border-border"
        style={{ width: detailColumnWidth }}
      >
        <NotesPagesPane
          title={pagesColumnTitle}
          notes={pagesNotes}
          loading={loading}
          activeNoteId={editing?.id ?? null}
          onOpenNote={openEdit}
          onRenameNoteTitle={renameNoteTitleInList}
          onPatchNoteDisplay={patchNoteDisplayInList}
          onCreateNote={(): void => void createStandalone()}
          creating={saving}
          pagesSort={pagesSort}
          onPagesSortChange={setPagesSort}
        />
      </aside>

      <VerticalSplitter
        ariaLabel={t('notes.shell.splitterPagesAria')}
        onDrag={(delta): void => setDetailColumnWidth((w) => w + delta)}
      />

      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
            <header className={cn(moduleColumnHeaderShellBarClass, 'min-w-0')}>
              <div className={cn(moduleColumnHeaderTitleClass, 'min-w-0 truncate text-left')}>
                {editing
                  ? noteTitle(editing, t('notes.shell.untitled'))
                  : t('notes.shell.selectNote')}
              </div>
              <div className="flex min-w-0 shrink-0 items-center gap-1.5">
                <NotesShellSearch
                  sections={sections}
                  accounts={accounts}
                  onOpenNote={openEdit}
                />
                <NotesShellViewToggle value={shellView} onChange={setShellView} />
                {editing ? (
                  <ModuleColumnHeaderIconButton
                    type="button"
                    onClick={(): void => {
                      setEditing(null)
                      setScheduleDraft(null)
                      clearSelectedMessage()
                    }}
                    aria-label={t('common.close')}
                  >
                    <X className={moduleColumnHeaderIconGlyphClass} />
                  </ModuleColumnHeaderIconButton>
                ) : null}
              </div>
            </header>

            {error ? (
              <div className="border-b border-border px-4 py-2 text-xs text-destructive">{error}</div>
            ) : null}

            {!editing ? (
              <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
                {t('notes.shell.selectNoteHint')}
              </div>
            ) : (
              <div className="flex min-h-0 flex-1">
                <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <NoteDisplayIcon note={editing} className="h-4 w-4" />
                    <span>{t(`notes.kind.${editing.kind}`)}</span>
                    {editing.scheduledStartIso ? (
                      <span className="text-primary">
                        {formatNoteDate(editing.scheduledStartIso, i18n.language)}
                      </span>
                    ) : null}
                    <span>{formatNoteDate(editing.updatedAt, i18n.language)}</span>
                  </div>

                  <div className="flex items-start gap-2">
                    <CalendarEventIconPicker
                      layout="compact"
                      openOn="doubleClick"
                      iconId={editing.iconId}
                      iconColorHex={resolveEntityIconColor(editing.iconColor)}
                      title={editTitle.trim() || noteTitle(editing, t('notes.shell.untitled'))}
                      disabled={saving}
                      triggerIcon={<NoteDisplayIcon note={editing} className="h-4 w-4" />}
                      onIconChange={(iconId): void => void patchNoteDisplay({ iconId: iconId ?? null })}
                      footer={
                        <IconColorPickerFooter
                          iconColor={editing.iconColor}
                          onIconColorChange={(iconColor): void =>
                            void patchNoteDisplay({ iconColor })
                          }
                        />
                      }
                    />
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e): void => setEditTitle(e.target.value)}
                      placeholder={t('notes.shell.titlePlaceholder')}
                      className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-base font-semibold outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
                    />
                  </div>

                  <NotesNoteScheduleBlock
                    note={
                      scheduleDraft && !scheduleDraft.clearSchedule
                        ? {
                            scheduledStartIso: scheduleDraft.scheduledStartIso,
                            scheduledEndIso: scheduleDraft.scheduledEndIso,
                            scheduledAllDay: scheduleDraft.scheduledAllDay
                          }
                        : editing
                    }
                    disabled={saving}
                    onChange={(value): void => setScheduleDraft(value)}
                  />

                  <NotesLinkedObjectsPanel
                    noteId={editing.id}
                    onOpenNote={(id): void => void openNoteById(id)}
                  />

                  <NotesAttachmentsPanel noteId={editing.id} />

                  <MarkdownNoteEditor
                    value={editBody}
                    onChange={setEditBody}
                    placeholder={t('notes.editor.placeholder')}
                    height={420}
                    className="min-h-0 flex-1"
                  />

                  <div className="-mt-1 text-xs text-muted-foreground">{t('notes.editor.markdownHint')}</div>

                  <footer className="flex justify-between gap-3 pb-2">
                    <button
                      type="button"
                      onClick={(): void => void deleteNote(editing as UserNoteListItem)}
                      disabled={saving}
                      className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      {t('common.delete')}
                    </button>
                    <button
                      type="button"
                      onClick={(): void => void saveEditing()}
                      disabled={saving}
                      className={cn(
                        moduleColumnHeaderOutlineSmClass,
                        'min-w-28 justify-center px-4 py-2 text-sm font-semibold'
                      )}
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {t('common.save')}
                    </button>
                  </footer>
                </div>

                {showObjectPreview && selectedObjectPreview ? (
                  <>
                    <VerticalSplitter
                      ariaLabel={t('notes.shell.splitterPreviewAria')}
                      onDrag={(delta): void => setPreviewColumnWidth((w) => w + delta)}
                    />
                    <aside
                      className="flex min-h-0 shrink-0 flex-col border-l border-border bg-card"
                      style={{ width: previewColumnWidth }}
                    >
                      <div className="flex h-10 shrink-0 items-center border-b border-border px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {t('notes.shell.linkedObject')}
                      </div>
                      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                        {selectedObjectPreview}
                      </div>
                    </aside>
                  </>
                ) : null}
              </div>
            )}
      </main>
    </>
  )

  const notesCalendarWorkspace = (
    <>
      <VerticalSplitter
        ariaLabel={t('notes.shell.splitterNavAria')}
        onDrag={(delta): void => setNavWidth((w) => w + delta)}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col border-l border-border bg-card">
        <header className={cn(moduleColumnHeaderShellBarClass, 'shrink-0 border-b border-border')}>
          <div className={moduleColumnHeaderTitleClass}>{t('notes.shell.selectNote')}</div>
          <div className="flex min-w-0 shrink-0 items-center gap-1.5">
            <NotesShellSearch
              sections={sections}
              accounts={accounts}
              onOpenNote={openEdit}
            />
            <NotesShellViewToggle value={shellView} onChange={setShellView} />
          </div>
        </header>
        <NotesCalendarToolbar
          calendarRef={notesCalendarRef}
          calendarTitle={calendarTitle}
          activeFcView={calendarFcView}
          onActiveFcViewChange={setCalendarFcView}
        />
        <NotesCalendarPane
          onSelectNote={openEdit}
          fcView={calendarFcView}
          fullCalendarRef={notesCalendarRef}
          onViewMeta={(meta): void => setCalendarTitle(meta.title)}
          selectedNoteId={editing?.id ?? null}
          className="min-h-0 min-w-0 flex-1"
        />
      </div>
    </>
  )

  return (
    <section className="flex min-h-0 flex-1 bg-background">
      {notesNavColumn}
      {shellView === 'calendar' ? (
        notesCalendarWorkspace
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragEnd={handleNoteDragEnd}
        >
          {notesListWorkspace}
        </DndContext>
      )}
    </section>
  )
}
