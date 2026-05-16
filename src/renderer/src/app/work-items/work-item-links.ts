import type { MailCloudTaskLink } from '@shared/work-item'
import type { CloudTaskWorkItem } from '@shared/work-item'
import { cloudTaskStableKey } from '@shared/work-item-keys'
import { mailCloudTaskLinkKey } from '@/app/work-items/work-item-keys'

export function indexLinksByMessageId(
  links: readonly MailCloudTaskLink[]
): Map<number, MailCloudTaskLink[]> {
  const map = new Map<number, MailCloudTaskLink[]>()
  for (const link of links) {
    const arr = map.get(link.messageId)
    if (arr) arr.push(link)
    else map.set(link.messageId, [link])
  }
  return map
}

export function indexLinksByCloudTaskKey(
  links: readonly MailCloudTaskLink[]
): Map<string, MailCloudTaskLink[]> {
  const map = new Map<string, MailCloudTaskLink[]>()
  for (const link of links) {
    const key = cloudTaskStableKey(link.accountId, link.listId, link.taskId)
    const arr = map.get(key)
    if (arr) arr.push(link)
    else map.set(key, [link])
  }
  return map
}

export function linkedMessageIdsForCloudTask(
  links: readonly MailCloudTaskLink[],
  accountId: string,
  listId: string,
  taskId: string
): number[] {
  const key = cloudTaskStableKey(accountId, listId, taskId)
  const byTask = indexLinksByCloudTaskKey(links)
  const rows = byTask.get(key) ?? []
  const ids = new Set<number>()
  for (const row of rows) ids.add(row.messageId)
  return [...ids]
}

/** Message-IDs, die bei Erledigen/Löschen der Cloud-Aufgabe ent-flaggt werden (Phase 4/6). */
export function messageIdsToUnflagWhenCloudTaskCompletes(item: CloudTaskWorkItem): number[] {
  return [...new Set(item.linkedMessageIds)]
}

export function attachLinkedMessageIds(
  cloudItems: CloudTaskWorkItem[],
  links: readonly MailCloudTaskLink[]
): CloudTaskWorkItem[] {
  const byTask = indexLinksByCloudTaskKey(links)
  return cloudItems.map((item) => {
    const rows = byTask.get(item.stableKey) ?? []
    const ids = new Set(item.linkedMessageIds)
    for (const row of rows) ids.add(row.messageId)
    return { ...item, linkedMessageIds: [...ids] }
  })
}

export function mergeUniqueLinks(links: readonly MailCloudTaskLink[]): MailCloudTaskLink[] {
  const seen = new Set<string>()
  const out: MailCloudTaskLink[] = []
  for (const link of links) {
    const k = mailCloudTaskLinkKey(link)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(link)
  }
  return out
}
