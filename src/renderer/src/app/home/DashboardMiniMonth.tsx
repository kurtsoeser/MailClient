import { useMemo, useState } from 'react'
import type { Locale } from 'date-fns'
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek
} from 'date-fns'
import { de, enUS } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ContextMenu } from '@/components/ContextMenu'
import { cn } from '@/lib/utils'

export function DashboardMiniMonth(props: {
  onOpenCalendarDay?: (day: Date) => void
  onCreateEventOnDay?: (day: Date, anchor: { x: number; y: number }) => void
}): JSX.Element {
  const { onOpenCalendarDay, onCreateEventOnDay } = props
  const { t, i18n } = useTranslation()
  const dfLocale: Locale = i18n.language.startsWith('de') ? de : enUS

  const [monthOffset, setMonthOffset] = useState(0)
  const [contextMenu, setContextMenu] = useState<null | { x: number; y: number; day: Date }>(null)

  const { days, monthAnchor, weekdayLabels } = useMemo(() => {
    const monthStart = addMonths(startOfMonth(new Date()), monthOffset)
    const mEnd = endOfMonth(monthStart)
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
    const gridEnd = endOfWeek(mEnd, { weekStartsOn: 1 })
    const d = eachDayOfInterval({ start: gridStart, end: gridEnd })
    const labels = Array.from({ length: 7 }, (_, i) =>
      format(addDays(gridStart, i), 'EEE', { locale: dfLocale })
    )
    return { days: d, monthAnchor: monthStart, weekdayLabels: labels }
  }, [monthOffset, dfLocale])

  const today = new Date()
  const dayInteractive = onOpenCalendarDay != null || onCreateEventOnDay != null

  return (
    <>
    <div className="flex h-full min-h-0 flex-col px-2 py-2">
      <div className="mb-1 flex items-center justify-between gap-1">
        <button
          type="button"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/30 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          aria-label={t('dashboard.miniMonthPrevMonth')}
          title={t('dashboard.miniMonthPrevMonth')}
          onClick={(): void => {
            setMonthOffset((o) => o - 1)
          }}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <div className="min-w-0 flex-1 truncate text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {t('dashboard.miniMonthHeading', { month: format(monthAnchor, 'LLLL yyyy', { locale: dfLocale }) })}
        </div>
        <button
          type="button"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/30 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          aria-label={t('dashboard.miniMonthNextMonth')}
          title={t('dashboard.miniMonthNextMonth')}
          onClick={(): void => {
            setMonthOffset((o) => o + 1)
          }}
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="mb-1 grid grid-cols-7 gap-0.5 text-center">
        {weekdayLabels.map((label, i) => (
          <div
            key={`${label}-${i}`}
            className="truncate text-[10px] font-semibold uppercase leading-none text-muted-foreground/90"
          >
            {label}
          </div>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-7 gap-0.5">
        {days.map((day) => {
          const inMonth = isSameMonth(day, monthAnchor)
          const isToday = isSameDay(day, today)
          const key = format(day, 'yyyy-MM-dd')
          const dayNum = (
            <span
              className={cn(
                'text-base font-semibold tabular-nums leading-none sm:text-lg',
                inMonth && isToday && 'text-primary'
              )}
            >
              {format(day, 'd', { locale: dfLocale })}
            </span>
          )
          if (dayInteractive) {
            return (
              <button
                key={key}
                type="button"
                onClick={(): void => {
                  if (onOpenCalendarDay) onOpenCalendarDay(day)
                }}
                onContextMenu={
                  onCreateEventOnDay
                    ? (e): void => {
                        e.preventDefault()
                        e.stopPropagation()
                        setContextMenu({ x: e.clientX, y: e.clientY, day })
                      }
                    : undefined
                }
                className={cn(
                  'flex min-h-0 items-center justify-center rounded-md border px-0.5 py-1 text-center transition-colors',
                  !inMonth && 'border-transparent bg-transparent text-muted-foreground/50 opacity-60',
                  inMonth && isToday && 'border-primary bg-primary/10 text-foreground',
                  inMonth && !isToday && 'border-border/60 bg-muted/25 text-foreground',
                  inMonth && 'cursor-pointer hover:bg-primary/5',
                  !inMonth && 'cursor-pointer hover:opacity-90'
                )}
              >
                {dayNum}
              </button>
            )
          }
          return (
            <div
              key={key}
              className={cn(
                'flex min-h-0 items-center justify-center rounded-md border px-0.5 py-1 text-center transition-colors',
                !inMonth && 'border-transparent bg-transparent text-muted-foreground/50 opacity-60',
                inMonth && isToday && 'border-primary bg-primary/10 text-foreground',
                inMonth && !isToday && 'border-border/60 bg-muted/25 text-foreground'
              )}
            >
              {dayNum}
            </div>
          )
        })}
      </div>
    </div>
    {contextMenu != null && onCreateEventOnDay != null ? (
      <ContextMenu
        x={contextMenu.x}
        y={contextMenu.y}
        items={[
          {
            id: 'dashboard-mini-month-new-event',
            label: t('dashboard.miniCalendarNewEventThisDay'),
            icon: Plus,
            onSelect: (): void => {
              onCreateEventOnDay(contextMenu.day, { x: contextMenu.x, y: contextMenu.y })
            }
          }
        ]}
        onClose={(): void => setContextMenu(null)}
      />
    ) : null}
    </>
  )
}
