import { describe, expect, it } from 'vitest'
import { scheduleFromCalendarCreateRange } from '@/app/tasks/tasks-calendar-create-range'

describe('scheduleFromCalendarCreateRange', () => {
  it('setzt nur Fälligkeit bei Ganztagsauswahl', () => {
    const start = new Date('2026-05-21T00:00:00')
    const end = new Date('2026-05-22T00:00:00')
    const sched = scheduleFromCalendarCreateRange(
      { start, end, allDay: true },
      'Europe/Berlin'
    )
    expect(sched.dueDate).toBe('2026-05-21')
    expect(sched.plannedStartIso).toBeNull()
    expect(sched.plannedEndIso).toBeNull()
  })

  it('setzt Planung und Fälligkeit bei Zeitauswahl', () => {
    const start = new Date('2026-05-21T10:00:00')
    const end = new Date('2026-05-21T11:00:00')
    const sched = scheduleFromCalendarCreateRange(
      { start, end, allDay: false },
      'Europe/Berlin'
    )
    expect(sched.dueDate).toBe('2026-05-21')
    expect(sched.plannedStartIso).toBe(start.toISOString())
    expect(sched.plannedEndIso).toBe(end.toISOString())
  })
})
