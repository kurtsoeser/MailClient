import type {
  TaskListArrangeBy,
  TaskListChronoOrder,
  TaskListFilter
} from '@/app/tasks/task-list-arrange'

const KEY = 'mailclient.workListViewPrefs.v1'

export interface WorkListViewPrefsV1 {
  arrange: TaskListArrangeBy
  chrono: TaskListChronoOrder
  filter: TaskListFilter
}

const DEFAULT: WorkListViewPrefsV1 = {
  /** Zeitliste: Gruppierung nach Kalendertag (wie klassische Agenda). */
  arrange: 'calendar_day',
  /** Kalender-Zeitliste: chronologisch mit ältesten Einträgen oben. */
  chrono: 'oldest_on_top',
  filter: 'open'
}

const ARRANGE_VALUES = new Set<TaskListArrangeBy>([
  'calendar_day',
  'todo_bucket',
  'due_date',
  'title',
  'account',
  'list',
  'status',
  'none'
])

function coerceArrange(v: unknown): TaskListArrangeBy {
  return typeof v === 'string' && ARRANGE_VALUES.has(v as TaskListArrangeBy)
    ? (v as TaskListArrangeBy)
    : DEFAULT.arrange
}

export function readWorkListViewPrefs(): WorkListViewPrefsV1 {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT }
    const parsed = JSON.parse(raw) as Partial<WorkListViewPrefsV1>
    return {
      arrange: coerceArrange(parsed.arrange),
      chrono: parsed.chrono ?? DEFAULT.chrono,
      filter: parsed.filter ?? DEFAULT.filter
    }
  } catch {
    return { ...DEFAULT }
  }
}

export function persistWorkListViewPrefs(prefs: WorkListViewPrefsV1): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    // ignore
  }
}
