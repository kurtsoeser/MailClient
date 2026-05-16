import type { CalendarApi } from '@fullcalendar/core'

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
