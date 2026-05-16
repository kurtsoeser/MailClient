import { useCallback, useMemo } from 'react'
import { Mail } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ConnectedAccount, TodoDueKindList } from '@shared/types'
import type { WorkItem } from '@shared/work-item'
import { AccountColorStripe } from '@/components/AccountColorStripe'
import {
  DueBucketKanbanBoard,
  type DueBucketKanbanCardModel
} from '@/components/due-bucket-kanban/DueBucketKanbanBoard'
import { moveCloudTaskToBucket, moveMailTodoToBucket } from '@/lib/move-todo-bucket'
import { cn } from '@/lib/utils'
import {
  flattenVisibleWorkItemViews,
  type WorkListArrangeContext,
  type WorkListChronoOrder,
  type WorkListFilter
} from '@/app/work-items/work-item-list-arrange'
import { workItemsToViews } from '@/app/work-items/work-item-mapper'
import type { WorkItemView } from '@shared/work-item'

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

export interface WorkItemsKanbanPaneProps {
  items: WorkItem[]
  accounts: ConnectedAccount[]
  filter: WorkListFilter
  chrono: WorkListChronoOrder
  arrangeCtx: WorkListArrangeContext
  selectedKey: string | null
  onSelect: (item: WorkItem) => void
  onItemsMutated: () => void
}

export function WorkItemsKanbanPane({
  items,
  accounts,
  filter,
  chrono,
  arrangeCtx,
  selectedKey,
  onSelect,
  onItemsMutated
}: WorkItemsKanbanPaneProps): JSX.Element {
  const { t } = useTranslation()
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a] as const)), [accounts])

  const kanbanItems = useMemo(
    () => items.filter((i) => i.kind === 'mail_todo' || i.kind === 'cloud_task'),
    [items]
  )

  const views = useMemo(
    () => workItemsToViews(kanbanItems, accountById, timeZone),
    [kanbanItems, accountById, timeZone]
  )

  const visible = useMemo(
    () => flattenVisibleWorkItemViews(views, 'none', chrono, filter, arrangeCtx),
    [views, chrono, filter, arrangeCtx]
  )

  const viewByKey = useMemo(
    () => new Map(visible.map((v) => [v.stableKey, v] as const)),
    [visible]
  )

  const itemByKey = useMemo(() => {
    const m = new Map<string, WorkItem>()
    for (const item of kanbanItems) m.set(item.stableKey, item)
    return m
  }, [kanbanItems])

  const cards = useMemo((): DueBucketKanbanCardModel[] => {
    return visible.map((v) => ({
      id: v.stableKey,
      bucket: v.bucket,
      completed: v.completed
    }))
  }, [visible])

  const showDoneColumn = filter === 'all' || filter === 'completed'

  const handleMove = useCallback(
    async (id: string, bucket: TodoDueKindList): Promise<void> => {
      const item = itemByKey.get(id)
      if (!item) return
      try {
        if (item.kind === 'mail_todo') {
          await moveMailTodoToBucket(item.messageId, bucket, timeZone)
        } else if (item.kind === 'cloud_task') {
          await moveCloudTaskToBucket(
            { accountId: item.accountId, listId: item.listId, taskId: item.taskId },
            bucket,
            timeZone
          )
        }
        onItemsMutated()
      } catch {
        onItemsMutated()
      }
    },
    [itemByKey, timeZone, onItemsMutated]
  )

  function renderCardBody(view: WorkItemView): JSX.Element {
    const acc = accountById.get(view.accountId)
    const due = dueDateLabel(view.dueAtIso)
    return (
      <div className="space-y-0.5">
        <p
          className={cn(
            'line-clamp-2 text-xs font-medium',
            view.completed && 'text-muted-foreground line-through'
          )}
        >
          {view.title}
        </p>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          {view.kind === 'mail_todo' ? (
            <Mail className="h-3 w-3 shrink-0" aria-hidden />
          ) : null}
          {acc ? (
            <>
              <AccountColorStripe color={acc.color} className="h-3 w-0.5" />
              <span className="truncate">{acc.displayName?.trim() || acc.email}</span>
            </>
          ) : null}
        </div>
        {due ? <p className="text-[10px] text-muted-foreground">{due}</p> : null}
      </div>
    )
  }

  return (
    <DueBucketKanbanBoard
      cards={cards}
      showDoneColumn={showDoneColumn}
      selectedId={selectedKey}
      emptyHint={t('work.shell.emptyFiltered')}
      onSelect={(id): void => {
        const item = itemByKey.get(id)
        if (item) onSelect(item)
      }}
      onMoveToBucket={handleMove}
      renderCard={(id): JSX.Element => {
        const view = viewByKey.get(id)
        if (!view) return <span className="text-xs text-muted-foreground">—</span>
        return renderCardBody(view)
      }}
    />
  )
}
