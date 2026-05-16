import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { addDays, format, parseISO, startOfDay } from 'date-fns'
import { de as deFns, enUS as enUSFns } from 'date-fns/locale'
import type { Locale } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { ExternalLink, Loader2, MapPin, Pencil, User, Video } from 'lucide-react'
import type { CalendarEventView } from '@shared/types'
import { fullCalendarEventToPatchSchedule } from '@/app/calendar/calendar-shell-view-helpers'
import { openExternalUrl } from '@/lib/open-external'
import { cn } from '@/lib/utils'
import { ObjectNoteEditor, ObjectNotePreview } from '@/components/ObjectNoteEditor'
import { CalendarEventDescriptionPreview } from '@/app/calendar/CalendarEventDescriptionPreview'
import { CalendarEventIconPicker } from '@/components/CalendarEventIconPicker'
import { calendarEventIconIsExplicit, resolveCalendarEventIcon } from '@/lib/calendar-event-icons'
import { sanitizeComposeHtmlFragment } from '@/lib/sanitize-compose-html'
import { useThemeStore } from '@/stores/theme'

function formatEventRange(
  ev: CalendarEventView,
  locale: Locale,
  allDaySuffix: string,
  sameDayTimeFormat: string
): string {
  const start = parseISO(ev.startIso)
  const end = parseISO(ev.endIso)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return `${ev.startIso} – ${ev.endIso}`
  }
  if (ev.isAllDay) {
    const a = format(start, 'PPP', { locale })
    const b = format(addDays(end, -1), 'PPP', { locale })
    if (a === b) return `${a} ${allDaySuffix}`
    return `${a} – ${b} ${allDaySuffix}`
  }
  if (format(start, 'yyyy-MM-dd') === format(end, 'yyyy-MM-dd')) {
    return `${format(start, sameDayTimeFormat, { locale })} · ${format(start, 'HH:mm')} – ${format(end, 'HH:mm')}`
  }
  return `${format(start, 'Pp', { locale })} – ${format(end, 'Pp', { locale })}`
}

function eventToScheduleDraft(ev: CalendarEventView): {
  isAllDay: boolean
  rangeStart: Date
  rangeEnd: Date
} {
  const start = parseISO(ev.startIso)
  const end = parseISO(ev.endIso)
  if (ev.isAllDay) {
    const rangeStart = startOfDay(Number.isNaN(start.getTime()) ? new Date() : start)
    const rangeEnd = startOfDay(
      Number.isNaN(end.getTime()) ? addDays(rangeStart, 1) : end
    )
    return { isAllDay: true, rangeStart, rangeEnd }
  }
  return {
    isAllDay: false,
    rangeStart: Number.isNaN(start.getTime()) ? new Date() : start,
    rangeEnd: Number.isNaN(end.getTime()) ? new Date() : end
  }
}

type PreviewEditField = 'title' | 'schedule'

