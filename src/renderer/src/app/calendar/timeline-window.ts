import { addDays, addMonths, startOfDay } from 'date-fns'
import type { TimelineWindowSize } from '@/app/calendar/timeline-window-storage'

export function timelineRangeStartToday(): Date {
  return startOfDay(new Date())
}

export function addTimelineWindow(from: Date, size: TimelineWindowSize, steps = 1): Date {
  const n = Math.max(1, steps)
  if (size === 'week') return addDays(from, n * 7)
  if (size === 'month') return addMonths(from, n)
  return addMonths(from, n * 3)
}

export function subtractTimelineWindow(from: Date, size: TimelineWindowSize, steps = 1): Date {
  const n = Math.max(1, steps)
  if (size === 'week') return addDays(from, -n * 7)
  if (size === 'month') return addMonths(from, -n)
  return addMonths(from, -n * 3)
}

/** Standardfenster ab heute: [heute, heute + Intervall). */
export function defaultTimelineLoadedRange(size: TimelineWindowSize): {
  loadedStart: Date
  loadedEnd: Date
} {
  const loadedStart = timelineRangeStartToday()
  return { loadedStart, loadedEnd: addTimelineWindow(loadedStart, size) }
}
