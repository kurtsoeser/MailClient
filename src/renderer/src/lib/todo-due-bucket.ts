import type { TodoDueKindList } from '@shared/types'

const VALID_KINDS = new Set<TodoDueKindList>(['overdue', 'today', 'tomorrow', 'this_week', 'later', 'done'])

export function parseOpenTodoDueKind(v: string | null | undefined): TodoDueKindList | null {
  if (v == null || typeof v !== 'string') return null
  const t = v.trim()
  if (!(VALID_KINDS as ReadonlySet<string>).has(t)) return null
  return t as TodoDueKindList
}

/** Reihenfolge der Gruppen: ueberfaellig zuerst, „ohne ToDo“ zuletzt. */
export function rankOpenTodoBucket(k: TodoDueKindList): number {
  switch (k) {
    case 'overdue':
      return 0
    case 'today':
      return 1
    case 'tomorrow':
      return 2
    case 'this_week':
      return 3
    case 'later':
      return 4
    case 'done':
      return 5
    default:
      return 99
  }
}

/** Gruppentitel wie in der Sidebar (Mail-Ansicht / Gruppierung). */
export function groupLabelTodoDueBucketDe(k: TodoDueKindList): string {
  switch (k) {
    case 'overdue':
      return 'ToDo überfällig'
    case 'today':
      return 'ToDo Heute'
    case 'tomorrow':
      return 'ToDo Morgen'
    case 'this_week':
      return 'ToDo diese Woche'
    case 'later':
      return 'ToDo später'
    case 'done':
      return 'ToDo erledigt'
    default:
      return 'ToDo'
  }
}

/** Kurztext neben dem Icon in der Zeilenliste. */
export function shortTitleTodoDueBucketDe(k: TodoDueKindList): string {
  switch (k) {
    case 'overdue':
      return 'Überfällig'
    case 'today':
      return 'Heute'
    case 'tomorrow':
      return 'Morgen'
    case 'this_week':
      return 'Diese Woche'
    case 'later':
      return 'Später'
    case 'done':
      return 'Erledigt'
    default:
      return 'ToDo'
  }
}
