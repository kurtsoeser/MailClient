import type { CloudTaskCalendarDateMode } from '@/app/calendar/cloud-task-calendar'

const KEY = 'mailclient.tasks.calendarDateMode.v1'

export function readTasksCalendarDateMode(): CloudTaskCalendarDateMode {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (raw === 'planned') return 'planned'
    return 'due'
  } catch {
    return 'due'
  }
}

export function persistTasksCalendarDateMode(mode: CloudTaskCalendarDateMode): void {
  try {
    window.localStorage.setItem(KEY, mode)
  } catch {
    // ignore
  }
}
