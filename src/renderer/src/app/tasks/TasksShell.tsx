import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent
} from 'react'
import type FullCalendar from '@fullcalendar/react'
import { addMonths, startOfMonth } from 'date-fns'
import { Loader2, ListTodo, RefreshCw, Trash2, ChevronDown, Eraser } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ConnectedAccount, TaskItemRow, TaskListRow } from '@shared/types'
import type { WorkItemPlannedSchedule } from '@shared/work-item'
import { cloudTaskStableKey } from '@shared/work-item-keys'
import { useAccountsStore } from '@/stores/accounts'
import { useUndoStore } from '@/stores/undo'
import { buildAccountColorAndNewContextItems } from '@/lib/account-sidebar-context-menu'
import { cn } from '@/lib/utils'
import { useResizableWidth, VerticalSplitter } from '@/components/ResizableSplitter'
import {
  moduleColumnHeaderDockBarRowClass,
  moduleColumnHeaderIconGlyphClass,
  moduleColumnHeaderOutlineSmClass,
  moduleColumnHeaderShellBarClass
} from '@/components/ModuleColumnHeader'
import { TasksListViewMenu } from '@/components/TasksListViewMenu'
import { TasksShellSidebar } from '@/app/tasks/TasksShellSidebar'
import { ContextMenu, type ContextMenuItem } from '@/components/ContextMenu'
import { TasksGroupedList } from '@/app/tasks/TasksGroupedList'
import { TasksCalendarPane } from '@/app/tasks/TasksCalendarPane'
import { TasksKanbanPane } from '@/app/tasks/TasksKanbanPane'
import { TasksViewModeSwitcher } from '@/app/tasks/TasksViewModeSwitcher'
import { TasksCalendarToolbar } from '@/app/tasks/TasksCalendarToolbar'
import { readTasksCalendarFcView } from '@/app/tasks/tasks-calendar-view-storage'
import { readTasksCalendarDateMode } from '@/app/tasks/tasks-calendar-date-mode-storage'
import type { CloudTaskCalendarDateMode } from '@/app/calendar/cloud-task-calendar'
import { confirmDeleteCloudTasks } from '@/app/tasks/confirm-delete-cloud-task'
import {
  readTasksContentViewMode,
  type TasksContentViewMode
} from '@/app/tasks/tasks-view-mode-storage'
import {
  flattenVisibleTaskItems,
  rangeSelectTaskKeys,
  taskListFilterCounts,
  type TaskListArrangeContext
} from '@/app/tasks/task-list-arrange'
import { toggleKeyInSet } from '@/app/tasks/task-selection'
import {
  readTasksListViewPrefs,
  persistTasksListViewPrefs,
  type TasksListViewPrefsV1
} from '@/app/tasks/tasks-list-view-storage'
import {
  taskItemKey,
  type TaskItemWithContext,
  type TasksViewSelection
} from '@/app/tasks/tasks-types'
import {
  persistTasksViewSelection,
  readTasksViewSelection
} from '@/app/tasks/tasks-view-storage'
import { loadPlannedScheduleMapForTasks } from '@/app/work-items/load-planned-schedules'
import { taskItemToWorkItem } from '@/app/work-items/work-item-mapper'
import type {
  CloudTaskDisplayPatch,
  CloudTaskSaveDraft
} from '@/app/work/CloudTaskWorkItemDetail'
import { CalendarDockPanelSlide } from '@/app/calendar/CalendarDockPanelSlide'
import { CalendarFloatingPanel } from '@/app/calendar/CalendarFloatingPanel'
import { TasksDetailDockHeader, TasksDetailPanelBody } from '@/app/tasks/TasksDetailPanel'
import {
  persistTasksDetailOpen,
  readTasksDetailOpenFromStorage,
  TASKS_FLOAT_DETAIL_SIZE_KEY
} from '@/app/tasks/tasks-detail-panel-storage'
import { useTasksDetailPanelLayoutStore } from '@/stores/tasks-detail-panel-layout'
import { CreateCloudTaskDialog } from '@/components/CreateCloudTaskDialog'
import type { CalendarCreateRange } from '@/app/tasks/tasks-calendar-create-range'
import { GLOBAL_CREATE_EVENT, useGlobalCreateNavigateStore } from '@/lib/global-create'
import { useTasksPendingFocusStore } from '@/stores/tasks-pending-focus'

function pickDefaultListId(rows: TaskListRow[]): string | null {
  if (rows.length === 0) return null
  return rows.find((r) => r.isDefault)?.id ?? rows[0]!.id
}

function initialSelection(accounts: { id: string }[]): TasksViewSelection | null {
  const stored = readTasksViewSelection()
  if (stored) {
    if (stored.kind === 'unified') return stored
    if (accounts.some((a) => a.id === stored.accountId)) return stored
  }
  if (accounts.length > 0) return { kind: 'unified' }
  return null
}

