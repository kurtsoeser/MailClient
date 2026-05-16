import type { ConnectedAccount, TaskListRow } from '@shared/types'
import type { WorkItemPlannedSchedule } from '@shared/work-item'
import { cloudTaskStableKey } from '@shared/work-item-keys'
import {
  cloudTaskVisualSpan,
  cloudTaskVisualSpanForMode,
  type CloudTaskCalendarDateMode
} from '@/app/calendar/cloud-task-calendar'
import type { TaskListFilter } from '@/app/tasks/task-list-arrange'
import { classifyTaskItemDueBucket } from '@/app/tasks/task-due-bucket'
import type { TaskItemWithContext, TasksViewSelection } from '@/app/tasks/tasks-types'

/** Signatur für Kalender-Layer: verhindert FullCalendar-Redraw bei unveränderten Daten. */
export function cloudTaskCalendarDisplaySignature(
  items: TaskItemWithContext[],
  plannedByTaskKey: ReadonlyMap<string, WorkItemPlannedSchedule>
): string {
  const parts = items.map((task) => {
    const key = cloudTaskStableKey(task.accountId, task.listId, task.id)
    const p = plannedByTaskKey.get(key)
    return `${key}\t${task.title}\t${task.completed ? 1 : 0}\t${task.dueIso ?? ''}\t${p?.plannedStartIso ?? ''}\t${p?.plannedEndIso ?? ''}`
  })
  parts.sort()
  return parts.join('\n')
}

/** Alle Aufgaben eines Kontos (Cache oder mit optionalem Hintergrund-Sync). */
export async function loadCloudTasksForAccount(
  accountId: string,
  opts?: { cacheOnly?: boolean }
): Promise<TaskItemWithContext[]> {
  const cacheOnly = opts?.cacheOnly === true
  let lists: TaskListRow[]
  try {
    lists = await window.mailClient.tasks.listLists({ accountId, cacheOnly })
  } catch {
    return []
  }
  const merged: TaskItemWithContext[] = []
  for (const list of lists) {
    try {
      const rows = await window.mailClient.tasks.listTasks({
        accountId,
        listId: list.id,
        showCompleted: true,
        showHidden: false,
        cacheOnly
      })
      for (const row of rows) {
        merged.push({ ...row, accountId, listName: list.name })
      }
    } catch {
      // eine Liste ueberspringen
    }
  }
  return merged
}

/** Alle Cloud-Aufgaben verbundener Konten (Hauptkalender-Layer). */
export async function loadUnifiedCloudTasks(
  taskAccounts: ConnectedAccount[],
  opts?: { cacheOnly?: boolean }
): Promise<TaskItemWithContext[]> {
  const merged: TaskItemWithContext[] = []
  const cacheOnly = opts?.cacheOnly === true
  for (const acc of taskAccounts) {
    let lists: TaskListRow[]
    try {
      lists = await window.mailClient.tasks.listLists({ accountId: acc.id, cacheOnly })
    } catch {
      continue
    }
    for (const list of lists) {
      try {
        const rows = await window.mailClient.tasks.listTasks({
          accountId: acc.id,
          listId: list.id,
          showCompleted: true,
          showHidden: false,
          cacheOnly
        })
        for (const row of rows) {
          merged.push({ ...row, accountId: acc.id, listName: list.name })
        }
      } catch {
        // eine Liste ueberspringen
      }
    }
  }
  return merged
}

export async function loadCloudTasksForSelection(
  selection: TasksViewSelection | null,
  taskAccounts: ConnectedAccount[],
  listsByAccount: Record<string, TaskListRow[] | undefined>,
  loadListsForAccount: (accountId: string) => Promise<TaskListRow[]>
): Promise<TaskItemWithContext[]> {
  if (!selection) return []

  if (selection.kind === 'list') {
    const rows = await window.mailClient.tasks.listTasks({
      accountId: selection.accountId,
      listId: selection.listId,
      showCompleted: true,
      showHidden: false
    })
    const listName =
      listsByAccount[selection.accountId]?.find((l) => l.id === selection.listId)?.name ?? ''
    return rows.map((row) => ({
      ...row,
      accountId: selection.accountId,
      listName
    }))
  }

  const merged: TaskItemWithContext[] = []
  for (const acc of taskAccounts) {
    let lists = listsByAccount[acc.id]
    if (lists === undefined) {
      lists = await loadListsForAccount(acc.id)
    }
    for (const list of lists ?? []) {
      try {
        const rows = await window.mailClient.tasks.listTasks({
          accountId: acc.id,
          listId: list.id,
          showCompleted: true,
          showHidden: false
        })
        for (const row of rows) {
          merged.push({ ...row, accountId: acc.id, listName: list.name })
        }
      } catch {
        // ein Konto/Liste ueberspringen
      }
    }
  }
  return merged
}

export function filterCloudTasksInCalendarRange(
  items: TaskItemWithContext[],
  plannedByTaskKey: ReadonlyMap<string, WorkItemPlannedSchedule>,
  rangeStart: Date,
  rangeEnd: Date,
  filter: TaskListFilter = 'all',
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
  dateMode?: CloudTaskCalendarDateMode
): TaskItemWithContext[] {
  const startMs = rangeStart.getTime()
  const endMs = rangeEnd.getTime()
  return items.filter((task) => {
    if (filter === 'open' && task.completed) return false
    if (filter === 'completed' && !task.completed) return false
    if (filter === 'overdue') {
      if (task.completed) return false
      if (classifyTaskItemDueBucket(task, timeZone) !== 'overdue') return false
    }
    const key = cloudTaskStableKey(task.accountId, task.listId, task.id)
    const planned = plannedByTaskKey.get(key)
    const span = dateMode
      ? cloudTaskVisualSpanForMode(task, planned ?? null, dateMode)
      : cloudTaskVisualSpan(task, planned ?? null)
    if (!span) return false
    return span.endMs > startMs && span.startMs < endMs
  })
}
