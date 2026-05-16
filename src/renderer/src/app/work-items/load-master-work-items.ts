import type { ConnectedAccount, MailListItem } from '@shared/types'
import type { MailCloudTaskLink, WorkItem } from '@shared/work-item'
import { loadAllOpenTodoMessages } from '@/stores/mail'
import { loadUnifiedCloudTasks } from '@/app/tasks/tasks-calendar-load'
import { buildMasterWorkItemList } from '@/app/work-items/work-item-dedup'
import { attachLinkedMessageIds } from '@/app/work-items/work-item-links'
import { loadPlannedScheduleMapForTasks } from '@/app/work-items/load-planned-schedules'
import { mailListItemsToWorkItems, taskItemToWorkItem } from '@/app/work-items/work-item-mapper'

export async function listMailCloudTaskLinks(): Promise<MailCloudTaskLink[]> {
  return window.mailClient.tasks.listMailCloudTaskLinks()
}

async function loadMailTodosForMaster(includeDone: boolean): Promise<MailListItem[]> {
  const open = await loadAllOpenTodoMessages()
  if (!includeDone) return open
  const done = await window.mailClient.mail
    .listTodoMessages({ accountId: null, dueKind: 'done', limit: 400 })
    .catch((): MailListItem[] => [])
  const seen = new Set(open.map((m) => m.id))
  const merged = [...open]
  for (const m of done) {
    if (seen.has(m.id)) continue
    seen.add(m.id)
    merged.push(m)
  }
  return merged
}

export interface MasterWorkItemsLoadResult {
  items: WorkItem[]
  hiddenMailMessageIds: number[]
  links: MailCloudTaskLink[]
}

export async function loadMasterWorkItems(
  taskAccounts: ConnectedAccount[],
  opts?: { includeCompletedMail?: boolean }
): Promise<MasterWorkItemsLoadResult> {
  const [mails, cloudRows, links] = await Promise.all([
    loadMailTodosForMaster(opts?.includeCompletedMail ?? true),
    loadUnifiedCloudTasks(taskAccounts),
    listMailCloudTaskLinks()
  ])

  const planned = await loadPlannedScheduleMapForTasks(cloudRows)
  const mailWork = mailListItemsToWorkItems(mails)
  const cloudWork = cloudRows.map((task) =>
    taskItemToWorkItem(task, { plannedByTaskKey: planned })
  )
  const cloudWithLinks = attachLinkedMessageIds(cloudWork, links)
  const { items, hiddenMailMessageIds } = buildMasterWorkItemList(mailWork, cloudWithLinks, links)
  return { items, hiddenMailMessageIds, links }
}
