import { cloudTaskStableKey } from '@shared/work-item-keys'
import type { TaskItemWithContext } from '@/app/tasks/tasks-types'

export const MIME_CLOUD_TASK_KEY = 'application/x-mailclient-cloud-task-key'

export interface CloudTaskDragPayload {
  accountId: string
  listId: string
  taskId: string
  taskKey: string
}

export function cloudTaskDragPayload(task: Pick<TaskItemWithContext, 'accountId' | 'listId' | 'id'>): CloudTaskDragPayload {
  return {
    accountId: task.accountId,
    listId: task.listId,
    taskId: task.id,
    taskKey: cloudTaskStableKey(task.accountId, task.listId, task.id)
  }
}

export function setCloudTaskDragData(dt: DataTransfer, task: Pick<TaskItemWithContext, 'accountId' | 'listId' | 'id'>): void {
  const payload = cloudTaskDragPayload(task)
  dt.setData(MIME_CLOUD_TASK_KEY, JSON.stringify(payload))
  dt.setData('text/plain', payload.taskKey)
  dt.effectAllowed = 'move'
}

export function readCloudTaskDragPayload(dt: DataTransfer): CloudTaskDragPayload | null {
  const raw = dt.getData(MIME_CLOUD_TASK_KEY).trim()
  if (raw) {
    try {
      const o = JSON.parse(raw) as CloudTaskDragPayload
      if (o?.accountId && o?.listId && o?.taskId && o?.taskKey) return o
    } catch {
      // fall through
    }
  }
  const plain = dt.getData('text/plain').trim()
  if (plain.startsWith('task:')) {
    const m = /^task:([^:]+):([^:]+):(.+)$/.exec(plain)
    if (m) {
      return {
        accountId: m[1]!,
        listId: m[2]!,
        taskId: m[3]!,
        taskKey: plain
      }
    }
  }
  return null
}

export function dataTransferLooksLikeCloudTaskDrag(dt: DataTransfer): boolean {
  const types = Array.from(dt.types ?? [])
  if (types.includes(MIME_CLOUD_TASK_KEY)) return true
  const plain = dt.getData('text/plain').trim()
  return plain.startsWith('task:')
}
