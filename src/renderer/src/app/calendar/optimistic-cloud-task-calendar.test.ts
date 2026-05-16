import { describe, expect, it, vi } from 'vitest'
import { removeCloudTaskCalendarEventsByTaskKey } from '@/app/calendar/calendar-fc-event-source'
import { applyOptimisticCloudTaskPersistToLayer } from '@/app/calendar/optimistic-cloud-task-calendar'
import { cloudTaskStableKey } from '@shared/work-item-keys'
import type { TaskItemWithContext } from '@/app/tasks/tasks-types'

function sampleTask(): TaskItemWithContext {
  return {
    id: 't1',
    listId: 'list-1',
    title: 'Demo',
    completed: false,
    dueIso: '2026-05-20',
    notes: null,
    accountId: 'acc-1',
    listName: 'Tasks'
  }
}

describe('applyOptimisticCloudTaskPersistToLayer', () => {
  it('aktualisiert Planung und Fälligkeit nach Zeitverschiebung', () => {
    const task = sampleTask()
    const key = cloudTaskStableKey(task.accountId, task.listId, task.id)
    const result = applyOptimisticCloudTaskPersistToLayer(
      {
        kind: 'planned',
        taskKey: key,
        plannedStartIso: '2026-05-21T13:15:00.000Z',
        plannedEndIso: '2026-05-21T13:45:00.000Z'
      },
      task,
      [task],
      new Map(),
      'UTC'
    )
    expect(result.plannedByKey.get(key)?.plannedStartIso).toBe('2026-05-21T13:15:00.000Z')
    expect(result.items[0]?.dueIso).toContain('2026-05-21')
  })
})

describe('removeCloudTaskCalendarEventsByTaskKey', () => {
  it('entfernt Drag-Duplikate und behält die kanonische Event-ID', () => {
    const keep = { id: 'cloud-task:key1', extendedProps: { taskKey: 'key1' }, remove: vi.fn() }
    const dragCopy = { id: '', extendedProps: { taskKey: 'key1' }, remove: vi.fn() }
    const api = { getEvents: () => [dragCopy, keep] }
    removeCloudTaskCalendarEventsByTaskKey(api as never, 'key1', 'cloud-task:key1')
    expect(dragCopy.remove).toHaveBeenCalledOnce()
    expect(keep.remove).not.toHaveBeenCalled()
  })
})
