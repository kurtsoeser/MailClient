const STORAGE_KEY = 'mailclient.tasksCalendarCreateAccountId'

export function readTasksCalendarCreateAccountId(): string | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)?.trim()
    return v || null
  } catch {
    return null
  }
}

export function persistTasksCalendarCreateAccountId(accountId: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, accountId)
  } catch {
    // ignore
  }
}
