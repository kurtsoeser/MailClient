import { useMemo, useRef, useState } from 'react'
import {
  addDays,
  addMonths,
  compareAsc,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek
} from 'date-fns'
import { de as deFns, enUS as enUSFns } from 'date-fns/locale'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

const WEEK_REF_MONDAY = new Date(2024, 0, 1)

function dayFromEventTarget(target: EventTarget | null): Date | null {
  let el: Element | null = target as Element | null
  while (el) {
    if (el instanceof HTMLElement && el.dataset.miniCalDay) {
      const ms = Date.parse(el.dataset.miniCalDay)
      return Number.isNaN(ms) ? null : new Date(ms)
    }
    el = el.parentElement
  }
  return null
}

export interface MiniMonthInboxDropHandlers {
  dropHoverDate: string | null
  onDayDragOver: (e: React.DragEvent, dateStr: string) => void
  onDayDragLeave: (e: React.DragEvent, dateStr: string) => void
  onDayDrop: (e: React.DragEvent, dateStr: string) => void
}

export interface MiniMonthGridProps {
  monthAnchor: Date
  /** Vergleich fuer «Heute»-Markierung; Standard: jetzt. */
  today?: Date
  onPrevMonth: () => void
  onNextMonth: () => void
  /** Kalender-Modul: Zeiger-Zug waehlt einen Tag- oder Mehr-Tage-Zeitraum. */
  onSelectDayRange?: (startInclusive: Date, endInclusive: Date) => void
  /** Inbox-Spalte: Mail per Drag auf Tag terminieren. */
  inboxDrop?: MiniMonthInboxDropHandlers
  /** Optional: einzelner Klick (Inbox). */
  onDayClick?: (day: Date) => void
}

/**
 * Monatsuebersicht wie in der Kalender-Shell: abgerundeter Kartenrahmen, Wochentage,
 * «Heute» mit destructive-Kreis, ausserhalb des Monats abgeschwaecht.
 */
export function MiniMonthGrid({
  monthAnchor,
  today = new Date(),
  onPrevMonth,
  onNextMonth,
  onSelectDayRange,
  inboxDrop,
  onDayClick
}: MiniMonthGridProps): JSX.Element {
  const { t, i18n } = useTranslation()
  const dfLocale = i18n.language.startsWith('de') ? deFns : enUSFns
  const weekdayLabels = useMemo(() => {
    const ws = startOfWeek(WEEK_REF_MONDAY, { weekStartsOn: 1 })
    return Array.from({ length: 7 }, (_, i) => format(addDays(ws, i), 'EEE', { locale: dfLocale }))
  }, [dfLocale])

  const gridStart = startOfWeek(startOfMonth(monthAnchor), { weekStartsOn: 1 })
  const gridEnd = endOfWeek(endOfMonth(monthAnchor), { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })

  const dragRef = useRef<{ anchor: Date; hover: Date } | null>(null)
  const [dragPaint, setDragPaint] = useState<{ anchor: Date; hover: Date } | null>(null)

  function finishDrag(): void {
    const g = dragRef.current
    dragRef.current = null
    setDragPaint(null)
    if (!g || !onSelectDayRange) return
    const lo = compareAsc(g.anchor, g.hover) <= 0 ? g.anchor : g.hover
    const hi = compareAsc(g.anchor, g.hover) <= 0 ? g.hover : g.anchor
    onSelectDayRange(lo, hi)
  }

  function dayInDraftRange(d: Date): boolean {
    if (!dragPaint) return false
    const lo = compareAsc(dragPaint.anchor, dragPaint.hover) <= 0 ? dragPaint.anchor : dragPaint.hover
    const hi = compareAsc(dragPaint.anchor, dragPaint.hover) <= 0 ? dragPaint.hover : dragPaint.anchor
    return compareAsc(d, lo) >= 0 && compareAsc(d, hi) <= 0
  }

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onPrevMonth}
          className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label={t('calendar.miniMonth.prevMonthAria')}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-[13px] font-semibold capitalize text-foreground">
          {format(monthAnchor, 'LLLL yyyy', { locale: dfLocale })}
        </span>
        <button
          type="button"
          onClick={onNextMonth}
          className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label={t('calendar.miniMonth.nextMonthAria')}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {weekdayLabels.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div
        className="grid touch-none select-none grid-cols-7 gap-y-0.5 text-center"
        style={onSelectDayRange ? { touchAction: 'none' } : undefined}
      >
        {days.map((d) => {
          const inMonth = isSameMonth(d, monthAnchor)
          const isTodayCell = isSameDay(d, today)
          const inDraft = Boolean(onSelectDayRange) && dayInDraftRange(d)
          const dateStr = format(d, 'yyyy-MM-dd')
          const dropHover = Boolean(inboxDrop && inboxDrop.dropHoverDate === dateStr)
          const rangeOrDrop = inDraft || dropHover

          return (
            <button
              key={d.toISOString()}
              type="button"
              data-mini-cal-day={d.toISOString()}
              data-date={inboxDrop ? dateStr : undefined}
              onClick={(): void => onDayClick?.(d)}
              onDragOver={
                inboxDrop
                  ? (e): void => {
                      inboxDrop.onDayDragOver(e, dateStr)
                    }
                  : undefined
              }
              onDragLeave={
                inboxDrop
                  ? (e): void => {
                      inboxDrop.onDayDragLeave(e, dateStr)
                    }
                  : undefined
              }
              onDrop={
                inboxDrop
                  ? (e): void => {
                      inboxDrop.onDayDrop(e, dateStr)
                    }
                  : undefined
              }
              onPointerDown={
                onSelectDayRange
                  ? (e): void => {
                      if (e.button !== 0) return
                      e.preventDefault()
                      dragRef.current = { anchor: d, hover: d }
                      setDragPaint({ anchor: d, hover: d })

                      const onMove = (ev: PointerEvent): void => {
                        const el = document.elementFromPoint(ev.clientX, ev.clientY)
                        const hit = dayFromEventTarget(el)
                        if (!hit || !dragRef.current) return
                        dragRef.current = { anchor: dragRef.current.anchor, hover: hit }
                        setDragPaint({ anchor: dragRef.current.anchor, hover: hit })
                      }
                      const onUp = (): void => {
                        window.removeEventListener('pointermove', onMove)
                        window.removeEventListener('pointerup', onUp)
                        window.removeEventListener('pointercancel', onUp)
                        finishDrag()
                      }
                      window.addEventListener('pointermove', onMove)
                      window.addEventListener('pointerup', onUp)
                      window.addEventListener('pointercancel', onUp)
                    }
                  : undefined
              }
              className={cn(
                'mx-auto flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-medium transition-colors',
                !inMonth && 'text-muted-foreground/40',
                inMonth && !isTodayCell && !rangeOrDrop && 'text-foreground hover:bg-secondary',
                rangeOrDrop && 'bg-primary/25 text-foreground ring-1 ring-primary/35',
                isTodayCell &&
                  !rangeOrDrop &&
                  'bg-destructive text-destructive-foreground shadow-sm ring-1 ring-destructive/30 hover:bg-destructive/90',
                isTodayCell && rangeOrDrop && 'bg-primary/35 text-foreground ring-2 ring-destructive/50'
              )}
            >
              {format(d, 'd')}
            </button>
          )
        })}
      </div>
    </div>
  )
}
