import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type Ref
} from 'react'
import { flushSync } from 'react-dom'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin from '@fullcalendar/interaction'
import luxonPlugin from '@fullcalendar/luxon'
import deLocale from '@fullcalendar/core/locales/de'
import enGbLocale from '@fullcalendar/core/locales/en-gb'
import type { DateSelectArg, EventDropArg } from '@fullcalendar/core'
import type { EventResizeDoneArg } from '@fullcalendar/interaction'
import { DateTime } from 'luxon'
import { useTranslation } from 'react-i18next'
import type { ConnectedAccount } from '@shared/types'
import { cn } from '@/lib/utils'
import { accountColorToCssBackground } from '@/lib/avatar-color'
import { loadPlannedScheduleMapForTasks } from '@/app/work-items/load-planned-schedules'
import {
  CALENDAR_KIND_CLOUD_TASK,
  cloudTasksToFullCalendarEvents,
  computePersistTargetForCloudTask,
  defaultScheduleForCalendarDayFc,
  dueIsoFromCloudTaskScheduleStart,
  type CloudTaskCalendarDateMode
} from '@/app/calendar/cloud-task-calendar'
import { applyCloudTaskPersistTarget } from '@/app/calendar/apply-cloud-task-persist'
import {
  scheduleRemoveCloudTaskCalendarEventsByTaskKey,
  scheduleRemoveDuplicateFullCalendarEventsById
} from '@/app/calendar/calendar-fc-event-source'
import {
  applyOptimisticCloudTaskPersistToLayer,
  syncFullCalendarCloudTaskEventFromLayer
} from '@/app/calendar/optimistic-cloud-task-calendar'
import { cloudTaskEventId } from '@/app/calendar/cloud-task-calendar'
import {
  filterCloudTasksInCalendarRange,
  loadCloudTasksForSelection
} from '@/app/tasks/tasks-calendar-load'
import {
  dataTransferLooksLikeCloudTaskDrag,
  readCloudTaskDragPayload
} from '@/app/tasks/tasks-cloud-task-dnd'
import type { TaskListFilter } from '@/app/tasks/task-list-arrange'
import type { CalendarCreateRange } from '@/app/tasks/tasks-calendar-create-range'
import type { TaskItemWithContext, TasksViewSelection } from '@/app/tasks/tasks-types'
import { cloudTaskStableKey } from '@shared/work-item-keys'
import { useCalendarFcEventContent } from '@/app/calendar/use-calendar-fc-event-content'
import '@/app/calendar/notion-calendar.css'

const DEFAULT_APPOINTMENT_MINUTES = 30
const MAX_TIME_GRID_SPAN_DAYS = 21

function assignMergedFullCalendarRef(
  inst: FullCalendar | null,
  inner: MutableRefObject<FullCalendar | null>,
  outer?: Ref<FullCalendar | null>
): void {
  inner.current = inst
  if (!outer) return
  if (typeof outer === 'function') {
    outer(inst)
    return
  }
  ;(outer as MutableRefObject<FullCalendar | null>).current = inst
}

function endDateFromStart(start: Date, minutes: number): Date {
  return new Date(start.getTime() + minutes * 60 * 1000)
}

export interface TasksCalendarPaneProps {
  selection: TasksViewSelection | null
  taskAccounts: ConnectedAccount[]
  listsByAccount: Record<string, import('@shared/types').TaskListRow[] | undefined>
  loadListsForAccount: (accountId: string) => Promise<import('@shared/types').TaskListRow[]>
  selectedKey: string | null
  onSelectTask: (task: TaskItemWithContext) => void
  onTasksMutated: () => void
  fcView: string
  fullCalendarRef?: Ref<FullCalendar | null>
  onViewMeta?: (meta: { title: string; viewType: string; currentStart: Date }) => void
  listFilter?: TaskListFilter
  dateMode: CloudTaskCalendarDateMode
  className?: string
  onRequestCreate?: (range: CalendarCreateRange | null) => void
}

