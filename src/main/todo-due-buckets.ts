import { DateTime } from 'luxon'
import type { TodoDueKindList } from '@shared/types'

/**
 * Grenzen fuer ToDo-Buckets relativ zu "jetzt" in einer IANA-Zeitzone.
 * `due_at` in der DB ist ISO-UTC; Vergleiche laufen lexikographisch auf ISO-Strings.
 */
export interface TodoDisplayBounds {
  startTodayIso: string
  endTodayIso: string
  startTomorrowIso: string
  endTomorrowIso: string
  endWeekIso: string
}

export function resolveCalendarTimeZone(configured: string | null | undefined): string {
  const t = configured?.trim()
  if (t) return t
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

/**
 * Wochenende = Sonntag 23:59:59.999 derselben Kalenderwoche wie `now`
 * (gleiche Logik wie `computeDueAt` fuer `this_week` im todos-service).
 */
export function computeTodoDisplayBounds(
  nowMs: number,
  timeZone: string
): TodoDisplayBounds {
  const n = DateTime.fromMillis(nowMs, { zone: timeZone })
  const startToday = n.startOf('day')
  const endToday = n.endOf('day')
  const tomorrow = n.plus({ days: 1 })
  const startTomorrow = tomorrow.startOf('day')
  const endTomorrow = tomorrow.endOf('day')
  const luxDow = n.weekday
  const daysUntilSun = luxDow === 7 ? 0 : 7 - luxDow
  const weekEnd = n.plus({ days: daysUntilSun }).endOf('day')

  return {
    startTodayIso: startToday.toUTC().toISO()!,
    endTodayIso: endToday.toUTC().toISO()!,
    startTomorrowIso: startTomorrow.toUTC().toISO()!,
    endTomorrowIso: endTomorrow.toUTC().toISO()!,
    endWeekIso: weekEnd.toUTC().toISO()!
  }
}

/**
 * Ordnet `due_at` (ISO-UTC) dem gleichen Bucket zu wie `listOpenTodoMessagesByDueAtBucket`
 * in `todos-repo.ts` — wichtig, damit UI-Gruppierung (`todoDueKind`) nach Kalender-Zug stimmt.
 */
export function classifyTodoDueKindFromDueAtIso(
  dueAtIso: string,
  timeZone: string,
  nowMs = Date.now()
): Exclude<TodoDueKindList, 'done'> {
  const b = computeTodoDisplayBounds(nowMs, timeZone)
  if (dueAtIso < b.startTodayIso) return 'overdue'
  if (dueAtIso >= b.startTodayIso && dueAtIso <= b.endTodayIso) return 'today'
  if (dueAtIso >= b.startTomorrowIso && dueAtIso <= b.endTomorrowIso) return 'tomorrow'
  if (dueAtIso > b.endTomorrowIso && dueAtIso <= b.endWeekIso) return 'this_week'
  return 'later'
}
