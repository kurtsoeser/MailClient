import type { WorkItemPlannedSchedule } from '@shared/work-item'
import { cloudTaskStableKey } from '@shared/work-item-keys'
import type { TaskItemWithContext } from '@/app/tasks/tasks-types'

export function plannedScheduleMapFromDtos(
  rows: Array<{ taskKey: string; plannedStartIso: string; plannedEndIso: string }>
): Map<string, WorkItemPlannedSchedule> {
  const map = new Map<string, WorkItemPlannedSchedule>()
  for (const row of rows) {
    map.set(row.taskKey, {
      plannedStartIso: row.plannedStartIso,
      plannedEndIso: row.plannedEndIso
    })
  }
  return map
}

export function cloudTaskKeysFromItems(items: TaskItemWithContext[]): string[] {
  return items.map((t) => cloudTaskStableKey(t.accountId, t.listId, t.id))
}

export async function loadPlannedScheduleMapForTasks(
  items: TaskItemWithContext[]
): Promise<Map<string, WorkItemPlannedSchedule>> {
  const keys = cloudTaskKeysFromItems(items)
  if (keys.length === 0) return new Map()
  const rows = await window.mailClient.tasks.listPlannedSchedules({ taskKeys: keys })
  return plannedScheduleMapFromDtos(rows)
}
