import { useEffect, useMemo, useState } from 'react'
import type { Locale } from 'date-fns'
import { format, parseISO } from 'date-fns'
import { de, enUS } from 'date-fns/locale'
import { Loader2, Video } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { CalendarEventView } from '@shared/types'
import { openExternalUrl } from '@/lib/open-external'

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const days = Math.floor(totalSeconds / 86_400)
  const hours = Math.floor((totalSeconds % 86_400) / 3_600)
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
  const seconds = totalSeconds % 60
  const h = String(hours).padStart(2, '0')
  const m = String(minutes).padStart(2, '0')
  const s = String(seconds).padStart(2, '0')
  return days > 0 ? `${days}d ${h}:${m}:${s}` : `${h}:${m}:${s}`
}

function formatMeetingTime(ev: CalendarEventView, locale: Locale): string {
  const start = parseISO(ev.startIso)
  const end = parseISO(ev.endIso)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return ev.startIso
  if (ev.isAllDay) return format(start, 'EEE d. MMM', { locale })
  if (format(start, 'yyyy-MM-dd') === format(end, 'yyyy-MM-dd')) {
    return `${format(start, 'EEE d. MMM · HH:mm', { locale })}–${format(end, 'HH:mm', { locale })}`
  }
  return `${format(start, 'Pp', { locale })}`
}

export interface DashboardNextMeetingTileProps {
  event: CalendarEventView | null
  loading: boolean
  error: string | null
  hasLinkedCalendars: boolean
}

export function DashboardNextMeetingTile({
  event,
  loading,
  error,
  hasLinkedCalendars
}: DashboardNextMeetingTileProps): JSX.Element {
  const { t, i18n } = useTranslation()
  const dfLocale = i18n.language.startsWith('de') ? de : enUS
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [openError, setOpenError] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const startMs = useMemo(() => {
    if (!event) return null
    const parsed = Date.parse(event.startIso)
    return Number.isNaN(parsed) ? null : parsed
  }, [event])

  if (!hasLinkedCalendars) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-3 py-4 text-center text-xs text-muted-foreground">
        {t('dashboard.nextMeeting.noCalendars')}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center gap-2 px-3 py-8 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        {t('dashboard.loading.calendar')}
      </div>
    )
  }

  if (error) {
    return <div className="px-3 py-4 text-xs text-destructive">{error}</div>
  }

  if (!event || !event.joinUrl?.trim() || startMs == null) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-3 py-6 text-center text-xs text-muted-foreground">
        {t('dashboard.nextMeeting.empty')}
      </div>
    )
  }

  const msUntilStart = startMs - nowMs
  const joinUrl = event.joinUrl.trim()

  return (
    <div className="flex min-h-0 flex-1 flex-col justify-between gap-3 overflow-hidden px-3 py-3">
      <div className="min-w-0 space-y-1">
        <div className="truncate text-sm font-semibold text-foreground" title={event.title || t('dashboard.noTitle')}>
          {event.title || t('dashboard.noTitle')}
        </div>
        <div className="truncate text-[11px] text-muted-foreground">{formatMeetingTime(event, dfLocale)}</div>
        <div className="truncate text-[10px] text-muted-foreground/90">{event.accountEmail}</div>
      </div>

      <div className="rounded-lg border border-border/70 bg-muted/25 px-3 py-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t('dashboard.nextMeeting.countdownLabel')}
        </div>
        <div className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-foreground">
          {msUntilStart <= 0 ? t('dashboard.nextMeeting.now') : formatCountdown(msUntilStart)}
        </div>
      </div>

      <div className="space-y-1">
        <button
          type="button"
          onClick={(): void => {
            setOpenError(null)
            void openExternalUrl(joinUrl).catch((err) => {
              setOpenError(err instanceof Error ? err.message : String(err))
            })
          }}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Video className="h-4 w-4" aria-hidden />
          {t('dashboard.nextMeeting.join')}
        </button>
        {openError ? <div className="text-[11px] text-destructive">{openError}</div> : null}
      </div>
    </div>
  )
}
