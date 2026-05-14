import { useMemo, useState } from 'react'
import { addDays, format, parseISO } from 'date-fns'
import { de as deFns, enUS as enUSFns } from 'date-fns/locale'
import type { Locale } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { ExternalLink, MapPin, Pencil, User, Video } from 'lucide-react'
import type { CalendarEventView } from '@shared/types'
import { openExternalUrl } from '@/lib/open-external'
import { cn } from '@/lib/utils'
import { ObjectNoteEditor } from '@/components/ObjectNoteEditor'

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

export function CalendarEventPreview(props: {
  event: CalendarEventView
  onEdit: () => void
  className?: string
}): JSX.Element {
  const { event: ev, onEdit, className } = props
  const { t, i18n } = useTranslation()
  const [err, setErr] = useState<string | null>(null)
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
            <h2 className="text-[17px] font-semibold leading-snug text-foreground">
              {ev.title || t('calendar.eventPreview.noTitle')}
            </h2>
            <p className="text-[12px] text-muted-foreground">{rangeLabel}</p>
            <p className="text-[11px] text-muted-foreground">{ev.accountEmail}</p>
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
      </div>
    </div>
  )
}
