import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { ConnectedAccount } from '@shared/types'
import type { WorkItem } from '@shared/work-item'
import { ReadingPane } from '@/app/layout/ReadingPane'
import { CalendarEventPreview } from '@/app/calendar/CalendarEventPreview'
import { TodoDueBucketBadge } from '@/components/TodoDueBucketBadge'
import { classifyWorkItemBucket } from '@/app/work-items/work-item-bucket'
import { openCalendarEventInCalendar } from '@/app/work-items/work-item-calendar-nav'
import { workItemSourceLabel } from '@/app/work-items/work-item-mapper'
import { useAppModeStore } from '@/stores/app-mode'
import {
  CloudTaskWorkItemDetail,
  type CloudTaskSaveDraft
} from '@/app/work/CloudTaskWorkItemDetail'

export interface WorkItemPreviewPanelProps {
  item: WorkItem | null
  accountById: ReadonlyMap<string, ConnectedAccount>
  saving?: boolean
  onOpenInMail?: () => void
  onCloudSave?: (draft: CloudTaskSaveDraft) => void | Promise<void>
  onCloudDelete?: () => void | Promise<void>
  onCloudDisplayChange?: (
    patch: import('@/app/work/CloudTaskWorkItemDetail').CloudTaskDisplayPatch
  ) => void | Promise<void>
}

export function WorkItemPreviewPanel({
  item,
  accountById,
  saving,
  onOpenInMail,
  onCloudSave,
  onCloudDelete,
  onCloudDisplayChange
}: WorkItemPreviewPanelProps): JSX.Element {
  const { t } = useTranslation()
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

  const bucket = useMemo(() => {
    if (!item) return null
    return classifyWorkItemBucket(item, timeZone)
  }, [item, timeZone])

  if (!item) {
    return (
      <p className="p-4 text-xs text-muted-foreground">{t('work.shell.selectItem')}</p>
    )
  }

  if (item.kind === 'calendar_event') {
    const setAppMode = useAppModeStore.getState().setMode
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <CalendarEventPreview
          event={item.event}
          onEdit={(): void => openCalendarEventInCalendar(item, setAppMode)}
        />
      </div>
    )
  }

  if (item.kind === 'mail_todo') {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 space-y-2 border-b border-border px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            {bucket ? <TodoDueBucketBadge kind={bucket} /> : null}
            <span className="text-[10px] text-muted-foreground">
              {workItemSourceLabel(item, accountById)}
            </span>
          </div>
          {onOpenInMail ? (
            <button
              type="button"
              onClick={onOpenInMail}
              className="text-xs font-medium text-primary hover:underline"
            >
              {t('work.shell.openInMail')}
            </button>
          ) : null}
        </div>
        <div className="min-h-0 flex-1">
          <ReadingPane />
        </div>
      </div>
    )
  }

  if (item.kind !== 'cloud_task') {
    return <p className="p-4 text-xs text-muted-foreground">{t('work.shell.selectItem')}</p>
  }

  const accountLine =
    (accountById.get(item.accountId)?.displayName ?? item.accountId) +
    (item.listName ? ` · ${item.listName}` : '')

  return (
    <CloudTaskWorkItemDetail
      item={item}
      accountLine={accountLine}
      saving={saving}
      onSave={(draft): void => {
        if (onCloudSave) void onCloudSave(draft)
      }}
      onDelete={(): void => {
        if (onCloudDelete) void onCloudDelete()
      }}
      onDisplayChange={onCloudDisplayChange}
    />
  )
}
