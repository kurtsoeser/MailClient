import { useCallback, useEffect, useMemo, useState } from 'react'
import { addMonths, format, isSameDay, isToday, isTomorrow, parseISO, startOfMonth } from 'date-fns'
import { de as deFns, enUS as enUSFns } from 'date-fns/locale'
import type { Locale } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { Loader2, SquareArrowOutUpRight } from 'lucide-react'
import type { MailListItem } from '@shared/types'
import { cn } from '@/lib/utils'
import { useMailStore } from '@/stores/mail'
import { useAccountsStore } from '@/stores/accounts'
import { useAppModeStore } from '@/stores/app-mode'
import { useCalendarPendingFocusStore } from '@/stores/calendar-pending-focus'
import {
  useInboxCalendarAgendaCacheStore,
  type InboxAgendaRow
} from '@/stores/inbox-calendar-agenda-cache'
import { resolvedAccountColorCss } from '@/lib/avatar-color'
import { MIME_THREAD_IDS, readDraggedWorkflowMessageIds } from '@/lib/workflow-dnd'
import {
  defaultScheduleForCalendarDayFc,
  mailListItemTodoScheduleWindow
} from '@/app/calendar/mail-todo-calendar'
import { ModuleNavMiniMonth } from '@/components/ModuleNavMiniMonth'
import { moduleNavColumnClass } from '@/components/module-shell-layout'
import { CALENDAR_VISIBILITY_CHANGED_EVENT } from '@/lib/calendar-visibility-storage'
import {
  ModuleColumnHeaderIconButton,
  moduleColumnHeaderDockBarRowClass,
  moduleColumnHeaderIconGlyphClass,
  moduleColumnHeaderUppercaseLabelClass
} from '@/components/ModuleColumnHeader'

export type InboxCalendarSidebarProps = {
  /** Kein eigener Titel-/Abdock-Balken (schwebendes Fenster bringt die Leiste mit). */
  hideChrome?: boolean
  /** Eingebettet: als schwebendes Fenster loesen. */
  onRequestUndock?: () => void
}

