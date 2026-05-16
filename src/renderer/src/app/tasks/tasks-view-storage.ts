import type { TasksViewSelection } from '@/app/tasks/tasks-types'

const KEY = 'mailclient.tasks.viewSelection.v1'

export function readTasksViewSelection(): TasksViewSelection | null {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as unknown
    if (!o || typeof o !== 'object' || Array.isArray(o)) return null
    const rec = o as Record<string, unknown>
    if (rec.kind === 'unified') return { kind: 'unified' }
    if (
      rec.kind === 'list' &&
      typeof rec.accountId === 'string' &&
      typeof rec.listId === 'string' &&
      rec.accountId.length > 0 &&
      rec.listId.length > 0
    ) {
      return { kind: 'list', accountId: rec.accountId, listId: rec.listId }
    }
    return null
  } catch {
    return null
  }
}

export function persistTasksViewSelection(sel: TasksViewSelection | null): void {
  try {
    if (!sel) {
      window.localStorage.removeItem(KEY)
      return
    }
    window.localStorage.setItem(KEY, JSON.stringify(sel))
  } catch {
    // ignore
  }
}
