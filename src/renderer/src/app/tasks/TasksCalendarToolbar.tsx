import { useEffect, useRef, useState, type RefObject } from 'react'
import type FullCalendar from '@fullcalendar/react'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { MAX_TIME_GRID_SPAN_DAYS, viewIdToLabel } from '@/app/calendar/calendar-shell-view-helpers'
import type { CloudTaskCalendarDateMode } from '@/app/calendar/cloud-task-calendar'
import { persistTasksCalendarFcView } from '@/app/tasks/tasks-calendar-view-storage'
import { persistTasksCalendarDateMode } from '@/app/tasks/tasks-calendar-date-mode-storage'
import { moduleColumnHeaderDockBarRowClass } from '@/components/ModuleColumnHeader'

const VIEW_OPTIONS = [
  'dayGridMonth',
  'timeGridWeek',
  'timeGridDay',
  'listWeek',
  ...Array.from({ length: MAX_TIME_GRID_SPAN_DAYS - 1 }, (_, i) => `timeGrid${i + 2}Day`)
]

export interface TasksCalendarToolbarProps {
  calendarRef: RefObject<FullCalendar | null>
  calendarTitle: string
  activeFcView: string
  onActiveFcViewChange: (viewId: string) => void
  dateMode: CloudTaskCalendarDateMode
  onDateModeChange: (mode: CloudTaskCalendarDateMode) => void
}

export function TasksCalendarToolbar({
  calendarRef,
  calendarTitle,
  activeFcView,
  onActiveFcViewChange,
  dateMode,
  onDateModeChange
}: TasksCalendarToolbarProps): JSX.Element {
  const { t } = useTranslation()
  const [viewMenuOpen, setViewMenuOpen] = useState(false)
  const viewMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!viewMenuOpen) return
    function onDown(e: MouseEvent): void {
      if (viewMenuRef.current?.contains(e.target as Node)) return
      setViewMenuOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return (): void => window.removeEventListener('mousedown', onDown)
  }, [viewMenuOpen])

  const changeView = (viewId: string): void => {
    persistTasksCalendarFcView(viewId)
    onActiveFcViewChange(viewId)
    const api = calendarRef.current?.getApi()
    api?.changeView(viewId)
    setViewMenuOpen(false)
  }

  const calToday = (): void => calendarRef.current?.getApi()?.today()
  const calPrev = (): void => calendarRef.current?.getApi()?.prev()
  const calNext = (): void => calendarRef.current?.getApi()?.next()

  const setDateMode = (mode: CloudTaskCalendarDateMode): void => {
    persistTasksCalendarDateMode(mode)
    onDateModeChange(mode)
  }

  return (
    <div className={cn(moduleColumnHeaderDockBarRowClass, 'shrink-0 border-b border-border bg-card')}>
      <div className="flex min-w-0 flex-1 items-center gap-0.5">
        <button
          type="button"
          onClick={calPrev}
          className="rounded p-1 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
          aria-label={t('tasks.shell.calendarPrev')}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={calToday}
          className="rounded px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
        >
          {t('tasks.shell.calendarToday')}
        </button>
        <button
          type="button"
          onClick={calNext}
          className="rounded p-1 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
          aria-label={t('tasks.shell.calendarNext')}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <span className="min-w-0 truncate font-semibold text-foreground">{calendarTitle}</span>
      </div>
      <div
        className="flex shrink-0 items-center gap-0.5 rounded-md border border-border p-0.5"
        role="group"
        aria-label={t('tasks.shell.calendarDateModeAria')}
      >
        <button
          type="button"
          onClick={(): void => setDateMode('due')}
          className={cn(
            'rounded-md px-2 py-1 text-[10px] font-medium',
            dateMode === 'due'
              ? 'bg-secondary text-foreground'
              : 'text-muted-foreground hover:bg-secondary/50'
          )}
        >
          {t('tasks.shell.calendarDateDue')}
        </button>
        <button
          type="button"
          onClick={(): void => setDateMode('planned')}
          className={cn(
            'rounded-md px-2 py-1 text-[10px] font-medium',
            dateMode === 'planned'
              ? 'bg-secondary text-foreground'
              : 'text-muted-foreground hover:bg-secondary/50'
          )}
        >
          {t('tasks.shell.calendarDatePlanned')}
        </button>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <div className="relative" ref={viewMenuRef}>
          <button
            type="button"
            onClick={(): void => setViewMenuOpen((o) => !o)}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] font-medium hover:bg-secondary/60"
          >
            {viewIdToLabel(activeFcView, t)}
            <ChevronDown className={cn('h-3 w-3', viewMenuOpen && 'rotate-180')} />
          </button>
          {viewMenuOpen ? (
            <div className="absolute right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-md border border-border bg-popover py-1 shadow-lg">
              {VIEW_OPTIONS.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={(): void => changeView(id)}
                  className={cn(
                    'block w-full px-3 py-1.5 text-left text-xs hover:bg-secondary/70',
                    id === activeFcView && 'bg-secondary font-medium'
                  )}
                >
                  {viewIdToLabel(id, t)}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
