import type { MailCloudTaskLink } from '@shared/work-item'
import {
  cloudTaskStableKey as cloudTaskStableKeyShared,
  mailTodoStableKey,
  parseCloudTaskStableKey,
  parseMailTodoStableKey
} from '@shared/work-item-keys'

export { mailTodoStableKey, parseMailTodoStableKey, parseCloudTaskStableKey }

export const cloudTaskStableKey = cloudTaskStableKeyShared

export function mailCloudTaskLinkKey(link: MailCloudTaskLink): string {
  return `${link.messageId}:${link.accountId}:${link.listId}:${link.taskId}`
}
