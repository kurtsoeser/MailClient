import type {
  TaskListArrangeBy,
  TaskListChronoOrder,
  TaskListFilter
} from '@/app/tasks/task-list-arrange'

const KEY = 'mailclient.tasks.listView.v1'

export interface TasksListViewPrefsV1 {
  arrange: TaskListArrangeBy
  chrono: TaskListChronoOrder
  filter: TaskListFilter
}

const DEFAULTS: TasksListViewPrefsV1 = {
  arrange: 'todo_bucket',
  chrono: 'newest_on_top',
  filter: 'all'
}

const VALID_ARRANGE = new Set<TaskListArrangeBy>([
  'todo_bucket',
  'due_date',
  'title',
  'account',
  'list',
  'status',
  'none'
])

const VALID_FILTER = new Set<TaskListFilter>(['all', 'open', 'completed', 'overdue'])

const VALID_CHRONO = new Set<TaskListChronoOrder>(['newest_on_top', 'oldest_on_top'])

export function readTasksListViewPrefs(): TasksListViewPrefsV1 {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    const o = JSON.parse(raw) as unknown
    if (!o || typeof o !== 'object' || Array.isArray(o)) return { ...DEFAULTS }
    const rec = o as Record<string, unknown>
    const arrange = VALID_ARRANGE.has(rec.arrange as TaskListArrangeBy)
      ? (rec.arrange as TaskListArrangeBy)
      : DEFAULTS.arrange
    const filter = VALID_FILTER.has(rec.filter as TaskListFilter)
      ? (rec.filter as TaskListFilter)
      : DEFAULTS.filter
    const chrono = VALID_CHRONO.has(rec.chrono as TaskListChronoOrder)
      ? (rec.chrono as TaskListChronoOrder)
      : DEFAULTS.chrono
    return { arrange, filter, chrono }
  } catch {
    return { ...DEFAULTS }
  }
}

export function persistTasksListViewPrefs(prefs: TasksListViewPrefsV1): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    // ignore
  }
}
