import type { MailCloudTaskLink } from '@shared/work-item'
import {
  cloudTaskStableKey as cloudTaskStableKeyShared,
  mailTodoStableKey,
  parseCloudTaskStableKey,
  parseMailTodoStableKey
} from '@shared/work-item-keys'

export { mailTodoStableKey, parseMailTodoStableKey, parseCloudTaskStableKey }

export const cloudTaskStableKey = cloudTaskStableKeyShared

/** @deprecated Alias – nutze {@link cloudTaskStableKey}. */
export function cloudTaskStableKeyFromParts(
  accountId: string,
  listId: string,
  taskId: string
): string {
  return cloudTaskStableKey(accountId, listId, taskId)
}

export function mailCloudTaskLinkKey(link: MailCloudTaskLink): string {
  return `${link.messageId}:${link.accountId}:${link.listId}:${link.taskId}`
}
