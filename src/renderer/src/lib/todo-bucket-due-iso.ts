import { DateTime } from 'luxon'
import type { TodoDueKindList } from '@shared/types'

export type OpenTodoDueKind = Exclude<TodoDueKindList, 'done'>

/** Ziel-Fälligkeit beim Verschieben in eine Bucket-Spalte (Cloud: `dueIso`, Mail: `dueKind`). */
export function dueIsoForOpenTodoBucket(kind: OpenTodoDueKind, timeZone: string): string | null {
  const zone = timeZone === 'local' ? 'local' : timeZone
  const now = DateTime.now().setZone(zone)
  switch (kind) {
    case 'overdue':
      return now.minus({ days: 1 }).toISODate()
    case 'today':
      return now.toISODate()
    case 'tomorrow':
      return now.plus({ days: 1 }).toISODate()
    case 'this_week':
      return now.plus({ days: 4 }).toISODate()
    case 'later':
      return null
    default:
      return null
  }
}

export function isOpenTodoBucket(kind: TodoDueKindList): kind is OpenTodoDueKind {
  return kind !== 'done'
}
