import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { format, isSameDay, parseISO } from 'date-fns'
import { de as deFns, enUS as enUSFns } from 'date-fns/locale'
import type { WorkItem } from '@shared/work-item'
import { useAccountsStore } from '@/stores/accounts'
import { useMailStore } from '@/stores/mail'
import { useComposeStore } from '@/stores/compose'
import { useAppModeStore } from '@/stores/app-mode'
import { useSnoozeUiStore } from '@/stores/snooze-ui'
import { useCreateCloudTaskUiStore } from '@/stores/create-cloud-task-ui'
import { TasksListViewMenu } from '@/components/TasksListViewMenu'
import { ContextMenu, type ContextMenuItem } from '@/components/ContextMenu'
import { MegaTimelineList } from '@/app/mega/MegaTimelineList'
import { loadMegaWorkItems } from '@/app/work-items/load-mega-work-items'
import { toggleWorkItemCompleted } from '@/app/work-items/work-item-actions'
import { openWorkItemInCalendar } from '@/app/work-items/work-item-calendar-nav'
import {
  buildWorkItemContextMenuItems,
  type WorkItemContextHandlers
} from '@/app/work-items/work-item-context-menu'
import {
  persistWorkListViewPrefs,
  readWorkListViewPrefs,
  type WorkListViewPrefsV1
} from '@/app/work-items/work-list-view-storage'
import type { WorkListArrangeContext } from '@/app/work-items/work-item-list-arrange'
import {
  computeMegaTimelineGroups,
  megaTimelineFilterCounts
} from '@/app/mega/mega-timeline-arrange'
import type { MailContextHandlers } from '@/lib/mail-context-menu'
import { accountSupportsCloudTasks } from '@/lib/cloud-task-accounts'
import { confirmDeleteCloudTasks } from '@/app/tasks/confirm-delete-cloud-task'
import { persistCalendarContentViewMode } from '@/app/calendar/calendar-content-view-mode-storage'
import {
  defaultTimelineLoadedRange,
  subtractTimelineWindow,
  addTimelineWindow,
  timelineRangeStartToday
} from '@/app/calendar/timeline-window'
import {
  persistTimelineWindowSize,
  readTimelineWindowSize,
  type TimelineWindowSize
} from '@/app/calendar/timeline-window-storage'
import { mergeWorkItemsByStableKey } from '@/app/work-items/work-item-range'

export interface CalendarTimelinePaneProps {
  /** `dock`: rechte Spalte (ohne doppelte Einleitung). */
  variant?: 'full' | 'dock'
  /** Parent erhöht den Wert → Daten neu laden. */
  reloadSignal?: number
  onLoadingChange?: (loading: boolean) => void
  reloadRef?: React.MutableRefObject<(() => void) | null>
  /** Auswahl → rechte Kalender-Vorschau (Mail / Termin / Cloud-Aufgabe). */
  onWorkItemFocused: (item: WorkItem) => void
}

