import type { RefObject } from 'react'
import { format, getWeek } from 'date-fns'
import { de as deFns, enUS as enFns } from 'date-fns/locale'
import { useTranslation } from 'react-i18next'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  PanelLeft,
  PanelLeftClose,
  Plus
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  ModuleColumnHeaderIconButton,
  moduleColumnHeaderIconGlyphClass,
  moduleColumnHeaderToolbarToggleClass
} from '@/components/ModuleColumnHeader'
import {
  CalendarPosteingangToolbarButton,
  CalendarPreviewPaneToolbarButton
} from '@/app/calendar/CalendarRightPosteingang'
import { MAX_TIME_GRID_SPAN_DAYS, viewIdToLabel } from '@/app/calendar/calendar-shell-view-helpers'
import type { TimeGridSlotMinutes } from '@/app/calendar/calendar-shell-storage'
import {
  isTimeGridSlotMinutes,
  TIME_GRID_SLOT_MINUTES_OPTIONS
} from '@/app/calendar/calendar-shell-storage'

export interface CalendarSidebarHiddenRestoreEntry {
  key: string
  accountLabel: string
  calendarName: string
}

export interface CalendarShellHeaderProps {
  rangeTitle: string
  visibleStart: Date
  dragCreateHint: string | null
  rightInboxOpen: boolean
  onRightInboxOpenChange: (open: boolean) => void
  rightPreviewOpen: boolean
  onRightPreviewOpenChange: (open: boolean) => void
  viewMenuRef: RefObject<HTMLDivElement>
  viewMenuOpen: boolean
  setViewMenuOpen: (open: boolean | ((prev: boolean) => boolean)) => void
  activeViewId: string
  changeView: (viewId: string) => void
  daysSubOpen: boolean
  setDaysSubOpen: (open: boolean) => void
  settingsSubOpen: boolean
  setSettingsSubOpen: (open: boolean) => void
  /** Kalender, die nur in der Seitenleiste ausgeblendet sind (Wiederherstellung). */
  calendarSidebarHiddenRestoreEntries?: CalendarSidebarHiddenRestoreEntry[]
  onRestoreCalendarToSidebar?: (visibilityKey: string) => void
  /** Tag-/Wochenraster in Minuten (FullCalendar). */
  timeGridSlotMinutes?: TimeGridSlotMinutes
  onTimeGridSlotMinutesChange?: (min: TimeGridSlotMinutes) => void
  onCalendarToday: () => void
  onCalendarPrev: () => void
  onCalendarNext: () => void
  leftSidebarCollapsed: boolean
  onLeftSidebarCollapsedChange: (collapsed: boolean) => void
  /** Kalender: neuer Termin (Erstellungsdialog). */
  onNewEventClick?: (anchor: { clientX: number; clientY: number }) => void
  newEventDisabled?: boolean
}

