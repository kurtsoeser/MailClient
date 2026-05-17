import type { TodoDueKindList } from '@shared/types'
import { addCalendarDaysIsoDate, isoDateInTimeZone } from '@/lib/zoned-iso-date'

export type OpenTodoDueKind = Exclude<TodoDueKindList, 'done'>

/** Ziel-Fälligkeit beim Verschieben in eine Bucket-Spalte (Cloud: `dueIso`, Mail: `dueKind`). */
export function dueIsoForOpenTodoBucket(kind: OpenTodoDueKind, timeZone: string): string | null {
  const today = isoDateInTimeZone(new Date(), timeZone)
  switch (kind) {
    case 'overdue':
      return addCalendarDaysIsoDate(today, -1, timeZone)
    case 'today':
      return today
    case 'tomorrow':
      return addCalendarDaysIsoDate(today, 1, timeZone)
    case 'this_week':
      return addCalendarDaysIsoDate(today, 4, timeZone)
    case 'later':
      return null
    default:
      return null
  }
}

export function isOpenTodoBucket(kind: TodoDueKindList): kind is OpenTodoDueKind {
  return kind !== 'done'
}
