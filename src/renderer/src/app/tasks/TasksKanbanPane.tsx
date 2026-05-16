import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { ConnectedAccount, TodoDueKindList } from '@shared/types'
import { AccountColorStripe } from '@/components/AccountColorStripe'
import {
  DueBucketKanbanBoard,
  type DueBucketKanbanCardModel
} from '@/components/due-bucket-kanban/DueBucketKanbanBoard'
import { moveCloudTaskToBucket } from '@/lib/move-todo-bucket'
import { cn } from '@/lib/utils'
import { classifyTaskItemDueBucket } from '@/app/tasks/task-due-bucket'
import {
  flattenVisibleTaskItems,
  type TaskListArrangeContext,
  type TaskListChronoOrder,
  type TaskListFilter
} from '@/app/tasks/task-list-arrange'
import { taskItemKey, type TaskItemWithContext } from '@/app/tasks/tasks-types'

function dueDateLabel(dueIso: string | null): string {
  if (!dueIso) return ''
  if (/^\d{4}-\d{2}-\d{2}/.test(dueIso)) return dueIso.slice(0, 10)
  try {
    const d = new Date(dueIso)
    if (Number.isNaN(d.getTime())) return ''
    return d.toISOString().slice(0, 10)
  } catch {
    return ''
  }
}

export interface TasksKanbanPaneProps {
  items: TaskItemWithContext[]
  accounts: ConnectedAccount[]
  filter: TaskListFilter
  chrono: TaskListChronoOrder
  arrangeCtx: TaskListArrangeContext
  showAccountHint: boolean
  selectedKey: string | null
  onSelect: (item: TaskItemWithContext) => void
  onTasksMutated: () => void
}

export function TasksKanbanPane({
  items,
  accounts,
  filter,
  chrono,
  arrangeCtx,
  showAccountHint,
  selectedKey,
  onSelect,
  onTasksMutated
}: TasksKanbanPaneProps): JSX.Element {
  const { t } = useTranslation()
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a] as const)), [accounts])

  const visible = useMemo(
    () => flattenVisibleTaskItems(items, 'none', chrono, filter, arrangeCtx, timeZone),
    [items, chrono, filter, arrangeCtx, timeZone]
  )

  const itemByKey = useMemo(
    () => new Map(visible.map((item) => [taskItemKey(item), item] as const)),
    [visible]
  )

  const cards = useMemo((): DueBucketKanbanCardModel[] => {
    return visible.map((item) => ({
      id: taskItemKey(item),
      bucket: classifyTaskItemDueBucket(item, timeZone),
      completed: item.completed
    }))
  }, [visible, timeZone])

  const showDoneColumn = filter === 'all' || filter === 'completed'

  const handleMove = useCallback(
    async (id: string, bucket: TodoDueKindList): Promise<void> => {
      const item = itemByKey.get(id)
      if (!item) return
      try {
        await moveCloudTaskToBucket(
          { accountId: item.accountId, listId: item.listId, taskId: item.id },
          bucket,
          timeZone
        )
        onTasksMutated()
      } catch {
        onTasksMutated()
      }
    },
    [itemByKey, timeZone, onTasksMutated]
  )

  return (
    <DueBucketKanbanBoard
      cards={cards}
      showDoneColumn={showDoneColumn}
      selectedId={selectedKey}
      emptyHint={t('tasks.shell.emptyFiltered')}
      onSelect={(id): void => {
        const item = itemByKey.get(id)
        if (item) onSelect(item)
      }}
      onMoveToBucket={handleMove}
      renderCard={(id): JSX.Element => {
        const item = itemByKey.get(id)
        if (!item) return <span className="text-xs text-muted-foreground">—</span>
        const acc = accountById.get(item.accountId)
        const due = dueDateLabel(item.dueIso)
        return (
          <div className="space-y-0.5">
            <p
              className={cn(
                'line-clamp-2 text-xs font-medium',
                item.completed && 'text-muted-foreground line-through'
              )}
            >
              {item.title.trim() || t('tasks.shell.untitled')}
            </p>
            {showAccountHint && acc ? (
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <AccountColorStripe color={acc.color} className="h-3 w-0.5" />
                <span className="truncate">{acc.displayName?.trim() || acc.email}</span>
              </div>
            ) : null}
            {due ? <p className="text-[10px] text-muted-foreground">{due}</p> : null}
            {!showAccountHint && item.listName ? (
              <p className="truncate text-[10px] text-muted-foreground">{item.listName}</p>
            ) : null}
          </div>
        )
      }}
    />
  )
}
