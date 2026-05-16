import type { EventApi } from '@fullcalendar/core'
import { describe, expect, it } from 'vitest'
import {
  CALENDAR_KIND_CLOUD_TASK,
  cloudTaskEventId,
  cloudTasksToFullCalendarEvents,
  cloudTaskVisualSpan,
  cloudTaskVisualSpanForMode,
  computePersistTargetForCloudTask,
  dueIsoFromCloudTaskScheduleStart,
  parseCloudTaskEventId
} from '@/app/calendar/cloud-task-calendar'
import { cloudTaskStableKey } from '@/app/work-items/work-item-keys'
import type { TaskItemWithContext } from '@/app/tasks/tasks-types'

function sampleTask(overrides: Partial<TaskItemWithContext> = {}): TaskItemWithContext {
  return {
    id: 't1',
    listId: 'list-1',
    title: 'Demo',
    completed: false,
    dueIso: '2026-05-20',
    notes: null,
    accountId: 'acc-1',
    listName: 'Tasks',
    ...overrides
  }
}

describe('cloudTaskVisualSpan', () => {
  it('bevorzugt Planungszeit vor Fälligkeit', () => {
    const span = cloudTaskVisualSpan(sampleTask(), {
      plannedStartIso: '2026-05-14T08:00:00.000Z',
      plannedEndIso: '2026-05-14T08:30:00.000Z'
    })
    expect(span?.allDay).toBe(false)
    expect(span?.fcStart).toBe('2026-05-14T08:00:00.000Z')
  })

  it('nutzt dueIso als Ganztag ohne Planung', () => {
    const span = cloudTaskVisualSpan(sampleTask({ dueIso: '2026-05-20' }))
    expect(span?.allDay).toBe(true)
    expect(span?.fcStart).toBe('2026-05-20')
  })

  it('liefert null ohne due und ohne Planung', () => {
    expect(cloudTaskVisualSpan(sampleTask({ dueIso: null }))).toBeNull()
  })
})

describe('cloudTaskVisualSpanForMode', () => {
  const planned = {
    plannedStartIso: '2026-05-14T08:00:00.000Z',
    plannedEndIso: '2026-05-14T08:30:00.000Z'
  }

  it('Fälligkeitsmodus ignoriert Planung', () => {
    const span = cloudTaskVisualSpanForMode(sampleTask({ dueIso: '2026-05-20' }), planned, 'due')
    expect(span?.allDay).toBe(true)
    expect(span?.fcStart).toBe('2026-05-20')
  })

  it('Planungsmodus ignoriert Fälligkeit', () => {
    const span = cloudTaskVisualSpanForMode(sampleTask({ dueIso: '2026-05-20' }), planned, 'planned')
    expect(span?.allDay).toBe(false)
    expect(span?.fcStart).toBe(planned.plannedStartIso)
  })
})

describe('cloudTasksToFullCalendarEvents', () => {
  it('erzeugt editierbare Events mit cloudTask kind', () => {
    const task = sampleTask()
    const key = cloudTaskStableKey(task.accountId, task.listId, task.id)
    const events = cloudTasksToFullCalendarEvents([task], { 'acc-1': '#ff0000' })
    expect(events).toHaveLength(1)
    expect(events[0]!.id).toBe(cloudTaskEventId(key))
    expect(events[0]!.extendedProps?.calendarKind).toBe(CALENDAR_KIND_CLOUD_TASK)
    expect(events[0]!.editable).toBe(true)
  })
})

describe('parseCloudTaskEventId', () => {
  it('roundtrip mit encodeURIComponent', () => {
    const key = cloudTaskStableKey('a:b', 'l', 'id/with/slash')
    const id = cloudTaskEventId(key)
    expect(parseCloudTaskEventId(id)).toBe(key)
  })
})

describe('dueIsoFromCloudTaskScheduleStart', () => {
  it('leitet Fälligkeit vom Kalendertag des geplanten Starts ab', () => {
    const due = dueIsoFromCloudTaskScheduleStart(
      '2026-05-21T10:00:00.000+02:00',
      'Europe/Berlin'
    )
    expect(due).toContain('2026-05-21')
  })
})

describe('computePersistTargetForCloudTask', () => {
  it('typ Ganztag → due', () => {
    const task = sampleTask()
    const key = cloudTaskStableKey(task.accountId, task.listId, task.id)
    const start = new Date('2026-05-21T00:00:00')
    const event = {
      id: cloudTaskEventId(key),
      start,
      end: new Date('2026-05-22T00:00:00'),
      allDay: true,
      extendedProps: { calendarKind: CALENDAR_KIND_CLOUD_TASK, taskKey: key }
    } as unknown as EventApi

    const target = computePersistTargetForCloudTask(event, null, 'Europe/Berlin')
    expect(target?.kind).toBe('due')
    if (target?.kind === 'due') {
      expect(target.dueIso).toContain('2026-05-21')
    }
  })
})
