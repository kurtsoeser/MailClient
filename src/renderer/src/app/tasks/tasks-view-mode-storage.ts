/** Liste + Kalender (Standard) oder Kanban. */
export type TasksContentViewMode = 'list' | 'kanban'

const KEY = 'mailclient.tasks.contentViewMode.v1'

export function readTasksContentViewMode(): TasksContentViewMode {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (raw === 'kanban') return 'kanban'
    // früher: separater Kalender-Modus → Liste+Kalender
    return 'list'
  } catch {
    return 'list'
  }
}

export function persistTasksContentViewMode(mode: TasksContentViewMode): void {
  try {
    window.localStorage.setItem(KEY, mode)
  } catch {
    // ignore
  }
}
