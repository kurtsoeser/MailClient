import type { TaskItemRow } from '@shared/types'

export type TasksViewSelection =
  | { kind: 'list'; accountId: string; listId: string }
  | { kind: 'unified' }

export type TaskItemWithContext = TaskItemRow & {
  accountId: string
  listName: string
}

export function taskItemKey(item: Pick<TaskItemWithContext, 'accountId' | 'listId' | 'id'>): string {
  return `${item.accountId}:${item.listId}:${item.id}`
}