export function CalendarShellHeader(props: CalendarShellHeaderProps): JSX.Element {
  const { t, i18n } = useTranslation()
  const dateFnsLocale = i18n.language.startsWith('de') ? deFns : enFns
  const {
    rangeTitle,
    visibleStart,
    dragCreateHint,
    rightInboxOpen,
    onRightInboxOpenChange,
    rightPreviewOpen,
    onRightPreviewOpenChange,
    viewMenuRef,
    viewMenuOpen,
    setViewMenuOpen,
    activeViewId,
    changeView,
    daysSubOpen,
    setDaysSubOpen,
    settingsSubOpen,
    setSettingsSubOpen,
    calendarSidebarHiddenRestoreEntries,
    onRestoreCalendarToSidebar,
    timeGridSlotMinutes,
    onTimeGridSlotMinutesChange,
    onCalendarToday,
    onCalendarPrev,
    onCalendarNext,
    leftSidebarCollapsed,
    onLeftSidebarCollapsedChange,
    onNewEventClick,
    newEventDisabled
  } = props

  const weekAnchor =
    visibleStart instanceof Date && !Number.isNaN(visibleStart.getTime())
      ? visibleStart
      : new Date()

  const weekNavBtnClass = moduleColumnHeaderToolbarToggleClass(false)

  const viewMenuPanelClass =
    'absolute right-0 top-full z-[100] mt-1 min-w-[min(100vw-1rem,220px)] max-w-[min(100vw-1rem,280px)] rounded-xl border border-border bg-popover py-1 text-popover-foreground shadow-xl sm:min-w-[220px] sm:max-w-none'

  return (
    <header
      className={cn(
        'calendar-shell-column-header calendar-shell-header-responsive relative z-50 min-h-0 flex-1 bg-card px-2 py-1 sm:px-3 sm:py-1.5 lg:px-4 lg:py-1.5'
      )}
    >
      <div className="calendar-shell-header-area-side flex items-center">
        <ModuleColumnHeaderIconButton
          title={
            leftSidebarCollapsed
              ? t('calendar.shell.leftSidebarExpand')
              : t('calendar.shell.leftSidebarCollapse')
          }
          aria-pressed={!leftSidebarCollapsed}
          variant="toolbar"
          pressed={!leftSidebarCollapsed}
          onClick={(): void => onLeftSidebarCollapsedChange(!leftSidebarCollapsed)}
        >
          {leftSidebarCollapsed ? (
            <PanelLeft className={moduleColumnHeaderIconGlyphClass} aria-hidden />
          ) : (
            <PanelLeftClose className={moduleColumnHeaderIconGlyphClass} aria-hidden />
          )}
        </ModuleColumnHeaderIconButton>
      </div>

      <div
        className={cn(
          'calendar-shell-header-area-date flex min-h-0 min-w-0 items-center justify-center gap-1 sm:gap-2'
        )}
      >
        <button
          type="button"
          aria-label={t('calendar.header.prevAria')}
          onClick={onCalendarPrev}
          className={weekNavBtnClass}
        >
          <ChevronLeft className={moduleColumnHeaderIconGlyphClass} />
        </button>
        <div className="min-w-0 max-w-full flex-1 text-center sm:max-w-[min(100%,28rem)]">
          <h1
            className={cn(
              'truncate font-semibold tracking-tight text-foreground',
              'text-[15px] leading-snug sm:text-[16px] lg:text-[18px]'
            )}
          >
            {rangeTitle}
          </h1>
          <p className="truncate text-[11px] text-muted-foreground sm:text-[12px]">
            {t('calendar.header.weekPrefix')}{' '}
            {getWeek(weekAnchor, { weekStartsOn: 1, firstWeekContainsDate: 4 })} ·{' '}
            {format(weekAnchor, 'MMMM yyyy', { locale: dateFnsLocale })}
          </p>
          {dragCreateHint ? (
            <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-muted-foreground sm:text-[11px]">
              {dragCreateHint}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          aria-label={t('calendar.header.nextAria')}
          onClick={onCalendarNext}
          className={weekNavBtnClass}
        >
          <ChevronRight className={moduleColumnHeaderIconGlyphClass} />
        </button>
      </div>

      <div
        className={cn(
          'calendar-shell-header-area-actions flex min-w-0 flex-wrap items-center justify-end gap-1 sm:gap-1.5'
        )}
      >
        <CalendarPosteingangToolbarButton
          open={rightInboxOpen}
          onOpenChange={onRightInboxOpenChange}
        />
        <CalendarPreviewPaneToolbarButton
          open={rightPreviewOpen}
          onOpenChange={onRightPreviewOpenChange}
        />

        {onNewEventClick != null ? (
          <button
            type="button"
            disabled={Boolean(newEventDisabled)}
            title={
              newEventDisabled ? t('calendar.shell.noLinkedAccount') : t('calendar.shell.newEvent')
            }
            aria-label={t('calendar.shell.newEvent')}
            onClick={(e): void => {
              if (newEventDisabled) return
              onNewEventClick({ clientX: e.clientX, clientY: e.clientY })
            }}
            className={cn(
              'flex shrink-0 items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 sm:gap-1.5 sm:px-2.5 sm:text-xs',
              newEventDisabled && 'cursor-not-allowed opacity-45'
            )}
          >
            <Plus className={cn(moduleColumnHeaderIconGlyphClass, 'shrink-0')} />
            <span className="calendar-shell-header-new-event-label">
              {t('calendar.shell.newEvent')}
            </span>
          </button>
        ) : null}

        <button
          type="button"
          onClick={onCalendarToday}
          className="shrink-0 rounded-md px-2 py-1 text-[11px] font-medium text-foreground hover:bg-secondary/80 sm:text-xs"
        >
          {t('calendar.header.today')}
        </button>

        <div className="relative shrink-0" ref={viewMenuRef}>
          <button
            type="button"
            onClick={(e): void => {
              e.stopPropagation()
              setViewMenuOpen((o) => !o)
            }}
            className="flex max-w-[7.5rem] items-center gap-1 rounded-md border border-border bg-secondary py-1 pl-1.5 pr-1 text-[11px] font-medium text-secondary-foreground hover:bg-secondary/80 sm:max-w-none sm:gap-1.5 sm:px-2 sm:text-xs"
          >
            <span className="min-w-0 truncate">{viewIdToLabel(activeViewId, t)}</span>
            <ChevronDown className={cn(moduleColumnHeaderIconGlyphClass, 'shrink-0 text-muted-foreground')} />
          </button>

          {viewMenuOpen && (
            <div className={viewMenuPanelClass} onMouseDown={(e): void => e.stopPropagation()}>
              <ViewMenuRow
                label={t('calendar.views.day')}
                hint="1 oder D"
                active={activeViewId === 'timeGridDay'}
                onPick={(): void => changeView('timeGridDay')}
              />
              <ViewMenuRow
                label={t('calendar.views.week')}
                hint="0 oder W"
                active={activeViewId === 'timeGridWeek'}
                onPick={(): void => changeView('timeGridWeek')}
              />
              <ViewMenuRow
                label={t('calendar.views.month')}
                hint="M"
                active={activeViewId === 'dayGridMonth'}
                onPick={(): void => changeView('dayGridMonth')}
              />
              <ViewMenuRow
                label={t('calendar.views.list')}
                hint="L"
                active={activeViewId === 'listWeek'}
                onPick={(): void => changeView('listWeek')}
              />
              <div className="my-1 h-px bg-border" />
              <div
                className="relative"
                onMouseEnter={(): void => setDaysSubOpen(true)}
                onMouseLeave={(): void => setDaysSubOpen(false)}
              >
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-[13px] hover:bg-accent"
                >
                  <span>{t('calendar.header.countDays')}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
                {daysSubOpen && (
                  <div
                    className={cn(
                      'absolute top-0 z-[110] min-w-[140px] rounded-xl border border-border bg-popover py-1 text-popover-foreground shadow-xl',
                      'right-full -translate-x-1 max-md:left-0 max-md:right-auto max-md:mt-1 max-md:max-h-[min(50vh,280px)] max-md:translate-x-0 max-md:overflow-y-auto',
                      'md:right-full md:translate-x-1'
                    )}
                  >
                    {Array.from({ length: MAX_TIME_GRID_SPAN_DAYS - 1 }, (_, i) => i + 2).map(
                      (n) => (
                        <button
                          key={n}
                          type="button"
                          className={cn(
                            'flex w-full items-center justify-between px-3 py-1.5 text-[13px] hover:bg-accent',
                            activeViewId === `timeGrid${n}Day` && 'bg-muted'
                          )}
                          onClick={(): void => changeView(`timeGrid${n}Day`)}
                        >
                          <span>{t('calendar.header.nDaysMenu', { count: n })}</span>
                          <span className="text-[11px] text-muted-foreground">{n}</span>
                        </button>
                      )
                    )}
                  </div>
                )}
              </div>
              <div className="my-1 h-px bg-border" />
              <div
                className="relative"
                onMouseEnter={(): void => setSettingsSubOpen(true)}
                onMouseLeave={(): void => setSettingsSubOpen(false)}
              >
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-[13px] hover:bg-accent"
                >
                  <span>{t('calendar.header.viewSettings')}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
                {settingsSubOpen && (
                  <div
                    className={cn(
                      'absolute top-0 z-[110] flex max-h-[min(72vh,520px)] w-[min(92vw,320px)] flex-col rounded-xl border border-border bg-popover px-3 py-2 text-[12px] leading-snug text-muted-foreground shadow-xl',
                      'right-full -translate-x-1 max-md:left-0 max-md:right-auto max-md:mt-1 max-md:translate-x-0',
                      'md:right-full md:translate-x-1'
                    )}
                  >
                    <p className="shrink-0">{t('calendar.header.viewSettingsBody')}</p>
                    {timeGridSlotMinutes != null && onTimeGridSlotMinutesChange != null ? (
                      <div className="mt-2 shrink-0 space-y-1">
                        <label
                          className="block text-[11px] font-semibold text-foreground"
                          htmlFor="cal-slot-min-select"
                        >
                          {t('calendar.header.slotDurationLabel')}
                        </label>
                        <select
                          id="cal-slot-min-select"
                          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-[12px] text-foreground"
                          value={timeGridSlotMinutes}
                          onChange={(ev): void => {
                            const n = Number(ev.target.value)
                            if (isTimeGridSlotMinutes(n)) {
                              onTimeGridSlotMinutesChange(n)
                            }
                          }}
                          onMouseDown={(ev): void => ev.stopPropagation()}
                          onClick={(ev): void => ev.stopPropagation()}
                        >
                          {TIME_GRID_SLOT_MINUTES_OPTIONS.map((m) => (
                            <option key={m} value={m}>
                              {t('calendar.header.slotMinutesOption', { count: m })}
                            </option>
                          ))}
                        </select>
                        <p className="text-[10px] leading-snug text-muted-foreground/90">
                          {t('calendar.header.slotDurationShortcuts')}
                        </p>
                      </div>
                    ) : null}
                    {calendarSidebarHiddenRestoreEntries != null &&
                    calendarSidebarHiddenRestoreEntries.length > 0 ? (
                      <>
                        <div className="my-2 h-px shrink-0 bg-border" />
                        <p className="mb-1.5 shrink-0 text-[11px] font-semibold text-foreground">
                          {t('calendar.header.sidebarHiddenSectionTitle')}
                        </p>
                        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain pr-0.5">
                          {calendarSidebarHiddenRestoreEntries.map((e) => (
                            <li
                              key={e.key}
                              className="flex items-start gap-1.5 rounded-md border border-border/60 bg-muted/25 px-2 py-1.5"
                            >
                              <div className="min-w-0 flex-1">
                                <p
                                  className="truncate text-[11px] font-medium text-foreground"
                                  title={e.calendarName}
                                >
                                  {e.calendarName}
                                </p>
                                <p
                                  className="truncate text-[10px] text-muted-foreground"
                                  title={e.accountLabel}
                                >
                                  {e.accountLabel}
                                </p>
                              </div>
                              <button
                                type="button"
                                className="shrink-0 rounded-md bg-primary/90 px-2 py-1 text-[10px] font-medium text-primary-foreground hover:bg-primary"
                                onClick={(ev): void => {
                                  ev.stopPropagation()
                                  onRestoreCalendarToSidebar?.(e.key)
                                }}
                              >
                                {t('calendar.header.sidebarHiddenRestore')}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

function ViewMenuRow({
  label,
  hint,
  active,
  onPick
}: {
  label: string
  hint: string
  active: boolean
  onPick: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onPick}
      className={cn(
        'flex w-full items-center justify-between px-3 py-2 text-left text-[13px] hover:bg-accent',
        active && 'bg-muted'
      )}
    >
      <span className="flex items-center gap-2">
        {active && <span className="text-foreground">✓</span>}
        {!active && <span className="w-3" />}
        {label}
      </span>
      {hint ? <span className="text-[11px] tabular-nums text-muted-foreground">{hint}</span> : null}
    </button>
  )
}
