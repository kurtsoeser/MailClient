/** Stabiler Schlüssel für Mail-ToDo (pro Message). */
export function mailTodoStableKey(messageId: number): string {
  return `mail:todo:${messageId}`
}

/** Stabiler Schlüssel für Cloud-Aufgabe (Master-Liste / Planungs-Store). */
export function cloudTaskStableKey(accountId: string, listId: string, taskId: string): string {
  return `task:${accountId}:${listId}:${taskId}`
}

export function parseMailTodoStableKey(key: string): number | null {
  const m = /^mail:todo:(\d+)$/.exec(key)
  if (!m) return null
  const id = Number(m[1])
  return Number.isFinite(id) ? id : null
}

export function parseCloudTaskStableKey(
  key: string
): { accountId: string; listId: string; taskId: string } | null {
  const m = /^task:([^:]+):([^:]+):(.+)$/.exec(key)
  if (!m) return null
  return { accountId: m[1]!, listId: m[2]!, taskId: m[3]! }
}

/** Stabiler Schlüssel für Graph/Google-Kalendertermin. */
export function calendarEventStableKey(
  accountId: string,
  graphCalendarId: string | null | undefined,
  graphEventId: string
): string {
  const cal = (graphCalendarId ?? '').trim() || '_'
  return `cal:${accountId}:${cal}:${graphEventId}`
}
