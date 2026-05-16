import type { TFunction } from 'i18next'
import { Calendar, CheckSquare, ExternalLink, ListTodo, Mail, Trash2 } from 'lucide-react'
import { openExternalUrl } from '@/lib/open-external'
import type { WorkItem } from '@shared/work-item'
import type { ContextMenuItem } from '@/components/ContextMenu'
import {
  buildMailCategorySubmenuItems,
  buildMailContextItems,
  type MailContextHandlers
} from '@/lib/mail-context-menu'
export interface WorkItemContextHandlers {
  t: TFunction
  mailHandlers: MailContextHandlers
  canCreateCloudTask?: (accountId: string) => boolean
  onToggleCompleted: (item: WorkItem) => void | Promise<void>
  onShowInCalendar: (item: WorkItem) => void
  onOpenInMail: (item: Extract<WorkItem, { kind: 'mail_todo' }>) => void
  onOpenInTasks: (item: Extract<WorkItem, { kind: 'cloud_task' }>) => void
  onDeleteCloudTask: (item: Extract<WorkItem, { kind: 'cloud_task' }>) => void | Promise<void>
  refreshMailList?: () => void | Promise<void>
}

function workItemCommonItems(item: WorkItem, h: WorkItemContextHandlers): ContextMenuItem[] {
  const out: ContextMenuItem[] = []
  if (item.kind !== 'calendar_event') {
    out.push({
      id: 'work-toggle-done',
      label: item.completed ? h.t('work.context.markOpen') : h.t('work.context.markDone'),
      icon: CheckSquare,
      onSelect: (): void => {
        void h.onToggleCompleted(item)
      }
    })
  }
  out.push({
    id: 'work-show-calendar',
    label: h.t('work.context.showInCalendar'),
    icon: Calendar,
    onSelect: (): void => h.onShowInCalendar(item)
  })
  return out
}

export async function buildWorkItemContextMenuItems(
  item: WorkItem,
  anchor: { x: number; y: number },
  h: WorkItemContextHandlers
): Promise<ContextMenuItem[]> {
  const common = workItemCommonItems(item, h)

  if (item.kind === 'calendar_event') {
    const link = item.event.webLink?.trim()
    return [
      ...common,
      ...(link
        ? [
            { id: 'mega-sep-cal-1', label: '', separator: true },
            {
              id: 'mega-open-event-link',
              label: h.t('mega.context.openEventLink'),
              icon: ExternalLink,
              onSelect: (): void => {
                void openExternalUrl(link)
              }
            }
          ]
        : [])
    ]
  }

  if (item.kind === 'mail_todo') {
    const cat = await buildMailCategorySubmenuItems(item.mail, { snoozeAnchor: anchor }, () => {
      if (h.refreshMailList) void h.refreshMailList()
    })
    const mailItems = buildMailContextItems(item.mail, h.mailHandlers, {
      snoozeAnchor: anchor,
      categorySubmenu: cat.length > 0 ? cat : undefined,
      allowsCloudTaskCreate: h.canCreateCloudTask?.(item.mail.accountId) ?? false,
      t: h.t
    })
    return [
      ...common,
      { id: 'work-sep-mail-1', label: '', separator: true },
      {
        id: 'work-open-mail',
        label: h.t('work.context.openInMail'),
        icon: Mail,
        onSelect: (): void => h.onOpenInMail(item)
      },
      { id: 'work-sep-mail-2', label: '', separator: true },
      ...mailItems
    ]
  }

  if (item.kind === 'cloud_task') {
    return [
      ...common,
      { id: 'work-sep-cloud-1', label: '', separator: true },
      {
        id: 'work-open-tasks',
        label: h.t('work.context.openInTasks'),
        icon: ListTodo,
        onSelect: (): void => h.onOpenInTasks(item)
      },
      {
        id: 'work-delete-cloud',
        label: h.t('common.delete'),
        icon: Trash2,
        destructive: true,
        onSelect: (): void => {
          void h.onDeleteCloudTask(item)
        }
      }
    ]
  }

  return common
}
