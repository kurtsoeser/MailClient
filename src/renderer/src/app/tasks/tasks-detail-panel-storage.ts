export const TASKS_DETAIL_OPEN_KEY = 'mailclient.tasks.detailOpen'
export const TASKS_FLOAT_DETAIL_SIZE_KEY = 'mailclient.tasks.float.detail'

export function readTasksDetailOpenFromStorage(): boolean {
  try {
    const v = window.localStorage.getItem(TASKS_DETAIL_OPEN_KEY)
    if (v === '0') return false
    if (v === '1') return true
  } catch {
    // ignore
  }
  return true
}

export function persistTasksDetailOpen(value: boolean): void {
  try {
    window.localStorage.setItem(TASKS_DETAIL_OPEN_KEY, value ? '1' : '0')
  } catch {
    // ignore
  }
}
