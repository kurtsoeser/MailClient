import { patchCloudTaskDisplay, touchTaskListSyncState } from './db/cloud-tasks-repo'
import {
  deleteCloudTask,
  invalidateTaskListSyncState,
  invalidateTaskListsSyncState,
  syncTasksForAccount,
  upsertCloudTasks
} from './tasks-cache-service'
import { broadcastTasksChanged } from './ipc/ipc-broadcasts'
import type { TaskItemRow, TasksPatchTaskDisplayInput } from '@shared/types'

export function afterTaskCreated(accountId: string, task: TaskItemRow): void {
  upsertCloudTasks(accountId, [task])
  touchList(accountId, task.listId)
  broadcastTasksChanged(accountId)
}

export function afterTaskUpdated(accountId: string, task: TaskItemRow): void {
  upsertCloudTasks(accountId, [task])
  touchList(accountId, task.listId)
  broadcastTasksChanged(accountId)
}

export function afterTaskDisplayPatched(input: TasksPatchTaskDisplayInput): void {
  patchCloudTaskDisplay(input.accountId, input.listId, input.taskId, {
    iconId: input.iconId,
    iconColor: input.iconColor
  })
  touchList(input.accountId, input.listId)
  broadcastTasksChanged(input.accountId)
}

export function afterTaskDeleted(accountId: string, listId: string, taskId: string): void {
  deleteCloudTask(accountId, listId, taskId)
  touchList(accountId, listId)
  broadcastTasksChanged(accountId)
}

export function afterTaskListsMayHaveChanged(accountId: string): void {
  invalidateTaskListsSyncState(accountId)
  invalidateTaskListSyncState(accountId)
  broadcastTasksChanged(accountId)
  void syncTasksForAccount(accountId).catch((e) =>
    console.warn('[tasks-cache] Nach Listen-Aenderung Sync fehlgeschlagen:', e)
  )
}

function touchList(accountId: string, listId: string): void {
  touchTaskListSyncState(accountId, listId)
}
