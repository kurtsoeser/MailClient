import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { addDays, addMinutes, format, parseISO, startOfDay } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { Calendar as CalendarIcon, CheckSquare, FileText, Loader2, X } from 'lucide-react'
import type { CalendarGraphCalendarRow, ConnectedAccount, TaskListRow } from '@shared/types'
import { cloudTaskStableKey } from '@shared/work-item-keys'
import { applyCloudTaskPersistTarget } from '@/app/calendar/apply-cloud-task-persist'
import {
  calendarDestinationKey,
  destinationAccountOptgroupLabel,
  isWritableCalendarTarget,
  parseCalendarDestinationKey
} from '@/app/calendar/calendar-create-destination'
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

export type CalendarCreateQuickKind = 'event' | 'task'

export type CalendarCreateQuickDraft = {
  createKind: CalendarCreateQuickKind
  subject: string
  range: CalendarCreateRange
  accountId: string
  graphCalendarId: string
  taskListId: string
  isAllDay: boolean
}

function pickDefaultTaskListId(rows: TaskListRow[]): string | null {
  if (rows.length === 0) return null
  return rows.find((r) => r.isDefault)?.id ?? rows[0]!.id
}

function resolvePreferredTaskAccountId(
  taskAccounts: ConnectedAccount[],
  defaultAccountId?: string
): string {
  if (defaultAccountId && taskAccounts.some((a) => a.id === defaultAccountId)) {
    return defaultAccountId
  }
  const stored = readTasksCalendarCreateAccountId()
  if (stored && taskAccounts.some((a) => a.id === stored)) return stored
  return taskAccounts[0]?.id ?? ''
}

export interface CalendarCreateQuickPopoverProps {
  anchor: { x: number; y: number }
  range: CalendarCreateRange
  calendarAccounts: ConnectedAccount[]
  taskAccounts: ConnectedAccount[]
  defaultAccountId?: string
  loadListsForAccount: (accountId: string) => Promise<TaskListRow[]>
  onClose: () => void
  onSaved: () => void
  onOpenDetails: (draft: CalendarCreateQuickDraft) => void
  /** Hält den Kalender-Platzhalter mit der gewählten Zeit synchron. */
  onRangeChange?: (range: CalendarCreateRange) => void
}

