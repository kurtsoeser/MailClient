import type { TodoDueKindList } from '@shared/types'
import type { WorkItemView } from '@shared/work-item'
import { format, parseISO } from 'date-fns'
import { dateBucketFor } from '@/lib/mail-list-arrange'
import { groupLabelTodoDueBucketDe, rankOpenTodoBucket } from '@/lib/todo-due-bucket'
import type {
  TaskListArrangeBy,
  TaskListChronoOrder,
  TaskListFilter
} from '@/app/tasks/task-list-arrange'

export type WorkListArrangeBy = TaskListArrangeBy
export type WorkListFilter = TaskListFilter
export type WorkListChronoOrder = TaskListChronoOrder

export interface WorkListGroup {
  key: string
  label: string
  todoKind: TodoDueKindList | null
  items: WorkItemView[]
}

export interface WorkListArrangeContext {
  accountLabel: (accountId: string) => string
  todoBucketLabel?: (kind: TodoDueKindList) => string
  noDueLabel: string
  openLabel: string
  doneLabel: string
  mailSourceLabel: string
  /** Kalendertag (yyyy-MM-dd): Lesbare Gruppenüberschrift für Zeitliste / Arbeit. */
  formatCalendarDayGroupLabel?: (dayKeyYyyyMmDd: string) => string
}

function dueSortKey(dueIso: string | null): string {
  if (!dueIso?.trim()) return 'zzzz-no-due'
  return dueIso.trim()
}

export function compareWorkItemViews(
  a: WorkItemView,
  b: WorkItemView,
  chrono: WorkListChronoOrder
): number {
  const ad = dueSortKey(a.dueAtIso)
  const bd = dueSortKey(b.dueAtIso)
  if (ad !== bd) {
    const newer = ad > bd
    if (chrono === 'newest_on_top') return newer ? -1 : 1
    return newer ? 1 : -1
  }
  return a.title.localeCompare(b.title, 'de', { sensitivity: 'base' })
}

function filterViews(
  items: WorkItemView[],
  filter: WorkListFilter
): WorkItemView[] {
  return items.filter((item) => {
    switch (filter) {
      case 'all':
        return true
      case 'open':
        return !item.completed
      case 'completed':
        return item.completed
      case 'overdue':
        return !item.completed && item.bucket === 'overdue'
      default:
        return true
    }
  })
}

function bucketKey(label: string, sortKey: string | number): string {
  return `${typeof sortKey === 'number' ? `n:${sortKey}` : `s:${sortKey}`}\t${label}`
}

function groupKeyForView(
  item: WorkItemView,
  arrange: WorkListArrangeBy,
  ctx: WorkListArrangeContext
): { key: string; label: string; sortKey: string | number; todoKind: TodoDueKindList | null } {
  switch (arrange) {
    case 'todo_bucket': {
      const kind = item.bucket
      const label = ctx.todoBucketLabel ? ctx.todoBucketLabel(kind) : groupLabelTodoDueBucketDe(kind)
      return { key: kind, label, sortKey: rankOpenTodoBucket(kind), todoKind: kind }
    }
    case 'due_date': {
      if (!item.dueAtIso?.trim()) {
        return { key: 'no-due', label: ctx.noDueLabel, sortKey: 'zzzz-no-due', todoKind: null }
      }
      const b = dateBucketFor(item.dueAtIso)
      return { key: b.key, label: b.label, sortKey: b.key, todoKind: null }
    }
    case 'calendar_day': {
      const iso = item.effectiveSortIso?.trim()
      if (!iso) {
        return {
          key: 'zzzz-no-date',
          label: ctx.noDueLabel,
          sortKey: 'zzzz-no-date',
          todoKind: null
        }
      }
      let dayKey: string
      if (/^\d{4}-\d{2}-\d{2}/.test(iso)) {
        dayKey = iso.slice(0, 10)
      } else {
        try {
          const d = parseISO(iso)
          if (Number.isNaN(d.getTime())) {
            return {
              key: 'zzzz-no-date',
              label: ctx.noDueLabel,
              sortKey: 'zzzz-no-date',
              todoKind: null
            }
          }
          dayKey = format(d, 'yyyy-MM-dd')
        } catch {
          return {
            key: 'zzzz-no-date',
            label: ctx.noDueLabel,
            sortKey: 'zzzz-no-date',
            todoKind: null
          }
        }
      }
      const label = ctx.formatCalendarDayGroupLabel?.(dayKey) ?? dayKey
      return { key: dayKey, label, sortKey: dayKey, todoKind: null }
    }
    case 'title': {
      const t = (item.title.trim() || '?')[0]!.toUpperCase()
      const letter = /[A-ZÄÖÜ]/.test(t) ? t : '#'
      return { key: letter, label: letter, sortKey: letter, todoKind: null }
    }
    case 'account': {
      const label = ctx.accountLabel(item.accountId)
      return { key: item.accountId, label, sortKey: label.toLowerCase(), todoKind: null }
    }
    case 'list': {
      if (item.kind === 'mail_todo') {
        return {
          key: 'mail',
          label: ctx.mailSourceLabel,
          sortKey: 'mail',
          todoKind: null
        }
      }
      const label = item.listName?.trim() || item.listId || '?'
      return {
        key: `${item.accountId}:${item.listId ?? ''}`,
        label,
        sortKey: label.toLowerCase(),
        todoKind: null
      }
    }
    case 'status': {
      const open = !item.completed
      return {
        key: open ? 'open' : 'done',
        label: open ? ctx.openLabel : ctx.doneLabel,
        sortKey: open ? 0 : 1,
        todoKind: null
      }
    }
    case 'none':
    default:
      return { key: 'all', label: '', sortKey: 0, todoKind: null }
  }
}

