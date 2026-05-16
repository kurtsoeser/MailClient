import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  removeCloudTaskCalendarEventsByTaskKey,
  removeDuplicateFullCalendarEventsById,
  scheduleRemoveDuplicateFullCalendarEventsById
} from '@/app/calendar/calendar-fc-event-source'

describe('removeDuplicateFullCalendarEventsById', () => {
  it('entfernt Duplikate mit gleicher id, behält das erste', () => {
    const removed: string[] = []
    const first = { id: 'ev-1', remove: vi.fn() }
    const second = { id: 'ev-1', remove: vi.fn(() => removed.push('ev-1-b')) }
    const third = { id: 'ev-2', remove: vi.fn() }
    const api = {
      getEvents: () => [first, second, third]
    }
    removeDuplicateFullCalendarEventsById(api as never, ['ev-1', 'ev-2'])
    expect(first.remove).not.toHaveBeenCalled()
    expect(second.remove).toHaveBeenCalledOnce()
    expect(third.remove).not.toHaveBeenCalled()
  })
})

describe('scheduleRemoveDuplicateFullCalendarEventsById', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('plant Entfernung nach zwei Animation Frames', () => {
    const rafImpl = (cb: FrameRequestCallback): number => {
      cb(0)
      return 0
    }
    globalThis.requestAnimationFrame = rafImpl
    const raf = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(rafImpl)
    const api = { getEvents: () => [] as { id: string; remove: () => void }[] }
    scheduleRemoveDuplicateFullCalendarEventsById(api as never, ['ev-1'])
    expect(raf).toHaveBeenCalledTimes(2)
  })
})