export function CalendarCreateQuickPopover({
  anchor,
  range,
  calendarAccounts,
  taskAccounts,
  defaultAccountId,
  loadListsForAccount,
  onClose,
  onSaved,
  onOpenDetails,
  onRangeChange
}: CalendarCreateQuickPopoverProps): JSX.Element {
  const { t, i18n } = useTranslation()
  const panelRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

  const [createKind, setCreateKind] = useState<CalendarCreateQuickKind>(
    calendarAccounts.length > 0 ? 'event' : 'task'
  )
  const [subject, setSubject] = useState('')
  const [isAllDay, setIsAllDay] = useState(range.allDay)
  const [rangeStart, setRangeStart] = useState(() => new Date(range.start))
  const [rangeEnd, setRangeEnd] = useState(() => new Date(range.end))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [accountId, setAccountId] = useState('')
  const [graphCalendarId, setGraphCalendarId] = useState('')
  const [destinationSelectValue, setDestinationSelectValue] = useState('')
  const [calendarsByAccount, setCalendarsByAccount] = useState<
    { account: ConnectedAccount; calendars: CalendarGraphCalendarRow[] }[]
  >([])
  const [calendarsLoading, setCalendarsLoading] = useState(false)

  const [taskAccountId, setTaskAccountId] = useState('')
  const [taskListId, setTaskListId] = useState('')
  const [taskLists, setTaskLists] = useState<TaskListRow[]>([])
  const [taskListsLoading, setTaskListsLoading] = useState(false)

  const calendarAccountIdsKey = useMemo(
    () =>
      calendarAccounts
        .map((a) => a.id)
        .sort()
        .join('|'),
    [calendarAccounts]
  )

  const currentRange = useMemo(
    (): CalendarCreateRange => ({
      start: rangeStart,
      end: rangeEnd,
      allDay: isAllDay
    }),
    [rangeStart, rangeEnd, isAllDay]
  )

  useEffect(() => {
    onRangeChange?.(currentRange)
  }, [currentRange, onRangeChange])

  useEffect(() => {
    setIsAllDay(range.allDay)
    setRangeStart(new Date(range.start))
    setRangeEnd(new Date(range.end))
    setSubject('')
    setError(null)
    setBusy(false)
    setCreateKind(calendarAccounts.length > 0 ? 'event' : 'task')
    const preferTaskAcc = resolvePreferredTaskAccountId(taskAccounts, defaultAccountId)
    setTaskAccountId(preferTaskAcc)
    setTaskListId('')
    setTaskLists([])
    window.setTimeout(() => titleRef.current?.focus(), 0)
    // Nur beim Öffnen (Popover wird bei jedem Quick-Create neu gemountet).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (createKind !== 'event' || calendarAccounts.length === 0) {
      setCalendarsByAccount([])
      setDestinationSelectValue('')
      return
    }
    let cancelled = false
    setCalendarsLoading(true)
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
        const preferAcc =
          defaultAccountId && calendarAccounts.some((a) => a.id === defaultAccountId)
            ? defaultAccountId
            : (calendarAccounts[0]?.id ?? '')
        const bundle = bundles.find((b) => b.account.id === preferAcc) ?? bundles[0]
        if (!bundle) {
          setDestinationSelectValue('')
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
  }, [createKind, calendarAccountIdsKey, defaultAccountId, calendarAccounts])

  useEffect(() => {
    if (createKind !== 'task' || !taskAccountId) {
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
        setTaskListId(pickDefaultTaskListId(rows) ?? '')
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
  }, [createKind, taskAccountId, loadListsForAccount])

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent): void {
      const el = panelRef.current
      if (!el || el.contains(e.target as Node)) return
      onClose()
    }
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKeyDown, true)
    return (): void => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [onClose])

  const toggleAllDay = useCallback((next: boolean): void => {
    if (next) {
      const s = startOfDay(rangeStart)
      let endExcl = startOfDay(rangeEnd)
      if (endExcl.getTime() <= s.getTime()) endExcl = addDays(s, 1)
      setRangeStart(s)
      setRangeEnd(endExcl)
    } else {
      const s = new Date(rangeStart)
      if (s.getHours() === 0 && s.getMinutes() === 0 && s.getSeconds() === 0) {
        s.setHours(9, 0, 0, 0)
      }
      let e = new Date(rangeEnd)
      if (e.getTime() <= s.getTime()) e = addMinutes(s, 30)
      setRangeStart(s)
      setRangeEnd(e)
    }
    setIsAllDay(next)
  }, [rangeStart, rangeEnd])

  const validateRange = useCallback((): string | null => {
    if (isAllDay) {
      if (rangeEnd.getTime() <= rangeStart.getTime()) {
        return t('calendar.eventDialog.endAfterStartExclusive')
      }
      return null
    }
    if (rangeEnd.getTime() <= rangeStart.getTime()) {
      return t('calendar.eventDialog.endAfterStart')
    }
    return null
  }, [isAllDay, rangeStart, rangeEnd, t])

  const buildDraft = useCallback((): CalendarCreateQuickDraft | null => {
    if (!subject.trim()) return null
    if (createKind === 'event') {
      if (!parseCalendarDestinationKey(destinationSelectValue)) return null
      return {
        createKind: 'event',
        subject: subject.trim(),
        range: currentRange,
        accountId,
        graphCalendarId,
        taskListId: '',
        isAllDay
      }
    }
    if (!taskAccountId || !taskListId) return null
    return {
      createKind: 'task',
      subject: subject.trim(),
      range: currentRange,
      accountId: taskAccountId,
      graphCalendarId: '',
      taskListId,
      isAllDay
    }
  }, [
    subject,
    createKind,
    destinationSelectValue,
    accountId,
    graphCalendarId,
    taskAccountId,
    taskListId,
    currentRange,
    isAllDay
  ])

  async function handleSave(): Promise<void> {
    const rangeError = validateRange()
    if (rangeError) {
      setError(rangeError)
      return
    }
    const draft = buildDraft()
    if (!draft) {
      if (!subject.trim()) setError(t('calendar.eventDialog.enterTitle'))
      else if (createKind === 'task' && !taskListId) {
        setError(t('calendar.eventDialog.selectTaskList'))
      } else {
        setError(t('calendar.eventDialog.selectTargetCalendar'))
      }
      return
    }
    setBusy(true)
    setError(null)
    try {
      if (draft.createKind === 'task') {
        const sched = scheduleFromCalendarCreateRange(draft.range, timeZone)
        const dueIso = sched.dueDate.trim() ? `${sched.dueDate.trim()}T12:00:00.000Z` : null
        const plannedStartIso = datetimeLocalValueToIso(isoToDatetimeLocalValue(sched.plannedStartIso))
        const plannedEndIso = datetimeLocalValueToIso(isoToDatetimeLocalValue(sched.plannedEndIso))
        const row = await window.mailClient.tasks.createTask({
          accountId: draft.accountId,
          listId: draft.taskListId,
          title: draft.subject,
          notes: null,
          dueIso,
          completed: false
        })
        if (plannedStartIso && plannedEndIso) {
          const taskKey = cloudTaskStableKey(draft.accountId, draft.taskListId, row.id)
          await applyCloudTaskPersistTarget(
            { kind: 'planned', taskKey, plannedStartIso, plannedEndIso },
            { accountId: draft.accountId, listId: draft.taskListId, id: row.id },
            timeZone
          )
        }
        persistTasksCalendarCreateAccountId(draft.accountId)
      } else {
        let startIso: string
        let endIso: string
        if (draft.isAllDay) {
          startIso = format(draft.range.start, 'yyyy-MM-dd')
          endIso = format(draft.range.end, 'yyyy-MM-dd')
        } else {
          startIso = draft.range.start.toISOString()
          endIso = draft.range.end.toISOString()
        }
        await window.mailClient.calendar.createEvent({
          accountId: draft.accountId,
          graphCalendarId: draft.graphCalendarId.trim() || null,
          subject: draft.subject,
          startIso,
          endIso,
          isAllDay: draft.isAllDay,
          location: null,
          bodyHtml: null,
          categories: []
        })
      }
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const panelW = 320
  const panelMaxH = 480
  const style: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(window.innerWidth - panelW - 8, Math.max(8, anchor.x + 8)),
    top: Math.min(window.innerHeight - panelMaxH - 8, Math.max(8, anchor.y + 8)),
    zIndex: 115,
    width: panelW
  }

  const canSave =
    subject.trim().length > 0 &&
    !busy &&
    (createKind === 'event'
      ? Boolean(parseCalendarDestinationKey(destinationSelectValue)) && !calendarsLoading
      : Boolean(taskAccountId && taskListId && !taskListsLoading))

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-label={t('calendar.quickCreate.title')}
      style={style}
      className="overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl"
      onMouseDown={(e): void => e.stopPropagation()}
      onClick={(e): void => e.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        {calendarAccounts.length > 0 && taskAccounts.length > 0 ? (
          <div className="flex gap-0.5 rounded-md border border-border p-0.5">
            <button
              type="button"
              disabled={busy}
              onClick={(): void => setCreateKind('event')}
              className={cn(
                'rounded px-2 py-0.5 text-[11px] font-medium',
                createKind === 'event'
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t('calendar.eventDialog.eventKindName')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={(): void => setCreateKind('task')}
              className={cn(
                'rounded px-2 py-0.5 text-[11px] font-medium',
                createKind === 'task'
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t('calendar.eventDialog.taskKindName')}
            </button>
          </div>
        ) : (
          <span className="text-[11px] font-medium text-muted-foreground">
            {createKind === 'task'
              ? t('calendar.eventDialog.taskKindName')
              : t('calendar.eventDialog.eventKindName')}
          </span>
        )}
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label={t('calendar.eventDialog.closeAria')}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-3 p-3">
        <label className="flex items-center gap-2">
          {createKind === 'task' ? (
            <CheckSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <input
            ref={titleRef}
            type="text"
            value={subject}
            onChange={(e): void => setSubject(e.target.value)}
            onKeyDown={(e): void => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void handleSave()
              }
            }}
            disabled={busy}
            placeholder={t('calendar.quickCreate.titlePlaceholder')}
            className="min-w-0 flex-1 rounded-md border border-border/70 bg-background px-2 py-1.5 text-[14px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          />
        </label>

        <div className="space-y-2 rounded-lg border border-border/70 bg-secondary/20 px-2.5 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <CalendarIcon className="h-3.5 w-3.5" />
            <span>{t('calendar.quickCreate.whenLabel')}</span>
            </div>
            <button
            type="button"
            disabled={busy}
            onClick={(): void => toggleAllDay(!isAllDay)}
            className={cn(
              'text-[11px] font-medium',
              isAllDay ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {t('calendar.eventDialog.allDay')}
          </button>
        </div>
        {isAllDay ? (
          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-0.5">
              <span className="text-[10px] text-muted-foreground">
                {t('calendar.eventDialog.labelBegin')}
              </span>
              <input
                type="date"
                disabled={busy}
                value={format(rangeStart, 'yyyy-MM-dd')}
                onChange={(e): void => {
                  const v = e.target.value
                  if (!v) return
                  const nextStart = startOfDay(parseISO(v))
                  setRangeStart(nextStart)
                  if (rangeEnd.getTime() <= nextStart.getTime()) {
                    setRangeEnd(addDays(nextStart, 1))
                  }
                }}
                className="w-full rounded-md border border-border bg-background px-2 py-1 text-[12px] tabular-nums"
              />
            </label>
            <label className="block space-y-0.5">
              <span className="text-[10px] text-muted-foreground">
                {t('calendar.eventDialog.labelEnd')}
              </span>
              <input
                type="date"
                disabled={busy}
                value={format(addDays(rangeEnd, -1), 'yyyy-MM-dd')}
                onChange={(e): void => {
                  const v = e.target.value
                  if (!v) return
                  const lastDay = startOfDay(parseISO(v))
                  const nextEnd = addDays(lastDay, 1)
                  setRangeEnd(nextEnd)
                  if (nextEnd.getTime() <= rangeStart.getTime()) {
                    setRangeStart(lastDay)
                  }
                }}
                className="w-full rounded-md border border-border bg-background px-2 py-1 text-[12px] tabular-nums"
              />
            </label>
            </div>
          ) : (
            <div className="space-y-2">
            <label className="block space-y-0.5">
              <span className="text-[10px] text-muted-foreground">
                {t('calendar.eventDialog.labelBegin')}
              </span>
              <input
                type="datetime-local"
                disabled={busy}
                value={isoToDatetimeLocalValue(rangeStart.toISOString())}
                onChange={(e): void => {
                  const iso = datetimeLocalValueToIso(e.target.value)
                  if (!iso) return
                  const next = new Date(iso)
                  setRangeStart(next)
                  if (rangeEnd.getTime() <= next.getTime()) {
                    setRangeEnd(addMinutes(next, 30))
                  }
                }}
                className="w-full rounded-md border border-border bg-background px-2 py-1 text-[12px] tabular-nums"
              />
            </label>
            <label className="block space-y-0.5">
              <span className="text-[10px] text-muted-foreground">
                {t('calendar.eventDialog.labelEnd')}
              </span>
              <input
                type="datetime-local"
                disabled={busy}
                value={isoToDatetimeLocalValue(rangeEnd.toISOString())}
                onChange={(e): void => {
                  const iso = datetimeLocalValueToIso(e.target.value)
                  if (!iso) return
                  setRangeEnd(new Date(iso))
                }}
                className="w-full rounded-md border border-border bg-background px-2 py-1 text-[12px] tabular-nums"
              />
            </label>
            </div>
          )}
        </div>

        {createKind === 'event' ? (
          <label className="block space-y-1">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {t('calendar.eventDialog.targetCalendarAria')}
            </span>
            <select
              value={destinationSelectValue}
              disabled={busy || calendarsLoading}
              onChange={(e): void => {
                const v = e.target.value
                setDestinationSelectValue(v)
                const parsed = parseCalendarDestinationKey(v)
                if (parsed) {
                  setAccountId(parsed.accountId)
                  setGraphCalendarId(parsed.graphCalendarId)
                }
              }}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-[12px]"
            >
              {calendarsLoading ? (
                <option value="">{t('calendar.eventDialog.loadingShort')}</option>
              ) : (
                calendarsByAccount.map(({ account, calendars }) => (
                  <optgroup key={account.id} label={destinationAccountOptgroupLabel(account)}>
                    {calendars.length === 0 ? (
                      <option value={calendarDestinationKey(account.id, '')}>
                        {t('calendar.eventDialog.primaryCalendarStandard')}
                      </option>
                    ) : (
                      calendars.map((c) => (
                        <option key={`${account.id}:${c.id}`} value={calendarDestinationKey(account.id, c.id)}>
                          {c.name}
                          {c.isDefaultCalendar ? t('calendar.eventDialog.standardCalendarSuffix') : ''}
                        </option>
                      ))
                    )}
                  </optgroup>
                ))
              )}
            </select>
          </label>
        ) : (
          <div>
            <label className="block space-y-1">
              <span className="text-[10px] text-muted-foreground">{t('tasks.create.account')}</span>
              <select
                value={taskAccountId}
                disabled={busy || taskListsLoading}
                onChange={(e): void => setTaskAccountId(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-[12px]"
              >
                {taskAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {cloudTaskAccountOptionLabel(a)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] text-muted-foreground">{t('tasks.create.list')}</span>
              <select
                value={taskListId}
                disabled={busy || taskListsLoading || taskLists.length === 0}
                onChange={(e): void => setTaskListId(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-[12px]"
              >
                {taskLists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {error ? <p className="text-[11px] text-destructive">{error}</p> : null}

        <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
          <button
            type="button"
            disabled={busy}
            onClick={(): void =>
              onOpenDetails({
                createKind,
                subject: subject.trim(),
                range: currentRange,
                accountId: createKind === 'event' ? accountId : taskAccountId,
                graphCalendarId,
                taskListId,
                isAllDay
              })
            }
            className="text-[12px] font-medium text-primary hover:underline disabled:opacity-50"
          >
            {t('calendar.quickCreate.detailsLink')}
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={(): void => void handleSave()}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/90',
              !canSave && 'cursor-not-allowed opacity-50'
            )}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {createKind === 'task' ? t('tasks.create.submit') : t('calendar.eventDialog.save')}
          </button>
        </div>
      </div>
    </div>
  )
}