export function TasksShell(): JSX.Element {
  const { t } = useTranslation()
  const accounts = useAccountsStore((s) => s.accounts)
  const profilePhotoDataUrls = useAccountsStore((s) => s.profilePhotoDataUrls)
  const patchAccountColor = useAccountsStore((s) => s.patchAccountColor)
  const taskAccounts = useMemo(
    () => accounts.filter((a) => a.provider === 'microsoft' || a.provider === 'google'),
    [accounts]
  )
  const microsoftTaskAccounts = useMemo(
    () => taskAccounts.filter((a) => a.provider === 'microsoft'),
    [taskAccounts]
  )

  const [sidebarWidth, setSidebarWidth] = useResizableWidth({
    storageKey: 'mailclient.tasksSidebarWidth',
    defaultWidth: 256,
    minWidth: 200,
    maxWidth: 420
  })
  const [listColumnWidth, setListColumnWidth] = useResizableWidth({
    storageKey: 'mailclient.tasksListColumnWidth',
    defaultWidth: 420,
    minWidth: 280,
    maxWidth: 720
  })
  const [detailColumnWidth, setDetailColumnWidth] = useResizableWidth({
    storageKey: 'mailclient.tasksDetailColumnWidth',
    defaultWidth: 380,
    minWidth: 300,
    maxWidth: 560
  })

  const [listsByAccount, setListsByAccount] = useState<Record<string, TaskListRow[] | undefined>>({})
  const [listsLoadingByAccount, setListsLoadingByAccount] = useState<Record<string, boolean>>({})
  const [listsErrorByAccount, setListsErrorByAccount] = useState<Record<string, string | null>>({})

  const [selection, setSelection] = useState<TasksViewSelection | null>(() =>
    initialSelection(taskAccounts)
  )

  const [listTasks, setListTasks] = useState<TaskItemRow[]>([])
  const listTasksRef = useRef<TaskItemRow[]>([])
  listTasksRef.current = listTasks
  const [unifiedTasks, setUnifiedTasks] = useState<TaskItemWithContext[]>([])
  const unifiedTasksRef = useRef<TaskItemWithContext[]>([])
  unifiedTasksRef.current = unifiedTasks
  const [tasksLoading, setTasksLoading] = useState(false)
  const [unifiedLoading, setUnifiedLoading] = useState(false)
  const [tasksError, setTasksError] = useState<string | null>(null)

  const [listViewPrefs, setListViewPrefs] = useState<TasksListViewPrefsV1>(() =>
    readTasksListViewPrefs()
  )
  const [selected, setSelected] = useState<TaskItemWithContext | null>(null)
  const [plannedByTaskKey, setPlannedByTaskKey] = useState<
    Map<string, WorkItemPlannedSchedule>
  >(() => new Map())
  const [saving, setSaving] = useState(false)
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(() => new Set())
  const selectionAnchorRef = useRef<string | null>(null)
  const [contentViewMode, setContentViewMode] = useState<TasksContentViewMode>(() =>
    readTasksContentViewMode()
  )
  const [calendarFcView, setCalendarFcView] = useState(() => readTasksCalendarFcView())
  const [calendarDateMode, setCalendarDateMode] = useState<CloudTaskCalendarDateMode>(() =>
    readTasksCalendarDateMode()
  )
  const detailPlacement = useTasksDetailPanelLayoutStore((s) => s.detailPlacement)
  const setDetailPlacement = useTasksDetailPanelLayoutStore((s) => s.setDetailPlacement)
  const [detailOpen, setDetailOpen] = useState(() => readTasksDetailOpenFromStorage())
  const detailDockShow = detailOpen && detailPlacement === 'dock'
  const [detailDockStripInDom, setDetailDockStripInDom] = useState(detailDockShow)
  const [calendarTitle, setCalendarTitle] = useState('')
  const tasksCalendarRef = useRef<FullCalendar | null>(null)
  const [miniMonth, setMiniMonth] = useState(() => startOfMonth(new Date()))

  const applyTasksMiniCalendarDayRange = useCallback((startInclusive: Date, endInclusive: Date): void => {
    const lo = startInclusive <= endInclusive ? startInclusive : endInclusive
    tasksCalendarRef.current?.getApi()?.gotoDate(lo)
    setMiniMonth(startOfMonth(lo))
  }, [])
  const [createTaskDialogOpen, setCreateTaskDialogOpen] = useState(false)
  const [createTaskInitialRange, setCreateTaskInitialRange] = useState<CalendarCreateRange | null>(
    null
  )
  const [createTaskPreferredAccountId, setCreateTaskPreferredAccountId] = useState<string | null>(null)
  const [accountSidebarContextMenu, setAccountSidebarContextMenu] = useState<{
    x: number
    y: number
    items: ContextMenuItem[]
  } | null>(null)

  const [bulkFlaggedMenuOpen, setBulkFlaggedMenuOpen] = useState(false)
  const bulkFlaggedBtnRef = useRef<HTMLButtonElement>(null)
  const bulkFlaggedPanelRef = useRef<HTMLDivElement>(null)
  const [bulkFlaggedPanelStyle, setBulkFlaggedPanelStyle] = useState<CSSProperties>({})

  const isUnified = selection?.kind === 'unified'
  const accountId = selection?.kind === 'list' ? selection.accountId : null
  const listId = selection?.kind === 'list' ? selection.listId : null

  const loadListsForAccount = useCallback(
    async (targetAccountId: string, opts?: { force?: boolean }): Promise<TaskListRow[]> => {
      if (!opts?.force && listsByAccount[targetAccountId] !== undefined) {
        return listsByAccount[targetAccountId] ?? []
      }
      setListsLoadingByAccount((prev) => ({ ...prev, [targetAccountId]: true }))
      setListsErrorByAccount((prev) => ({ ...prev, [targetAccountId]: null }))
      try {
        const rows = await window.mailClient.tasks.listLists({ accountId: targetAccountId })
        setListsByAccount((prev) => ({ ...prev, [targetAccountId]: rows }))
        setSelection((prev) => {
          if (prev?.kind !== 'list' || prev.accountId !== targetAccountId) return prev
          if (prev.listId && rows.some((r) => r.id === prev.listId)) return prev
          const nextId = pickDefaultListId(rows)
          return nextId ? { kind: 'list', accountId: targetAccountId, listId: nextId } : prev
        })
        return rows
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setListsErrorByAccount((prev) => ({ ...prev, [targetAccountId]: msg }))
        setListsByAccount((prev) => ({ ...prev, [targetAccountId]: [] }))
        setSelection((prev) =>
          prev?.kind === 'list' && prev.accountId === targetAccountId ? null : prev
        )
        return []
      } finally {
        setListsLoadingByAccount((prev) => ({ ...prev, [targetAccountId]: false }))
      }
    },
    [listsByAccount]
  )

  const handleAccountExpanded = useCallback(
    (targetAccountId: string): void => {
      if (listsLoadingByAccount[targetAccountId]) return
      if (listsByAccount[targetAccountId] !== undefined) return
      void loadListsForAccount(targetAccountId)
    },
    [listsByAccount, listsLoadingByAccount, loadListsForAccount]
  )

  const handleRefreshAccountLists = useCallback(
    (targetAccountId: string): void => {
      void loadListsForAccount(targetAccountId, { force: true })
    },
    [loadListsForAccount]
  )

  const loadListTasks = useCallback(
    async (opts?: { silent?: boolean; forceRefresh?: boolean }): Promise<void> => {
      if (!accountId || !listId) {
        setListTasks([])
        return
      }
      const silent = opts?.silent ?? listTasksRef.current.length > 0
      if (!silent) setTasksLoading(true)
      setTasksError(null)
      try {
        const rows = await window.mailClient.tasks.listTasks({
          accountId,
          listId,
          showCompleted: true,
          showHidden: false,
          forceRefresh: opts?.forceRefresh === true
        })
        setListTasks(rows)
      } catch (e) {
        setTasksError(e instanceof Error ? e.message : String(e))
        if (!silent) setListTasks([])
      } finally {
        if (!silent) setTasksLoading(false)
      }
    },
    [accountId, listId]
  )

  const loadUnifiedTasks = useCallback(
    async (opts?: { silent?: boolean; forceRefresh?: boolean }): Promise<void> => {
      const silent = opts?.silent ?? unifiedTasksRef.current.length > 0
      if (!silent) setUnifiedLoading(true)
      setTasksError(null)
      try {
      const merged: TaskItemWithContext[] = []
      for (const acc of taskAccounts) {
        const lists = await loadListsForAccount(acc.id)
        for (const list of lists) {
          try {
            const rows = await window.mailClient.tasks.listTasks({
              accountId: acc.id,
              listId: list.id,
              showCompleted: true,
              showHidden: false,
              forceRefresh: opts?.forceRefresh === true
            })
            for (const row of rows) {
              merged.push({
                ...row,
                accountId: acc.id,
                listName: list.name
              })
            }
          } catch (e) {
            console.warn('[TasksShell] unified listTasks failed', acc.id, list.id, e)
          }
        }
      }
      setUnifiedTasks(merged)
    } catch (e) {
      setTasksError(e instanceof Error ? e.message : String(e))
      if (!silent) setUnifiedTasks([])
    } finally {
      if (!silent) setUnifiedLoading(false)
    }
  },
    [taskAccounts, loadListsForAccount]
  )

  useEffect(() => {
    const off = window.mailClient.events.onTasksChanged(() => {
      if (isUnified) {
        void loadUnifiedTasks({ silent: true })
        return
      }
      void loadListTasks({ silent: true })
    })
    return off
  }, [isUnified, loadListTasks, loadUnifiedTasks])

  const handleSelectUnified = useCallback((): void => {
    setSelection({ kind: 'unified' })
    setSelected(null)
    setCheckedKeys(new Set())
    selectionAnchorRef.current = null
    void loadUnifiedTasks()
  }, [loadUnifiedTasks])

  const handleSelectList = useCallback((nextAccountId: string, nextListId: string): void => {
    setSelection({ kind: 'list', accountId: nextAccountId, listId: nextListId })
    setSelected(null)
    setCheckedKeys(new Set())
    selectionAnchorRef.current = null
  }, [])

  useEffect(() => {
    persistTasksViewSelection(selection)
  }, [selection])

  useEffect(() => {
    if (selection?.kind === 'list' && !taskAccounts.some((a) => a.id === selection.accountId)) {
      setSelection(taskAccounts.length > 0 ? { kind: 'unified' } : null)
      setSelected(null)
    }
  }, [selection, taskAccounts])

  useEffect(() => {
    if (selection?.kind === 'list') {
      void loadListTasks()
    }
  }, [selection?.kind, accountId, listId, loadListTasks])

  useEffect(() => {
    if (selection?.kind === 'unified') {
      void loadUnifiedTasks()
    }
  }, [selection?.kind, loadUnifiedTasks])

  useEffect(() => {
    persistTasksListViewPrefs(listViewPrefs)
  }, [listViewPrefs])

  const accountById = useMemo(
    () => new Map(taskAccounts.map((a) => [a.id, a] as const)),
    [taskAccounts]
  )

  const onDragSidebar = useCallback(
    (delta: number) => setSidebarWidth((w) => w + delta),
    [setSidebarWidth]
  )
  const onDragListCol = useCallback(
    (delta: number) => setListColumnWidth((w) => w + delta),
    [setListColumnWidth]
  )
  const onDragDetailCol = useCallback(
    (delta: number) => setDetailColumnWidth((w) => w - delta),
    [setDetailColumnWidth]
  )

  const selectedKey = selected ? taskItemKey(selected) : null

  const headerTitle = useMemo(() => {
    if (isUnified) return t('tasks.shell.unifiedTitle')
    if (!accountId || !listId) return null
    return listsByAccount[accountId]?.find((L) => L.id === listId)?.name ?? null
  }, [isUnified, accountId, listId, listsByAccount, t])

  const listItemsForSingleList: TaskItemWithContext[] = useMemo(() => {
    if (!accountId || !listId) return []
    const listName = listsByAccount[accountId]?.find((L) => L.id === listId)?.name ?? ''
    return listTasks.map((row) => ({ ...row, accountId, listName }))
  }, [accountId, listId, listTasks, listsByAccount])

  const displayItems = isUnified ? unifiedTasks : listItemsForSingleList

  useEffect(() => {
    let cancelled = false
    void loadPlannedScheduleMapForTasks(displayItems).then((map) => {
      if (!cancelled) setPlannedByTaskKey(map)
    })
    return (): void => {
      cancelled = true
    }
  }, [displayItems])

  const selectedWorkItem = useMemo(() => {
    if (!selected) return null
    return taskItemToWorkItem(selected, { plannedByTaskKey })
  }, [selected, plannedByTaskKey])

  const filterCounts = useMemo(
    () => taskListFilterCounts(displayItems, Intl.DateTimeFormat().resolvedOptions().timeZone),
    [displayItems]
  )

  const visibleTaskCount = useMemo(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    return taskListFilterCounts(displayItems, tz)[
      listViewPrefs.filter === 'all'
        ? 'all'
        : listViewPrefs.filter === 'open'
          ? 'open'
          : listViewPrefs.filter === 'completed'
            ? 'completed'
            : 'overdue'
    ]
  }, [displayItems, listViewPrefs.filter])

  const taskArrangeCtx = useMemo((): TaskListArrangeContext => {
    const accountById = new Map(taskAccounts.map((a) => [a.id, a] as const))
    return {
      accountLabel: (id: string): string => {
        const a = accountById.get(id)
        return a?.displayName?.trim() || a?.email || id
      },
      todoBucketLabel: (kind) => t(`mail.todoBucket.${kind}` as const),
      noDueLabel: t('tasks.listArrange.noDue'),
      openLabel: t('tasks.listArrange.statusOpen'),
      doneLabel: t('tasks.listArrange.statusDone')
    }
  }, [taskAccounts, t])

  const visibleOrderedItems = useMemo(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    return flattenVisibleTaskItems(
      displayItems,
      listViewPrefs.arrange,
      listViewPrefs.chrono,
      listViewPrefs.filter,
      taskArrangeCtx,
      tz
    )
  }, [displayItems, listViewPrefs, taskArrangeCtx])

  const visibleOrderedKeys = useMemo(
    () => visibleOrderedItems.map((item) => taskItemKey(item)),
    [visibleOrderedItems]
  )

  useEffect(() => {
    setCheckedKeys(new Set())
    selectionAnchorRef.current = null
  }, [listViewPrefs.filter, listViewPrefs.arrange, listViewPrefs.chrono])

  const handleTaskClick = useCallback(
    (task: TaskItemWithContext, event: MouseEvent): void => {
      const key = taskItemKey(task)
      const mod = event.ctrlKey || event.metaKey
      if (event.shiftKey && selectionAnchorRef.current) {
        const range = rangeSelectTaskKeys(
          visibleOrderedKeys,
          selectionAnchorRef.current,
          key
        )
        setCheckedKeys(new Set(range))
        setSelected(task)
      } else if (mod) {
        setCheckedKeys((prev) => toggleKeyInSet(prev, key))
        setSelected(task)
        selectionAnchorRef.current = key
      } else {
        setCheckedKeys(new Set())
        setSelected(task)
        selectionAnchorRef.current = key
      }
    },
    [visibleOrderedKeys]
  )

  const handleToggleCheck = useCallback((task: TaskItemWithContext, event: MouseEvent): void => {
    event.stopPropagation()
    const key = taskItemKey(task)
    setCheckedKeys((prev) => toggleKeyInSet(prev, key))
    selectionAnchorRef.current = key
    setSelected((s) => s ?? task)
  }, [])

  const selectAllVisible = useCallback((): void => {
    setCheckedKeys(new Set(visibleOrderedKeys))
    if (visibleOrderedKeys.length > 0) {
      selectionAnchorRef.current = visibleOrderedKeys[0]!
    }
  }, [visibleOrderedKeys])

  const clearChecked = useCallback((): void => {
    setCheckedKeys(new Set())
    selectionAnchorRef.current = null
  }, [])

  const applyTaskRowUpdate = useCallback(
    (next: TaskItemRow, ctx: Pick<TaskItemWithContext, 'accountId' | 'listName'>): void => {
      const merged: TaskItemWithContext = { ...next, accountId: ctx.accountId, listName: ctx.listName }
      if (isUnified) {
        setUnifiedTasks((prev) =>
          prev.map((x) => (taskItemKey(x) === taskItemKey(merged) ? merged : x))
        )
      } else {
        setListTasks((prev) => prev.map((x) => (x.id === next.id ? next : x)))
      }
      setSelected((s) => (s && taskItemKey(s) === taskItemKey(merged) ? merged : s))
    },
    [isUnified]
  )

  async function patchTask(item: TaskItemWithContext, patch: { completed?: boolean }): Promise<void> {
    const next = await window.mailClient.tasks.patchTask({
      accountId: item.accountId,
      listId: item.listId,
      taskId: item.id,
      ...patch
    })
    applyTaskRowUpdate(next, item)
  }

  const patchTaskDisplay = useCallback(
    async (item: TaskItemWithContext, patch: CloudTaskDisplayPatch): Promise<void> => {
      const next = await window.mailClient.tasks.patchTaskDisplay({
        accountId: item.accountId,
        listId: item.listId,
        taskId: item.id,
        ...patch
      })
      applyTaskRowUpdate(next, item)
    },
    [applyTaskRowUpdate]
  )

  async function toggleCompleted(task: TaskItemWithContext): Promise<void> {
    try {
      await patchTask(task, { completed: !task.completed })
    } catch {
      if (isUnified) void loadUnifiedTasks()
      else void loadListTasks()
    }
  }

  const saveCloudTask = useCallback(
    async (draft: CloudTaskSaveDraft): Promise<void> => {
      if (!selected) return
      setSaving(true)
      try {
        const taskKey = cloudTaskStableKey(selected.accountId, selected.listId, selected.id)
        const next = await window.mailClient.tasks.updateTask({
          accountId: selected.accountId,
          listId: selected.listId,
          taskId: selected.id,
          title: draft.title,
          notes: draft.notes || null,
          dueIso: draft.dueIso,
          completed: selected.completed
        })
        if (draft.plannedStartIso && draft.plannedEndIso) {
          await window.mailClient.tasks.setPlannedSchedule({
            taskKey,
            plannedStartIso: draft.plannedStartIso,
            plannedEndIso: draft.plannedEndIso
          })
        } else {
          await window.mailClient.tasks.clearPlannedSchedule({ taskKey })
        }
        const ctx: TaskItemWithContext = {
          ...next,
          accountId: selected.accountId,
          listName: selected.listName
        }
        if (isUnified) {
          setUnifiedTasks((prev) =>
            prev.map((x) => (taskItemKey(x) === taskItemKey(selected) ? ctx : x))
          )
        } else {
          setListTasks((prev) => prev.map((x) => (x.id === next.id ? next : x)))
        }
        setSelected(ctx)
        const planned = await loadPlannedScheduleMapForTasks(
          isUnified
            ? unifiedTasks.map((x) =>
                taskItemKey(x) === taskItemKey(ctx) ? ctx : x
              )
            : listItemsForSingleList.map((x) =>
                taskItemKey(x) === taskItemKey(ctx) ? ctx : x
              )
        )
        setPlannedByTaskKey(planned)
      } catch (e) {
        setTasksError(e instanceof Error ? e.message : String(e))
      } finally {
        setSaving(false)
      }
    },
    [selected, isUnified, unifiedTasks, listItemsForSingleList]
  )

  async function deleteTasks(
    items: TaskItemWithContext[],
    opts?: { skipConfirm?: boolean }
  ): Promise<void> {
    if (items.length === 0) return
    if (!opts?.skipConfirm) {
      if (!(await confirmDeleteCloudTasks(t, items.length))) return
    }
    setSaving(true)
    try {
      const deletedKeys = new Set<string>()
      for (const item of items) {
        await window.mailClient.tasks.deleteTask({
          accountId: item.accountId,
          listId: item.listId,
          taskId: item.id
        })
        deletedKeys.add(taskItemKey(item))
      }
      setCheckedKeys((prev) => {
        const next = new Set(prev)
        for (const k of deletedKeys) next.delete(k)
        return next
      })
      setSelected((s) => (s && deletedKeys.has(taskItemKey(s)) ? null : s))
      if (isUnified) {
        setUnifiedTasks((prev) => prev.filter((x) => !deletedKeys.has(taskItemKey(x))))
      } else {
        await loadListTasks()
      }
    } catch (e) {
      setTasksError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  async function deleteSelectedCloudTask(): Promise<void> {
    if (!selected) return
    await deleteTasks([selected])
  }

  async function deleteChecked(): Promise<void> {
    const items = visibleOrderedItems.filter((item) => checkedKeys.has(taskItemKey(item)))
    await deleteTasks(items)
  }

  const displayLoading = isUnified ? unifiedLoading : tasksLoading
  const isKanbanView = contentViewMode === 'kanban'

  const handleTasksMutated = useCallback((): void => {
    if (isUnified) void loadUnifiedTasks()
    else void loadListTasks()
  }, [isUnified, loadUnifiedTasks, loadListTasks])

  useLayoutEffect(() => {
    if (!bulkFlaggedMenuOpen || !bulkFlaggedBtnRef.current) return
    const r = bulkFlaggedBtnRef.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const width = Math.min(320, vw - 16)
    let left = r.right - width
    if (left < 8) left = 8
    if (left + width > vw - 8) left = vw - 8 - width
    const maxH = Math.max(200, vh - r.bottom - 12)
    setBulkFlaggedPanelStyle({
      position: 'fixed',
      top: r.bottom + 4,
      left,
      width,
      maxHeight: maxH,
      zIndex: 200
    })
  }, [bulkFlaggedMenuOpen])

  useEffect(() => {
    if (!bulkFlaggedMenuOpen) return
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') setBulkFlaggedMenuOpen(false)
    }
    function onDown(evt: Event): void {
      const target = evt.target as Node
      if (bulkFlaggedBtnRef.current?.contains(target)) return
      if (bulkFlaggedPanelRef.current?.contains(target)) return
      setBulkFlaggedMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    return (): void => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
    }
  }, [bulkFlaggedMenuOpen])

  const runBulkDeleteFlaggedCompleted = useCallback(
    async (account: ConnectedAccount): Promise<void> => {
      const label = account.displayName?.trim() || account.email || account.id
      if (!window.confirm(t('tasks.shell.bulkDeleteFlaggedConfirm', { account: label }))) {
        return
      }
      setBulkFlaggedMenuOpen(false)
      setSaving(true)
      setTasksError(null)
      try {
        const res = await window.mailClient.tasks.bulkDeleteCompletedFlaggedEmailTasks({
          accountId: account.id
        })
        void loadListsForAccount(account.id, { force: true })
        if (isUnified) void loadUnifiedTasks({ forceRefresh: true })
        else void loadListTasks({ forceRefresh: true })
        if (!res.listFound) {
          useUndoStore.getState().pushToast({
            label: t('tasks.shell.bulkDeleteFlaggedNoList', { account: label }),
            variant: 'error'
          })
        } else {
          const parts: string[] = []
          if (res.deleted > 0) {
            parts.push(t('tasks.shell.bulkDeleteFlaggedDeleted', { count: res.deleted }))
          }
          if (res.failed > 0) {
            parts.push(t('tasks.shell.bulkDeleteFlaggedFailed', { count: res.failed }))
          }
          if (res.deleted === 0 && res.failed === 0) {
            parts.push(t('tasks.shell.bulkDeleteFlaggedNone'))
          }
          useUndoStore.getState().pushToast({
            label: parts.join(' · '),
            variant: res.failed > 0 ? 'error' : 'success'
          })
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setTasksError(msg)
        useUndoStore.getState().pushToast({ label: msg, variant: 'error' })
      } finally {
        setSaving(false)
      }
    },
    [t, loadListsForAccount, isUnified, loadUnifiedTasks, loadListTasks]
  )

  const openCreateTaskDialog = useCallback((range: CalendarCreateRange | null, preferredAccountId?: string | null): void => {
    setCreateTaskInitialRange(range)
    setCreateTaskPreferredAccountId(preferredAccountId ?? null)
    setCreateTaskDialogOpen(true)
  }, [])

  const closeCreateTaskDialog = useCallback((): void => {
    setCreateTaskDialogOpen(false)
    setCreateTaskInitialRange(null)
    setCreateTaskPreferredAccountId(null)
  }, [])

  const openTasksAccountContextMenu = useCallback(
    (e: MouseEvent, account: ConnectedAccount): void => {
      e.preventDefault()
      e.stopPropagation()
      setAccountSidebarContextMenu({
        x: e.clientX,
        y: e.clientY,
        items: buildAccountColorAndNewContextItems({
          account,
          patchAccountColor,
          onPatchError: (msg) => setTasksError(msg),
          newItem: {
            id: `tasks-new-${account.id}`,
            label: t('tasks.shell.calendarCreateTask'),
            icon: ListTodo,
            onSelect: (): void => {
              setAccountSidebarContextMenu(null)
              openCreateTaskDialog(null, account.id)
            }
          }
        })
      })
    },
    [patchAccountColor, t, openCreateTaskDialog]
  )

  useEffect(() => {
    const pending = useGlobalCreateNavigateStore.getState().takePendingAfterNavigate()
    if (pending === 'task' && taskAccounts.length > 0) {
      window.setTimeout((): void => openCreateTaskDialog(null), 0)
    }
  }, [taskAccounts.length, openCreateTaskDialog])

  useEffect(() => {
    const pendingTask = useTasksPendingFocusStore.getState().takePendingTask()
    if (!pendingTask) return
    const targetKey = `${pendingTask.accountId}:${pendingTask.listId}:${pendingTask.taskId}`
    persistTasksViewSelection({
      kind: 'list',
      accountId: pendingTask.accountId,
      listId: pendingTask.listId
    })
    setSelection({ kind: 'list', accountId: pendingTask.accountId, listId: pendingTask.listId })
    const fromUnified = unifiedTasksRef.current.find(
      (r) => `${r.accountId}:${r.listId}:${r.id}` === targetKey
    )
    if (fromUnified) {
      setSelected(fromUnified)
      return
    }
    void window.mailClient.tasks
      .listTasks({
        accountId: pendingTask.accountId,
        listId: pendingTask.listId,
        showCompleted: true
      })
      .then((rows) => {
        const listName =
          listsByAccount[pendingTask.accountId]?.find((l) => l.id === pendingTask.listId)?.name ??
          ''
        const hit = rows.find((t) => t.id === pendingTask.taskId)
        if (!hit) return
        setSelected({ ...hit, accountId: pendingTask.accountId, listName })
      })
      .catch(() => undefined)
  }, [listsByAccount])

  useEffect(() => {
    function onGlobalCreate(e: Event): void {
      const ce = e as CustomEvent<{ kind?: string }>
      if (ce.detail?.kind !== 'task') return
      if (taskAccounts.length === 0) return
      openCreateTaskDialog(null)
    }
    window.addEventListener(GLOBAL_CREATE_EVENT, onGlobalCreate as EventListener)
    return (): void => window.removeEventListener(GLOBAL_CREATE_EVENT, onGlobalCreate as EventListener)
  }, [taskAccounts.length, openCreateTaskDialog])

  const handleTaskCreated = useCallback(
    (task: TaskItemWithContext): void => {
      closeCreateTaskDialog()
      setSelected(task)
      handleTasksMutated()
    },
    [closeCreateTaskDialog, handleTasksMutated]
  )

  useEffect(() => {
    if (detailPlacement !== 'dock') {
      setDetailDockStripInDom(false)
      return
    }
    if (detailOpen) {
      setDetailDockStripInDom(true)
    }
  }, [detailOpen, detailPlacement])

  useEffect(() => {
    if (detailPlacement === 'float' && selectedWorkItem) {
      setDetailOpen(true)
      persistTasksDetailOpen(true)
    }
  }, [selectedWorkItem, detailPlacement])

  const detailFloatWidth = useMemo(
    () => Math.min(560, Math.max(300, Math.round(detailColumnWidth))),
    [detailColumnWidth]
  )
  const detailFloatPos = useMemo(() => {
    const x = Math.max(12, window.innerWidth - detailFloatWidth - 24)
    return { x, y: 72 }
  }, [detailFloatWidth])

  const detailFloatTitle = useMemo(() => {
    if (!selectedWorkItem) return t('tasks.shell.detailHeading')
    const title = selectedWorkItem.title?.trim()
    return title || t('tasks.shell.untitled')
  }, [selectedWorkItem, t])

  const hideDetailPanel = useCallback((): void => {
    persistTasksDetailOpen(false)
    setDetailOpen(false)
  }, [])

  const showDetailPanel = useCallback((): void => {
    persistTasksDetailOpen(true)
    setDetailOpen(true)
  }, [])

  const detailPanelBody = (
    <TasksDetailPanelBody
      item={selectedWorkItem}
      accountById={accountById}
      saving={saving}
      onCloudSave={saveCloudTask}
      onCloudDelete={deleteSelectedCloudTask}
      onCloudDisplayChange={
        selected
          ? (patch): Promise<void> => patchTaskDisplay(selected, patch)
          : undefined
      }
    />
  )

  const detailFloatOpen = detailOpen && detailPlacement === 'float'

  return (
    <section className="flex min-h-0 flex-1 overflow-hidden bg-background">
      <div style={{ width: sidebarWidth }} className="h-full shrink-0">
        <TasksShellSidebar
          taskAccounts={taskAccounts}
          profilePhotoDataUrls={profilePhotoDataUrls}
          listsByAccount={listsByAccount}
          listsLoadingByAccount={listsLoadingByAccount}
          listsErrorByAccount={listsErrorByAccount}
          selection={selection}
          unifiedLoading={unifiedLoading}
          onSelectUnified={handleSelectUnified}
          onSelectList={handleSelectList}
          onRefreshUnified={(): void => void loadUnifiedTasks({ forceRefresh: true })}
          onRefreshAccountLists={handleRefreshAccountLists}
          onAccountExpanded={handleAccountExpanded}
          onAccountHeaderContextMenu={openTasksAccountContextMenu}
          miniMonth={miniMonth}
          onMiniMonthPrev={(): void => setMiniMonth((m) => addMonths(m, -1))}
          onMiniMonthNext={(): void => setMiniMonth((m) => addMonths(m, 1))}
          onMiniMonthSelectRange={applyTasksMiniCalendarDayRange}
          miniMonthFooter={
            <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
              {t('tasks.shell.miniCalendarHint')}
            </p>
          }
        />
      </div>
      <VerticalSplitter onDrag={onDragSidebar} ariaLabel={t('tasks.shell.splitterSidebar')} />

      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className={cn(moduleColumnHeaderShellBarClass, 'justify-start gap-3 border-b border-border')}>
          <span className="shrink-0 font-semibold text-foreground">{t('tasks.shell.title')}</span>
          {headerTitle ? (
            <span className="min-w-0 truncate text-muted-foreground">· {headerTitle}</span>
          ) : null}
          <TasksViewModeSwitcher
            contentViewMode={contentViewMode}
            onContentViewModeChange={setContentViewMode}
            disabled={!selection}
          />
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={(): void => {
                if (isUnified) void loadUnifiedTasks({ forceRefresh: true })
                else void loadListTasks({ forceRefresh: true })
              }}
              disabled={!selection}
              className={moduleColumnHeaderOutlineSmClass}
            >
              <RefreshCw
                className={cn(moduleColumnHeaderIconGlyphClass, displayLoading && 'animate-spin')}
              />
              {t('tasks.shell.refreshTasks')}
            </button>
            {microsoftTaskAccounts.length > 0 ? (
              <div className="relative">
                <button
                  ref={bulkFlaggedBtnRef}
                  type="button"
                  disabled={saving}
                  onClick={(): void => setBulkFlaggedMenuOpen((o) => !o)}
                  className={moduleColumnHeaderOutlineSmClass}
                  aria-expanded={bulkFlaggedMenuOpen}
                  aria-haspopup="menu"
                  title={t('tasks.shell.bulkDeleteFlaggedMenuTitle')}
                >
                  <Eraser className={moduleColumnHeaderIconGlyphClass} />
                  <span className="hidden sm:inline">{t('tasks.shell.bulkDeleteFlaggedMenu')}</span>
                  <ChevronDown
                    className={cn(
                      'h-3.5 w-3.5 shrink-0 text-muted-foreground',
                      bulkFlaggedMenuOpen && 'rotate-180'
                    )}
                  />
                </button>
                {bulkFlaggedMenuOpen ? (
                  <div
                    ref={bulkFlaggedPanelRef}
                    role="menu"
                    aria-label={t('tasks.shell.bulkDeleteFlaggedMenuAria')}
                    className={cn(
                      'overflow-y-auto rounded-lg border border-border bg-popover py-1 shadow-xl',
                      'text-popover-foreground'
                    )}
                    style={bulkFlaggedPanelStyle}
                  >
                    <div className="border-b border-border/80 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {t('tasks.shell.bulkDeleteFlaggedSection')}
                    </div>
                    {microsoftTaskAccounts.map((acc) => {
                      const label = acc.displayName?.trim() || acc.email || acc.id
                      return (
                        <button
                          key={acc.id}
                          type="button"
                          role="menuitem"
                          className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs text-foreground hover:bg-secondary/70"
                          onClick={(): void => void runBulkDeleteFlaggedCompleted(acc)}
                        >
                          <span className="min-w-0 truncate">{label}</span>
                        </button>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </header>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          {isKanbanView ? (
            <>
              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                {!selection ? (
                  <p className="p-4 text-xs text-muted-foreground">{t('tasks.shell.selectList')}</p>
                ) : tasksError ? (
                  <p className="p-4 text-xs text-destructive">{tasksError}</p>
                ) : displayLoading && displayItems.length === 0 ? (
                  <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('common.loading')}
                  </div>
                ) : (
                  <TasksKanbanPane
                    items={displayItems}
                    accounts={taskAccounts}
                    filter={listViewPrefs.filter}
                    chrono={listViewPrefs.chrono}
                    arrangeCtx={taskArrangeCtx}
                    showAccountHint={isUnified}
                    selectedKey={selectedKey}
                    onSelect={setSelected}
                    onTasksMutated={handleTasksMutated}
                  />
                )}
              </div>
            </>
          ) : (
            <>
              <div
                style={{ width: listColumnWidth }}
                className="flex min-h-0 shrink-0 flex-col border-r border-border bg-background"
              >
                <div
                  className={cn(
                    moduleColumnHeaderDockBarRowClass,
                    'h-auto min-h-10 shrink-0 flex-wrap border-b border-border bg-card'
                  )}
                >
                  {checkedKeys.size > 0 ? (
                    <>
                      <span className="shrink-0 text-xs font-medium text-foreground">
                        {t('tasks.shell.selectedCount', { count: checkedKeys.size })}
                      </span>
                      <button
                        type="button"
                        onClick={selectAllVisible}
                        disabled={displayLoading || visibleOrderedKeys.length === 0}
                        className="shrink-0 rounded-md border border-border px-2 py-1 text-[10px] font-medium hover:bg-secondary/60 disabled:opacity-50"
                      >
                        {t('tasks.shell.selectAllVisible')}
                      </button>
                      <button
                        type="button"
                        onClick={clearChecked}
                        className="shrink-0 rounded-md border border-border px-2 py-1 text-[10px] font-medium hover:bg-secondary/60"
                      >
                        {t('tasks.shell.clearSelection')}
                      </button>
                      <button
                        type="button"
                        onClick={(): void => void deleteChecked()}
                        disabled={saving}
                        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-destructive/40 px-2 py-1 text-[10px] font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
                      >
                        <Trash2 className="h-3 w-3" />
                        {t('tasks.shell.deleteSelected')}
                      </button>
                      <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                        {visibleTaskCount}{' '}
                        {visibleTaskCount === 1
                          ? t('tasks.shell.task_one')
                          : t('tasks.shell.task_other')}
                      </span>
                    </>
                  ) : (
                    <>
                      <div className="min-w-0 flex-1">
                        <TasksListViewMenu
                          arrange={listViewPrefs.arrange}
                          chrono={listViewPrefs.chrono}
                          filter={listViewPrefs.filter}
                          filterCounts={filterCounts}
                          showAccountArrange={isUnified}
                          onArrangeChange={(v): void =>
                            setListViewPrefs((p) => ({ ...p, arrange: v }))
                          }
                          onChronoChange={(v): void =>
                            setListViewPrefs((p) => ({ ...p, chrono: v }))
                          }
                          onFilterChange={(v): void =>
                            setListViewPrefs((p) => ({ ...p, filter: v }))
                          }
                          disabled={!selection || displayLoading}
                        />
                      </div>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {visibleTaskCount}{' '}
                        {visibleTaskCount === 1
                          ? t('tasks.shell.task_one')
                          : t('tasks.shell.task_other')}
                      </span>
                    </>
                  )}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {!selection ? (
                    <p className="p-4 text-xs text-muted-foreground">{t('tasks.shell.selectList')}</p>
                  ) : tasksError ? (
                    <p className="p-4 text-xs text-destructive">{tasksError}</p>
                  ) : displayLoading &&
                    (isUnified ? unifiedTasks.length === 0 : listTasks.length === 0) ? (
                    <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t('common.loading')}
                    </div>
                  ) : displayItems.length === 0 ? (
                    <p className="p-4 text-xs text-muted-foreground">{t('tasks.shell.emptyTasks')}</p>
                  ) : (
                    <TasksGroupedList
                      items={displayItems}
                      accounts={taskAccounts}
                      arrange={listViewPrefs.arrange}
                      chrono={listViewPrefs.chrono}
                      filter={listViewPrefs.filter}
                      showAccountHint={isUnified}
                      selectedKey={selectedKey}
                      checkedKeys={checkedKeys}
                      onSelect={setSelected}
                      onTaskClick={handleTaskClick}
                      onToggleCheck={handleToggleCheck}
                      onToggleCompleted={(item): void => void toggleCompleted(item)}
                      enableDrag
                    />
                  )}
                </div>
              </div>
              <VerticalSplitter
                onDrag={onDragListCol}
                ariaLabel={t('mail.workspace.splitterList')}
              />
            </>
          )}
          {detailDockStripInDom && detailPlacement === 'dock' ? (
            <CalendarDockPanelSlide
              visible={detailDockShow}
              panelWidthPx={detailColumnWidth}
              onExitTransitionComplete={(): void => {
                if (!detailOpen) setDetailDockStripInDom(false)
              }}
              splitter={
                <VerticalSplitter
                  onDrag={onDragDetailCol}
                  ariaLabel={t('people.shell.splitterDetailAria')}
                />
              }
            >
              <div
                style={{ width: detailColumnWidth }}
                className="flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-r border-border bg-card"
              >
                <TasksDetailDockHeader
                  onUndock={(): void => {
                    setDetailPlacement('float')
                    showDetailPanel()
                  }}
                  onHide={hideDetailPanel}
                />
                {detailPanelBody}
              </div>
            </CalendarDockPanelSlide>
          ) : null}
          {!isKanbanView ? (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col border-l border-border bg-card">
              {!selection ? (
                <p className="p-4 text-xs text-muted-foreground">{t('tasks.shell.selectList')}</p>
              ) : (
                <>
                  <TasksCalendarToolbar
                    calendarRef={tasksCalendarRef}
                    calendarTitle={calendarTitle}
                    activeFcView={calendarFcView}
                    onActiveFcViewChange={setCalendarFcView}
                    dateMode={calendarDateMode}
                    onDateModeChange={setCalendarDateMode}
                  />
                  <TasksCalendarPane
                    selection={selection}
                    taskAccounts={taskAccounts}
                    listsByAccount={listsByAccount}
                    loadListsForAccount={loadListsForAccount}
                    selectedKey={selectedKey}
                    onSelectTask={setSelected}
                    onTasksMutated={handleTasksMutated}
                    fcView={calendarFcView}
                    fullCalendarRef={tasksCalendarRef}
                    listFilter={listViewPrefs.filter}
                    dateMode={calendarDateMode}
                    onViewMeta={(meta): void => setCalendarTitle(meta.title)}
                    onRequestCreate={openCreateTaskDialog}
                    className="min-h-0 min-w-0 flex-1"
                  />
                </>
              )}
            </div>
          ) : null}
        </div>

      </main>

      {detailPlacement === 'float' ? (
        <CalendarFloatingPanel
          open={detailFloatOpen}
          title={detailFloatTitle}
          widthPx={detailFloatWidth}
          minHeightPx={360}
          persistSizeKey={TASKS_FLOAT_DETAIL_SIZE_KEY}
          defaultPosition={detailFloatPos}
          zIndex={91}
          onClose={hideDetailPanel}
          onDock={(): void => {
            setDetailPlacement('dock')
            showDetailPanel()
          }}
        >
          {detailPanelBody}
        </CalendarFloatingPanel>
      ) : null}

      <CreateCloudTaskDialog
        open={createTaskDialogOpen}
        onClose={closeCreateTaskDialog}
        onCreated={handleTaskCreated}
        taskAccounts={taskAccounts}
        selection={selection}
        loadListsForAccount={loadListsForAccount}
        initialRange={createTaskInitialRange}
        preferredAccountIdOnOpen={createTaskPreferredAccountId}
      />
      {accountSidebarContextMenu ? (
        <ContextMenu
          x={accountSidebarContextMenu.x}
          y={accountSidebarContextMenu.y}
          items={accountSidebarContextMenu.items}
          onClose={(): void => setAccountSidebarContextMenu(null)}
        />
      ) : null}
    </section>
  )
}
