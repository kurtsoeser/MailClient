import type { CalendarEventView, ConnectedAccount, MailListItem, TaskItemRow } from '@shared/types'
import type {
  CalendarEventWorkItem,
  CloudTaskWorkItem,
  MailTodoWorkItem,
  WorkItem,
  WorkItemPlannedSchedule,
  WorkItemView
} from '@shared/work-item'
import { calendarEventStableKey } from '@shared/work-item-keys'
import { parseOpenTodoDueKind } from '@/lib/todo-due-bucket'
import { classifyWorkItemBucket, workItemEffectiveSortIso } from '@/app/work-items/work-item-bucket'
import { cloudTaskStableKey, mailTodoStableKey } from '@shared/work-item-keys'
import type { TaskItemWithContext } from '@/app/tasks/tasks-types'

function mailTodoTitle(mail: MailListItem): string {
  const s = mail.subject?.trim()
  return s || '(Ohne Betreff)'
}

function mailTodoCompleted(mail: MailListItem): boolean {
  return Boolean(mail.todoCompletedAt?.trim())
}

function mailPlannedSchedule(mail: MailListItem): WorkItemPlannedSchedule {
  return {
    plannedStartIso: mail.todoStartAt?.trim() || null,
    plannedEndIso: mail.todoEndAt?.trim() || null
  }
}

function cloudPlannedSchedule(
  taskKey: string,
  plannedByTaskKey?: ReadonlyMap<string, WorkItemPlannedSchedule>
): WorkItemPlannedSchedule {
  const fromStore = plannedByTaskKey?.get(taskKey)
  if (fromStore) return fromStore
  return { plannedStartIso: null, plannedEndIso: null }
}

export function mailListItemToWorkItem(mail: MailListItem): MailTodoWorkItem {
  const planned = mailPlannedSchedule(mail)
  return {
    kind: 'mail_todo',
    stableKey: mailTodoStableKey(mail.id),
    messageId: mail.id,
    accountId: mail.accountId,
    title: mailTodoTitle(mail),
    dueAtIso: mail.todoDueAt?.trim() || null,
    planned,
    completed: mailTodoCompleted(mail),
    mail
  }
}

export function mailListItemsToWorkItems(mails: MailListItem[]): MailTodoWorkItem[] {
  return mails.map(mailListItemToWorkItem)
}

export function taskItemToWorkItem(
  task: TaskItemWithContext,
  opts?: {
    linkedMessageIds?: number[]
    plannedByTaskKey?: ReadonlyMap<string, WorkItemPlannedSchedule>
  }
): CloudTaskWorkItem {
  const stableKey = cloudTaskStableKey(task.accountId, task.listId, task.id)
  return {
    kind: 'cloud_task',
    stableKey,
    accountId: task.accountId,
    listId: task.listId,
    taskId: task.id,
    listName: task.listName,
    title: task.title?.trim() || '(Ohne Titel)',
    dueAtIso: task.dueIso?.trim() || null,
    planned: cloudPlannedSchedule(stableKey, opts?.plannedByTaskKey),
    completed: task.completed,
    linkedMessageIds: opts?.linkedMessageIds ?? [],
    task
  }
}

export function taskRowToWorkItem(
  task: TaskItemRow,
  ctx: { accountId: string; listName: string },
  opts?: {
    linkedMessageIds?: number[]
    plannedByTaskKey?: ReadonlyMap<string, WorkItemPlannedSchedule>
  }
): CloudTaskWorkItem {
  return taskItemToWorkItem({ ...task, ...ctx }, opts)
}

export function accountLabelForWorkItem(
  accountId: string,
  accountsById: ReadonlyMap<string, ConnectedAccount>
): string {
  const a = accountsById.get(accountId)
  return a?.displayName?.trim() || a?.email?.trim() || accountId
}

export function calendarEventToWorkItem(event: CalendarEventView): CalendarEventWorkItem {
  const title = event.title?.trim() || '(Termin)'
  return {
    kind: 'calendar_event',
    stableKey: calendarEventStableKey(event.accountId, event.graphCalendarId, event.graphEventId ?? event.id),
    accountId: event.accountId,
    title,
    dueAtIso: null,
    planned: {
      plannedStartIso: event.startIso,
      plannedEndIso: event.endIso
    },
    completed: false,
    event
  }
}

export function workItemSourceLabel(
  item: WorkItem,
  accountsById: ReadonlyMap<string, ConnectedAccount>
): string {
  if (item.kind === 'mail_todo') return 'E-Mail'
  if (item.kind === 'calendar_event') {
    const acc = accountLabelForWorkItem(item.accountId, accountsById)
    return `${acc} · Kalender`
  }
  const acc = accountLabelForWorkItem(item.accountId, accountsById)
  return item.listName ? `${acc} · ${item.listName}` : acc
}

export function workItemToView(
  item: WorkItem,
  accountsById: ReadonlyMap<string, ConnectedAccount>,
  timeZone: string,
  nowMs?: number
): WorkItemView {
  const bucket = classifyWorkItemBucket(item, timeZone, nowMs)
  const base = {
    kind: item.kind,
    stableKey: item.stableKey,
    title: item.title,
    dueAtIso: item.dueAtIso,
    plannedStartIso: item.planned.plannedStartIso,
    plannedEndIso: item.planned.plannedEndIso,
    effectiveSortIso: workItemEffectiveSortIso(item),
    completed: item.completed,
    bucket,
    accountId: item.accountId,
    sourceLabel: workItemSourceLabel(item, accountsById)
  }
  if (item.kind === 'mail_todo') {
    return {
      ...base,
      messageId: item.messageId,
      listId: null,
      listName: null
    }
  }
  if (item.kind === 'calendar_event') {
    return {
      ...base,
      messageId: null,
      listId: null,
      listName: null
    }
  }
  return {
    ...base,
    messageId: item.linkedMessageIds[0] ?? null,
    listId: item.listId,
    listName: item.listName
  }
}

export function workItemsToViews(
  items: WorkItem[],
  accountsById: ReadonlyMap<string, ConnectedAccount>,
  timeZone: string,
  nowMs?: number
): WorkItemView[] {
  return items.map((item) => workItemToView(item, accountsById, timeZone, nowMs))
}
