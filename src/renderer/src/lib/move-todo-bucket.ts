import type { TodoDueKindList, TodoDueKindOpen } from '@shared/types'
import { dueIsoForOpenTodoBucket, isOpenTodoBucket } from '@/lib/todo-bucket-due-iso'

const OPEN_MAIL_KINDS = new Set<TodoDueKindOpen>(['today', 'tomorrow', 'this_week', 'later'])

function scheduleIsoForDate(date: string, hour: number): string {
  return `${date}T${String(hour).padStart(2, '0')}:00:00`
}

/** Mail-ToDo in eine Fälligkeits-Spalte verschieben. */
export async function moveMailTodoToBucket(
  messageId: number,
  bucket: TodoDueKindList,
  timeZone: string
): Promise<void> {
  if (bucket === 'done') {
    await window.mailClient.mail.completeTodoForMessage(messageId)
    return
  }
  if (bucket === 'overdue') {
    const date = dueIsoForOpenTodoBucket('overdue', timeZone)
    if (!date) return
    await window.mailClient.mail.setTodoScheduleForMessage({
      messageId,
      startIso: scheduleIsoForDate(date, 8),
      endIso: scheduleIsoForDate(date, 17)
    })
    return
  }
  if (OPEN_MAIL_KINDS.has(bucket as TodoDueKindOpen)) {
    await window.mailClient.mail.setTodoForMessage({
      messageId,
      dueKind: bucket as TodoDueKindOpen
    })
  }
}

/** Cloud-Aufgabe in eine Fälligkeits-Spalte verschieben. */
export async function moveCloudTaskToBucket(
  task: { accountId: string; listId: string; taskId: string },
  bucket: TodoDueKindList,
  timeZone: string
): Promise<void> {
  if (bucket === 'done') {
    await window.mailClient.tasks.patchTask({
      accountId: task.accountId,
      listId: task.listId,
      taskId: task.taskId,
      completed: true
    })
    return
  }
  const dueIso = isOpenTodoBucket(bucket) ? dueIsoForOpenTodoBucket(bucket, timeZone) : null
  await window.mailClient.tasks.patchTask({
    accountId: task.accountId,
    listId: task.listId,
    taskId: task.taskId,
    dueIso,
    completed: false
  })
}