export function TasksCalendarPane({
  selection,
  taskAccounts,
  listsByAccount,
  loadListsForAccount,
  selectedKey,
  onSelectTask,
  onTasksMutated,
  fcView,
  fullCalendarRef,
  onViewMeta,
  listFilter = 'all',
  dateMode,
  className,
  onRequestCreate
}: TasksCalendarPaneProps): JSX.Element {
  const { i18n } = useTranslation()
  const calendarFcEventContentRender = useCalendarFcEventContent()
  const fcLocale = i18n.language.startsWith('de') ? deLocale : enGbLocale
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

  const calendarRef = useRef<FullCalendar | null>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const lastRangeRef = useRef<{ start: Date; end: Date }>({ start: new Date(), end: new Date() })
  const taskByKeyRef = useRef<Map<string, TaskItemWithContext>>(new Map())

  const [allItems, setAllItems] = useState<TaskItemWithContext[]>([])
  const [rangeItems, setRangeItems] = useState<TaskItemWithContext[]>([])
  const [plannedByKey, setPlannedByKey] = useState(() => new Map<string, import('@shared/work-item').WorkItemPlannedSchedule>())
  const [loading, setLoading] = useState(false)
  const allItemsRef = useRef(allItems)
  allItemsRef.current = allItems
  const plannedByKeyRef = useRef(plannedByKey)
  plannedByKeyRef.current = plannedByKey

  const accountColorById = useMemo(
    () => Object.fromEntries(taskAccounts.map((a) => [a.id, a.color])),
    [taskAccounts]
  )

  const fcEvents = useMemo(
    () => cloudTasksToFullCalendarEvents(rangeItems, accountColorById, plannedByKey, dateMode),
    [rangeItems, accountColorById, plannedByKey, dateMode]
  )

  const multiDayViews = useMemo(() => {
    const o: Record<string, { type: 'timeGrid'; duration: { days: number }; buttonText: string }> = {}
    for (let n = 2; n <= MAX_TIME_GRID_SPAN_DAYS; n++) {
      o[`timeGrid${n}Day`] = { type: 'timeGrid', duration: { days: n }, buttonText: `${n} Tage` }
    }
    return o
  }, [])

  const reloadAll = useCallback(async (): Promise<TaskItemWithContext[]> => {
    setLoading(true)
    try {
      const items = await loadCloudTasksForSelection(
        selection,
        taskAccounts,
        listsByAccount,
        loadListsForAccount
      )
      setAllItems(items)
      const planned = await loadPlannedScheduleMapForTasks(items)
      setPlannedByKey(planned)
      const map = new Map<string, TaskItemWithContext>()
      for (const t of items) {
        map.set(cloudTaskStableKey(t.accountId, t.listId, t.id), t)
      }
      taskByKeyRef.current = map
      return items
    } catch {
      setAllItems([])
      setPlannedByKey(new Map())
      taskByKeyRef.current = new Map()
      return []
    } finally {
      setLoading(false)
    }
  }, [selection, taskAccounts, listsByAccount, loadListsForAccount])

  const applyRangeFilter = useCallback(
    (items: TaskItemWithContext[], planned: typeof plannedByKey, start: Date, end: Date) => {
      setRangeItems(
        filterCloudTasksInCalendarRange(items, planned, start, end, listFilter, timeZone, dateMode)
      )
    },
    [listFilter, timeZone, dateMode]
  )

  const loadRange = useCallback(
    async (start: Date, end: Date): Promise<void> => {
      lastRangeRef.current = { start, end }
      let items = allItems
      let planned = plannedByKey
      if (items.length === 0 && selection) {
        items = await reloadAll()
        planned = await loadPlannedScheduleMapForTasks(items)
        setPlannedByKey(planned)
      }
      applyRangeFilter(items, planned, start, end)
    },
    [allItems, plannedByKey, selection, reloadAll, applyRangeFilter]
  )

  useEffect(() => {
    void reloadAll().then((items) => {
      const { start, end } = lastRangeRef.current
      void loadPlannedScheduleMapForTasks(items).then((planned) => {
        setPlannedByKey(planned)
        applyRangeFilter(items, planned, start, end)
      })
    })
  }, [selection, reloadAll, applyRangeFilter])

  useEffect(() => {
    const { start, end } = lastRangeRef.current
    applyRangeFilter(allItems, plannedByKey, start, end)
  }, [dateMode, allItems, plannedByKey, applyRangeFilter])

  const resolveTaskFromEvent = useCallback((taskKey: string): TaskItemWithContext | null => {
    return taskByKeyRef.current.get(taskKey) ?? null
  }, [])

  const persistEventChange = useCallback(
    async (info: EventDropArg | EventResizeDoneArg): Promise<void> => {
      const taskKey =
        (typeof info.event.extendedProps.taskKey === 'string' && info.event.extendedProps.taskKey) ||
        null
      if (!taskKey) {
        info.revert()
        return
      }
      const task = resolveTaskFromEvent(taskKey)
      if (!task) {
        info.revert()
        return
      }
      const target = computePersistTargetForCloudTask(info.event, info.oldEvent, timeZone, dateMode)
      if (!target) {
        info.revert()
        return
      }
      try {
        await applyCloudTaskPersistTarget(target, task, timeZone)
        const optimistic = applyOptimisticCloudTaskPersistToLayer(
          target,
          task,
          allItemsRef.current,
          plannedByKeyRef.current,
          timeZone
        )
        const optimisticTask =
          optimistic.items.find(
            (row) => cloudTaskStableKey(row.accountId, row.listId, row.id) === taskKey
          ) ?? task
        const optimisticPlanned = optimistic.plannedByKey.get(taskKey)
        const api = calendarRef.current?.getApi()

        flushSync(() => {
          setAllItems(optimistic.items)
          setPlannedByKey(optimistic.plannedByKey)
          const { start, end } = lastRangeRef.current
          applyRangeFilter(optimistic.items, optimistic.plannedByKey, start, end)
        })

        syncFullCalendarCloudTaskEventFromLayer(api, optimisticTask, optimisticPlanned, timeZone)
        scheduleRemoveCloudTaskCalendarEventsByTaskKey(
          api,
          taskKey,
          cloudTaskEventId(taskKey)
        )

        const items = await reloadAll()
        const { start, end } = lastRangeRef.current
        const planned = await loadPlannedScheduleMapForTasks(items)
        setPlannedByKey(planned)
        applyRangeFilter(items, planned, start, end)
        scheduleRemoveCloudTaskCalendarEventsByTaskKey(
          calendarRef.current?.getApi(),
          taskKey,
          cloudTaskEventId(taskKey)
        )
        onTasksMutated()
      } catch {
        info.revert()
      }
    },
    [applyRangeFilter, dateMode, onTasksMutated, reloadAll, resolveTaskFromEvent, timeZone]
  )

  useLayoutEffect(() => {
    const root = shellRef.current
    if (!root) return

    const findDateHostFromElement = (start: Element | null): HTMLElement | null => {
      const el = start as HTMLElement | null
      if (!el) return null
      return (
        el.closest('td.fc-timegrid-col[data-date]') ||
        el.closest('td.fc-daygrid-day[data-date]') ||
        el.closest('.fc-daygrid-day[data-date]') ||
        el.closest('th.fc-col-header-cell[data-date]') ||
        el.closest('.fc-daygrid-body td[data-date]') ||
        null
      )
    }

    const findDateHostForDrop = (
      target: EventTarget | null,
      clientX: number,
      clientY: number
    ): HTMLElement | null => {
      const tryOne = (node: Element | null): HTMLElement | null => {
        const cell = findDateHostFromElement(node)
        return cell && root.contains(cell) ? cell : null
      }
      let cell = tryOne(target as Element | null)
      if (cell) return cell
      for (const node of document.elementsFromPoint(clientX, clientY)) {
        if (!root.contains(node)) continue
        cell = tryOne(node)
        if (cell) return cell
      }
      return null
    }

    const scheduleRangeFromDrop = (
      clientX: number,
      clientY: number,
      dateStr: string
    ): { startIso: string; endIso: string } => {
      for (const node of document.elementsFromPoint(clientX, clientY)) {
        if (!(node instanceof HTMLElement) || !root.contains(node)) continue
        if (node.closest('.fc-timegrid-axis')) continue
        const t = node.getAttribute('data-time')
        if (t && /^\d{1,2}:\d{2}/.test(t)) {
          const zone = timeZone === 'local' ? 'local' : timeZone
          const normalized = t.length <= 5 ? `${t}:00` : t
          const start = DateTime.fromISO(`${dateStr}T${normalized}`, { zone })
          if (start.isValid) {
            const end = start.plus({ minutes: DEFAULT_APPOINTMENT_MINUTES })
            return { startIso: start.toISO()!, endIso: end.toISO()! }
          }
        }
      }
      return defaultScheduleForCalendarDayFc(dateStr, timeZone)
    }

    const onDragHover = (e: DragEvent): void => {
      if (!e.dataTransfer || !dataTransferLooksLikeCloudTaskDrag(e.dataTransfer)) return
      const cell = findDateHostForDrop(e.target, e.clientX, e.clientY)
      if (!cell) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
    }

    const onDrop = (e: DragEvent): void => {
      if (!e.dataTransfer || !dataTransferLooksLikeCloudTaskDrag(e.dataTransfer)) return
      const cell = findDateHostForDrop(e.target, e.clientX, e.clientY)
      if (!cell) return
      const payload = readCloudTaskDragPayload(e.dataTransfer)
      if (!payload) return
      e.preventDefault()
      e.stopPropagation()
      const dateStr = cell.getAttribute('data-date')
      if (!dateStr) return
      const task = taskByKeyRef.current.get(payload.taskKey)
      if (!task) return
      const range = scheduleRangeFromDrop(e.clientX, e.clientY, dateStr)
      void (async (): Promise<void> => {
        try {
          const persistTarget =
            dateMode === 'due'
              ? {
                  kind: 'due' as const,
                  taskKey: payload.taskKey,
                  dueIso: dueIsoFromCloudTaskScheduleStart(range.startIso, timeZone)
                }
              : {
                  kind: 'planned' as const,
                  taskKey: payload.taskKey,
                  plannedStartIso: range.startIso,
                  plannedEndIso: range.endIso
                }
          await applyCloudTaskPersistTarget(persistTarget, task, timeZone)
          const items = await reloadAll()
          const { start, end } = lastRangeRef.current
          const planned = await loadPlannedScheduleMapForTasks(items)
          setPlannedByKey(planned)
          applyRangeFilter(items, planned, start, end)
          onSelectTask(task)
          onTasksMutated()
        } catch {
          // ignore
        }
      })()
    }

    const cap = { capture: true, passive: false } as const
    root.addEventListener('dragenter', onDragHover, cap)
    root.addEventListener('dragover', onDragHover, cap)
    root.addEventListener('drop', onDrop, { capture: true })
    return () => {
      root.removeEventListener('dragenter', onDragHover, cap)
      root.removeEventListener('dragover', onDragHover, cap)
      root.removeEventListener('drop', onDrop, { capture: true })
    }
  }, [applyRangeFilter, onSelectTask, onTasksMutated, reloadAll, timeZone])

  return (
    <div ref={shellRef} className={cn('calendar-notion-shell relative h-full min-h-0 flex-1', className)}>
      {loading ? (
        <div className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center bg-background/40">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : null}
      <FullCalendar
        key={`${timeZone}-${fcView}`}
        ref={(inst): void => {
          assignMergedFullCalendarRef(inst, calendarRef, fullCalendarRef)
        }}
        plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin, luxonPlugin]}
        locale={fcLocale}
        height="100%"
        timeZone={timeZone}
        headerToolbar={false}
        firstDay={1}
        views={{ ...multiDayViews }}
        initialView={fcView}
        slotMinTime="00:00:00"
        slotMaxTime="24:00:00"
        scrollTime="07:00:00"
        slotDuration="00:30:00"
        slotLabelInterval="01:00:00"
        defaultTimedEventDuration="00:30:00"
        nowIndicator
        editable
        selectable={taskAccounts.length > 0 && Boolean(onRequestCreate)}
        selectMirror
        selectLongPressDelay={380}
        selectAllow={(): boolean => taskAccounts.length > 0 && Boolean(onRequestCreate)}
        select={(sel: DateSelectArg): void => {
          if (!onRequestCreate) return
          onRequestCreate({
            start: sel.start,
            end: sel.end,
            allDay: sel.allDay
          })
          calendarRef.current?.getApi().unselect()
        }}
        dayMaxEvents
        events={fcEvents}
        eventContent={calendarFcEventContentRender}
        eventDidMount={(info): void => {
          if (info.event.extendedProps.calendarKind !== CALENDAR_KIND_CLOUD_TASK) return
          const raw = info.event.extendedProps.accountColor as string | undefined
          const bg = accountColorToCssBackground(raw)
          const key = typeof info.event.extendedProps.taskKey === 'string' ? info.event.extendedProps.taskKey : ''
          if (selectedKey && key === selectedKey) {
            info.el.classList.add('ring-2', 'ring-primary')
          }
          if (bg) {
            info.el.style.backgroundColor = bg
            info.el.style.borderColor = 'transparent'
            info.el.style.color = '#fafafa'
          } else {
            info.el.style.borderLeft = '4px solid hsl(var(--primary))'
          }
        }}
        datesSet={(arg): void => {
          void loadRange(arg.start, arg.end)
          onViewMeta?.({
            title: arg.view.title,
            viewType: arg.view.type,
            currentStart: arg.view.currentStart
          })
        }}
        eventClick={(info): void => {
          info.jsEvent.preventDefault()
          if (info.event.extendedProps.calendarKind !== CALENDAR_KIND_CLOUD_TASK) return
          const task = info.event.extendedProps.cloudTask as TaskItemWithContext | undefined
          if (task) onSelectTask(task)
        }}
        eventDrop={(info): void => {
          void persistEventChange(info)
        }}
        eventResize={(info): void => {
          void persistEventChange(info)
        }}
      />
    </div>
  )
}
