import { ipcMain } from 'electron'
import {
  IPC,
  type TasksCreateTaskInput,
  type TasksDeleteTaskInput,
  type TasksListListsInput,
  type TasksListTasksInput,
  type TasksPatchTaskInput,
  type TasksUpdateTaskInput,
  type TaskItemRow,
  type TaskListRow
} from '@shared/types'
import {
  createTaskForAccount,
  deleteTaskForAccount,
  listTaskListsForAccount,
  listTasksForAccount,
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

export function registerTasksIpc(): void {
  ipcMain.removeHandler(IPC.tasks.listLists)
  ipcMain.handle(
    IPC.tasks.listLists,
    async (_event, args: TasksListListsInput): Promise<TaskListRow[]> => {
      return listTaskListsForAccount(requireAccountId(args?.accountId))
    }
  )

  ipcMain.removeHandler(IPC.tasks.listTasks)
  ipcMain.handle(
    IPC.tasks.listTasks,
    async (_event, args: TasksListTasksInput): Promise<TaskItemRow[]> => {
      return listTasksForAccount(requireAccountId(args?.accountId), requireListId(args?.listId), {
        showCompleted: args?.showCompleted,
        showHidden: args?.showHidden
      })
    }
  )

  ipcMain.removeHandler(IPC.tasks.createTask)
  ipcMain.handle(IPC.tasks.createTask, async (_event, input: TasksCreateTaskInput): Promise<TaskItemRow> => {
    const accountId = requireAccountId(input?.accountId)
    const listId = requireListId(input?.listId)
    const title = typeof input?.title === 'string' ? input.title.trim() : ''
    if (!title) throw new Error('Titel fehlt.')
    return createTaskForAccount(accountId, listId, {
      title,
      notes: input.notes ?? null,
      dueIso: input.dueIso ?? null,
      completed: input.completed === true
    })
  })

  ipcMain.removeHandler(IPC.tasks.patchTask)
  ipcMain.handle(IPC.tasks.patchTask, async (_event, input: TasksPatchTaskInput): Promise<TaskItemRow> => {
    return patchTaskForAccount(
      requireAccountId(input?.accountId),
      requireListId(input?.listId),
      requireTaskId(input?.taskId),
      {
        title: input.title,
        notes: input.notes,
        dueIso: input.dueIso,
        completed: input.completed
      }
    )
  })

  ipcMain.removeHandler(IPC.tasks.updateTask)
  ipcMain.handle(IPC.tasks.updateTask, async (_event, input: TasksUpdateTaskInput): Promise<TaskItemRow> => {
    const accountId = requireAccountId(input?.accountId)
    const listId = requireListId(input?.listId)
    const taskId = requireTaskId(input?.taskId)
    const title = typeof input?.title === 'string' ? input.title.trim() : ''
    if (!title) throw new Error('Titel fehlt.')
    return updateTaskForAccount(accountId, listId, taskId, {
      title,
      notes: input.notes ?? null,
      dueIso: input.dueIso ?? null,
      completed: input.completed === true
    })
  })

  ipcMain.removeHandler(IPC.tasks.deleteTask)
  ipcMain.handle(IPC.tasks.deleteTask, async (_event, input: TasksDeleteTaskInput): Promise<void> => {
    await deleteTaskForAccount(
      requireAccountId(input?.accountId),
      requireListId(input?.listId),
      requireTaskId(input?.taskId)
    )
  })
}
