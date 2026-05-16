import { Columns3, List } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import {
  persistTasksContentViewMode,
  type TasksContentViewMode
} from '@/app/tasks/tasks-view-mode-storage'

export interface TasksViewModeSwitcherProps {
  contentViewMode: TasksContentViewMode
  onContentViewModeChange: (mode: TasksContentViewMode) => void
  disabled?: boolean
  className?: string
}

export function TasksViewModeSwitcher({
  contentViewMode,
  onContentViewModeChange,
  disabled,
  className
}: TasksViewModeSwitcherProps): JSX.Element {
  const { t } = useTranslation()

  const setMode = (mode: TasksContentViewMode): void => {
    persistTasksContentViewMode(mode)
    onContentViewModeChange(mode)
  }

  return (
    <div
      className={cn(
        'flex items-center gap-0.5 rounded-md border border-border p-0.5',
        className
      )}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={(): void => setMode('list')}
        className={cn(
          'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium',
          contentViewMode === 'list'
            ? 'bg-secondary text-foreground'
            : 'text-muted-foreground hover:bg-secondary/50'
        )}
      >
        <List className="h-3 w-3" />
        {t('tasks.shell.viewList')}
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={(): void => setMode('kanban')}
        className={cn(
          'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium',
          contentViewMode === 'kanban'
            ? 'bg-secondary text-foreground'
            : 'text-muted-foreground hover:bg-secondary/50'
        )}
      >
        <Columns3 className="h-3 w-3" />
        {t('tasks.shell.viewKanban')}
      </button>
    </div>
  )
}
