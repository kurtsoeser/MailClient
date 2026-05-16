import { DateTime } from 'luxon'
import type { TodoDueKindList } from '@shared/types'

/** Grenzen wie `classifyTodoDueKindFromDueAtIso` im Main-Prozess. */
export function computeWorkItemDueBounds(nowMs: number, timeZone: string) {
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

export function normalizeDueAtIso(dueIso: string, timeZone: string): string | null {
  const raw = dueIso.trim()
  if (!raw) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = DateTime.fromISO(raw, { zone: timeZone }).endOf('day')
    return d.isValid ? d.toUTC().toISO() : null
  }
  const dt = DateTime.fromISO(raw, { setZone: true })
  return dt.isValid ? dt.toUTC().toISO() : null
}

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
