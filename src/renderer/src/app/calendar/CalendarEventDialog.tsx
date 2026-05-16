import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import {
  addDays,
  addHours,
  addMinutes,
  addMonths,
  format,
  parseISO,
  set
} from 'date-fns'
import { de as deFns, enUS as enUSFns } from 'date-fns/locale'
import type { Locale } from 'date-fns'
import { useTranslation } from 'react-i18next'
import {
  AlignLeft,
  Calendar as CalendarIcon,
  CheckSquare,
  CircleDot,
  ExternalLink,
  LayoutPanelLeft,
  Loader2,
  MapPin,
  MoreHorizontal,
  Repeat2,
  Users,
  Video,
  X
} from 'lucide-react'
import type {
  CalendarEventView,
  CalendarGraphCalendarRow,
  CalendarRecurrenceFrequency,
  CalendarRecurrenceRangeEndMode,
  CalendarSaveEventRecurrence,
  ConnectedAccount,
  MailMasterCategory,
  TaskListRow
} from '@shared/types'
import { cloudTaskStableKey } from '@shared/work-item-keys'
import { applyCloudTaskPersistTarget } from '@/app/calendar/apply-cloud-task-persist'
import { isWritableCalendarTarget } from '@/app/calendar/calendar-create-destination'
import {
  scheduleFromCalendarCreateRange,
  type CalendarCreateRange
} from '@/app/tasks/tasks-calendar-create-range'
import {
  persistTasksCalendarCreateAccountId,
  readTasksCalendarCreateAccountId
} from '@/app/tasks/tasks-calendar-create-storage'
import {
  datetimeLocalValueToIso,
  isoToDatetimeLocalValue
} from '@/app/work-items/work-item-datetime'
import { cloudTaskAccountOptionLabel } from '@/lib/cloud-task-accounts'
import { cn } from '@/lib/utils'
import { openExternalUrl } from '@/lib/open-external'
import { useAccountsStore } from '@/stores/accounts'
import { outlookCategoryDotClass } from '@/lib/outlook-category-colors'
import { resolvedAccountColorCss } from '@/lib/avatar-color'
import { ObjectNoteEditor } from '@/components/ObjectNoteEditor'
import { TipTapBody } from '@/components/TipTapBody'
import { sanitizeComposeHtmlFragment } from '@/lib/sanitize-compose-html'
import { CalendarEventDescriptionPreview } from '@/app/calendar/CalendarEventDescriptionPreview'
import { CalendarEventIconPicker } from '@/components/CalendarEventIconPicker'
import { calendarEventIconIsExplicit } from '@/lib/calendar-event-icons'
import { useThemeStore } from '@/stores/theme'

function dateToDatetimeLocal(d: Date): string {
  return format(d, "yyyy-MM-dd'T'HH:mm")
}

function datetimeLocalToIso(s: string, invalidMsg: string): string {
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) throw new Error(invalidMsg)
  return d.toISOString()
}

function isEffectivelyEmptyEditorHtml(html: string): boolean {
  const t = html.replace(/<[^>]+>/gi, '').replace(/\u00a0/g, ' ').trim()
  return t.length === 0
}

/** E-Mail aus einem Token (reine Adresse oder `Name <addr>` / Outlook-Stil). */
function extractEmailFromAttendeeToken(token: string): string | null {
  const t = token.trim()
  if (!t) return null
  const angle = /<([^>]+@[^>]+)>/i.exec(t)
  if (angle) {
    const inner = angle[1].trim().toLowerCase()
    return inner.includes('@') ? inner : null
  }
  const lower = t.toLowerCase()
  return lower.includes('@') ? lower : null
}

/** Teilnehmer aus Freitext (Zeilenumbruch, Komma, Semikolon); max. 40 Eintraege. */
function parseAttendeeEmailsField(raw: string): string[] {
  const parts = raw.split(/[\n,;]+/)
  const out: string[] = []
  const seen = new Set<string>()
  for (const p of parts) {
    const s = extractEmailFromAttendeeToken(p)
    if (!s) continue
    if (seen.has(s)) continue
    seen.add(s)
    out.push(s)
    if (out.length >= 40) break
  }
  return out
}

/** Ein `<option>`-Wert: Konto + Graph-Kalender (leer = Standardkalender). */
function calendarDestinationKey(accountId: string, graphCalendarId: string): string {
  return JSON.stringify({ accountId, graphCalendarId })
}

function parseCalendarDestinationKey(
  key: string
): { accountId: string; graphCalendarId: string } | null {
  try {
    const o = JSON.parse(key) as { accountId?: unknown; graphCalendarId?: unknown }
    if (typeof o.accountId !== 'string') return null
    const graphCalendarId = typeof o.graphCalendarId === 'string' ? o.graphCalendarId : ''
    return { accountId: o.accountId, graphCalendarId }
  } catch {
    return null
  }
}

type RecurrenceUiFrequency = 'none' | CalendarRecurrenceFrequency

/** Optgroup im Zielkalender-Dropdown: Name + E-Mail zur eindeutigen Zuordnung. */
type CalendarEventDialogCreateKind = 'event' | 'task'

function pickDefaultTaskListId(rows: TaskListRow[]): string | null {
  if (rows.length === 0) return null
  return rows.find((r) => r.isDefault)?.id ?? rows[0]!.id
}

function resolvePreferredTaskAccountId(
  taskAccounts: ConnectedAccount[],
  preferredAccountId?: string
): string {
  if (preferredAccountId && taskAccounts.some((a) => a.id === preferredAccountId)) {
    return preferredAccountId
  }
  const stored = readTasksCalendarCreateAccountId()
  if (stored && taskAccounts.some((a) => a.id === stored)) return stored
  return taskAccounts[0]?.id ?? ''
}

function destinationAccountOptgroupLabel(account: ConnectedAccount): string {
  const name = account.displayName.trim()
  const email = account.email.trim()
  if (!name) return email || account.id
  if (!email || name.toLowerCase() === email.toLowerCase()) return name
  return `${name} · ${email}`
}

function formatDurationMs(
  ms: number,
  tr: (key: string, options?: Record<string, unknown>) => string
): string {
  if (!Number.isFinite(ms) || ms <= 0) return tr('calendar.eventDialog.summaryDash')
  const h = Math.floor(ms / 3600000)
  const m = Math.round((ms % 3600000) / 60000)
  if (h > 0 && m > 0) return tr('calendar.eventDialog.durationHMin', { hours: h, minutes: m })
  if (h > 0) return tr('calendar.eventDialog.durationH', { hours: h })
  return tr('calendar.eventDialog.durationMin', { minutes: m })
}

type SchedulePickerKind = 'startTime' | 'endTime' | 'startDate' | 'endDate' | 'dayStart' | 'dayEnd'

function quarterHourTimesForYmd(ymd: string): string[] {
  const base = parseISO(`${ymd}T12:00:00`)
  const out: string[] = []
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      out.push(
        format(set(base, { hours: h, minutes: m, seconds: 0, milliseconds: 0 }), 'HH:mm')
      )
    }
  }
  return out
}

function mergeTimeIntoStart(dtStart: string, hhmm: string): string {
  const d = new Date(dtStart)
  if (Number.isNaN(d.getTime())) return dtStart
  const [hh, mm] = hhmm.split(':').map(Number)
  d.setHours(hh, mm, 0, 0)
  return dateToDatetimeLocal(d)
}

function mergeTimeIntoEnd(dtStart: string, dtEnd: string, hhmm: string): string {
  const d = new Date(dtEnd)
  if (Number.isNaN(d.getTime())) return dtEnd
  const [hh, mm] = hhmm.split(':').map(Number)
  d.setHours(hh, mm, 0, 0)
  const next = dateToDatetimeLocal(d)
  const s = new Date(dtStart)
  const e = new Date(next)
  if (Number.isNaN(s.getTime())) return next
  if (e.getTime() <= s.getTime()) {
    return dateToDatetimeLocal(addMinutes(s, 15))
  }
  return next
}

/** Kalendertag (`yyyy-MM-dd`) in einen `datetime-local`-String einsetzen, Uhrzeit bleibt erhalten. */
function mergeYmdIntoDatetimeLocal(dtLocal: string, ymd: string): string {
  const d = new Date(dtLocal)
  if (Number.isNaN(d.getTime())) return dtLocal
  const parts = ymd.split('-').map(Number)
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return dtLocal
  const [y, m, day] = parts
  d.setFullYear(y, m - 1, day)
  return dateToDatetimeLocal(d)
}

function fieldChipClass(locked: boolean): string {
  return cn(
    'inline-flex min-h-[30px] max-w-full shrink-0 items-center rounded-md border border-border/70 bg-secondary/35 px-2 py-1 text-[13px] font-medium tabular-nums text-foreground transition-colors',
    'hover:bg-secondary/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35',
    locked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
  )
}

export interface CalendarEventDialogProps {
  open: boolean
  mode: 'create' | 'edit'
  accounts: ConnectedAccount[]
  defaultAccountId?: string
  initialRange?: { start: Date; end: Date; allDay: boolean } | null
  /** Optional: Betreff/Ort beim Anlegen (z. B. Duplizieren aus Kontextmenue). */
  createPrefill?: { subject?: string; location?: string } | null
  initialCreateKind?: CalendarEventDialogCreateKind
  initialGraphCalendarId?: string
  initialTaskListId?: string
  initialEvent?: CalendarEventView | null
  taskAccounts?: ConnectedAccount[]
  loadListsForAccount?: (accountId: string) => Promise<TaskListRow[]>
  onTaskCreated?: () => void
  onClose: () => void
  onSaved: () => void
}

