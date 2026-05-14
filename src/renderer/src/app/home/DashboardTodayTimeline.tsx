import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Locale } from 'date-fns'
import { addDays, format, parseISO, startOfDay } from 'date-fns'
import { de, enUS } from 'date-fns/locale'
import { Loader2, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { CalendarEventView, ConnectedAccount } from '@shared/types'
import { ContextMenu } from '@/components/ContextMenu'
import { resolvedAccountColorCss } from '@/lib/avatar-color'
import { cn } from '@/lib/utils'

const VIEW_START_HOUR = 0
const VIEW_END_HOUR = 24
/** Sichtfenster-Breite für Hinweis „außerhalb …“ (gleiche Spanne wie früher 8–18 Uhr). */
const FOCUS_RANGE_MIN = 10 * 60
const VIEW_START_MIN = VIEW_START_HOUR * 60
const VIEW_END_MIN = VIEW_END_HOUR * 60
const VIEW_RANGE_MIN = VIEW_END_MIN - VIEW_START_MIN

function eventChipBackground(ev: CalendarEventView, accounts: ConnectedAccount[]): string {
  const hex = ev.displayColorHex?.trim()
  if (hex) return hex
  const acc = accounts.find((a) => a.id === ev.accountId)
  if (acc) return resolvedAccountColorCss(acc.color)
  return 'hsl(var(--muted-foreground) / 0.35)'
}

function overlapsLocalCalendarDay(ev: CalendarEventView, day: Date): boolean {
  const s = parseISO(ev.startIso)
  const e = parseISO(ev.endIso)
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return false
  const d0 = startOfDay(day)
  const d1 = addDays(d0, 1)
  return e.getTime() > d0.getTime() && s.getTime() < d1.getTime()
}

function minutesSinceMidnight(d: Date): number {
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60
}

/** Obere Kante der Startansicht: eine Stunde vor der aktuellen Uhrzeit (lokal), min. Mitternacht. */
function scrollAnchorStartMinFromNow(now: Date): number {
  return Math.max(VIEW_START_MIN, minutesSinceMidnight(now) - 60)
}

function focusWindowEndMin(anchorStartMin: number): number {
  return Math.min(VIEW_END_MIN, anchorStartMin + FOCUS_RANGE_MIN)
}

function minutesInDayRange(d: Date, day: Date): number {
  const d0 = startOfDay(day)
  const d1 = addDays(d0, 1)
  if (d.getTime() <= d0.getTime()) return VIEW_START_MIN
  if (d.getTime() >= d1.getTime()) return VIEW_END_MIN
  return minutesSinceMidnight(d)
}

type TimedBlock = {
  ev: CalendarEventView
  start: Date
  end: Date
  lane: number
}

function assignLanes(blocks: TimedBlock[]): TimedBlock[] {
  const sorted = [...blocks].sort((a, b) => a.start.getTime() - b.start.getTime() || a.end.getTime() - b.end.getTime())
  const laneEnds: number[] = []
  for (const b of sorted) {
    const t0 = b.start.getTime()
    const t1 = b.end.getTime()
    let L = 0
    while (L < laneEnds.length && laneEnds[L]! > t0) L++
    if (L === laneEnds.length) laneEnds.push(t1)
    else laneEnds[L] = Math.max(laneEnds[L]!, t1)
    b.lane = L
  }
  return sorted
}

function overlapColumnCount(b: TimedBlock, all: TimedBlock[]): number {
  const t0 = b.start.getTime()
  const t1 = b.end.getTime()
  let maxLane = 0
  for (const o of all) {
    const o0 = o.start.getTime()
    const o1 = o.end.getTime()
    if (o1 <= t0 || o0 >= t1) continue
    maxLane = Math.max(maxLane, o.lane)
  }
  return maxLane + 1
}

export function DashboardTodayTimeline(props: {
  events: CalendarEventView[]
  accounts: ConnectedAccount[]
  loading?: boolean
  hasLinkedCalendars: boolean
  onOpenEvent?: (ev: CalendarEventView) => void
  onCreateEventOnDay?: (day: Date, anchor: { x: number; y: number }) => void
}): JSX.Element {
  const { events, accounts, loading, hasLinkedCalendars, onOpenEvent, onCreateEventOnDay } = props
  const { t, i18n } = useTranslation()
  const dfLocale: Locale = i18n.language.startsWith('de') ? de : enUS
  const [contextMenu, setContextMenu] = useState<null | { x: number; y: number }>(null)
  const timelineScrollRef = useRef<HTMLDivElement | null>(null)
  const timelineContentRef = useRef<HTMLDivElement | null>(null)

  const [today, setToday] = useState(() => new Date())
  /** Minütlicher Tick: Scroll-Start an „jetzt − 1 h“ und Sichtfenster-Hinweis aktualisieren. */
  const [clockTick, setClockTick] = useState(0)
  const dayLabel = format(today, 'EEEE, d. MMM', { locale: dfLocale })

  useEffect(() => {
    const now = new Date()
    const nextDay = addDays(startOfDay(now), 1)
    const timeout = window.setTimeout(() => setToday(new Date()), Math.max(1000, nextDay.getTime() - now.getTime() + 1000))
    return (): void => window.clearTimeout(timeout)
  }, [today])

  useEffect(() => {
    const id = window.setInterval(() => setClockTick((n) => n + 1), 60_000)
    return (): void => window.clearInterval(id)
  }, [])

  const { allDayToday, timedToday, outsideWindowCount } = useMemo(() => {
    const allDay: CalendarEventView[] = []
    const timed: TimedBlock[] = []
    let outside = 0
    const now = new Date()
    const focusStart = scrollAnchorStartMinFromNow(now)
    const focusEnd = focusWindowEndMin(focusStart)

    for (const ev of events) {
      if (!overlapsLocalCalendarDay(ev, today)) continue
      if (ev.isAllDay) {
        allDay.push(ev)
        continue
      }
      const s = parseISO(ev.startIso)
      const e = parseISO(ev.endIso)
      if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) continue
      const d0 = startOfDay(today)
      const d1 = addDays(d0, 1)
      const clipStart = new Date(Math.max(s.getTime(), d0.getTime()))
      const clipEnd = new Date(Math.min(e.getTime(), d1.getTime()))
      if (clipEnd.getTime() <= clipStart.getTime()) continue

      const sm = minutesInDayRange(clipStart, today)
      const em = minutesInDayRange(clipEnd, today)
      if (em <= focusStart || sm >= focusEnd) {
        outside += 1
      }
      timed.push({ ev, start: clipStart, end: clipEnd, lane: 0 })
    }

    const placed = assignLanes(timed)
    return { allDayToday: allDay, timedToday: placed, outsideWindowCount: outside }
  }, [events, today, clockTick])

  useLayoutEffect(() => {
    const scrollEl = timelineScrollRef.current
    const contentEl = timelineContentRef.current
    if (scrollEl == null || contentEl == null) return

    const visibleRatio = FOCUS_RANGE_MIN / VIEW_RANGE_MIN
    const contentHeight = Math.max(VIEW_END_HOUR * 32, scrollEl.clientHeight / visibleRatio)
    contentEl.style.height = `${contentHeight}px`

    const anchorMin = scrollAnchorStartMinFromNow(new Date())
    const targetTop = (anchorMin / VIEW_RANGE_MIN) * contentHeight
    scrollEl.scrollTop = Math.min(Math.max(0, targetTop), Math.max(0, contentHeight - scrollEl.clientHeight))
  }, [today, clockTick, loading, hasLinkedCalendars, events.length])

  const hourLabels = useMemo(() => {
    const out: number[] = []
    for (let h = VIEW_START_HOUR; h < VIEW_END_HOUR; h++) out.push(h)
    return out
  }, [])

  if (!hasLinkedCalendars) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center px-3 py-4 text-center text-[11px] text-muted-foreground">
        {t('dashboard.todayTimelineNoCalendars')}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-2 text-[11px] text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        {t('dashboard.loading.calendar')}
      </div>
    )
  }

  return (
    <>
      <div className="flex h-full min-h-0 flex-col px-2 py-1.5">
        <div className="mb-1 shrink-0 truncate text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {dayLabel}
        </div>
        {allDayToday.length > 0 ? (
          <div className="mb-1 shrink-0 space-y-0.5 border-b border-border/50 pb-1">
            {allDayToday.map((ev) => (
              <button
                key={ev.id}
                type="button"
                disabled={!onOpenEvent}
                onClick={(): void => {
                  if (onOpenEvent) onOpenEvent(ev)
                }}
                className={cn(
                  'flex w-full min-w-0 items-center gap-1.5 rounded border border-border/60 bg-muted/30 px-1 py-0.5 text-left text-[10px] transition-colors',
                  onOpenEvent && 'hover:bg-muted/50'
                )}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-sm"
                  style={{ backgroundColor: eventChipBackground(ev, accounts) }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">{ev.title || t('dashboard.noTitle')}</span>
                <span className="shrink-0 text-[9px] text-muted-foreground">{t('dashboard.allDay')}</span>
              </button>
            ))}
          </div>
        ) : null}

        <div
          ref={timelineScrollRef}
          className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden rounded-md border border-border/50 bg-muted/15"
          onContextMenu={
            onCreateEventOnDay
              ? (e): void => {
                  e.preventDefault()
                  e.stopPropagation()
                  setContextMenu({ x: e.clientX, y: e.clientY })
                }
              : undefined
          }
        >
          <div ref={timelineContentRef} className="relative flex min-h-[768px]">
            <div className="flex w-8 shrink-0 flex-col border-r border-border/40 bg-muted/20 pt-0.5 text-[9px] tabular-nums text-muted-foreground">
              {hourLabels.map((h) => (
                <div key={h} className="flex flex-1 items-start justify-end pr-1 pt-0">
                  {format(new Date(2000, 0, 1, h, 0), 'HH:mm')}
                </div>
              ))}
            </div>
            <div className="relative min-h-0 flex-1">
              <div className="absolute inset-0 flex flex-col">
                {hourLabels.map((h) => (
                  <div key={h} className="flex-1 border-b border-border/30 last:border-b-0" />
                ))}
              </div>
              <div className="absolute inset-0 px-0.5">
                {timedToday.map((b) => {
                  const sm = minutesInDayRange(b.start, today)
                  const em = minutesInDayRange(b.end, today)
                  const clipStart = Math.max(sm, VIEW_START_MIN)
                  const clipEnd = Math.min(em, VIEW_END_MIN)
                  const topPct = ((clipStart - VIEW_START_MIN) / VIEW_RANGE_MIN) * 100
                  const heightPct = Math.max(((clipEnd - clipStart) / VIEW_RANGE_MIN) * 100, 1.1)
                  const cols = overlapColumnCount(b, timedToday)
                  const wPct = 100 / cols
                  const leftPct = b.lane * wPct
                  return (
                    <button
                      key={b.ev.id}
                      type="button"
                      disabled={!onOpenEvent}
                      title={`${b.ev.title || t('dashboard.noTitle')} · ${format(b.start, 'HH:mm')}–${format(b.end, 'HH:mm')}`}
                      onClick={(): void => {
                        if (onOpenEvent) onOpenEvent(b.ev)
                      }}
                      className={cn(
                        'absolute overflow-hidden rounded border border-border/50 px-0.5 py-px text-left text-[9px] leading-tight shadow-sm transition-colors',
                        onOpenEvent ? 'cursor-pointer hover:bg-black/5 dark:hover:bg-white/10' : 'cursor-default opacity-90'
                      )}
                      style={{
                        top: `${topPct}%`,
                        height: `${heightPct}%`,
                        left: `calc(${leftPct}% + 1px)`,
                        width: `calc(${wPct}% - 2px)`,
                        backgroundColor: `${eventChipBackground(b.ev, accounts)}22`,
                        borderLeftWidth: 3,
                        borderLeftColor: eventChipBackground(b.ev, accounts)
                      }}
                    >
                      <span className="line-clamp-2 font-medium text-foreground">{b.ev.title || t('dashboard.noTitle')}</span>
                      <span className="block text-[8px] text-muted-foreground">
                        {format(b.start, 'HH:mm')}–{format(b.end, 'HH:mm')}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        {outsideWindowCount > 0 ? (
          <div className="mt-1 shrink-0 truncate text-center text-[9px] text-muted-foreground">
            {t('dashboard.todayTimelineOutsideWindow', { count: outsideWindowCount })}
          </div>
        ) : timedToday.length === 0 && allDayToday.length === 0 ? (
          <div className="mt-1 shrink-0 truncate text-center text-[9px] text-muted-foreground">{t('dashboard.todayTimelineEmpty')}</div>
        ) : null}
      </div>

      {contextMenu != null && onCreateEventOnDay != null ? (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={[
            {
              id: 'dash-today-new-event',
              label: t('dashboard.miniCalendarNewEventThisDay'),
              icon: Plus,
              onSelect: (): void => {
                onCreateEventOnDay(today, { x: contextMenu.x, y: contextMenu.y })
              }
            }
          ]}
          onClose={(): void => setContextMenu(null)}
        />
      ) : null}
    </>
  )
}
