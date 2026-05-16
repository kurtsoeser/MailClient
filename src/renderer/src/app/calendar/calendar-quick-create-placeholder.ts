import type { EventInput } from '@fullcalendar/core'
import type { CalendarCreateRange } from '@/app/tasks/tasks-calendar-create-range'

export const QUICK_CREATE_PLACEHOLDER_EVENT_ID = '__quick-create-placeholder__'

export function quickCreateRangeToFcPlaceholder(range: CalendarCreateRange): EventInput {
  return {
    id: QUICK_CREATE_PLACEHOLDER_EVENT_ID,
    start: range.start,
    end: range.end,
    allDay: range.allDay,
    title: '',
    classNames: ['fc-quick-create-placeholder'],
    editable: false,
    startEditable: false,
    durationEditable: false,
    resourceEditable: false,
    overlap: true,
    /** Ganztag: Hintergrund-Layer; Zeitraster: normales Event (vermeidet Doppel-Rahmen mit .fc-highlight). */
    display: range.allDay ? 'background' : undefined,
    backgroundColor: 'transparent',
    borderColor: 'transparent'
  }
}