export function CalendarTimelinePane({
  variant = 'full',
  reloadSignal,
  onLoadingChange,
  reloadRef,
  onWorkItemFocused
}: CalendarTimelinePaneProps): JSX.Element {
  const { t, i18n } = useTranslation()
  const accounts = useAccountsStore((s) => s.accounts)
  const selectMessage = useMailStore((s) => s.selectMessage)
  const setMessageRead = useMailStore((s) => s.setMessageRead)
  const toggleMessageFlag = useMailStore((s) => s.toggleMessageFlag)
  const archiveMessage = useMailStore((s) => s.archiveMessage)
  const deleteMessage = useMailStore((s) => s.deleteMessage)
  const setTodoForMessage = useMailStore((s) => s.setTodoForMessage)
  const completeTodoForMessage = useMailStore((s) => s.completeTodoForMessage)
  const setWaitingForMessage = useMailStore((s) => s.setWaitingForMessage)
  const clearWaitingForMessage = useMailStore((s) => s.clearWaitingForMessage)
  const refreshNow = useMailStore((s) => s.refreshNow)
  const openReply = useComposeStore((s) => s.openReply)
  const openForward = useComposeStore((s) => s.openForward)
  const openSnoozePicker = useSnoozeUiStore((s) => s.open)
  const setAppMode = useAppModeStore((s) => s.setMode)

  const taskAccounts = useMemo(
    () => accounts.filter((a) => a.provider === 'microsoft' || a.provider === 'google'),
    [accounts]
  )
  const calendarAccounts = taskAccounts

  const [windowSize, setWindowSize] = useState<TimelineWindowSize>(() => readTimelineWindowSize())
  const initialRange = defaultTimelineLoadedRange(readTimelineWindowSize())
  const [loadedStart, setLoadedStart] = useState<Date>(() => initialRange.loadedStart)
  const [loadedEnd, setLoadedEnd] = useState<Date>(() => initialRange.loadedEnd)
  const loadedStartRef = useRef(loadedStart)
  const loadedEndRef = useRef(loadedEnd)
  loadedStartRef.current = loadedStart
  loadedEndRef.current = loadedEnd

  const [items, setItems] = useState<WorkItem[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingEarlier, setLoadingEarlier] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [listViewPrefs, setListViewPrefs] = useState<WorkListViewPrefsV1>(() => readWorkListViewPrefs())
  const [selected, setSelected] = useState<WorkItem | null>(null)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    items: ContextMenuItem[]
  } | null>(null)

  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a] as const)), [accounts])
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const dfLocale = i18n.language.startsWith('de') ? deFns : enUSFns

  const arrangeCtx = useMemo((): WorkListArrangeContext => {
    return {
      accountLabel: (accountId: string): string => {
        const a = accountById.get(accountId)
        return a?.displayName?.trim() || a?.email || accountId
      },
      todoBucketLabel: (kind) => t(`mail.todoBucket.${kind}` as const),
      noDueLabel: t('tasks.listArrange.noDue'),
      openLabel: t('tasks.listArrange.statusOpen'),
      doneLabel: t('tasks.listArrange.statusDone'),
      mailSourceLabel: t('work.listArrange.sourceMail'),
      formatCalendarDayGroupLabel: (dayKey: string): string => {
        try {
          return format(parseISO(`${dayKey}T12:00:00`), 'EEEE, d. MMMM yyyy', { locale: dfLocale })
        } catch {
          return dayKey
        }
      }
    }
  }, [accountById, t, dfLocale])

  const groups = useMemo(
    () =>
      computeMegaTimelineGroups(
        items,
        listViewPrefs.filter,
        listViewPrefs.chrono,
        listViewPrefs.arrange,
        i18n.language,
        arrangeCtx,
        accountById,
        timeZone
      ),
    [
      items,
      listViewPrefs.filter,
      listViewPrefs.chrono,
      listViewPrefs.arrange,
      i18n.language,
      arrangeCtx,
      accountById,
      timeZone
    ]
  )

  const filterCounts = useMemo(() => megaTimelineFilterCounts(items), [items])

  const fetchRange = useCallback(
    async (rangeStart: Date, rangeEnd: Date): Promise<WorkItem[]> => {
      const result = await loadMegaWorkItems(taskAccounts, calendarAccounts, {
        rangeStart,
        rangeEnd,
        includeCompletedMail: true
      })
      return result.items
    },
    [taskAccounts, calendarAccounts]
  )

  const applySelectionAfterLoad = useCallback(
    (loaded: WorkItem[]): void => {
      setSelected((prev) => {
        if (!prev) return null
        const next = loaded.find((i) => i.stableKey === prev.stableKey) ?? null
        if (next) onWorkItemFocused(next)
        return next
      })
    },
    [onWorkItemFocused]
  )

  const reload = useCallback(
    async (opts?: { silent?: boolean }): Promise<void> => {
      const silent = opts?.silent === true
      if (!silent) {
        setLoading(true)
        onLoadingChange?.(true)
      }
      setError(null)
      try {
        const start = loadedStartRef.current
        const end = loadedEndRef.current
        const loaded = await fetchRange(start, end)
        setItems(loaded)
        applySelectionAfterLoad(loaded)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        if (!silent) setItems([])
      } finally {
        if (!silent) {
          setLoading(false)
          onLoadingChange?.(false)
        }
      }
    },
    [fetchRange, applySelectionAfterLoad, onLoadingChange]
  )

  const resetRangeToToday = useCallback((size: TimelineWindowSize): void => {
    const { loadedStart: start, loadedEnd: end } = defaultTimelineLoadedRange(size)
    setLoadedStart(start)
    setLoadedEnd(end)
    loadedStartRef.current = start
    loadedEndRef.current = end
  }, [])

  const loadEarlier = useCallback(async (): Promise<void> => {
    if (loadingEarlier || loading) return
    setLoadingEarlier(true)
    setError(null)
    try {
      const end = loadedStartRef.current
      const start = subtractTimelineWindow(end, windowSize)
      const chunk = await fetchRange(start, end)
      setLoadedStart(start)
      loadedStartRef.current = start
      setItems((prev) => mergeWorkItemsByStableKey(prev, chunk))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoadingEarlier(false)
    }
  }, [loadingEarlier, loading, windowSize, fetchRange])

  const loadMore = useCallback(async (): Promise<void> => {
    if (loadingMore || loading) return
    setLoadingMore(true)
    setError(null)
    try {
      const start = loadedEndRef.current
      const end = addTimelineWindow(start, windowSize)
      const chunk = await fetchRange(start, end)
      setLoadedEnd(end)
      loadedEndRef.current = end
      setItems((prev) => mergeWorkItemsByStableKey(prev, chunk))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoadingMore(false)
    }
  }, [loadingMore, loading, windowSize, fetchRange])

  const handleWindowSizeChange = useCallback(
    (size: TimelineWindowSize): void => {
      setWindowSize(size)
      persistTimelineWindowSize(size)
      resetRangeToToday(size)
    },
    [resetRangeToToday]
  )

  useEffect(() => {
    if (reloadRef) reloadRef.current = (): void => void reload()
    return (): void => {
      if (reloadRef) reloadRef.current = null
    }
  }, [reload, reloadRef])

  const taskAccountIdsKey = useMemo(
    () =>
      taskAccounts
        .map((a) => a.id)
        .sort()
        .join('|'),
    [taskAccounts]
  )

  useEffect(() => {
    resetRangeToToday(windowSize)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Kontowechsel: Fenster ab heute neu
  }, [taskAccountIdsKey])

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nach Fenster-/Kontowechsel
  }, [loadedStart, loadedEnd, taskAccountIdsKey])

  useEffect(() => {
    persistTimelineWindowSize(windowSize)
  }, [windowSize])

  const lastReloadSignal = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (reloadSignal === undefined) return
    if (lastReloadSignal.current === undefined) {
      lastReloadSignal.current = reloadSignal
      return
    }
    if (reloadSignal === lastReloadSignal.current) return
    lastReloadSignal.current = reloadSignal
    void reload({ silent: true })
  }, [reloadSignal, reload])

  const cloudTaskCreatedSignal = useCreateCloudTaskUiStore((s) => s.createdSignal)
  useEffect(() => {
    if (cloudTaskCreatedSignal === 0) return
    void reload({ silent: true })
  }, [cloudTaskCreatedSignal, reload])

  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | undefined
    const scheduleSilentReload = (): void => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        void reload({ silent: true })
      }, 280)
    }
    const offCal = window.mailClient.events.onCalendarChanged(scheduleSilentReload)
    const offTasks = window.mailClient.events.onTasksChanged(scheduleSilentReload)
    return (): void => {
      offCal()
      offTasks()
      if (debounceTimer) clearTimeout(debounceTimer)
    }
  }, [reload])

  useEffect(() => {
    persistWorkListViewPrefs(listViewPrefs)
  }, [listViewPrefs])

  const handleSelect = useCallback(
    (item: WorkItem): void => {
      setSelected(item)
      onWorkItemFocused(item)
    },
    [onWorkItemFocused]
  )

  const handleToggleCompleted = useCallback(
    async (item: WorkItem): Promise<void> => {
      try {
        await toggleWorkItemCompleted(item)
        await reload()
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    },
    [reload]
  )

  const mailContextHandlers = useMemo<MailContextHandlers>(
    () => ({
      openReply,
      openForward,
      setMessageRead,
      toggleMessageFlag,
      archiveMessage,
      deleteMessage,
      setTodoForMessage,
      completeTodoForMessage: async (messageId: number): Promise<void> => {
        await completeTodoForMessage(messageId)
        await reload()
      },
      setWaitingForMessage,
      clearWaitingForMessage,
      openSnoozePicker,
      refreshNow: async (): Promise<void> => {
        await refreshNow()
        await reload()
      }
    }),
    [
      openReply,
      openForward,
      setMessageRead,
      toggleMessageFlag,
      archiveMessage,
      deleteMessage,
      setTodoForMessage,
      completeTodoForMessage,
      setWaitingForMessage,
      clearWaitingForMessage,
      openSnoozePicker,
      refreshNow,
      reload
    ]
  )

  const showInCalendarGrid = useCallback(
    (item: WorkItem): void => {
      persistCalendarContentViewMode('calendar')
      openWorkItemInCalendar(item, setAppMode)
    },
    [setAppMode]
  )

  const workContextHandlers = useMemo<WorkItemContextHandlers>(
    () => ({
      t,
      mailHandlers: mailContextHandlers,
      canCreateCloudTask: (accountId): boolean =>
        taskAccounts.some((a) => a.id === accountId && accountSupportsCloudTasks(a)),
      onToggleCompleted: handleToggleCompleted,
      onShowInCalendar: showInCalendarGrid,
      onOpenInMail: (item): void => {
        void selectMessage(item.messageId)
        setAppMode('mail')
      },
      onOpenInTasks: (): void => setAppMode('tasks'),
      onDeleteCloudTask: async (item): Promise<void> => {
        if (!(await confirmDeleteCloudTasks(t, 1))) return
        try {
          await window.mailClient.tasks.deleteTask({
            accountId: item.accountId,
            listId: item.listId,
            taskId: item.taskId
          })
          setSelected((s) => (s?.stableKey === item.stableKey ? null : s))
          await reload()
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e))
        }
      },
      refreshMailList: reload
    }),
    [t, mailContextHandlers, taskAccounts, handleToggleCompleted, showInCalendarGrid, selectMessage, setAppMode, reload]
  )

  const workContextHandlersRef = useRef(workContextHandlers)
  workContextHandlersRef.current = workContextHandlers

  const openItemContextMenu = useCallback((item: WorkItem, event: React.MouseEvent): void => {
    event.preventDefault()
    event.stopPropagation()
    void (async (): Promise<void> => {
      const menuItems = await buildWorkItemContextMenuItems(
        item,
        { x: event.clientX, y: event.clientY },
        workContextHandlersRef.current
      )
      setContextMenu({ x: event.clientX, y: event.clientY, items: menuItems })
    })()
  }, [])

  const visibleCount = useMemo(
    () => groups.reduce((n, g) => n + g.items.length, 0),
    [groups]
  )

  const atTodayStart = isSameDay(loadedStart, timelineRangeStartToday())
  const rangeHint = atTodayStart
    ? t('mega.shell.rangeFromToday')
    : format(loadedStart, 'd. MMM yyyy', { locale: dfLocale })

  const loadLinkClass =
    'block w-full px-3 py-2 text-center text-[11px] font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50'

  return (
    <>
      {variant === 'dock' ? null : (
        <p className="shrink-0 border-b border-border px-3 py-1.5 text-[10px] text-muted-foreground">
          {t('mega.shell.subtitle')}
        </p>
      )}

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-2 py-1.5">
        <div className="min-w-0 flex-1">
          <TasksListViewMenu
            arrange={listViewPrefs.arrange}
            chrono={listViewPrefs.chrono}
            filter={listViewPrefs.filter}
            filterCounts={filterCounts}
            showAccountArrange={false}
            onArrangeChange={(v): void => setListViewPrefs((p) => ({ ...p, arrange: v }))}
            onChronoChange={(v): void => setListViewPrefs((p) => ({ ...p, chrono: v }))}
            onFilterChange={(v): void => setListViewPrefs((p) => ({ ...p, filter: v }))}
            disabled={loading}
          />
        </div>
        <label className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
          <span className="sr-only">{t('mega.shell.windowLabel')}</span>
          <select
            value={windowSize}
            disabled={loading}
            onChange={(e): void => handleWindowSizeChange(e.target.value as TimelineWindowSize)}
            className="max-w-[7.5rem] rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-foreground"
            aria-label={t('mega.shell.windowLabel')}
          >
            <option value="week">{t('mega.shell.windowWeek')}</option>
            <option value="month">{t('mega.shell.windowMonth')}</option>
            <option value="quarter">{t('mega.shell.windowQuarter')}</option>
          </select>
        </label>
        <div className="ml-auto shrink-0 text-right text-[10px] text-muted-foreground">
          <div>
            {visibleCount}{' '}
            {visibleCount === 1 ? t('mega.shell.item_one') : t('mega.shell.item_other')}
          </div>
          <div className="text-[9px] opacity-80">{rangeHint}</div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <button
          type="button"
          className={loadLinkClass}
          disabled={loadingEarlier || loading}
          onClick={(): void => void loadEarlier()}
        >
          {loadingEarlier ? (
            <span className="inline-flex items-center justify-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t('mega.shell.loadEarlier')}
            </span>
          ) : (
            t('mega.shell.loadEarlier')
          )}
        </button>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading && items.length === 0 ? (
          <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('common.loading')}
          </div>
        ) : error ? (
          <p className="p-4 text-xs text-destructive">{error}</p>
        ) : items.length === 0 ? (
          <p className="p-4 text-xs text-muted-foreground">{t('mega.shell.empty')}</p>
        ) : (
          <MegaTimelineList
            groups={groups}
            accounts={accounts}
            selectedKey={selected?.stableKey ?? null}
            onSelect={handleSelect}
            onItemClick={handleSelect}
            onToggleCompleted={(item): void => void handleToggleCompleted(item)}
            onContextMenu={openItemContextMenu}
          />
        )}
        </div>
        <button
          type="button"
          className={loadLinkClass}
          disabled={loadingMore || loading}
          onClick={(): void => void loadMore()}
        >
          {loadingMore ? (
            <span className="inline-flex items-center justify-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t('mega.shell.loadMore')}
            </span>
          ) : (
            t('mega.shell.loadMore')
          )}
        </button>
      </div>

      {contextMenu ? (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={(): void => setContextMenu(null)}
        />
      ) : null}
    </>
  )
}
