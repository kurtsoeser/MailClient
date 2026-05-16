import { useMemo, useState, type ReactNode } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent
} from '@dnd-kit/core'
import type { TodoDueKindList } from '@shared/types'
import { cn } from '@/lib/utils'
import { rankOpenTodoBucket } from '@/lib/todo-due-bucket'
import { TodoDueBucketBadge } from '@/components/TodoDueBucketBadge'
import { OPEN_TASK_DUE_BUCKETS } from '@/app/tasks/task-due-bucket'

export interface DueBucketKanbanCardModel {
  id: string
  bucket: TodoDueKindList
  completed: boolean
}

function columnId(bucket: TodoDueKindList): string {
  return `kanban-col:${bucket}`
}

function parseColumnId(id: string): TodoDueKindList | null {
  if (!id.startsWith('kanban-col:')) return null
  return id.slice('kanban-col:'.length) as TodoDueKindList
}

function resolveDropBucket(
  overId: string,
  cards: readonly DueBucketKanbanCardModel[]
): TodoDueKindList | null {
  const col = parseColumnId(overId)
  if (col) return col
  return cards.find((c) => c.id === overId)?.bucket ?? null
}

function KanbanColumnShell({
  bucket,
  count,
  children
}: {
  bucket: TodoDueKindList
  count: number
  children: ReactNode
}): JSX.Element {
  const { setNodeRef, isOver } = useDroppable({ id: columnId(bucket) })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex h-full min-h-0 w-[220px] shrink-0 flex-col rounded-lg border border-border bg-card shadow-sm',
        isOver && 'ring-1 ring-primary/50'
      )}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-secondary/40 px-2 py-1.5">
        <TodoDueBucketBadge kind={bucket} />
        <span className="text-[10px] tabular-nums text-muted-foreground">{count}</span>
      </div>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-1.5">{children}</div>
    </div>
  )
}

function DraggableCard({
  id,
  active,
  children
}: {
  id: string
  active: boolean
  children: ReactNode
}): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id })
  const style: React.CSSProperties | undefined = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'rounded-md border border-border bg-background p-2 text-left shadow-sm transition-colors',
        active && 'ring-1 ring-primary/40',
        isDragging && 'opacity-40'
      )}
      {...listeners}
      {...attributes}
    >
      {children}
    </div>
  )
}

export interface DueBucketKanbanBoardProps {
  cards: DueBucketKanbanCardModel[]
  showDoneColumn: boolean
  selectedId: string | null
  renderCard: (id: string) => ReactNode
  onSelect: (id: string) => void
  onMoveToBucket: (id: string, bucket: TodoDueKindList) => void | Promise<void>
  emptyHint?: string
}

export function DueBucketKanbanBoard({
  cards,
  showDoneColumn,
  selectedId,
  renderCard,
  onSelect,
  onMoveToBucket,
  emptyHint
}: DueBucketKanbanBoardProps): JSX.Element {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const [activeId, setActiveId] = useState<string | null>(null)

  const columns = useMemo((): TodoDueKindList[] => {
    const base: TodoDueKindList[] = [...OPEN_TASK_DUE_BUCKETS]
    if (showDoneColumn) base.push('done')
    return base.sort((a, b) => rankOpenTodoBucket(a) - rankOpenTodoBucket(b))
  }, [showDoneColumn])

  const byColumn = useMemo(() => {
    const map = new Map<TodoDueKindList, DueBucketKanbanCardModel[]>()
    for (const c of columns) map.set(c, [])
    for (const card of cards) {
      const list = map.get(card.bucket) ?? []
      list.push(card)
      map.set(card.bucket, list)
    }
    return map
  }, [cards, columns])

  function handleDragStart(ev: DragStartEvent): void {
    setActiveId(String(ev.active.id))
  }

  function handleDragEnd(ev: DragEndEvent): void {
    setActiveId(null)
    const cardId = String(ev.active.id)
    const overId = ev.over?.id
    if (!overId) return
    const bucket = resolveDropBucket(String(overId), cards)
    if (!bucket) return
    const card = cards.find((c) => c.id === cardId)
    if (!card || card.bucket === bucket) return
    void onMoveToBucket(cardId, bucket)
  }

  if (cards.length === 0 && emptyHint) {
    return <p className="p-4 text-xs text-muted-foreground">{emptyHint}</p>
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex h-full min-h-0 gap-2 overflow-x-auto overflow-y-hidden p-2">
        {columns.map((bucket) => {
          const colCards = byColumn.get(bucket) ?? []
          return (
            <KanbanColumnShell key={bucket} bucket={bucket} count={colCards.length}>
              {colCards.map((card) => (
                <DraggableCard key={card.id} id={card.id} active={selectedId === card.id}>
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={(): void => onSelect(card.id)}
                  >
                    {renderCard(card.id)}
                  </button>
                </DraggableCard>
              ))}
            </KanbanColumnShell>
          )
        })}
      </div>
      <DragOverlay>
        {activeId ? (
          <div className="w-[200px] rounded-md border border-border bg-background p-2 text-xs shadow-lg">
            {renderCard(activeId)}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
