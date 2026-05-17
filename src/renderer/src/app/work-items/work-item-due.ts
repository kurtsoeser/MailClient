import type { TodoDueKindList } from '@shared/types'
import { normalizeDueAtIso, zonedDayBoundsUtcIso } from '@/lib/zoned-iso-date'

/** Grenzen wie `classifyTodoDueKindFromDueAtIso` im Main-Prozess. */
export function computeWorkItemDueBounds(nowMs: number, timeZone: string) {
  return zonedDayBoundsUtcIso(nowMs, timeZone)
}

export { normalizeDueAtIso }

/** Bucket aus Fälligkeits-ISO (offene Items). */
export function classifyDueAtIso(
  dueAtIso: string,
  timeZone: string,
  nowMs = Date.now()
): Exclude<TodoDueKindList, 'done'> {
  const b = computeWorkItemDueBounds(nowMs, timeZone)
  if (dueAtIso < b.startTodayIso) return 'overdue'
  if (dueAtIso >= b.startTodayIso && dueAtIso <= b.endTodayIso) return 'today'
  if (dueAtIso >= b.startTomorrowIso && dueAtIso <= b.endTomorrowIso) return 'tomorrow'
  if (dueAtIso > b.endTomorrowIso && dueAtIso <= b.endWeekIso) return 'this_week'
  return 'later'
}
