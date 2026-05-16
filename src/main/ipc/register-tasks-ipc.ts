import { ipcMain } from 'electron'
import { listAccounts } from '../accounts'
import {
  graphFindFlaggedEmailsListId,
  graphListCompletedTodoTaskIdsInList
} from '../graph/tasks-graph'
import {
  IPC,
  type ClearLocalTasksCacheResult,
  type TasksCreateTaskInput,
  type TasksDeleteTaskInput,
  type TasksBulkDeleteCompletedFlaggedEmailInput,
  type TasksBulkDeleteCompletedFlaggedEmailResult,
  type TasksListListsInput,
  type TasksListTasksInput,
  type TasksPatchTaskInput,
  type TasksClearPlannedScheduleInput,
  type TasksListPlannedSchedulesInput,
  type TasksSetPlannedScheduleInput,
  type TasksUpdateTaskInput,
  type TasksCreateMailCloudTaskFromMessageInput,
  type MailCloudTaskLinkDto,
  type TaskItemRow,
  type TaskListRow,
  type TaskPlannedScheduleDto
} from '@shared/types'
import {
  createMailCloudTaskFromMessage,
  listMailCloudTaskLinkDtos
} from '../mail-cloud-task-link-service'
import {
  clearTaskPlannedSchedule,
  listTaskPlannedSchedules,
  setTaskPlannedSchedule
} from '../task-planned-schedule-service'
import {
  afterTaskCreated,
  afterTaskDeleted,
  afterTaskUpdated
} from '../tasks-cache-mutations'
import { clearLocalTasksCacheForAccount } from '../tasks-cache-reset'
import { listTaskListsCached, listTasksCached } from '../tasks-cache-service'
import {
  createTaskForAccount,
  deleteTaskForAccount,
  patchTaskForAccount,
  updateTaskForAccount
} from '../tasks-service'

function requireAccountId(v: unknown): string {
  const s = typeof v === 'string' ? v.trim() : ''
  if (!s) throw new Error('Konto-ID fehlt.')
  return s
}

function requireListId(v: unknown): string {
  const s = typeof v === 'string' ? v.trim() : ''
  if (!s) throw new Error('Aufgabenlisten-ID fehlt.')
  return s
}

function requireTaskId(v: unknown): string {
  const s = typeof v === 'string' ? v.trim() : ''
  if (!s) throw new Error('Aufgaben-ID fehlt.')
  return s
}

async function bulkDeleteCompletedFlaggedEmailTasksImpl(
  accountId: string
): Promise<TasksBulkDeleteCompletedFlaggedEmailResult> {
  const accounts = await listAccounts()
  const acc = accounts.find((a) => a.id === accountId)
  if (!acc) throw new Error('Konto nicht gefunden.')
  if (acc.provider !== 'microsoft') {
    throw new Error('Bulk-Löschen der Liste „Gekennzeichnete E-Mail“ ist nur für Microsoft 365 verfügbar.')
  }
  const listId = await graphFindFlaggedEmailsListId(accountId)
  if (listId == null) {
    return { listFound: false, deleted: 0, failed: 0 }
  }
  const taskIds = await graphListCompletedTodoTaskIdsInList(accountId, listId)
  let deleted = 0
  let failed = 0
  for (const taskId of taskIds) {
    try {
      await deleteTaskForAccount(accountId, listId, taskId)
      afterTaskDeleted(accountId, listId, taskId)
      deleted++
    } catch (e) {
      failed++
      console.warn('[tasks-ipc] bulk delete flagged completed failed', accountId, taskId, e)
    }
  }
  return { listFound: true, deleted, failed }
}

