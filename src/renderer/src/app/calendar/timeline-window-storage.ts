export type TimelineWindowSize = 'week' | 'month' | 'quarter'

const KEY = 'mailclient.calendarTimelineWindow.v1'

const SIZES = new Set<TimelineWindowSize>(['week', 'month', 'quarter'])

export const DEFAULT_TIMELINE_WINDOW_SIZE: TimelineWindowSize = 'month'

export function readTimelineWindowSize(): TimelineWindowSize {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (raw && SIZES.has(raw as TimelineWindowSize)) return raw as TimelineWindowSize
  } catch {
    // ignore
  }
  return DEFAULT_TIMELINE_WINDOW_SIZE
}

export function persistTimelineWindowSize(size: TimelineWindowSize): void {
  try {
    window.localStorage.setItem(KEY, size)
  } catch {
    // ignore
  }
}
