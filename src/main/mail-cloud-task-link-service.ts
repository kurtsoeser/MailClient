import type { MailCloudTaskLinkDto, TaskItemRow } from '@shared/types'
import { getMessageById } from './db/messages-repo'
import {
  deleteMailCloudTaskLinksForTask,
  insertMailCloudTaskLink,
  listAllMailCloudTaskLinks,
  type MailCloudTaskLinkRow
} from './db/mail-cloud-task-link-repo'
import { createTaskForAccount } from './tasks-service'

function rowToDto(r: MailCloudTaskLinkRow): MailCloudTaskLinkDto {
  return {
    messageId: r.messageId,
    accountId: r.accountId,
    listId: r.listId,
    taskId: r.taskId
  }
}

export function listMailCloudTaskLinkDtos(): MailCloudTaskLinkDto[] {
  return listAllMailCloudTaskLinks().map(rowToDto)
}

export interface CreateMailCloudTaskFromMessageInput {
  messageId: number
  accountId: string
  listId: string
  title: string
  notes?: string | null
  dueIso?: string | null
}

export async function createMailCloudTaskFromMessage(
  input: CreateMailCloudTaskFromMessageInput
): Promise<TaskItemRow> {
  const messageId = input.messageId
  const accountId = input.accountId.trim()
  const listId = input.listId.trim()
  const title = input.title.trim()
  if (!accountId || !listId) throw new Error('Konto oder Liste fehlt.')
  if (!title) throw new Error('Titel fehlt.')

  const msg = getMessageById(messageId)
  if (!msg) throw new Error('Mail nicht gefunden.')
  if (msg.accountId !== accountId) {
    throw new Error('Die Mail gehört nicht zu diesem Konto.')
  }

  const task = await createTaskForAccount(accountId, listId, {
    title,
    notes: input.notes ?? null,
    dueIso: input.dueIso ?? null,
    completed: false
  })

  insertMailCloudTaskLink({
    messageId,
    accountId,
    listId,
    taskId: task.id
  })

  return task
}

export function clearMailCloudTaskLinksForDeletedTask(
  accountId: string,
  listId: string,
  taskId: string
): void {
  deleteMailCloudTaskLinksForTask(accountId, listId, taskId)
}