export function registerTasksIpc(): void {
  ipcMain.removeHandler(IPC.tasks.listLists)
  ipcMain.handle(
    IPC.tasks.listLists,
    async (_event, args: TasksListListsInput): Promise<TaskListRow[]> => {
      return listTaskListsCached(requireAccountId(args?.accountId), {
        forceRefresh: args?.forceRefresh === true,
        cacheOnly: args?.cacheOnly === true
      })
    }
  )

  ipcMain.removeHandler(IPC.tasks.listTasks)
  ipcMain.handle(
    IPC.tasks.listTasks,
    async (_event, args: TasksListTasksInput): Promise<TaskItemRow[]> => {
      return listTasksCached(requireAccountId(args?.accountId), requireListId(args?.listId), {
        showCompleted: args?.showCompleted,
        showHidden: args?.showHidden,
        forceRefresh: args?.forceRefresh === true,
        cacheOnly: args?.cacheOnly === true
      })
    }
  )

  ipcMain.removeHandler(IPC.tasks.clearLocalTasksCache)
  ipcMain.handle(
    IPC.tasks.clearLocalTasksCache,
    async (_event, accountId: string): Promise<ClearLocalTasksCacheResult> => {
      return clearLocalTasksCacheForAccount(requireAccountId(accountId))
    }
  )

  ipcMain.removeHandler(IPC.tasks.createTask)
  ipcMain.handle(IPC.tasks.createTask, async (_event, input: TasksCreateTaskInput): Promise<TaskItemRow> => {
    const accountId = requireAccountId(input?.accountId)
    const listId = requireListId(input?.listId)
    const title = typeof input?.title === 'string' ? input.title.trim() : ''
    if (!title) throw new Error('Titel fehlt.')
    const task = await createTaskForAccount(accountId, listId, {
      title,
      notes: input.notes ?? null,
      dueIso: input.dueIso ?? null,
      completed: input.completed === true
    })
    afterTaskCreated(accountId, task)
    return task
  })

  ipcMain.removeHandler(IPC.tasks.patchTask)
  ipcMain.handle(IPC.tasks.patchTask, async (_event, input: TasksPatchTaskInput): Promise<TaskItemRow> => {
    const accountId = requireAccountId(input?.accountId)
    const task = await patchTaskForAccount(accountId, requireListId(input?.listId), requireTaskId(input?.taskId), {
      title: input.title,
      notes: input.notes,
      dueIso: input.dueIso,
      completed: input.completed
    })
    afterTaskUpdated(accountId, task)
    return task
  })

  ipcMain.removeHandler(IPC.tasks.updateTask)
  ipcMain.handle(IPC.tasks.updateTask, async (_event, input: TasksUpdateTaskInput): Promise<TaskItemRow> => {
    const accountId = requireAccountId(input?.accountId)
    const listId = requireListId(input?.listId)
    const taskId = requireTaskId(input?.taskId)
    const title = typeof input?.title === 'string' ? input.title.trim() : ''
    if (!title) throw new Error('Titel fehlt.')
    const task = await updateTaskForAccount(accountId, listId, taskId, {
      title,
      notes: input.notes ?? null,
      dueIso: input.dueIso ?? null,
      completed: input.completed === true
    })
    afterTaskUpdated(accountId, task)
    return task
  })

  ipcMain.removeHandler(IPC.tasks.deleteTask)
  ipcMain.handle(IPC.tasks.deleteTask, async (_event, input: TasksDeleteTaskInput): Promise<void> => {
    const accountId = requireAccountId(input?.accountId)
    const listId = requireListId(input?.listId)
    const taskId = requireTaskId(input?.taskId)
    await deleteTaskForAccount(accountId, listId, taskId)
    afterTaskDeleted(accountId, listId, taskId)
  })

  ipcMain.removeHandler(IPC.tasks.bulkDeleteCompletedFlaggedEmailTasks)
  ipcMain.handle(
    IPC.tasks.bulkDeleteCompletedFlaggedEmailTasks,
    async (_event, input: TasksBulkDeleteCompletedFlaggedEmailInput): Promise<TasksBulkDeleteCompletedFlaggedEmailResult> => {
      const accountId = requireAccountId(input?.accountId)
      return bulkDeleteCompletedFlaggedEmailTasksImpl(accountId)
    }
  )

  ipcMain.removeHandler(IPC.tasks.listPlannedSchedules)
  ipcMain.handle(
    IPC.tasks.listPlannedSchedules,
    async (_event, args: TasksListPlannedSchedulesInput): Promise<TaskPlannedScheduleDto[]> => {
      const keys = Array.isArray(args?.taskKeys) ? args.taskKeys : []
      return listTaskPlannedSchedules(keys)
    }
  )

  ipcMain.removeHandler(IPC.tasks.setPlannedSchedule)
  ipcMain.handle(
    IPC.tasks.setPlannedSchedule,
    async (_event, input: TasksSetPlannedScheduleInput): Promise<void> => {
      const taskKey = typeof input?.taskKey === 'string' ? input.taskKey.trim() : ''
      if (!taskKey) throw new Error('Aufgaben-Schlüssel fehlt.')
      const plannedStartIso =
        typeof input?.plannedStartIso === 'string' ? input.plannedStartIso.trim() : ''
      const plannedEndIso = typeof input?.plannedEndIso === 'string' ? input.plannedEndIso.trim() : ''
      setTaskPlannedSchedule(taskKey, plannedStartIso, plannedEndIso)
    }
  )

  ipcMain.removeHandler(IPC.tasks.clearPlannedSchedule)
  ipcMain.handle(
    IPC.tasks.clearPlannedSchedule,
    async (_event, input: TasksClearPlannedScheduleInput): Promise<void> => {
      const taskKey = typeof input?.taskKey === 'string' ? input.taskKey.trim() : ''
      if (!taskKey) throw new Error('Aufgaben-Schlüssel fehlt.')
      clearTaskPlannedSchedule(taskKey)
    }
  )

  ipcMain.removeHandler(IPC.tasks.listMailCloudTaskLinks)
  ipcMain.handle(IPC.tasks.listMailCloudTaskLinks, async (): Promise<MailCloudTaskLinkDto[]> => {
    return listMailCloudTaskLinkDtos()
  })

  ipcMain.removeHandler(IPC.tasks.createMailCloudTaskFromMessage)
  ipcMain.handle(
    IPC.tasks.createMailCloudTaskFromMessage,
    async (_event, input: TasksCreateMailCloudTaskFromMessageInput): Promise<TaskItemRow> => {
      const messageId = typeof input?.messageId === 'number' ? input.messageId : 0
      if (!messageId) throw new Error('Mail-ID fehlt.')
      const accountId = requireAccountId(input?.accountId)
      const task = await createMailCloudTaskFromMessage({
        messageId,
        accountId,
        listId: requireListId(input?.listId),
        title: typeof input?.title === 'string' ? input.title : '',
        notes: input?.notes ?? null,
        dueIso: input?.dueIso ?? null
      })
      afterTaskCreated(accountId, task)
      return task
    }
  )
}
