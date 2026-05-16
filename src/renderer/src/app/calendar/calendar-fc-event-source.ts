import type { CalendarApi } from '@fullcalendar/core'

function eventMatchesTaskKey(
  event: { id: string; extendedProps: Record<string, unknown> },
  taskKey: string
): boolean {
  return event.extendedProps?.taskKey === taskKey
}

/** Entfernt FullCalendar-Duplikate nach Drag/Resize (gleiche öffentliche Event-ID). */
export function removeDuplicateFullCalendarEventsById(
  api: CalendarApi,
  eventIds: readonly string[]
): void {
  for (const id of eventIds) {
    if (!id) continue
    const matches = api.getEvents().filter((e) => e.id === id)
    for (let i = 1; i < matches.length; i++) {
      matches[i].remove()
    }
  }
}

/**
 * Entfernt alle Kalender-Einträge einer Cloud-Aufgabe (Drag-Kopie + veraltete Quelle).
 * `keepEventId` bleibt als einziges Event erhalten, falls vorhanden.
 */
export function removeCloudTaskCalendarEventsByTaskKey(
  api: CalendarApi,
  taskKey: string,
  keepEventId?: string
): void {
  if (!taskKey.trim()) return
  const matches = api
    .getEvents()
    .filter((e) => e.id === keepEventId || eventMatchesTaskKey(e, taskKey))
  if (matches.length === 0) return

  let keep = keepEventId ? matches.find((e) => e.id === keepEventId) : undefined
  if (!keep) keep = matches[0]

  for (const ev of matches) {
    if (ev !== keep) ev.remove()
  }
}

/**
 * Entfernt Duplikate nach React-Commit (z. B. wenn zuvor `revert()` + neues `eventSources`).
 * Nur als Fallback — bei Erfolg kein `info.revert()` verwenden.
 */
export function scheduleRemoveDuplicateFullCalendarEventsById(
  api: CalendarApi | null | undefined,
  eventIds: readonly string[]
): void {
  if (!api || eventIds.length === 0) return
  const run = (): void => removeDuplicateFullCalendarEventsById(api, eventIds)
  requestAnimationFrame(() => {
    requestAnimationFrame(run)
  })
}

export function scheduleRemoveCloudTaskCalendarEventsByTaskKey(
  api: CalendarApi | null | undefined,
  taskKey: string,
  keepEventId?: string
): void {
  if (!api || !taskKey.trim()) return
  const run = (): void => removeCloudTaskCalendarEventsByTaskKey(api, taskKey, keepEventId)
  requestAnimationFrame(() => {
    requestAnimationFrame(run)
  })
}
