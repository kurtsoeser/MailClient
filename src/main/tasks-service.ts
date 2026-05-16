import { listAccounts } from './accounts'
import type { ConnectedAccount, TaskItemRow, TaskListRow } from '@shared/types'
import {
  graphCreateTodoTask,
  graphDeleteTodoTask,
  graphListTodoLists,
  graphListTodoTasks,
  graphPatchTodoTask,
  graphUpdateTodoTask
} from './graph/tasks-graph'
import {
  googleDeleteTask,
  googleInsertTask,
  googleListTaskLists,
  googleListTasksInList,
  googlePatchTask,
  googleUpdateTask
} from './google/tasks-google'
import { cloudTaskStableKey } from '@shared/work-item-keys'
import { clearMailCloudTaskLinksForDeletedTask } from './mail-cloud-task-link-service'
import { clearTaskPlannedSchedule } from './task-planned-schedule-service'

async function resolveConnectedAccount(accountId: string): Promise<ConnectedAccount> {
  const accounts = await listAccounts()
  const acc = accounts.find((a) => a.id === accountId)
  if (!acc) {
    throw new Error('Konto nicht gefunden.')
  }
  if (acc.provider !== 'microsoft' && acc.provider !== 'google') {
    throw new Error('Aufgaben werden fuer dieses Konto nicht unterstuetzt.')
  }
  return acc
}

export async function listTaskListsForAccount(accountId: string): Promise<TaskListRow[]> {
  const acc = await resolveConnectedAccount(accountId)
  if (acc.provider === 'google') {
    return googleListTaskLists(accountId)
  }
  return graphListTodoLists(accountId)
}

export async function listTasksForAccount(
  accountId: string,
  listId: string,
  opts?: { showCompleted?: boolean; showHidden?: boolean }
): Promise<TaskItemRow[]> {
  const acc = await resolveConnectedAccount(accountId)
  if (acc.provider === 'google') {
    return googleListTasksInList(accountId, listId, opts)
  }
  return graphListTodoTasks(accountId, listId, opts)
}

export async function createTaskForAccount(
  accountId: string,
  listId: string,
  input: { title: string; notes?: string | null; dueIso?: string | null; completed?: boolean }
): Promise<TaskItemRow> {
  const acc = await resolveConnectedAccount(accountId)
  if (acc.provider === 'google') {
    return googleInsertTask(accountId, listId, input)
  }
  return graphCreateTodoTask(accountId, listId, input)
}

export async function patchTaskForAccount(
  accountId: string,
  listId: string,
  taskId: string,
  patch: {
    title?: string | null
    notes?: string | null
    dueIso?: string | null
    completed?: boolean
  }
): Promise<TaskItemRow> {
  const acc = await resolveConnectedAccount(accountId)
  if (acc.provider === 'google') {
    return googlePatchTask(accountId, listId, taskId, patch)
  }
  return graphPatchTodoTask(accountId, listId, taskId, patch)
}

export async function updateTaskForAccount(
  accountId: string,
  listId: string,
  taskId: string,
  input: { title: string; notes?: string | null; dueIso?: string | null; completed?: boolean }
): Promise<TaskItemRow> {
  const acc = await resolveConnectedAccount(accountId)
  if (acc.provider === 'google') {
    return googleUpdateTask(accountId, listId, taskId, input)
  }
  return graphUpdateTodoTask(accountId, listId, taskId, input)
}

export async function deleteTaskForAccount(accountId: string, listId: string, taskId: string): Promise<void> {
  const acc = await resolveConnectedAccount(accountId)
  if (acc.provider === 'google') {
    await googleDeleteTask(accountId, listId, taskId)
  } else {
    await graphDeleteTodoTask(accountId, listId, taskId)
  }
  clearTaskPlannedSchedule(cloudTaskStableKey(accountId, listId, taskId))
  clearMailCloudTaskLinksForDeletedTask(accountId, listId, taskId)
}