export function CalendarEventPreview(props: {
  event: CalendarEventView
  onEdit: () => void
  onSaved?: () => void
  onEventChange?: (event: CalendarEventView) => void
  className?: string
}): JSX.Element {
  const { event: ev, onEdit, onSaved, onEventChange, className } = props
  const { t, i18n } = useTranslation()
  const viewerTheme = useThemeStore((s) => s.effective)
  const [err, setErr] = useState<string | null>(null)
  const [descHtml, setDescHtml] = useState('')
  const [descLoading, setDescLoading] = useState(false)
  const [descErr, setDescErr] = useState<string | null>(null)
  const [attendeeEmails, setAttendeeEmails] = useState<string[]>([])
  const [teamsMeeting, setTeamsMeeting] = useState(false)

  const [editingField, setEditingField] = useState<PreviewEditField | null>(null)
  const [titleDraft, setTitleDraft] = useState('')
  const [isAllDay, setIsAllDay] = useState(ev.isAllDay)
  const [rangeStart, setRangeStart] = useState(() => new Date())
  const [rangeEnd, setRangeEnd] = useState(() => new Date())
  const [inlineSaving, setInlineSaving] = useState(false)
  const [inlineError, setInlineError] = useState<string | null>(null)

  const titleInputRef = useRef<HTMLInputElement>(null)
  const scheduleEditorRef = useRef<HTMLDivElement>(null)

  const dfLocale: Locale = i18n.language.startsWith('de') ? deFns : enUSFns
  const allDaySuffix = t('calendar.eventPreview.allDaySuffix')
  const sameDayFmt = i18n.language.startsWith('de') ? 'EEEE, d. MMMM yyyy' : 'EEEE, MMMM d, yyyy'
  const rangeLabel = useMemo(
    () => formatEventRange(ev, dfLocale, allDaySuffix, sameDayFmt),
    [ev, dfLocale, allDaySuffix, sameDayFmt]
  )
  const noteTarget = useMemo(() => {
    const eventRemoteId = ev.graphEventId?.trim()
    if (!eventRemoteId) return null
    return {
      kind: 'calendar' as const,
      accountId: ev.accountId,
      calendarSource: ev.source,
      calendarRemoteId: ev.graphCalendarId?.trim() || 'default',
      eventRemoteId,
      title: ev.title,
      eventTitleSnapshot: ev.title,
      eventStartIsoSnapshot: ev.startIso
    }
  }, [ev.accountId, ev.graphCalendarId, ev.graphEventId, ev.source, ev.startIso, ev.title])

  const canEdit = ev.calendarCanEdit !== false && Boolean(ev.graphEventId)

  useEffect(() => {
    setEditingField(null)
    setInlineError(null)
  }, [ev.id, ev.startIso, ev.endIso, ev.title])

  useEffect(() => {
    if (editingField === 'title') {
      setTitleDraft(ev.title?.trim() ?? '')
      titleInputRef.current?.focus()
      titleInputRef.current?.select()
    }
    if (editingField === 'schedule') {
      const draft = eventToScheduleDraft(ev)
      setIsAllDay(draft.isAllDay)
      setRangeStart(draft.rangeStart)
      setRangeEnd(draft.rangeEnd)
    }
  }, [editingField, ev])

  useEffect(() => {
    const eventId = ev.graphEventId?.trim()
    if (!eventId) {
      setDescHtml('')
      setDescLoading(false)
      setDescErr(null)
      setAttendeeEmails([])
      setTeamsMeeting(false)
      return
    }
    if (ev.source === 'google' && !ev.graphCalendarId?.trim()) {
      setDescHtml('')
      setDescLoading(false)
      setDescErr(null)
      setAttendeeEmails([])
      setTeamsMeeting(false)
      return
    }
    let cancelled = false
    setDescLoading(true)
    setDescErr(null)
    void window.mailClient.calendar
      .getEvent({
        accountId: ev.accountId,
        graphEventId: eventId,
        graphCalendarId: ev.graphCalendarId ?? null,
        forceRefresh: true
      })
      .then((d) => {
        if (cancelled) return
        const raw = d.bodyHtml?.trim() ? d.bodyHtml.trim() : ''
        setDescHtml(raw ? sanitizeComposeHtmlFragment(raw) : '')
        setAttendeeEmails(d.attendeeEmails)
        setTeamsMeeting(!!d.isOnlineMeeting && !ev.isAllDay)
        setDescErr(null)
      })
      .catch((e) => {
        if (cancelled) return
        setDescHtml('')
        setAttendeeEmails([])
        setTeamsMeeting(false)
        setDescErr(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setDescLoading(false)
      })
    return (): void => {
      cancelled = true
    }
  }, [ev.accountId, ev.graphCalendarId, ev.graphEventId, ev.isAllDay, ev.source])

  const cancelInlineEdit = useCallback((): void => {
    setEditingField(null)
    setInlineError(null)
  }, [])

  const applyLocalEventPatch = useCallback(
    (
      patch: Partial<Pick<CalendarEventView, 'title' | 'startIso' | 'endIso' | 'isAllDay' | 'icon'>>
    ): void => {
      const next: CalendarEventView = {
        ...ev,
        ...patch,
        title: patch.title ?? ev.title
      }
      onEventChange?.(next)
    },
    [ev, onEventChange]
  )

  const persistEventIcon = useCallback(
    async (iconId: string | undefined): Promise<void> => {
      const graphEventId = ev.graphEventId?.trim()
      if (!graphEventId || !canEdit) return
      const nextIcon = iconId?.trim() || null
      const prevIcon = ev.icon?.trim() || null
      if ((nextIcon ?? '') === (prevIcon ?? '')) return
      setInlineSaving(true)
      setInlineError(null)
      try {
        await window.mailClient.calendar.patchEventIcon({
          accountId: ev.accountId,
          graphEventId,
          iconId: nextIcon
        })
        applyLocalEventPatch({ icon: nextIcon })
        onSaved?.()
      } catch (e) {
        setInlineError(e instanceof Error ? e.message : String(e))
      } finally {
        setInlineSaving(false)
      }
    },
    [ev, canEdit, onSaved, applyLocalEventPatch]
  )

  const saveTitle = useCallback(async (): Promise<void> => {
    const graphEventId = ev.graphEventId?.trim()
    if (!graphEventId) return
    const subject = titleDraft.trim()
    if (!subject) {
      setInlineError(t('calendar.eventDialog.enterTitle'))
      return
    }
    if (subject === (ev.title?.trim() ?? '')) {
      cancelInlineEdit()
      return
    }
    setInlineSaving(true)
    setInlineError(null)
    try {
      await window.mailClient.calendar.updateEvent({
        accountId: ev.accountId,
        graphEventId,
        graphCalendarId: ev.graphCalendarId ?? null,
        subject,
        startIso: ev.startIso,
        endIso: ev.endIso,
        isAllDay: ev.isAllDay,
        location: ev.location ?? null,
        bodyHtml: descHtml || null,
        categories: ev.categories ?? null,
        ...(ev.source === 'microsoft'
          ? {
              attendeeEmails,
              teamsMeeting: !ev.isAllDay && teamsMeeting
            }
          : {})
      })
      applyLocalEventPatch({ title: subject })
      cancelInlineEdit()
      onSaved?.()
    } catch (e) {
      setInlineError(e instanceof Error ? e.message : String(e))
    } finally {
      setInlineSaving(false)
    }
  }, [
    applyLocalEventPatch,
    attendeeEmails,
    cancelInlineEdit,
    descHtml,
    ev,
    onSaved,
    t,
    teamsMeeting,
    titleDraft
  ])

  const saveSchedule = useCallback(async (): Promise<void> => {
    const graphEventId = ev.graphEventId?.trim()
    if (!graphEventId) return
    if (isAllDay && rangeEnd.getTime() <= rangeStart.getTime()) {
      setInlineError(t('calendar.eventDialog.endAfterStartExclusive'))
      return
    }
    if (!isAllDay && rangeEnd.getTime() <= rangeStart.getTime()) {
      setInlineError(t('calendar.eventDialog.endAfterStart'))
      return
    }
    const sched = fullCalendarEventToPatchSchedule({
      start: rangeStart,
      end: rangeEnd,
      allDay: isAllDay
    })
    if (!sched) {
      setInlineError(t('calendar.eventDialog.scheduleParseFailed'))
      return
    }
    if (
      sched.startIso === ev.startIso &&
      sched.endIso === ev.endIso &&
      sched.isAllDay === ev.isAllDay
    ) {
      cancelInlineEdit()
      return
    }
    setInlineSaving(true)
    setInlineError(null)
    try {
      await window.mailClient.calendar.patchEventSchedule({
        accountId: ev.accountId,
        graphEventId,
        graphCalendarId: ev.graphCalendarId ?? null,
        startIso: sched.startIso,
        endIso: sched.endIso,
        isAllDay: sched.isAllDay
      })
      applyLocalEventPatch({
        startIso: sched.startIso,
        endIso: sched.endIso,
        isAllDay: sched.isAllDay
      })
      cancelInlineEdit()
      onSaved?.()
    } catch (e) {
      setInlineError(e instanceof Error ? e.message : String(e))
    } finally {
      setInlineSaving(false)
    }
  }, [
    applyLocalEventPatch,
    cancelInlineEdit,
    ev,
    isAllDay,
    onSaved,
    rangeEnd,
    rangeStart,
    t
  ])

  useEffect(() => {
    if (!editingField) return
    function onDocMouseDown(e: MouseEvent): void {
      const target = e.target as Node
      if (editingField === 'title' && titleInputRef.current?.contains(target)) return
      if (editingField === 'schedule' && scheduleEditorRef.current?.contains(target)) return
      if (editingField === 'title') void saveTitle()
      else void saveSchedule()
    }
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key !== 'Escape') return
      e.preventDefault()
      cancelInlineEdit()
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKeyDown, true)
    return (): void => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [cancelInlineEdit, editingField, saveSchedule, saveTitle])

  const toggleAllDay = useCallback(
    (next: boolean): void => {
      if (next) {
        const s = startOfDay(rangeStart)
        let endExcl = startOfDay(rangeEnd)
        if (endExcl.getTime() <= s.getTime()) endExcl = addDays(s, 1)
        setRangeStart(s)
        setRangeEnd(endExcl)
      } else {
        const s = new Date(rangeStart)
        if (s.getHours() === 0 && s.getMinutes() === 0) s.setHours(9, 0, 0, 0)
        let e = new Date(rangeEnd)
        if (e.getTime() <= s.getTime()) e = new Date(s.getTime() + 30 * 60 * 1000)
        setRangeStart(s)
        setRangeEnd(e)
      }
      setIsAllDay(next)
    },
    [rangeEnd, rangeStart]
  )

  const clickableClass = canEdit
    ? 'cursor-pointer rounded-sm transition-colors hover:bg-secondary/60 hover:text-foreground'
    : ''

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col overflow-y-auto bg-background', className)}>
      <div className="shrink-0 space-y-2 border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {ev.source === 'google'
                ? t('calendar.eventPreview.sourceGoogle')
                : t('calendar.eventPreview.sourceMicrosoft')}
            </p>
            <div className="flex items-start gap-2">
              {canEdit ? (
                <CalendarEventIconPicker
                  layout="compact"
                  iconId={ev.icon}
                  title={ev.title}
                  disabled={inlineSaving}
                  onIconChange={(id): void => void persistEventIcon(id)}
                />
              ) : calendarEventIconIsExplicit(ev.icon) ? (
                ((): JSX.Element => {
                  const Icon = resolveCalendarEventIcon(ev.icon)
                  return (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border/60 bg-secondary/20 text-muted-foreground">
                      <Icon className="h-4 w-4" strokeWidth={2} />
                    </span>
                  )
                })()
              ) : null}
              {editingField === 'title' ? (
                <input
                  ref={titleInputRef}
                  type="text"
                  value={titleDraft}
                  disabled={inlineSaving}
                  onChange={(e): void => setTitleDraft(e.target.value)}
                  onKeyDown={(e): void => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void saveTitle()
                    }
                  }}
                  className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-[17px] font-semibold leading-snug outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                />
              ) : (
                <h2
                  role={canEdit ? 'button' : undefined}
                  tabIndex={canEdit ? 0 : undefined}
                  title={canEdit ? t('calendar.eventPreview.editTitle') : undefined}
                  onClick={(): void => {
                    if (!canEdit || inlineSaving) return
                    setEditingField('title')
                  }}
                  onKeyDown={(e): void => {
                    if (!canEdit) return
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setEditingField('title')
                    }
                  }}
                  className={cn(
                    'min-w-0 flex-1 text-[17px] font-semibold leading-snug text-foreground',
                    clickableClass,
                    canEdit && '-mx-1 px-1'
                  )}
                >
                  {ev.title || t('calendar.eventPreview.noTitle')}
                </h2>
              )}
            </div>
            {editingField === 'schedule' ? (
              <div
                ref={scheduleEditorRef}
                className="space-y-2 rounded-lg border border-border/70 bg-secondary/20 px-2.5 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {t('calendar.quickCreate.whenLabel')}
                  </span>
                  <button
                    type="button"
                    disabled={inlineSaving}
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
                        disabled={inlineSaving}
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
                        disabled={inlineSaving}
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
                        disabled={inlineSaving}
                        value={format(rangeStart, "yyyy-MM-dd'T'HH:mm")}
                        onChange={(e): void => {
                          const v = e.target.value
                          if (!v) return
                          const d = new Date(v)
                          if (Number.isNaN(d.getTime())) return
                          setRangeStart(d)
                          if (rangeEnd.getTime() <= d.getTime()) {
                            setRangeEnd(new Date(d.getTime() + 30 * 60 * 1000))
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
                        disabled={inlineSaving}
                        value={format(rangeEnd, "yyyy-MM-dd'T'HH:mm")}
                        onChange={(e): void => {
                          const v = e.target.value
                          if (!v) return
                          const d = new Date(v)
                          if (Number.isNaN(d.getTime())) return
                          setRangeEnd(d)
                          if (d.getTime() <= rangeStart.getTime()) {
                            setRangeStart(new Date(d.getTime() - 30 * 60 * 1000))
                          }
                        }}
                        className="w-full rounded-md border border-border bg-background px-2 py-1 text-[12px] tabular-nums"
                      />
                    </label>
                  </div>
                )}
              </div>
            ) : (
              <p
                role={canEdit ? 'button' : undefined}
                tabIndex={canEdit ? 0 : undefined}
                title={canEdit ? t('calendar.eventPreview.editScheduleTitle') : undefined}
                onClick={(): void => {
                  if (!canEdit || inlineSaving) return
                  setEditingField('schedule')
                }}
                onKeyDown={(e): void => {
                  if (!canEdit) return
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setEditingField('schedule')
                  }
                }}
                className={cn('text-[12px] text-muted-foreground', clickableClass, canEdit && '-mx-1 px-1')}
              >
                {rangeLabel}
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">{ev.accountEmail}</p>
            {inlineError ? <p className="text-[11px] text-destructive">{inlineError}</p> : null}
            {inlineSaving ? (
              <p className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                {t('calendar.eventPreview.saving')}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-start gap-1">
            {noteTarget ? <ObjectNoteEditor target={noteTarget} layout="toggle" /> : null}
            <button
              type="button"
              disabled={!canEdit}
              title={canEdit ? t('calendar.eventPreview.editTitle') : t('calendar.eventPreview.readOnlyTitle')}
              onClick={onEdit}
              className={cn(
                'flex h-6 shrink-0 items-center gap-1 rounded-md border border-border px-2 text-[10px] font-medium transition-colors',
                'text-foreground hover:bg-secondary',
                !canEdit && 'cursor-not-allowed opacity-45'
              )}
            >
              <Pencil className="h-3 w-3" />
              {t('calendar.eventPreview.editButton')}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {ev.joinUrl?.trim() ? (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
              onClick={(): void => {
                setErr(null)
                void openExternalUrl(ev.joinUrl!.trim()).catch((e) =>
                  setErr(e instanceof Error ? e.message : String(e))
                )
              }}
            >
              <Video className="h-3.5 w-3.5" />
              {t('calendar.eventPreview.joinTeams')}
            </button>
          ) : null}
          {ev.webLink?.trim() ? (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary px-2.5 py-1.5 text-[11px] font-medium text-secondary-foreground hover:bg-secondary/80"
              onClick={(): void => {
                setErr(null)
                void openExternalUrl(ev.webLink!.trim()).catch((e) =>
                  setErr(e instanceof Error ? e.message : String(e))
                )
              }}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {t('calendar.eventPreview.openInCalendar')}
            </button>
          ) : null}
        </div>
        {err ? <p className="text-[11px] text-destructive">{err}</p> : null}
      </div>

      <div className="space-y-3 px-4 py-3 text-[12px]">
        {ev.location?.trim() ? (
          <div className="flex gap-2 text-muted-foreground">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="min-w-0 text-foreground">{ev.location.trim()}</span>
          </div>
        ) : null}
        {ev.organizer?.trim() ? (
          <div className="flex gap-2 text-muted-foreground">
            <User className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="min-w-0 text-foreground">{ev.organizer.trim()}</span>
          </div>
        ) : null}
        {ev.categories && ev.categories.length > 0 ? (
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t('calendar.eventPreview.categories')}
            </p>
            <div className="flex flex-wrap gap-1">
              {ev.categories.map((c) => (
                <span
                  key={c}
                  className="rounded-md border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-foreground"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {ev.graphEventId?.trim() ? (
          <div className="min-h-0 border-t border-border/60 pt-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t('calendar.eventDialog.description')}
            </p>
            {ev.source === 'google' && !ev.graphCalendarId?.trim() ? (
              <p className="text-[11px] text-muted-foreground">{t('calendar.eventDialog.googleCalendarIdMissing')}</p>
            ) : descLoading ? (
              <p className="inline-flex items-center gap-2 text-[11px] text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t('calendar.eventDialog.loadingEventDetails')}
              </p>
            ) : descErr ? (
              <p className="text-[11px] text-destructive" role="alert">
                {descErr}
              </p>
            ) : (
              <CalendarEventDescriptionPreview
                html={descHtml}
                viewerTheme={viewerTheme}
                className="w-full"
              />
            )}
          </div>
        ) : null}

        {noteTarget ? (
          <ObjectNotePreview
            target={noteTarget}
            previewHeight={220}
            className="border-t border-border/60 border-b-0 bg-transparent px-0 pt-4"
          />
        ) : null}
      </div>
    </div>
  )
}