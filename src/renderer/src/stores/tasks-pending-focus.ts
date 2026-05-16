import { create } from 'zustand'

export type PendingCloudTaskFocus = {
  accountId: string
  listId: string
  taskId: string
}

interface TasksPendingFocusState {
  pendingTask: PendingCloudTaskFocus | null
  queueTask: (task: PendingCloudTaskFocus) => void
  takePendingTask: () => PendingCloudTaskFocus | null
}

export const useTasksPendingFocusStore = create<TasksPendingFocusState>((set, get) => ({
  pendingTask: null,
  queueTask(task): void {
    set({ pendingTask: task })
  },
  takePendingTask(): PendingCloudTaskFocus | null {
    const task = get().pendingTask
    if (task) set({ pendingTask: null })
    return task
  }
}))
