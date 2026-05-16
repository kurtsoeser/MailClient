import {
  dueIsoFromCloudTaskScheduleStart,
  type CloudTaskPersistTarget
} from '@/app/calendar/cloud-task-calendar'
import type { TaskItemWithContext } from '@/app/tasks/tasks-types'

/** Wendet Drag/Resize-Ergebnis auf API (Due) bzw. lokalen Planungs-Store an. */
export async function applyCloudTaskPersistTarget(
  target: CloudTaskPersistTarget,
  task: Pick<TaskItemWithContext, 'accountId' | 'listId' | 'id'>,
  fcTimeZone: string
): Promise<void> {
  if (target.kind === 'planned') {
    await window.mailClient.tasks.setPlannedSchedule({
      taskKey: target.taskKey,
      plannedStartIso: target.plannedStartIso,
      plannedEndIso: target.plannedEndIso
    })
    await window.mailClient.tasks.patchTask({
      accountId: task.accountId,
      listId: task.listId,
      taskId: task.id,
      dueIso: dueIsoFromCloudTaskScheduleStart(target.plannedStartIso, fcTimeZone)
    })
    return
  }
  await window.mailClient.tasks.clearPlannedSchedule({ taskKey: target.taskKey })
  await window.mailClient.tasks.patchTask({
    accountId: task.accountId,
    listId: task.listId,
    taskId: task.id,
    dueIso: target.dueIso
  })
}
