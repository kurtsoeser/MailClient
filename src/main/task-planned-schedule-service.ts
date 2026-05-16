import {
  deleteTaskPlannedSchedule,
  listTaskPlannedSchedulesForKeys,
  upsertTaskPlannedSchedule
} from './db/task-planned-schedule-repo'
import type { TaskPlannedScheduleDto } from '@shared/types'

export function listTaskPlannedSchedules(taskKeys: string[]): TaskPlannedScheduleDto[] {
  return listTaskPlannedSchedulesForKeys(taskKeys).map((row) => ({
    taskKey: row.taskKey,
    plannedStartIso: row.plannedStartIso,
    plannedEndIso: row.plannedEndIso
  }))
}

export function setTaskPlannedSchedule(
  taskKey: string,
  plannedStartIso: string,
  plannedEndIso: string
): void {
  upsertTaskPlannedSchedule(taskKey, plannedStartIso, plannedEndIso)
}

export function clearTaskPlannedSchedule(taskKey: string): void {
  deleteTaskPlannedSchedule(taskKey)
}
