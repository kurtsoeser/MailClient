import type { TaskItemRow, TodoDueKindList } from '@shared/types'
import { rankOpenTodoBucket } from '@/lib/todo-due-bucket'
import { classifyDueAtIso, normalizeDueAtIso } from '@/app/work-items/work-item-due'

export function classifyTaskItemDueBucket(
  task: Pick<TaskItemRow, 'dueIso' | 'completed'>,
  timeZone: string,
  nowMs = Date.now()
): TodoDueKindList {
  if (task.completed) return 'done'
  const dueAt = task.dueIso ? normalizeDueAtIso(task.dueIso, timeZone) : null
  if (!dueAt) return 'later'
  return classifyDueAtIso(dueAt, timeZone, nowMs)
}

export const OPEN_TASK_DUE_BUCKETS: TodoDueKindList[] = [
  'overdue',
  'today',
  'tomorrow',
  'this_week',
  'later'
]

const ALL_TASK_DUE_BUCKETS: TodoDueKindList[] = [...OPEN_TASK_DUE_BUCKETS, 'done']

export function compareTasksInBucket(
  a: Pick<TaskItemRow, 'dueIso' | 'title'>,
  b: Pick<TaskItemRow, 'dueIso' | 'title'>
): number {
  const ad = a.dueIso?.trim() ?? ''
  const bd = b.dueIso?.trim() ?? ''
  if (ad && bd && ad !== bd) return ad.localeCompare(bd)
  if (ad && !bd) return -1
  if (!ad && bd) return 1
  return a.title.localeCompare(b.title, 'de', { sensitivity: 'base' })
}

export function groupTasksByDueBucket<T extends Pick<TaskItemRow, 'dueIso' | 'completed' | 'title'>>(
  items: T[],
  opts: { showCompleted: boolean; timeZone: string }
): Array<{ kind: TodoDueKindList; items: T[] }> {
  const buckets = new Map<TodoDueKindList, T[]>()
  for (const kind of ALL_TASK_DUE_BUCKETS) {
    buckets.set(kind, [])
  }
  const tz = opts.timeZone
  for (const item of items) {
    if (item.completed && !opts.showCompleted) continue
    const kind = classifyTaskItemDueBucket(item, tz)
    buckets.get(kind)?.push(item)
  }
  const out: Array<{ kind: TodoDueKindList; items: T[] }> = []
  for (const kind of ALL_TASK_DUE_BUCKETS) {
    const list = buckets.get(kind) ?? []
    if (kind === 'done' && list.length === 0) continue
    if (kind !== 'done' && list.length === 0) continue
    list.sort(compareTasksInBucket)
    out.push({ kind, items: list })
  }
  out.sort((a, b) => rankOpenTodoBucket(a.kind) - rankOpenTodoBucket(b.kind))
  return out
}
