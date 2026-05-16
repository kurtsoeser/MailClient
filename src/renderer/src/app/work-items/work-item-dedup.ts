import type { MailCloudTaskLink, MasterListDedupStrategy, WorkItem } from '@shared/work-item'
import { indexLinksByMessageId } from '@/app/work-items/work-item-links'

export interface DedupWorkItemsResult {
  items: WorkItem[]
  /** Mail-ToDos, die wegen verknüpfter Cloud-Aufgabe ausgeblendet wurden. */
  hiddenMailMessageIds: number[]
}

/**
 * Master-Liste: bei verknüpfter Mail+Cloud nur Cloud-Task anzeigen (Standard).
 */
export function dedupWorkItemsForMasterList(
  items: WorkItem[],
  links: readonly MailCloudTaskLink[],
  strategy: MasterListDedupStrategy = 'prefer_cloud_task'
): DedupWorkItemsResult {
  if (strategy !== 'prefer_cloud_task') {
    return { items: [...items], hiddenMailMessageIds: [] }
  }

  const byMessage = indexLinksByMessageId(links)
  const linkedMessageIds = new Set(byMessage.keys())
  const hiddenMailMessageIds: number[] = []
  const out: WorkItem[] = []

  for (const item of items) {
    if (item.kind === 'mail_todo' && linkedMessageIds.has(item.messageId)) {
      hiddenMailMessageIds.push(item.messageId)
      continue
    }
    out.push(item)
  }

  return { items: out, hiddenMailMessageIds }
}

export function buildMasterWorkItemList(
  mailTodos: WorkItem[],
  cloudTasks: WorkItem[],
  links: readonly MailCloudTaskLink[],
  strategy?: MasterListDedupStrategy
): DedupWorkItemsResult {
  const combined = [...mailTodos, ...cloudTasks]
  return dedupWorkItemsForMasterList(combined, links, strategy)
}
