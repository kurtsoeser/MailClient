import { useMemo, useState } from 'react'
import type { Locale } from 'date-fns'
import { addDays, addWeeks, format, isSameDay, startOfWeek } from 'date-fns'
import { de, enUS } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ContextMenu } from '@/components/ContextMenu'
import { cn } from '@/lib/utils'

export function DashboardMiniWeek(props: {
  onOpenCalendarDay?: (day: Date) => void
  onCreateEventOnDay?: (day: Date) => void
}): JSX.Element {
  const { onOpenCalendarDay, onCreateEventOnDay } = props
  const { t, i18n } = useTranslation()
  const dfLocale: Locale = i18n.language.startsWith('de') ? de : enUS

  const [weekOffset, setWeekOffset] = useState(0)
  const [contextMenu, setContextMenu] = useState<null | { x: number; y: number; day: Date }>(null)

  const days = useMemo(() => {
    const weekStart = addWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), weekOffset)
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  }, [weekOffset])

  const today = new Date()
  const dayInteractive = onOpenCalendarDay != null || onCreateEventOnDay != null

  return (
    <>
    <div className="flex h-full min-h-0 flex-col px-2 py-2">
      <div className="mb-1 flex items-center justify-between gap-1">
        <button
          type="button"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/30 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          aria-label={t('dashboard.miniWeekPrevWeek')}
          title={t('dashboard.miniWeekPrevWeek')}
          onClick={(): void => {
            setWeekOffset((o) => o - 1)
          }}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <div className="min-w-0 flex-1 truncate text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {t('dashboard.miniWeekHeading', { date: format(days[0]!, 'd. MMM', { locale: dfLocale }) })}
        </div>
        <button
          type="button"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/30 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          aria-label={t('dashboard.miniWeekNextWeek')}
          title={t('dashboard.miniWeekNextWeek')}
          onClick={(): void => {
            setWeekOffset((o) => o + 1)
          }}
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7 gap-1">
        {days.map((day) => {
          const isToday = isSameDay(day, today)
          const key = day.toISOString()
          const inner = (
            <>
              <span className="text-[10px] font-semibold uppercase leading-none text-muted-foreground">
                {format(day, 'EEE', { locale: dfLocale })}
              </span>
              <span
                className={cn(
                  'text-base font-semibold tabular-nums sm:text-lg',
                  isToday && 'text-primary'
                )}
              >
                {format(day, 'd', { locale: dfLocale })}
              </span>
            </>
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
                  'flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-md border px-0.5 py-1 text-center transition-colors',
                  isToday
                    ? 'border-primary bg-primary/10 text-foreground hover:bg-primary/15'
                    : 'border-border/60 bg-muted/25 text-foreground hover:bg-muted/40'
                )}
              >
                {inner}
              </button>
            )
          }
          return (
            <div
              key={key}
              className={cn(
                'flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-md border px-0.5 py-1 text-center',
                isToday
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border/60 bg-muted/25 text-muted-foreground'
              )}
            >
              {inner}
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
            id: 'dashboard-mini-week-new-event',
            label: t('dashboard.miniCalendarNewEventThisDay'),
            icon: Plus,
            onSelect: (): void => {
              onCreateEventOnDay(contextMenu.day)
            }
          }
        ]}
        onClose={(): void => setContextMenu(null)}
      />
    ) : null}
    </>
  )
}