function capitalizeLocale(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function dataTransferLooksLikeMailDrag(dt: DataTransfer): boolean {
  const types = Array.from(dt.types ?? [])
  return (
    types.includes(MIME_THREAD_IDS) ||
    types.includes('text/plain') ||
    types.includes('text/mailclient-message-id') ||
    types.includes('application/x-mailclient-message-id')
  )
}

export function InboxCalendarSidebar({
  hideChrome = false,
  onRequestUndock
}: InboxCalendarSidebarProps = {}): JSX.Element {
  const { t, i18n } = useTranslation()
  const dfLocale: Locale = i18n.language.startsWith('de') ? deFns : enUSFns

  const formatDayHeading = useCallback(
    (date: Date): string => {
      if (isToday(date)) return t('mail.inboxCal.today')
      if (isTomorrow(date)) return t('mail.inboxCal.tomorrow')
      return capitalizeLocale(format(date, 'EEEE', { locale: dfLocale }))
    },
    [dfLocale, t]
  )

  const formatAgendaTime = useCallback(
    (row: InboxAgendaRow): string => {
      if (row.kind === 'graph' && row.ev.isAllDay) return t('mail.inboxCal.allDay')
      if (row.kind === 'mail') {
        const w = mailListItemTodoScheduleWindow(row.message)
        if (w?.allDay) return t('mail.inboxCal.allDay')
      }
      const startIso = row.kind === 'graph' ? row.ev.startIso : row.message.todoStartAt ?? row.message.todoDueAt
      if (!startIso) return ''
      const d = parseISO(startIso)
      if (Number.isNaN(d.getTime())) return ''
      return format(d, 'HH:mm')
    },
    [t]
  )

  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()))
  const [dropHoverDate, setDropHoverDate] = useState<string | null>(null)

  const agenda = useInboxCalendarAgendaCacheStore((s) => s.agenda)
  const calError = useInboxCalendarAgendaCacheStore((s) => s.error)
  const inFlight = useInboxCalendarAgendaCacheStore((s) => s.inFlight)
  const loadAgendaFromCache = useInboxCalendarAgendaCacheStore((s) => s.loadAgenda)
  const blockingLoading = inFlight && agenda.length === 0 && calError == null

  const accounts = useAccountsStore((s) => s.accounts)
  const calendarLinkedAccounts = useMemo(
    () => accounts.filter((a) => a.provider === 'microsoft' || a.provider === 'google'),
    [accounts]
  )
  const selectMessage = useMailStore((s) => s.selectMessage)
  const setTodoScheduleForMessage = useMailStore((s) => s.setTodoScheduleForMessage)
  const setAppMode = useAppModeStore((s) => s.setMode)

  const accountById = useMemo(
    () => new Map(accounts.map((a) => [a.id, a] as const)),
    [accounts]
  )

  const loadAgenda = useCallback(
    (opts?: { force?: boolean }): void => {
      void loadAgendaFromCache(calendarLinkedAccounts, opts)
    },
    [calendarLinkedAccounts, loadAgendaFromCache]
  )

  useEffect(() => {
    loadAgenda()
  }, [loadAgenda])

  useEffect(() => {
    const onVis = (): void => {
      loadAgenda({ force: true })
    }
    window.addEventListener(CALENDAR_VISIBILITY_CHANGED_EVENT, onVis)
    return () => window.removeEventListener(CALENDAR_VISIBILITY_CHANGED_EVENT, onVis)
  }, [loadAgenda])

  useEffect(() => {
    if (!window.mailClient?.events?.onMailChanged) {
      return undefined
    }
    const off = window.mailClient.events.onMailChanged(() => {
      loadAgenda({ force: true })
    })
    return off
  }, [loadAgenda])

  const onDayDragOver = useCallback((e: React.DragEvent, dateStr: string): void => {
    if (!e.dataTransfer || !dataTransferLooksLikeMailDrag(e.dataTransfer)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropHoverDate(dateStr)
  }, [])

  const onDayDragLeave = useCallback((e: React.DragEvent, dateStr: string): void => {
    e.preventDefault()
    if (dropHoverDate === dateStr) setDropHoverDate(null)
  }, [dropHoverDate])

  const onDayDrop = useCallback(
    (e: React.DragEvent, dateStr: string): void => {
      setDropHoverDate(null)
      if (!e.dataTransfer || !dataTransferLooksLikeMailDrag(e.dataTransfer)) return
      const dragged = readDraggedWorkflowMessageIds(e.dataTransfer)
      if (dragged.length === 0) return
      e.preventDefault()
      e.stopPropagation()
      const range = defaultScheduleForCalendarDayFc(dateStr, 'local')
      void (async (): Promise<void> => {
        try {
          for (const mid of dragged) {
            await setTodoScheduleForMessage(mid, range.startIso, range.endIso, {
              skipSelectedRefresh: true
            })
          }
          await useMailStore.getState().reloadSelectedMessageFromDb()
          loadAgenda({ force: true })
        } catch (err) {
          console.warn('[InboxCalendarSidebar] drop schedule failed', err)
        }
      })()
    },
    [setTodoScheduleForMessage, loadAgenda]
  )

  const inboxDropHandlers = useMemo(
    () => ({
      dropHoverDate,
      onDayDragOver,
      onDayDragLeave,
      onDayDrop
    }),
    [dropHoverDate, onDayDragOver, onDayDragLeave, onDayDrop]
  )

  const stripDragOver = useCallback((): void => {
    setDropHoverDate(null)
  }, [])

  return (
    <aside
      className={cn(
        moduleNavColumnClass,
        hideChrome ? 'border-0 border-r-0' : 'border-l border-r-0'
      )}
      onDragLeave={(e): void => {
        if (e.currentTarget === e.target) stripDragOver()
      }}
    >
      {!hideChrome && onRequestUndock ? (
        <div
          className={cn(
            moduleColumnHeaderDockBarRowClass,
            'shrink-0 border-b border-border'
          )}
        >
          <span className={moduleColumnHeaderUppercaseLabelClass}>
            {t('mail.inboxCal.chromeTitle')}
          </span>
          <ModuleColumnHeaderIconButton
            title={t('mail.inboxCal.undockTitle')}
            onClick={onRequestUndock}
          >
            <SquareArrowOutUpRight className={moduleColumnHeaderIconGlyphClass} />
          </ModuleColumnHeaderIconButton>
        </div>
      ) : null}

      <div className={cn('shrink-0 px-3 pb-2', hideChrome ? 'pt-3' : 'pt-2')}>
        <ModuleNavMiniMonth
          monthAnchor={visibleMonth}
          today={new Date()}
          onPrevMonth={(): void => {
            setVisibleMonth((d) => addMonths(d, -1))
            stripDragOver()
          }}
          onNextMonth={(): void => {
            setVisibleMonth((d) => addMonths(d, 1))
            stripDragOver()
          }}
          inboxDrop={inboxDropHandlers}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden border-t border-border">
        <div className="sticky top-0 z-[1] border-b border-border bg-sidebar/95 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
          {t('mail.inboxCal.nextEvents')}
        </div>
        {blockingLoading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-[11px] text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t('mail.inboxCal.loading')}
          </div>
        ) : calError ? (
          <p className="px-2 py-2 text-[10px] leading-snug text-destructive">{calError}</p>
        ) : agenda.length === 0 ? (
          <p className="px-2 py-3 text-center text-[10px] text-muted-foreground">
            {t('mail.inboxCal.noUpcoming')}
          </p>
        ) : (
          <ul className="space-y-0 border-border/60 p-1">
            {agenda.map((row, idx) => {
              const startDate = new Date(row.startMs)
              const prev = idx > 0 ? agenda[idx - 1] : null
              const prevStart = prev ? new Date(prev.startMs) : null
              const showDay = !prevStart || !isSameDay(startDate, prevStart)
              const subline =
                row.kind === 'graph' && row.ev.joinUrl?.trim()
                  ? t('mail.inboxCal.teamsMeeting')
                  : row.kind === 'mail'
                    ? t('mail.inboxCal.mailTodo')
                    : null
              const title =
                row.kind === 'graph'
                  ? row.ev.title?.trim() || t('mail.inboxCal.noTitle')
                  : row.message.subject?.trim() || t('common.noSubject')
              const acc =
                row.kind === 'graph'
                  ? accountById.get(row.ev.accountId)
                  : accountById.get(row.message.accountId)
              const dotStyle =
                row.kind === 'graph' && row.ev.displayColorHex?.trim()
                  ? { backgroundColor: row.ev.displayColorHex.trim() }
                  : acc
                    ? { backgroundColor: resolvedAccountColorCss(acc.color) }
                    : { backgroundColor: 'hsl(var(--primary))' }

              return (
                <li key={`${row.kind}-${row.kind === 'graph' ? row.ev.id : row.message.id}-${idx}`}>
                  {showDay && (
                    <div className="px-1.5 pb-0.5 pt-2 text-[11px] font-semibold capitalize text-foreground first:pt-1">
                      {formatDayHeading(startDate)}
                    </div>
                  )}
                  <button
                    type="button"
                    className="flex w-full items-stretch gap-1.5 rounded-md px-1 py-1 text-left hover:bg-secondary/60"
                    onClick={(): void => {
                      if (row.kind === 'mail') {
                        void selectMessage(row.message.id)
                        return
                      }
                      useCalendarPendingFocusStore.getState().queueFocusEvent(row.ev)
                      setAppMode('calendar')
                    }}
                  >
                    <span className="w-9 shrink-0 pt-0.5 text-[10px] tabular-nums text-muted-foreground">
                      {formatAgendaTime(row)}
                    </span>
                    <span
                      className={cn(
                        'mt-0.5 h-8 shrink-0 rounded-sm',
                        row.kind === 'mail' && 'w-[3px] min-w-[3px] bg-primary',
                        row.kind === 'graph' &&
                          row.ev.joinUrl?.trim() &&
                          'w-[5px] min-w-[5px] border border-dashed border-primary bg-transparent',
                        row.kind === 'graph' && !row.ev.joinUrl?.trim() && 'w-[3px] min-w-[3px]'
                      )}
                      style={
                        row.kind === 'graph' && !row.ev.joinUrl?.trim() ? dotStyle : undefined
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-[11px] font-medium leading-snug text-foreground">
                        {title}
                      </span>
                      {subline && (
                        <span className="line-clamp-1 text-[10px] text-muted-foreground">{subline}</span>
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </aside>
  )
}
