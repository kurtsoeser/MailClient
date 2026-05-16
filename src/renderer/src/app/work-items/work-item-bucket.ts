import type { MailListItem, TodoDueKindList } from '@shared/types'
import type { WorkItem } from '@shared/work-item'
import { classifyTaskItemDueBucket } from '@/app/tasks/task-due-bucket'
import { parseOpenTodoDueKind } from '@/lib/todo-due-bucket'
import { classifyDueAtIso, normalizeDueAtIso } from '@/app/work-items/work-item-due'

export function classifyMailTodoDueBucket(
  mail: Pick<MailListItem, 'todoDueAt' | 'todoCompletedAt' | 'todoDueKind'>,
  timeZone: string,
  nowMs = Date.now()
): TodoDueKindList {
  if (mail.todoCompletedAt?.trim()) return 'done'
  const dueRaw = mail.todoDueAt?.trim()
  if (dueRaw) {
    const dueAt = normalizeDueAtIso(dueRaw, timeZone)
    if (dueAt) return classifyDueAtIso(dueAt, timeZone, nowMs)
  }
  const parsed = parseOpenTodoDueKind(mail.todoDueKind)
  if (parsed && parsed !== 'done') return parsed
  return 'later'
}

export function classifyWorkItemBucket(
  item: WorkItem,
  timeZone: string,
  nowMs = Date.now()
): TodoDueKindList {
  if (item.kind === 'calendar_event') {
    const endMs = Date.parse(item.planned.plannedEndIso ?? item.event.endIso)
    if (Number.isFinite(endMs) && endMs < nowMs) return 'done'
    return 'later'
  }
  if (item.kind === 'cloud_task') {
    return classifyTaskItemDueBucket(
      { dueIso: item.dueAtIso, completed: item.completed },
      timeZone,
      nowMs
    )
  }
  return classifyMailTodoDueBucket(item.mail, timeZone, nowMs)
}

/** Effektiver Zeitpunkt für spätere MEGA-Zeitliste (Planung > Fälligkeit). */
export function workItemEffectiveSortIso(item: WorkItem): string | null {
  const planned = item.planned.plannedStartIso?.trim()
  if (planned) return planned
  const due = item.dueAtIso?.trim()
  if (due) return due
  if (item.kind === 'mail_todo') {
    return item.mail.receivedAt ?? item.mail.sentAt ?? null
  }
  if (item.kind === 'calendar_event') {
    return item.event.startIso
  }
  return null
}