function PropertyRow({
  icon: Icon,
  label,
  children,
  onClick
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  children: React.ReactNode
  onClick?: () => void
}): JSX.Element {
  const inner = (
    <>
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
        <div className="mt-0.5 text-[13px] text-foreground">{children}</div>
      </div>
    </>
  )
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-start gap-3 rounded-md px-1 py-2 text-left transition-colors hover:bg-secondary/60"
      >
        {inner}
      </button>
    )
  }
  return <div className="flex items-start gap-3 px-1 py-2">{inner}</div>
}

export function CalendarEventDialog({
  open,
  mode,
  accounts,
  defaultAccountId,
  initialRange,
  createPrefill,
  initialCreateKind,
  initialGraphCalendarId,
  initialTaskListId,
  initialEvent,
  taskAccounts = [],
  loadListsForAccount,
  onTaskCreated,
  onClose,
  onSaved
}: CalendarEventDialogProps): JSX.Element | null {
  const { t, i18n } = useTranslation()
  const dfLocale: Locale = i18n.language.startsWith('de') ? deFns : enUSFns
  const collatorLocale = i18n.language.startsWith('de') ? 'de' : 'en'

  /** Konten mit Kalender-Anbindung (Microsoft 365 + Google). */
  const calendarAccounts = useMemo(
    () => accounts.filter((a) => a.provider === 'microsoft' || a.provider === 'google'),
    [accounts]
  )
  /** Nur Konto-IDs: verhindert Formular-Reset bei Profilfoto/Store-Refresh mit gleichen Konten. */
  const calendarAccountIdsKey = useMemo(
    () =>
      calendarAccounts
        .map((a) => a.id)
        .sort()
        .join('|'),
    [calendarAccounts]
  )
  const calendarTzConfig = useAccountsStore((s) => s.config?.calendarTimeZone)
  const tzDisplay =
    calendarTzConfig?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

  const viewerTheme = useThemeStore((s) => s.effective)

  const [accountId, setAccountId] = useState('')
  const [subject, setSubject] = useState('')
  const [eventIconId, setEventIconId] = useState<string | undefined>(undefined)
  const [location, setLocation] = useState('')
  const [descriptionHtml, setDescriptionHtml] = useState('')
  const [isAllDay, setIsAllDay] = useState(false)
  const [dayStart, setDayStart] = useState('')
  const [dayEnd, setDayEnd] = useState('')
  const [dtStart, setDtStart] = useState('')
  const [dtEnd, setDtEnd] = useState('')
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [showAdvancedDateTime, setShowAdvancedDateTime] = useState(false)
  const [schedulePicker, setSchedulePicker] = useState<SchedulePickerKind | null>(null)
  const [schedulePickerPos, setSchedulePickerPos] = useState<{
    top: number
    left: number
    width: number
  } | null>(null)
  /** Pro Konto die Kalender von Graph (Anlegen: ein gemeinsames Auswahlfeld). */
  const [calendarsByAccount, setCalendarsByAccount] = useState<
    { account: ConnectedAccount; calendars: CalendarGraphCalendarRow[] }[]
  >([])
  const [calendarsLoading, setCalendarsLoading] = useState(false)
  /** Graph-Kalender-ID; leer = `POST /me/events` (Standardkalender). */
  const [graphCalendarId, setGraphCalendarId] = useState('')
  /** Wert des kombinierten Zielkalender-`<select>` (JSON). */
  const [destinationSelectValue, setDestinationSelectValue] = useState('')

  const [masterCategories, setMasterCategories] = useState<MailMasterCategory[]>([])
  const [mastersLoading, setMastersLoading] = useState(false)
  const [eventCategories, setEventCategories] = useState<string[]>([])

  const [teamsMeeting, setTeamsMeeting] = useState(false)
  const [attendeeInput, setAttendeeInput] = useState('')
  const [msEventDetailsLoading, setMsEventDetailsLoading] = useState(false)
  const [msEventDetailsError, setMsEventDetailsError] = useState<string | null>(null)

  const [recurFreq, setRecurFreq] = useState<RecurrenceUiFrequency>('none')
  const [recurEnd, setRecurEnd] = useState<CalendarRecurrenceRangeEndMode>('never')
  const [recurUntilDate, setRecurUntilDate] = useState('')
  const [recurCount, setRecurCount] = useState('10')

  const [createKind, setCreateKind] = useState<CalendarEventDialogCreateKind>('event')
  const [taskAccountId, setTaskAccountId] = useState('')
  const [taskListId, setTaskListId] = useState('')
  const [taskLists, setTaskLists] = useState<TaskListRow[]>([])
  const [taskListsLoading, setTaskListsLoading] = useState(false)
  const [taskNotes, setTaskNotes] = useState('')
  const [taskDue, setTaskDue] = useState('')
  const [taskPlannedStart, setTaskPlannedStart] = useState('')
  const [taskPlannedEnd, setTaskPlannedEnd] = useState('')

  const taskTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

  function applyTaskScheduleFromRange(range: CalendarCreateRange | null | undefined): void {
    if (!range) {
      setTaskDue('')
      setTaskPlannedStart('')
      setTaskPlannedEnd('')
      return
    }
    const sched = scheduleFromCalendarCreateRange(range, taskTimeZone)
    setTaskDue(sched.dueDate)
    setTaskPlannedStart(isoToDatetimeLocalValue(sched.plannedStartIso))
    setTaskPlannedEnd(isoToDatetimeLocalValue(sched.plannedEndIso))
  }

  useEffect(() => {
    if (!open) return
    if (mode === 'edit' && !initialEvent) return

    setLocalError(null)
    setBusy(false)
    setShowAdvancedDateTime(false)
    setSchedulePicker(null)
    setSchedulePickerPos(null)
    setDescriptionHtml('')
    setCreateKind(initialCreateKind ?? 'event')
    setTaskNotes('')

    if (mode === 'edit' && initialEvent) {
      setAccountId(initialEvent.accountId)
      setSubject(initialEvent.title ?? '')
      setEventIconId(initialEvent.icon?.trim() || undefined)
      setLocation(initialEvent.location ?? '')
      setIsAllDay(initialEvent.isAllDay)
      setEventCategories(
        initialEvent.categories?.filter((c) => c.trim().length > 0) ?? []
      )
      if (initialEvent.isAllDay) {
        setDayStart(initialEvent.startIso.slice(0, 10))
        setDayEnd(initialEvent.endIso.slice(0, 10))
        setDtStart('')
        setDtEnd('')
      } else {
        setDtStart(dateToDatetimeLocal(parseISO(initialEvent.startIso)))
        setDtEnd(dateToDatetimeLocal(parseISO(initialEvent.endIso)))
        setDayStart('')
        setDayEnd('')
      }
      setTeamsMeeting(false)
      setAttendeeInput('')
      setMsEventDetailsError(null)
      setRecurFreq('none')
      setRecurEnd('never')
      setRecurUntilDate('')
      setRecurCount('10')
      const calId = initialEvent.graphCalendarId?.trim() ?? ''
      setGraphCalendarId(calId)
      setDestinationSelectValue(calendarDestinationKey(initialEvent.accountId, calId))
      return
    }

    if (mode === 'create') {
      const preferAcc =
        defaultAccountId && calendarAccounts.some((a) => a.id === defaultAccountId)
          ? defaultAccountId
          : calendarAccounts[0]?.id ?? ''
      const acc =
        initialCreateKind === 'task' && defaultAccountId ? defaultAccountId : preferAcc
      setAccountId(acc)
      setSubject(createPrefill?.subject?.trim() ? createPrefill.subject : '')
      setEventIconId(undefined)
      setLocation(createPrefill?.location?.trim() ? createPrefill.location : '')
      if (initialRange) {
        setIsAllDay(initialRange.allDay)
        if (initialRange.allDay) {
          setDayStart(format(initialRange.start, 'yyyy-MM-dd'))
          setDayEnd(format(initialRange.end, 'yyyy-MM-dd'))
          setDtStart('')
          setDtEnd('')
        } else {
          setDtStart(dateToDatetimeLocal(initialRange.start))
          setDtEnd(dateToDatetimeLocal(initialRange.end))
          setDayStart('')
          setDayEnd('')
        }
      } else {
        setIsAllDay(false)
        const start = new Date()
        start.setMinutes(0, 0, 0)
        start.setHours(start.getHours() + 1)
        const end = addHours(start, 1)
        setDtStart(dateToDatetimeLocal(start))
        setDtEnd(dateToDatetimeLocal(end))
        setDayStart('')
        setDayEnd('')
      }
      setEventCategories([])
      setGraphCalendarId(initialGraphCalendarId?.trim() ?? '')
      setDestinationSelectValue(
        initialGraphCalendarId != null && acc
          ? calendarDestinationKey(acc, initialGraphCalendarId.trim())
          : ''
      )
      setTeamsMeeting(false)
      setAttendeeInput('')
      setMsEventDetailsError(null)
      setMsEventDetailsLoading(false)
      setRecurFreq('none')
      setRecurEnd('never')
      const anchorForUntil = initialRange
        ? initialRange.start
        : ((): Date => {
            const start = new Date()
            start.setMinutes(0, 0, 0)
            start.setHours(start.getHours() + 1)
            return start
          })()
      setRecurUntilDate(format(addMonths(anchorForUntil, 6), 'yyyy-MM-dd'))
      setRecurCount('10')
      const preferTaskAcc = resolvePreferredTaskAccountId(
        taskAccounts,
        defaultAccountId && taskAccounts.some((a) => a.id === defaultAccountId)
          ? defaultAccountId
          : undefined
      )
      setTaskAccountId(
        initialCreateKind === 'task' && defaultAccountId ? defaultAccountId : preferTaskAcc
      )
      setTaskListId(initialTaskListId?.trim() ?? '')
      setTaskLists([])
      applyTaskScheduleFromRange(initialRange ?? null)
    }
  }, [
    open,
    mode,
    initialEvent,
    initialRange,
    createPrefill,
    initialCreateKind,
    initialGraphCalendarId,
    initialTaskListId,
    defaultAccountId,
    calendarAccountIdsKey,
    taskAccounts
  ])

  useEffect(() => {
    if (!open || calendarAccounts.length === 0) {
      if (mode !== 'edit') {
        setCalendarsByAccount([])
        setCalendarsLoading(false)
        setDestinationSelectValue('')
      }
      return
    }
    if (mode !== 'create' && mode !== 'edit') {
      setCalendarsByAccount([])
      setCalendarsLoading(false)
      return
    }
    let cancelled = false
    setCalendarsLoading(true)
    if (mode === 'create') {
      setDestinationSelectValue('')
    }
    void Promise.all(
      calendarAccounts.map((acc) =>
        window.mailClient.calendar
          .listCalendars({ accountId: acc.id })
          .then((rows) => ({
            account: acc,
            calendars: rows.filter(isWritableCalendarTarget)
          }))
          .catch(() => ({ account: acc, calendars: [] as CalendarGraphCalendarRow[] }))
      )
    )
      .then((bundles) => {
        if (cancelled) return
        setCalendarsByAccount(bundles)
        if (mode === 'edit' && initialEvent) {
          const calId = initialEvent.graphCalendarId?.trim() ?? ''
          setDestinationSelectValue(calendarDestinationKey(initialEvent.accountId, calId))
          setAccountId(initialEvent.accountId)
          setGraphCalendarId(calId)
          return
        }
        const preferAcc =
          defaultAccountId && calendarAccounts.some((a) => a.id === defaultAccountId)
            ? defaultAccountId
            : (calendarAccounts[0]?.id ?? '')
        if (
          mode === 'create' &&
          initialGraphCalendarId != null &&
          defaultAccountId &&
          calendarAccounts.some((a) => a.id === defaultAccountId)
        ) {
          const calId = initialGraphCalendarId.trim()
          setDestinationSelectValue(calendarDestinationKey(defaultAccountId, calId))
          setAccountId(defaultAccountId)
          setGraphCalendarId(calId)
          return
        }
        const bundle = bundles.find((b) => b.account.id === preferAcc) ?? bundles[0]
        if (!bundle) {
          setDestinationSelectValue('')
          setGraphCalendarId('')
          return
        }
        let calId = ''
        if (bundle.calendars.length > 0) {
          const def =
            bundle.calendars.find((r) => r.isDefaultCalendar && r.calendarKind !== 'm365Group') ??
            bundle.calendars.find((r) => r.isDefaultCalendar) ??
            bundle.calendars.find((r) => r.calendarKind !== 'm365Group') ??
            bundle.calendars[0]
          calId = def?.id ?? ''
        }
        const key = calendarDestinationKey(bundle.account.id, calId)
        setDestinationSelectValue(key)
        setAccountId(bundle.account.id)
        setGraphCalendarId(calId)
      })
      .finally(() => {
        if (!cancelled) setCalendarsLoading(false)
      })
    return (): void => {
      cancelled = true
    }
  }, [open, mode, calendarAccountIdsKey, defaultAccountId, initialGraphCalendarId, initialEvent])

  useEffect(() => {
    if (!open || mode !== 'create' || createKind !== 'task' || !taskAccountId || !loadListsForAccount) {
      setTaskLists([])
      setTaskListId('')
      return
    }
    let cancelled = false
    setTaskListsLoading(true)
    void loadListsForAccount(taskAccountId)
      .then((rows) => {
        if (cancelled) return
        setTaskLists(rows)
        const preferred =
          initialTaskListId && rows.some((r) => r.id === initialTaskListId)
            ? initialTaskListId
            : (pickDefaultTaskListId(rows) ?? '')
        setTaskListId(preferred)
      })
      .catch(() => {
        if (cancelled) return
        setTaskLists([])
        setTaskListId('')
      })
      .finally(() => {
        if (!cancelled) setTaskListsLoading(false)
      })
    return (): void => {
      cancelled = true
    }
  }, [open, mode, createKind, taskAccountId, loadListsForAccount, initialTaskListId])

  const timedDisplay = useMemo(() => {
    if (isAllDay || !dtStart || !dtEnd) return null
    const s = new Date(dtStart)
    const e = new Date(dtEnd)
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null
    const ms = e.getTime() - s.getTime()
    const sameDay = format(s, 'yyyy-MM-dd') === format(e, 'yyyy-MM-dd')
    const sameYear = format(s, 'yyyy') === format(e, 'yyyy')
    const startDateChip =
      sameDay || sameYear
        ? format(s, 'EEE d. MMM', { locale: dfLocale })
        : format(s, 'EEE d. MMM yyyy', { locale: dfLocale })
    const endDateChip = sameDay
      ? startDateChip
      : format(e, 'EEE d. MMM yyyy', { locale: dfLocale })
    return {
      startHm: format(s, 'HH:mm'),
      endHm: format(e, 'HH:mm'),
      duration: formatDurationMs(ms, t),
      startDateChip,
      endDateChip,
      startYmd: format(s, 'yyyy-MM-dd'),
      endYmd: format(e, 'yyyy-MM-dd')
    }
  }, [isAllDay, dtStart, dtEnd, dfLocale, t])

  const allDayDisplay = useMemo(() => {
    if (!isAllDay || !dayStart || !dayEnd) return null
    try {
      const s = parseISO(`${dayStart}T12:00:00`)
      const endExcl = parseISO(`${dayEnd}T12:00:00`)
      const lastIncl = addDays(endExcl, -1)
      const same = format(s, 'yyyy-MM-dd') === format(lastIncl, 'yyyy-MM-dd')
      return {
        startChip: format(s, 'EEE d. MMM', { locale: dfLocale }),
        endChip: format(lastIncl, 'EEE d. MMM yyyy', { locale: dfLocale }),
        singleDay: same
      }
    } catch {
      return null
    }
  }, [isAllDay, dayStart, dayEnd, dfLocale])

  useEffect(() => {
    if (!schedulePicker) return
    function onDocMouseDown(e: MouseEvent): void {
      const el = schedulePickerRef.current
      if (!el || el.contains(e.target as Node)) return
      setSchedulePicker(null)
      setSchedulePickerPos(null)
    }
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        setSchedulePicker(null)
        setSchedulePickerPos(null)
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return (): void => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [schedulePicker])

  useLayoutEffect(() => {
    if (schedulePicker !== 'startTime' && schedulePicker !== 'endTime') return
    const btn = selectedTimeOptionRef.current
    if (!btn) return
    btn.scrollIntoView({ block: 'nearest' })
  }, [schedulePicker, dtStart, dtEnd])

  /** Formularfelder gesperrt (Busy oder Kalender nur lesbar). */
  const eventFieldsLocked = useMemo(
    () => busy || (mode === 'edit' && initialEvent?.calendarCanEdit === false),
    [busy, mode, initialEvent?.calendarCanEdit]
  )

  /** Outlook-Masterkategorien nur fuer Microsoft-Konten laden. */
  const useOutlookCategories = mode === 'edit' && initialEvent?.source === 'microsoft'

  useEffect(() => {
    if (!open || !useOutlookCategories || !accountId) {
      setMasterCategories([])
      setMastersLoading(false)
      return
    }
    let cancelled = false
    setMastersLoading(true)
    void window.mailClient.mail
      .listMasterCategories(accountId)
      .then((rows) => {
        if (!cancelled) setMasterCategories(rows)
      })
      .catch(() => {
        if (!cancelled) setMasterCategories([])
      })
      .finally(() => {
        if (!cancelled) setMastersLoading(false)
      })
    return (): void => {
      cancelled = true
    }
  }, [open, useOutlookCategories, accountId])

  const categoryColorByName = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of masterCategories) {
      m.set(c.displayName, c.color)
    }
    return m
  }, [masterCategories])

  const categoryChoiceNames = useMemo(() => {
    const fromMasters = masterCategories.map((c) => c.displayName)
    const extra = eventCategories.filter((n) => !fromMasters.includes(n))
    return [...new Set([...fromMasters, ...extra])].sort((a, b) => a.localeCompare(b, collatorLocale))
  }, [masterCategories, eventCategories, collatorLocale])

  const panelRef = useRef<HTMLElement>(null)
  const schedulePickerRef = useRef<HTMLDivElement>(null)
  const selectedTimeOptionRef = useRef<HTMLButtonElement>(null)
  /** Nativer Datums-Dialog per showPicker() gleich beim Chip-Klick (Chromium/Electron). */
  const scheduleDateInputRef = useRef<HTMLInputElement>(null)

  const selectedAccount = useMemo(
    () => calendarAccounts.find((a) => a.id === accountId),
    [calendarAccounts, accountId]
  )

  useEffect(() => {
    if (isAllDay) setTeamsMeeting(false)
  }, [isAllDay])

  useEffect(() => {
    if (!open || mode !== 'edit' || !initialEvent) return
    const eventId = initialEvent.graphEventId?.trim()
    if (!eventId) {
      setMsEventDetailsLoading(false)
      setMsEventDetailsError(null)
      return
    }
    if (initialEvent.source === 'google' && !initialEvent.graphCalendarId?.trim()) {
      setMsEventDetailsLoading(false)
      setMsEventDetailsError(t('calendar.eventDialog.googleCalendarIdMissing'))
      setAttendeeInput('')
      return
    }

    let cancelled = false
    setMsEventDetailsLoading(true)
    setMsEventDetailsError(null)
    setTeamsMeeting(!!initialEvent.joinUrl && !initialEvent.isAllDay)
    void window.mailClient.calendar
      .getEvent({
        accountId: initialEvent.accountId,
        graphEventId: eventId,
        graphCalendarId: initialEvent.graphCalendarId ?? null
      })
      .then((d) => {
        if (cancelled) return
        setTeamsMeeting(!!d.isOnlineMeeting && !initialEvent.isAllDay)
        setAttendeeInput(d.attendeeEmails.join('\n'))
        const raw = d.bodyHtml?.trim() ? d.bodyHtml.trim() : ''
        setDescriptionHtml(raw ? sanitizeComposeHtmlFragment(raw) : '')
      })
      .catch((err) => {
        if (cancelled) return
        setMsEventDetailsError(err instanceof Error ? err.message : String(err))
        setAttendeeInput('')
        setDescriptionHtml('')
      })
      .finally(() => {
        if (!cancelled) setMsEventDetailsLoading(false)
      })
    return (): void => {
      cancelled = true
    }
  }, [open, mode, initialEvent])

  const msTeamsUiLocked = useMemo(
    () =>
      eventFieldsLocked ||
      (mode === 'edit' && initialEvent?.source === 'microsoft' && msEventDetailsLoading),
    [eventFieldsLocked, mode, initialEvent?.source, msEventDetailsLoading]
  )

  if (!open) return null

  function closeSchedulePicker(): void {
    setSchedulePicker(null)
    setSchedulePickerPos(null)
  }

  function openSchedulePicker(kind: SchedulePickerKind, anchorEl: HTMLElement | null): void {
    if (eventFieldsLocked || !anchorEl) return
    const r = anchorEl.getBoundingClientRect()
    const margin = 8
    const popW = 208
    let left = r.left
    if (left + popW > window.innerWidth - margin) left = window.innerWidth - popW - margin
    if (left < margin) left = margin
    const listMax = 260
    let top = r.bottom + 6
    if (top + listMax > window.innerHeight - margin) {
      top = r.top - 6 - listMax
      if (top < margin) top = margin
    }
    const pos = { top, left, width: popW }
    const dateKind =
      kind === 'startDate' ||
      kind === 'endDate' ||
      kind === 'dayStart' ||
      kind === 'dayEnd'
    if (dateKind) {
      flushSync(() => {
        setSchedulePickerPos(pos)
        setSchedulePicker(kind)
      })
      const input = scheduleDateInputRef.current
      if (input) {
        input.focus()
        try {
          if ('showPicker' in input && typeof input.showPicker === 'function') {
            input.showPicker()
          }
        } catch {
          // ohne User-Gesture oder nicht unterstützt
        }
      }
    } else {
      setSchedulePickerPos(pos)
      setSchedulePicker(kind)
    }
  }

  const timePickerYmd =
    schedulePicker === 'startTime'
      ? (dtStart.length >= 10 ? dtStart.slice(0, 10) : format(new Date(), 'yyyy-MM-dd'))
      : schedulePicker === 'endTime'
        ? (dtEnd.length >= 10 ? dtEnd.slice(0, 10) : dtStart.slice(0, 10) || format(new Date(), 'yyyy-MM-dd'))
        : ''
  const timePickerOptions =
    schedulePicker === 'startTime' || schedulePicker === 'endTime'
      ? quarterHourTimesForYmd(timePickerYmd)
      : []
  const timePickerCurrentHm =
    schedulePicker === 'startTime'
      ? dtStart
        ? format(new Date(dtStart), 'HH:mm')
        : ''
      : schedulePicker === 'endTime'
        ? dtEnd
          ? format(new Date(dtEnd), 'HH:mm')
          : ''
        : ''

  function toggleEventCategory(name: string): void {
    const trimmed = name.trim()
    if (!trimmed) return
    setEventCategories((prev) => {
      const next = new Set(prev)
      if (next.has(trimmed)) next.delete(trimmed)
      else next.add(trimmed)
      return Array.from(next).sort((a, b) => a.localeCompare(b, collatorLocale))
    })
  }

  function handleCreateKindChange(next: CalendarEventDialogCreateKind): void {
    if (next === createKind) return
    if (next === 'task') {
      if (accountId && taskAccounts.some((a) => a.id === accountId)) {
        setTaskAccountId(accountId)
      }
      if (dtStart && dtEnd && !isAllDay) {
        setTaskPlannedStart(dtStart)
        setTaskPlannedEnd(dtEnd)
        setTaskDue(dtStart.slice(0, 10))
      } else if (isAllDay && dayStart) {
        setTaskDue(dayStart)
        setTaskPlannedStart('')
        setTaskPlannedEnd('')
      } else {
        applyTaskScheduleFromRange(initialRange ?? null)
      }
    }
    setCreateKind(next)
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setLocalError(null)

    if (mode === 'create' && createKind === 'task') {
      if (taskAccounts.length === 0) {
        setLocalError(t('tasks.create.noAccounts'))
        return
      }
      if (!taskAccountId) {
        setLocalError(t('calendar.eventDialog.selectAccount'))
        return
      }
      if (!taskListId) {
        setLocalError(t('calendar.eventDialog.selectTaskList'))
        return
      }
      if (!subject.trim()) {
        setLocalError(t('calendar.eventDialog.enterTitle'))
        return
      }
      setBusy(true)
      try {
        const dueIso = taskDue.trim() ? `${taskDue.trim()}T12:00:00.000Z` : null
        const plannedStartIso = datetimeLocalValueToIso(taskPlannedStart)
        const plannedEndIso = datetimeLocalValueToIso(taskPlannedEnd)
        const row = await window.mailClient.tasks.createTask({
          accountId: taskAccountId,
          listId: taskListId,
          title: subject.trim(),
          notes: taskNotes.trim() || null,
          dueIso,
          completed: false
        })
        if (plannedStartIso && plannedEndIso) {
          const taskKey = cloudTaskStableKey(taskAccountId, taskListId, row.id)
          await applyCloudTaskPersistTarget(
            {
              kind: 'planned',
              taskKey,
              plannedStartIso,
              plannedEndIso
            },
            { accountId: taskAccountId, listId: taskListId, id: row.id },
            taskTimeZone
          )
        }
        persistTasksCalendarCreateAccountId(taskAccountId)
        onTaskCreated?.()
        onSaved()
        onClose()
      } catch (err) {
        setLocalError(err instanceof Error ? err.message : String(err))
      } finally {
        setBusy(false)
      }
      return
    }

    if (mode === 'create') {
      if (!parseCalendarDestinationKey(destinationSelectValue)) {
        setLocalError(t('calendar.eventDialog.selectTargetCalendar'))
        return
      }
    }
    if (!accountId) {
      setLocalError(t('calendar.eventDialog.selectAccount'))
      return
    }
    if (!subject.trim()) {
      setLocalError(t('calendar.eventDialog.enterTitle'))
      return
    }

    if (mode === 'edit' && initialEvent?.calendarCanEdit === false) {
      setLocalError(t('calendar.eventDialog.calendarReadOnly'))
      return
    }

    let startIso: string
    let endIso: string
    try {
      if (isAllDay) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dayStart) || !/^\d{4}-\d{2}-\d{2}$/.test(dayEnd)) {
          setLocalError(t('calendar.eventDialog.allDayNeedDates'))
          return
        }
        if (dayEnd <= dayStart) {
          setLocalError(t('calendar.eventDialog.endAfterStartExclusive'))
          return
        }
        startIso = dayStart
        endIso = dayEnd
      } else {
        const invalid = t('calendar.eventDialog.invalidDate')
        startIso = datetimeLocalToIso(dtStart, invalid)
        endIso = datetimeLocalToIso(dtEnd, invalid)
        if (new Date(endIso) <= new Date(startIso)) {
          setLocalError(t('calendar.eventDialog.endAfterStart'))
          return
        }
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err))
      return
    }

    const bodyHtml = isEffectivelyEmptyEditorHtml(descriptionHtml)
      ? null
      : sanitizeComposeHtmlFragment(descriptionHtml.trim())

    const parsedAttendees = parseAttendeeEmailsField(attendeeInput)

    let recurrence: CalendarSaveEventRecurrence | undefined
    if (mode === 'create' && recurFreq !== 'none') {
      const startYmd = isAllDay ? dayStart : dtStart.slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startYmd)) {
        setLocalError(t('calendar.eventDialog.invalidDate'))
        return
      }
      if (recurEnd === 'until') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(recurUntilDate)) {
          setLocalError(t('calendar.eventDialog.recurrenceUntilInvalid'))
          return
        }
        if (recurUntilDate < startYmd) {
          setLocalError(t('calendar.eventDialog.recurrenceUntilBeforeStart'))
          return
        }
      }
      if (recurEnd === 'count') {
        const n = parseInt(recurCount, 10)
        if (!Number.isFinite(n) || n < 1 || n > 999) {
          setLocalError(t('calendar.eventDialog.recurrenceCountInvalid'))
          return
        }
      }
      recurrence = {
        frequency: recurFreq,
        rangeEnd: recurEnd,
        ...(recurEnd === 'until' ? { untilDate: recurUntilDate } : {}),
        ...(recurEnd === 'count' ? { count: parseInt(recurCount, 10) } : {})
      }
    }

    setBusy(true)
    try {
      if (mode === 'create') {
        const created = await window.mailClient.calendar.createEvent({
          accountId,
          graphCalendarId: graphCalendarId.trim() || null,
          subject: subject.trim(),
          startIso,
          endIso,
          isAllDay,
          location: location.trim() || null,
          bodyHtml,
          categories: eventCategories,
          ...(selectedAccount?.provider === 'microsoft'
            ? {
                attendeeEmails: parsedAttendees,
                teamsMeeting: !isAllDay && teamsMeeting
              }
            : {}),
          ...(recurrence ? { recurrence } : {})
        })
        if (calendarEventIconIsExplicit(eventIconId) && created.id?.trim()) {
          await window.mailClient.calendar.patchEventIcon({
            accountId,
            graphEventId: created.id.trim(),
            iconId: eventIconId
          })
        }
      } else {
        const gid = initialEvent?.graphEventId
        if (!gid) {
          setLocalError(t('calendar.eventDialog.missingEventId'))
          setBusy(false)
          return
        }
        const parsedDest = parseCalendarDestinationKey(destinationSelectValue)
        const initialCalId = initialEvent.graphCalendarId?.trim() ?? ''
        const initialDestKey = calendarDestinationKey(initialEvent.accountId, initialCalId)
        const destinationChanged =
          parsedDest != null &&
          destinationSelectValue !== initialDestKey &&
          (parsedDest.accountId !== initialEvent.accountId ||
            parsedDest.graphCalendarId !== initialCalId)

        const payloadOverride = {
          subject: subject.trim(),
          startIso,
          endIso,
          isAllDay,
          location: location.trim() || null,
          bodyHtml,
          categories: eventCategories,
          ...(initialEvent.source === 'microsoft'
            ? {
                attendeeEmails: parsedAttendees,
                teamsMeeting: !isAllDay && teamsMeeting
              }
            : {})
        }

        if (destinationChanged && parsedDest) {
          await window.mailClient.calendar.transferEvent({
            source: {
              accountId: initialEvent.accountId,
              graphEventId: gid,
              graphCalendarId: initialEvent.graphCalendarId ?? null,
              title: initialEvent.title,
              startIso: initialEvent.startIso,
              endIso: initialEvent.endIso,
              isAllDay: initialEvent.isAllDay,
              location: initialEvent.location ?? null,
              categories: initialEvent.categories ?? null
            },
            targetAccountId: parsedDest.accountId,
            targetGraphCalendarId: parsedDest.graphCalendarId,
            mode: 'move',
            payloadOverride
          })
        } else {
          await window.mailClient.calendar.updateEvent({
            accountId,
            graphEventId: gid,
            graphCalendarId: initialEvent.graphCalendarId ?? null,
            ...payloadOverride
          })
        }
        const prevIcon = initialEvent.icon?.trim() || null
        const nextIcon = eventIconId?.trim() || null
        if ((prevIcon ?? '') !== (nextIcon ?? '')) {
          await window.mailClient.calendar.patchEventIcon({
            accountId: initialEvent.accountId,
            graphEventId: gid,
            iconId: nextIcon
          })
        }
      }
      onSaved()
      onClose()
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const isTaskCreate = mode === 'create' && createKind === 'task'
  const submitDisabled =
    busy ||
    (isTaskCreate
      ? taskAccounts.length === 0 ||
        !taskAccountId ||
        !taskListId ||
        !subject.trim() ||
        taskListsLoading
      : calendarAccounts.length === 0 ||
        ((mode === 'create' || mode === 'edit') && calendarsLoading) ||
        (mode === 'edit' && initialEvent?.calendarCanEdit === false) ||
        (mode === 'edit' && Boolean(initialEvent?.graphEventId) && msEventDetailsLoading))

  const submitLabel = isTaskCreate ? t('tasks.create.submit') : t('calendar.eventDialog.save')

  return (
    <div
      className="fixed inset-0 z-[100] flex justify-end bg-black/45 backdrop-blur-[2px]"
      onClick={onClose}
      onKeyDown={(ev): void => {
        if (ev.key === 'Escape') onClose()
      }}
      role="presentation"
    >
      <aside
        ref={panelRef}
        className="calendar-event-panel flex h-[100dvh] max-h-[100dvh] w-full max-w-[630px] flex-col overflow-hidden border-l border-border bg-card text-foreground shadow-2xl"
        onClick={(ev): void => ev.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
          {mode === 'create' && taskAccounts.length > 0 ? (
            <div>
              <span className="sr-only">{t('calendar.eventDialog.kindLabel')}</span>
              <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={(): void => handleCreateKindChange('event')}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors',
                    createKind === 'event'
                      ? 'bg-secondary text-foreground'
                      : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                  )}
                >
                  {t('calendar.eventDialog.eventKindName')}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={(): void => handleCreateKindChange('task')}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors',
                    createKind === 'task'
                      ? 'bg-secondary text-foreground'
                      : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                  )}
                >
                  {t('calendar.eventDialog.taskKindName')}
                </button>
              </div>
            </div>
          ) : (
            <span className="text-[13px] font-medium text-muted-foreground">
              {t('calendar.eventDialog.panelTitle')}
            </span>
          )}
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              className="rounded-md p-1.5 text-muted-foreground opacity-50"
              tabIndex={-1}
              aria-hidden
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="rounded-md p-1.5 text-muted-foreground opacity-50"
              tabIndex={-1}
              aria-hidden
            >
              <LayoutPanelLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label={t('calendar.eventDialog.closeAria')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(ev): void => void handleSubmit(ev)}
        >
          <div className="min-h-0 flex-1 space-y-0 overflow-y-auto px-4 py-3">
            <div className="flex items-start gap-2 border-b border-border pb-3">
              {mode === 'create' && createKind === 'task' ? (
                <CheckSquare className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <CalendarEventIconPicker
                  layout="compact"
                  iconId={eventIconId}
                  title={subject}
                  disabled={eventFieldsLocked}
                  onIconChange={setEventIconId}
                />
              )}
              <input
                type="text"
                value={subject}
                onChange={(e): void => setSubject(e.target.value)}
                disabled={eventFieldsLocked}
                placeholder={
                  mode === 'create' && createKind === 'task'
                    ? t('calendar.eventDialog.taskTitlePlaceholder')
                    : t('calendar.eventDialog.titlePlaceholder')
                }
                aria-label={t('calendar.eventDialog.titleAria')}
                className="min-w-0 flex-1 rounded-md border border-border/60 bg-secondary/20 px-2.5 py-2 text-[17px] font-semibold leading-snug text-foreground outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>

            {mode === 'create' && createKind === 'task' && taskAccounts.length > 0 ? (
              <div className="border-b border-border py-3">
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t('calendar.eventDialog.taskDestinationHeadingShort')}
                </div>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                  {t('calendar.eventDialog.taskDestinationHelpBody')}
                </p>
                <label className="mt-2 block space-y-1">
                  <span className="text-[11px] text-muted-foreground">{t('tasks.create.account')}</span>
                  <select
                    value={taskAccountId}
                    disabled={busy || taskListsLoading}
                    onChange={(e): void => setTaskAccountId(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-2 py-2 text-[13px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {taskAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {cloudTaskAccountOptionLabel(a)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="mt-2 block space-y-1">
                  <span className="text-[11px] text-muted-foreground">{t('tasks.create.list')}</span>
                  <select
                    value={taskListId}
                    disabled={busy || taskListsLoading || taskLists.length === 0}
                    onChange={(e): void => setTaskListId(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-2 py-2 text-[13px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {taskListsLoading ? (
                      <option value="">{t('calendar.eventDialog.loadingShort')}</option>
                    ) : (
                      taskLists.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))
                    )}
                  </select>
                </label>
              </div>
            ) : null}

            {mode === 'create' && createKind === 'event' && calendarAccounts.length > 0 ? (
              <div className="border-b border-border py-3">
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t('calendar.eventDialog.destinationHeadingShort')}
                </div>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                  {t('calendar.eventDialog.destinationHelpBody')}
                </p>
                <select
                  value={destinationSelectValue}
                  disabled={false || calendarsLoading}
                  onChange={(e): void => {
                    const v = e.target.value
                    setDestinationSelectValue(v)
                    const parsed = parseCalendarDestinationKey(v)
                    if (parsed) {
                      setAccountId(parsed.accountId)
                      setGraphCalendarId(parsed.graphCalendarId)
                    }
                  }}
                  aria-label={t('calendar.eventDialog.targetCalendarAria')}
                  className="mt-2 w-full rounded-md border border-border bg-background px-2 py-2 text-[13px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {calendarsLoading ? (
                    <option value="">{t('calendar.eventDialog.submitLoadingCalendars')}</option>
                  ) : (
                    calendarsByAccount.map(({ account, calendars }) => {
                      const accLabel = destinationAccountOptgroupLabel(account)
                      return (
                        <optgroup key={account.id} label={accLabel}>
                          {calendars.length === 0 ? (
                            <option value={calendarDestinationKey(account.id, '')}>
                              {t('calendar.eventDialog.primaryCalendarStandard')}
                            </option>
                          ) : (
                            calendars.map((c) => (
                              <option
                                key={`${account.id}:${c.id}`}
                                value={calendarDestinationKey(account.id, c.id)}
                              >
                                {c.name}
                                {c.isDefaultCalendar ? t('calendar.eventDialog.standardCalendarSuffix') : ''}
                              </option>
                            ))
                          )}
                        </optgroup>
                      )
                    })
                  )}
                </select>
              </div>
            ) : null}

            {mode === 'create' && createKind === 'task' ? (
              <div className="border-b border-border py-3 space-y-3">
                <div className="mb-1 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <CheckSquare className="h-3.5 w-3.5 shrink-0" />
                  {t('tasks.create.planned')}
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block space-y-1 text-[11px]">
                    <span className="text-muted-foreground">{t('tasks.create.plannedStart')}</span>
                    <input
                      type="datetime-local"
                      value={taskPlannedStart}
                      onChange={(e): void => setTaskPlannedStart(e.target.value)}
                      disabled={busy}
                      className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-[13px]"
                    />
                  </label>
                  <label className="block space-y-1 text-[11px]">
                    <span className="text-muted-foreground">{t('tasks.create.plannedEnd')}</span>
                    <input
                      type="datetime-local"
                      value={taskPlannedEnd}
                      onChange={(e): void => setTaskPlannedEnd(e.target.value)}
                      disabled={busy}
                      className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-[13px]"
                    />
                  </label>
                </div>
                <label className="block space-y-1 text-[11px]">
                  <span className="text-muted-foreground">{t('tasks.create.due')}</span>
                  <input
                    type="date"
                    value={taskDue}
                    onChange={(e): void => setTaskDue(e.target.value)}
                    disabled={busy}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-[13px]"
                  />
                </label>
                <label className="block space-y-1 text-[11px]">
                  <span className="text-muted-foreground">{t('tasks.create.notes')}</span>
                  <textarea
                    value={taskNotes}
                    onChange={(e): void => setTaskNotes(e.target.value)}
                    disabled={busy}
                    rows={4}
                    className="w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-[13px]"
                  />
                </label>
              </div>
            ) : (
            <div className="border-b border-border py-3">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
                {t('calendar.eventDialog.appointmentHeading')}
              </div>

              {!isAllDay && timedDisplay ? (
                <>
                  <div className="grid w-fit max-w-full grid-cols-[auto_auto_auto_1fr] items-center gap-x-2 gap-y-1.5 text-[14px]">
                    <button
                      type="button"
                      disabled={eventFieldsLocked}
                      aria-label={t('calendar.eventDialog.editStartTimeAria')}
                      onClick={(ev): void => openSchedulePicker('startTime', ev.currentTarget)}
                      className={fieldChipClass(eventFieldsLocked)}
                    >
                      {timedDisplay.startHm}
                    </button>
                    <span className="text-muted-foreground" aria-hidden>
                      →
                    </span>
                    <button
                      type="button"
                      disabled={eventFieldsLocked}
                      aria-label={t('calendar.eventDialog.editEndTimeAria')}
                      onClick={(ev): void => openSchedulePicker('endTime', ev.currentTarget)}
                      className={fieldChipClass(eventFieldsLocked)}
                    >
                      {timedDisplay.endHm}
                    </button>
                    <span className="min-w-0 text-[13px] tabular-nums text-muted-foreground">
                      · {timedDisplay.duration}
                    </span>
                    <button
                      type="button"
                      disabled={eventFieldsLocked}
                      aria-label={t('calendar.eventDialog.editStartDateAria')}
                      onClick={(ev): void => openSchedulePicker('startDate', ev.currentTarget)}
                      className={fieldChipClass(eventFieldsLocked)}
                    >
                      {timedDisplay.startDateChip}
                    </button>
                    <span className="select-none text-transparent" aria-hidden>
                      →
                    </span>
                    <button
                      type="button"
                      disabled={eventFieldsLocked}
                      aria-label={t('calendar.eventDialog.editEndDateAria')}
                      onClick={(ev): void => openSchedulePicker('endDate', ev.currentTarget)}
                      className={fieldChipClass(eventFieldsLocked)}
                    >
                      {timedDisplay.endDateChip}
                    </button>
                    <span aria-hidden className="min-w-0" />
                  </div>
                </>
              ) : isAllDay && allDayDisplay ? (
                <>
                  <p className="text-[12px] font-medium text-muted-foreground">{t('calendar.eventDialog.allDay')}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-2">
                    <button
                      type="button"
                      disabled={eventFieldsLocked}
                      aria-label={t('calendar.eventDialog.editAllDayStartAria')}
                      onClick={(ev): void => openSchedulePicker('dayStart', ev.currentTarget)}
                      className={fieldChipClass(eventFieldsLocked)}
                    >
                      {allDayDisplay.startChip}
                    </button>
                    <span className="text-muted-foreground" aria-hidden>
                      →
                    </span>
                    <button
                      type="button"
                      disabled={eventFieldsLocked}
                      aria-label={t('calendar.eventDialog.editAllDayEndAria')}
                      onClick={(ev): void => openSchedulePicker('dayEnd', ev.currentTarget)}
                      className={fieldChipClass(eventFieldsLocked)}
                    >
                      {allDayDisplay.endChip}
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-[13px] text-muted-foreground">{t('calendar.eventDialog.summaryDash')}</p>
              )}

              <div className="mt-3 flex flex-col gap-2 text-[12px]">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <button
                    type="button"
                    disabled={eventFieldsLocked}
                    onClick={(): void => {
                      setSchedulePicker(null)
                      setSchedulePickerPos(null)
                      setIsAllDay((prev) => {
                        if (!prev) {
                          if (dtStart && dtEnd) {
                            const s = new Date(dtStart)
                            const e = new Date(dtEnd)
                            if (!Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime())) {
                              const startDay = format(s, 'yyyy-MM-dd')
                              const endDay = format(e, 'yyyy-MM-dd')
                              const lastInclusive = endDay >= startDay ? endDay : startDay
                              setDayStart(startDay)
                              setDayEnd(
                                format(addDays(parseISO(`${lastInclusive}T12:00:00`), 1), 'yyyy-MM-dd')
                              )
                            }
                          }
                          return true
                        }
                        if (dayStart) {
                          const base = parseISO(`${dayStart}T09:00:00`)
                          setDtStart(dateToDatetimeLocal(base))
                          setDtEnd(dateToDatetimeLocal(addHours(base, 1)))
                        }
                        return false
                      })
                    }}
                    className={cn(
                      'font-medium transition-colors',
                      isAllDay ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {t('calendar.eventDialog.allDay')}
                  </button>
                  <span className="text-muted-foreground" title={t('calendar.eventDialog.timezoneTitle')}>
                    {t('calendar.eventDialog.timezonePrefix')}{' '}
                    <span className="text-foreground/90">{tzDisplay}</span>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={(): void => setShowAdvancedDateTime((s) => !s)}
                  className="w-fit text-left text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  {showAdvancedDateTime
                    ? t('calendar.eventDialog.advancedDateTimeHide')
                    : t('calendar.eventDialog.advancedDateTime')}
                </button>
              </div>
              {showAdvancedDateTime && (
                <div className="mt-3 space-y-2 rounded-lg border border-border/50 bg-secondary/25 p-3">
                  {isAllDay ? (
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-[11px]">
                        <span className="mb-1 block text-muted-foreground">
                          {t('calendar.eventDialog.labelStartDate')}
                        </span>
                        <input
                          type="date"
                          value={dayStart}
                          onChange={(e): void => setDayStart(e.target.value)}
                          disabled={eventFieldsLocked}
                          className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
                        />
                      </label>
                      <label className="text-[11px]">
                        <span className="mb-1 block text-muted-foreground">
                          {t('calendar.eventDialog.labelEndExclusive')}
                        </span>
                        <input
                          type="date"
                          value={dayEnd}
                          onChange={(e): void => setDayEnd(e.target.value)}
                          disabled={eventFieldsLocked}
                          className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
                        />
                      </label>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-[11px]">
                        <span className="mb-1 block text-muted-foreground">
                          {t('calendar.eventDialog.labelBegin')}
                        </span>
                        <input
                          type="datetime-local"
                          value={dtStart}
                          onChange={(e): void => setDtStart(e.target.value)}
                          disabled={eventFieldsLocked}
                          className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
                        />
                      </label>
                      <label className="text-[11px]">
                        <span className="mb-1 block text-muted-foreground">
                          {t('calendar.eventDialog.labelEnd')}
                        </span>
                        <input
                          type="datetime-local"
                          value={dtEnd}
                          onChange={(e): void => setDtEnd(e.target.value)}
                          disabled={eventFieldsLocked}
                          className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
                        />
                      </label>
                    </div>
                  )}
                </div>
              )}
            </div>
            )}

            {mode === 'create' && createKind === 'event' ? (
              <div className="border-b border-border py-3">
                <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <Repeat2 className="h-3.5 w-3.5" />
                  {t('calendar.eventDialog.recurrenceHeading')}
                </div>
                <label className="block text-[11px] text-muted-foreground" htmlFor="cal-recur-freq">
                  {t('calendar.eventDialog.recurrenceFreqLabel')}
                </label>
                <select
                  id="cal-recur-freq"
                  value={recurFreq}
                  disabled={eventFieldsLocked}
                  onChange={(e): void => {
                    const v = e.target.value
                    if (
                      v === 'none' ||
                      v === 'daily' ||
                      v === 'weekly' ||
                      v === 'biweekly' ||
                      v === 'monthly' ||
                      v === 'yearly'
                    ) {
                      setRecurFreq(v)
                    }
                  }}
                  className="mt-1 w-full rounded-md border border-border bg-background px-2 py-2 text-[13px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="none">{t('calendar.eventDialog.recurrenceFreqNone')}</option>
                  <option value="daily">{t('calendar.eventDialog.recurrenceFreqDaily')}</option>
                  <option value="weekly">{t('calendar.eventDialog.recurrenceFreqWeekly')}</option>
                  <option value="biweekly">{t('calendar.eventDialog.recurrenceFreqBiweekly')}</option>
                  <option value="monthly">{t('calendar.eventDialog.recurrenceFreqMonthly')}</option>
                  <option value="yearly">{t('calendar.eventDialog.recurrenceFreqYearly')}</option>
                </select>
                {recurFreq !== 'none' ? (
                  <div className="mt-3 space-y-2">
                    <label className="block text-[11px] text-muted-foreground" htmlFor="cal-recur-end">
                      {t('calendar.eventDialog.recurrenceEndLabel')}
                    </label>
                    <select
                      id="cal-recur-end"
                      value={recurEnd}
                      disabled={eventFieldsLocked}
                      onChange={(e): void => {
                        const v = e.target.value
                        if (v === 'never' || v === 'until' || v === 'count') setRecurEnd(v)
                      }}
                      className="w-full rounded-md border border-border bg-background px-2 py-2 text-[13px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <option value="never">{t('calendar.eventDialog.recurrenceEndNever')}</option>
                      <option value="until">{t('calendar.eventDialog.recurrenceEndUntil')}</option>
                      <option value="count">{t('calendar.eventDialog.recurrenceEndCount')}</option>
                    </select>
                    {recurEnd === 'until' ? (
                      <label className="block text-[11px]">
                        <span className="mb-1 block text-muted-foreground">
                          {t('calendar.eventDialog.recurrenceUntilLabel')}
                        </span>
                        <input
                          type="date"
                          value={recurUntilDate}
                          onChange={(e): void => setRecurUntilDate(e.target.value)}
                          disabled={eventFieldsLocked}
                          className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
                        />
                      </label>
                    ) : null}
                    {recurEnd === 'count' ? (
                      <label className="block text-[11px]">
                        <span className="mb-1 block text-muted-foreground">
                          {t('calendar.eventDialog.recurrenceCountLabel')}
                        </span>
                        <input
                          type="number"
                          min={1}
                          max={999}
                          value={recurCount}
                          onChange={(e): void => setRecurCount(e.target.value)}
                          disabled={eventFieldsLocked}
                          className="w-full rounded border border-border bg-background px-2 py-1 text-xs tabular-nums"
                        />
                      </label>
                    ) : null}
                    <p className="text-[10px] leading-snug text-muted-foreground">
                      {t('calendar.eventDialog.recurrenceHint')}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}

            {(mode !== 'create' || createKind === 'event') &&
            (selectedAccount?.provider === 'google' ? (
              <div className="border-b border-border py-1">
                <PropertyRow icon={Users} label={t('calendar.eventDialog.attendeesRowLabel')}>
                  <span className="text-[11px] text-muted-foreground">
                    {t('calendar.eventDialog.googleTeamsAttendeesHint')}
                  </span>
                </PropertyRow>
              </div>
            ) : selectedAccount?.provider === 'microsoft' ? (
              <div className="border-b border-border py-1">
                <PropertyRow icon={Video} label={t('calendar.eventDialog.teamsMeetingRowLabel')}>
                  <div className="space-y-1.5">
                    <label className="flex cursor-pointer items-center gap-2 text-[13px]">
                      <input
                        type="checkbox"
                        checked={teamsMeeting}
                        disabled={isAllDay || msTeamsUiLocked}
                        onChange={(e): void => setTeamsMeeting(e.target.checked)}
                        className="rounded border-border"
                      />
                      <span>{t('calendar.eventDialog.teamsMeetingToggle')}</span>
                    </label>
                    {isAllDay ? (
                      <p className="text-[10px] text-muted-foreground">{t('calendar.eventDialog.teamsDisabledAllDay')}</p>
                    ) : null}
                    {msEventDetailsError ? (
                      <p className="text-[10px] text-destructive" role="status">
                        {msEventDetailsError}
                      </p>
                    ) : null}
                  </div>
                </PropertyRow>
                <PropertyRow icon={Users} label={t('calendar.eventDialog.attendeesRowLabel')}>
                  <textarea
                    value={attendeeInput}
                    onChange={(e): void => setAttendeeInput(e.target.value)}
                    disabled={msTeamsUiLocked}
                    placeholder={t('calendar.eventDialog.attendeesPlaceholder')}
                    rows={3}
                    className="mt-1 w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 font-mono text-[12px] text-foreground outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </PropertyRow>
              </div>
            ) : null)}

            {mode === 'edit' && calendarAccounts.length > 0 ? (
              <div className="border-b border-border py-3">
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t('calendar.eventDialog.destinationHeadingShort')}
                </div>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                  {t('calendar.eventDialog.destinationMoveHelp')}
                </p>
                <select
                  value={destinationSelectValue}
                  disabled={busy || calendarsLoading || initialEvent?.calendarCanEdit === false}
                  onChange={(e): void => {
                    const v = e.target.value
                    setDestinationSelectValue(v)
                    const parsed = parseCalendarDestinationKey(v)
                    if (parsed) {
                      setAccountId(parsed.accountId)
                      setGraphCalendarId(parsed.graphCalendarId)
                    }
                  }}
                  aria-label={t('calendar.eventDialog.targetCalendarAria')}
                  className="mt-2 w-full rounded-md border border-border bg-background px-2 py-2 text-[13px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {calendarsLoading ? (
                    <option value="">{t('calendar.eventDialog.submitLoadingCalendars')}</option>
                  ) : (
                    calendarsByAccount.map(({ account, calendars }) => {
                      const accLabel = destinationAccountOptgroupLabel(account)
                      return (
                        <optgroup key={account.id} label={accLabel}>
                          {calendars.length === 0 ? (
                            <option value={calendarDestinationKey(account.id, '')}>
                              {t('calendar.eventDialog.primaryCalendarStandard')}
                            </option>
                          ) : (
                            calendars.map((c) => (
                              <option
                                key={`${account.id}:${c.id}`}
                                value={calendarDestinationKey(account.id, c.id)}
                              >
                                {c.name}
                                {c.isDefaultCalendar ? t('calendar.eventDialog.standardCalendarSuffix') : ''}
                              </option>
                            ))
                          )}
                        </optgroup>
                      )
                    })
                  )}
                </select>
              </div>
            ) : null}

            {(mode !== 'create' || createKind === 'event') ? (
            <div className="border-b border-border py-1">
              <PropertyRow icon={CircleDot} label={t('calendar.eventDialog.categories')}>
                {selectedAccount?.provider !== 'microsoft' ? (
                  <span className="text-[11px] text-muted-foreground">
                    {t('calendar.eventDialog.categoriesOutlookOnly')}
                  </span>
                ) : mastersLoading && categoryChoiceNames.length === 0 ? (
                  <span className="inline-flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t('calendar.eventDialog.loadingShort')}
                  </span>
                ) : (
                  <div className="space-y-2">
                    {categoryChoiceNames.length === 0 ? (
                      <p className="text-[11px] leading-snug text-muted-foreground">
                        {t('calendar.eventDialog.categoriesEmptyOutlook')}
                      </p>
                    ) : (
                      <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto pr-0.5">
                        {categoryChoiceNames.map((name) => {
                          const on = eventCategories.includes(name)
                          const dotClass = outlookCategoryDotClass(categoryColorByName.get(name))
                          return (
                            <button
                              key={name}
                              type="button"
                              disabled={busy}
                              onClick={(): void => toggleEventCategory(name)}
                              className={cn(
                                'inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors',
                                on
                                  ? 'border-primary/40 bg-primary/15 text-foreground'
                                  : 'border-border/80 bg-secondary/30 text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
                              )}
                              title={name}
                            >
                              <span className={cn('h-2 w-2 shrink-0 rounded-full', dotClass)} aria-hidden />
                              <span className="truncate">{name}</span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                    <p className="text-[10px] leading-snug text-muted-foreground">
                      {t('calendar.eventDialog.categoriesMasterHint')}
                    </p>
                  </div>
                )}
              </PropertyRow>
              <PropertyRow icon={MapPin} label={t('calendar.eventDialog.locationRowLabel')}>
                <input
                  type="text"
                  value={location}
                  onChange={(e): void => setLocation(e.target.value)}
                  disabled={eventFieldsLocked}
                  placeholder={t('calendar.eventDialog.locationPlaceholder')}
                  className="mt-0.5 w-full rounded-md border border-border/60 bg-secondary/20 px-2 py-1.5 text-[13px] text-foreground outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </PropertyRow>
              <PropertyRow icon={AlignLeft} label={t('calendar.eventDialog.description')}>
                <div className="mt-1 min-w-0 space-y-2">
                  {mode === 'edit' && Boolean(initialEvent?.graphEventId) && msEventDetailsLoading ? (
                    <p className="inline-flex items-center gap-2 text-[11px] text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {t('calendar.eventDialog.loadingEventDetails')}
                    </p>
                  ) : null}
                  {msEventDetailsError && mode === 'edit' && initialEvent?.graphEventId ? (
                    <p className="text-[10px] text-destructive" role="alert">
                      {msEventDetailsError}
                    </p>
                  ) : null}
                  {eventFieldsLocked ? (
                    <CalendarEventDescriptionPreview
                      html={descriptionHtml}
                      viewerTheme={viewerTheme}
                      className="w-full"
                    />
                  ) : (
                    <TipTapBody
                      valueHtml={descriptionHtml}
                      onChangeHtml={setDescriptionHtml}
                      placeholder={t('calendar.eventDialog.descriptionEditorPlaceholder')}
                      editorMinHeightClass="min-h-[440px]"
                      className="min-h-[520px] rounded-md border border-border bg-background !border-t-0"
                    />
                  )}
                </div>
              </PropertyRow>
            </div>
            ) : null}

            {mode === 'edit' && initialEvent?.graphEventId ? (
              <div className="border-b border-border py-3">
                <ObjectNoteEditor
                  variant="section"
                  layout="toggle"
                  sectionCollapsedDefault
                  target={{
                    kind: 'calendar',
                    accountId: initialEvent.accountId,
                    calendarSource: initialEvent.source,
                    calendarRemoteId: initialEvent.graphCalendarId?.trim() || 'default',
                    eventRemoteId: initialEvent.graphEventId,
                    title: subject.trim() || initialEvent.title,
                    eventTitleSnapshot: subject.trim() || initialEvent.title,
                    eventStartIsoSnapshot: initialEvent.startIso
                  }}
                />
              </div>
            ) : null}

            {mode === 'edit' && initialEvent && (initialEvent.webLink || initialEvent.joinUrl) && (
              <div className="flex flex-wrap gap-2 border-b border-border py-3">
                {initialEvent.webLink && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground"
                    onClick={(): void => {
                      void openExternalUrl(initialEvent.webLink!).catch(() => undefined)
                    }}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {t('calendar.eventDialog.openInOutlook')}
                  </button>
                )}
                {initialEvent.joinUrl && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground"
                    onClick={(): void => {
                      void openExternalUrl(initialEvent.joinUrl!).catch(() => undefined)
                    }}
                  >
                    <Video className="h-3.5 w-3.5" />
                    {t('calendar.eventDialog.joinTeamsShort')}
                  </button>
                )}
              </div>
            )}

            {localError && (
              <p className="py-2 text-[11px] text-destructive" role="alert">
                {localError}
              </p>
            )}
          </div>

          <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-card px-4 py-3 shadow-[0_-8px_24px_-4px_hsl(0_0%_0%/0.25)]">
            <button
              type="button"
              onClick={onClose}
              className="text-[13px] font-medium text-muted-foreground hover:text-foreground"
            >
              {t('calendar.eventDialog.cancel')}
            </button>
            <button
              type="submit"
              disabled={submitDisabled}
              title={
                isTaskCreate
                  ? taskAccounts.length === 0
                    ? t('tasks.create.noAccounts')
                    : taskListsLoading
                      ? t('calendar.eventDialog.loadingShort')
                      : undefined
                  : calendarAccounts.length === 0
                    ? t('calendar.eventDialog.submitNoAccount')
                    : mode === 'create' && calendarsLoading
                      ? t('calendar.eventDialog.submitLoadingCalendars')
                      : mode === 'edit' && initialEvent?.calendarCanEdit === false
                        ? t('calendar.eventDialog.submitReadOnly')
                        : mode === 'edit' && Boolean(initialEvent?.graphEventId) && msEventDetailsLoading
                          ? t('calendar.eventDialog.loadingEventDetails')
                          : undefined
              }
              className={cn(
                'inline-flex min-w-[100px] items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground hover:bg-primary/90',
                submitDisabled && 'cursor-not-allowed opacity-50'
              )}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {submitLabel}
            </button>
          </footer>
        </form>
      </aside>

      {schedulePicker && schedulePickerPos ? (
        <div
          ref={schedulePickerRef}
          role="dialog"
          aria-label={t('calendar.eventDialog.schedulePickerAria')}
          className="fixed z-[220] w-[208px] max-w-[calc(100vw-16px)] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl"
          style={{ top: schedulePickerPos.top, left: schedulePickerPos.left }}
          onMouseDown={(ev): void => ev.stopPropagation()}
          onClick={(ev): void => ev.stopPropagation()}
        >
          {(schedulePicker === 'startTime' || schedulePicker === 'endTime') && (
            <ul className="max-h-60 overflow-y-auto py-1">
              {timePickerOptions.map((hm) => {
                const sel = hm === timePickerCurrentHm
                return (
                  <li key={`${schedulePicker}-${hm}`}>
                    <button
                      type="button"
                      ref={sel ? selectedTimeOptionRef : undefined}
                      className={cn(
                        'w-full rounded-md px-2.5 py-1.5 text-left text-[13px] tabular-nums transition-colors',
                        sel
                          ? 'bg-primary/15 font-medium text-foreground'
                          : 'text-foreground hover:bg-secondary/80'
                      )}
                      onClick={(): void => {
                        if (schedulePicker === 'startTime') {
                          const nextStart = mergeTimeIntoStart(dtStart, hm)
                          setDtStart(nextStart)
                          if (new Date(dtEnd).getTime() <= new Date(nextStart).getTime()) {
                            setDtEnd(dateToDatetimeLocal(addMinutes(new Date(nextStart), 15)))
                          }
                        } else {
                          setDtEnd(mergeTimeIntoEnd(dtStart, dtEnd, hm))
                        }
                        closeSchedulePicker()
                      }}
                    >
                      {hm}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {schedulePicker === 'startDate' && timedDisplay ? (
            <div className="p-2">
              <input
                ref={scheduleDateInputRef}
                type="date"
                value={timedDisplay.startYmd}
                disabled={eventFieldsLocked}
                onChange={(ev): void => {
                  const v = ev.target.value
                  if (!v) return
                  const nextStart = mergeYmdIntoDatetimeLocal(dtStart, v)
                  setDtStart(nextStart)
                  if (new Date(dtEnd).getTime() <= new Date(nextStart).getTime()) {
                    setDtEnd(dateToDatetimeLocal(addMinutes(new Date(nextStart), 15)))
                  }
                  closeSchedulePicker()
                }}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              />
            </div>
          ) : null}

          {schedulePicker === 'endDate' && timedDisplay ? (
            <div className="p-2">
              <input
                ref={scheduleDateInputRef}
                type="date"
                value={timedDisplay.endYmd}
                min={timedDisplay.startYmd}
                disabled={eventFieldsLocked}
                onChange={(ev): void => {
                  const v = ev.target.value
                  if (!v) return
                  const nextEnd = mergeYmdIntoDatetimeLocal(dtEnd, v)
                  if (new Date(nextEnd).getTime() <= new Date(dtStart).getTime()) {
                    setDtEnd(dateToDatetimeLocal(addMinutes(new Date(dtStart), 15)))
                  } else {
                    setDtEnd(nextEnd)
                  }
                  closeSchedulePicker()
                }}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              />
            </div>
          ) : null}

          {schedulePicker === 'dayStart' ? (
            <div className="p-2">
              <input
                ref={scheduleDateInputRef}
                type="date"
                value={dayStart}
                disabled={eventFieldsLocked}
                onChange={(ev): void => {
                  const v = ev.target.value
                  if (!v) return
                  setDayStart(v)
                  if (dayEnd <= v) {
                    setDayEnd(format(addDays(parseISO(`${v}T12:00:00`), 1), 'yyyy-MM-dd'))
                  }
                  closeSchedulePicker()
                }}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              />
            </div>
          ) : null}

          {schedulePicker === 'dayEnd' && dayStart && dayEnd ? (
            <div className="space-y-1.5 p-2">
              <p className="text-[10px] leading-snug text-muted-foreground">
                {t('calendar.eventDialog.allDayEndLastDayHint')}
              </p>
              <input
                ref={scheduleDateInputRef}
                type="date"
                min={dayStart}
                value={format(addDays(parseISO(`${dayEnd}T12:00:00`), -1), 'yyyy-MM-dd')}
                disabled={eventFieldsLocked}
                onChange={(ev): void => {
                  const v = ev.target.value
                  if (!v) return
                  const excl = format(addDays(parseISO(`${v}T12:00:00`), 1), 'yyyy-MM-dd')
                  if (excl <= dayStart) {
                    setDayEnd(format(addDays(parseISO(`${dayStart}T12:00:00`), 1), 'yyyy-MM-dd'))
                  } else {
                    setDayEnd(excl)
                  }
                  closeSchedulePicker()
                }}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
