import type { WorkItem } from '@shared/work-item'
import { PanelRightClose, SquareArrowOutUpRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import type { CloudTaskSaveDraft } from '@/app/work/CloudTaskWorkItemDetail'
import { WorkItemPreviewPanel } from '@/app/work/WorkItemPreviewPanel'
import type { ConnectedAccount } from '@shared/types'
import {
  ModuleColumnHeaderIconButton,
  moduleColumnHeaderDockBarRowClass,
  moduleColumnHeaderIconGlyphClass,
  moduleColumnHeaderUppercaseLabelClass
} from '@/components/ModuleColumnHeader'

export interface TasksDetailPanelBodyProps {
  item: WorkItem | null
  accountById: Map<string, ConnectedAccount>
  saving: boolean
  onCloudSave: (draft: CloudTaskSaveDraft) => Promise<void>
  onCloudDelete: () => Promise<void>
}

export function TasksDetailPanelBody({
  item,
  accountById,
  saving,
  onCloudSave,
  onCloudDelete
}: TasksDetailPanelBodyProps): JSX.Element {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <WorkItemPreviewPanel
        item={item}
        accountById={accountById}
        saving={saving}
        onCloudSave={onCloudSave}
        onCloudDelete={onCloudDelete}
      />
    </div>
  )
}

export interface TasksDetailDockHeaderProps {
  onUndock: () => void
  onHide: () => void
}

export function TasksDetailDockHeader({ onUndock, onHide }: TasksDetailDockHeaderProps): JSX.Element {
  const { t } = useTranslation()

  return (
    <div className={cn(moduleColumnHeaderDockBarRowClass, 'shrink-0 border-b border-border bg-card')}>
      <span className={cn(moduleColumnHeaderUppercaseLabelClass, 'min-w-0 flex-1 text-left')}>
        {t('tasks.shell.detailHeading')}
      </span>
      <div className="flex shrink-0 items-center gap-0.5">
        <ModuleColumnHeaderIconButton
          title={t('tasks.shell.undockDetailTitle')}
          onClick={onUndock}
        >
          <SquareArrowOutUpRight className={moduleColumnHeaderIconGlyphClass} />
        </ModuleColumnHeaderIconButton>
        <ModuleColumnHeaderIconButton title={t('tasks.shell.hideDetailTitle')} onClick={onHide}>
          <PanelRightClose className={moduleColumnHeaderIconGlyphClass} />
        </ModuleColumnHeaderIconButton>
      </div>
    </div>
  )
}