function sortGroups(
  groups: WorkListGroup[],
  arrange: WorkListArrangeBy,
  chrono: WorkListChronoOrder
): WorkListGroup[] {
  const g = [...groups]
  if (arrange === 'todo_bucket') {
    g.sort((a, b) => {
      const ar = a.todoKind != null ? rankOpenTodoBucket(a.todoKind) : 99
      const br = b.todoKind != null ? rankOpenTodoBucket(b.todoKind) : 99
      return ar - br
    })
    return g
  }
  if (arrange === 'status') {
    g.sort((a, b) => a.key.localeCompare(b.key))
    return g
  }
  if (arrange === 'due_date' || arrange === 'calendar_day') {
    g.sort((a, b) => {
      const empty = (k: string): boolean => k.startsWith('zzzz') || k === 'unknown'
      if (empty(a.key) && !empty(b.key)) return 1
      if (!empty(a.key) && empty(b.key)) return -1
      if (chrono === 'newest_on_top') return b.key.localeCompare(a.key)
      return a.key.localeCompare(b.key)
    })
    return g
  }
  g.sort((a, b) => a.label.localeCompare(b.label, 'de', { sensitivity: 'base' }))
  return g
}

export function computeWorkItemListLayout(
  items: WorkItemView[],
  arrange: WorkListArrangeBy,
  chrono: WorkListChronoOrder,
  filter: WorkListFilter,
  ctx: WorkListArrangeContext
): WorkListGroup[] {
  const filtered = filterViews(items, filter)
  if (arrange === 'none') {
    const sorted = [...filtered].sort((a, b) => compareWorkItemViews(a, b, chrono))
    if (sorted.length === 0) return []
    return [{ key: 'all', label: '', todoKind: null, items: sorted }]
  }

  const map = new Map<string, WorkListGroup>()
  for (const item of filtered) {
    const { key, label, sortKey, todoKind } = groupKeyForView(item, arrange, ctx)
    const mapKey = bucketKey(label, sortKey)
    const ex = map.get(mapKey)
    if (ex) ex.items.push(item)
    else map.set(mapKey, { key, label, todoKind, items: [item] })
  }

  const groups = sortGroups([...map.values()], arrange, chrono)
  for (const g of groups) {
    g.items.sort((a, b) => compareWorkItemViews(a, b, chrono))
  }
  return groups.filter((g) => g.items.length > 0)
}

export function workListFilterCounts(items: WorkItemView[]): {
  all: number
  open: number
  completed: number
  overdue: number
} {
  let open = 0
  let completed = 0
  let overdue = 0
  for (const item of items) {
    if (item.completed) completed++
    else {
      open++
      if (item.bucket === 'overdue') overdue++
    }
  }
  return { all: items.length, open, completed, overdue }
}

export function workListGroupCollapseKey(arrange: WorkListArrangeBy, group: WorkListGroup): string {
  return `${arrange}:${group.key}`
}

export function flattenVisibleWorkItemViews(
  items: WorkItemView[],
  arrange: WorkListArrangeBy,
  chrono: WorkListChronoOrder,
  filter: WorkListFilter,
  ctx: WorkListArrangeContext
): WorkItemView[] {
  return computeWorkItemListLayout(items, arrange, chrono, filter, ctx).flatMap((g) => g.items)
}
