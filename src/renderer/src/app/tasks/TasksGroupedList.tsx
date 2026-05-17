import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { CheckCircle2, ChevronDown, ChevronRight, Circle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { format, parseISO } from 'date-fns'
import { de, enUS } from 'date-fns/locale'
import type { ConnectedAccount } from '@shared/types'
import { cn } from '@/lib/utils'
import { resolvedAccountColorCss } from '@/lib/avatar-color'
import { AccountColorStripe } from '@/components/AccountColorStripe'
import { TaskDisplayIcon } from '@/components/TaskDisplayIcon'
import { TodoDueBucketBadge } from '@/components/TodoDueBucketBadge'
import {
  computeTaskListLayout,
  taskListGroupCollapseKey,
  type TaskListArrangeBy,
  type TaskListArrangeContext,
  type TaskListChronoOrder,
  type TaskListFilter
} from '@/app/tasks/task-list-arrange'
import { setCloudTaskDragData } from '@/app/tasks/tasks-cloud-task-dnd'
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

export interface TasksGroupedListProps {
  items: TaskItemWithContext[]
  accounts: ConnectedAccount[]
  arrange: TaskListArrangeBy
  chrono: TaskListChronoOrder
  filter: TaskListFilter
  showAccountHint: boolean
  selectedKey: string | null
  checkedKeys: Set<string>
  onSelect: (item: TaskItemWithContext) => void
  onTaskClick: (item: TaskItemWithContext, event: MouseEvent) => void
  onToggleCheck: (item: TaskItemWithContext, event: MouseEvent) => void
  onToggleCompleted: (item: TaskItemWithContext) => void
  enableDrag?: boolean
}

export function TasksGroupedList({
  items,
  accounts,
  arrange,
  chrono,
  filter,
  showAccountHint,
  selectedKey,
  checkedKeys,
  onSelect,
  onTaskClick,
  onToggleCheck,
  onToggleCompleted,
  enableDrag = false
}: TasksGroupedListProps): JSX.Element {
  const { t, i18n } = useTranslation()
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a] as const)), [accounts])
  const dfLocale = i18n.language.startsWith('de') ? de : enUS

  const arrangeCtx = useMemo((): TaskListArrangeContext => {
    return {
      accountLabel: (accountId: string): string => {
        const a = accountById.get(accountId)
        return a?.displayName?.trim() || a?.email || accountId
      },
      todoBucketLabel: (kind) => t(`mail.todoBucket.${kind}` as const),
      noDueLabel: t('tasks.listArrange.noDue'),
      openLabel: t('tasks.listArrange.statusOpen'),
      doneLabel: t('tasks.listArrange.statusDone'),
      formatCalendarDayGroupLabel: (dayKey: string): string => {
        try {
          return format(parseISO(`${dayKey}T12:00:00`), 'EEEE, d. MMMM yyyy', { locale: dfLocale })
        } catch {
          return dayKey
        }
      }
    }
  }, [accountById, t, dfLocale])

  const groups = useMemo(
    () => computeTaskListLayout(items, arrange, chrono, filter, arrangeCtx, timeZone),
    [items, arrange, chrono, filter, arrangeCtx, timeZone]
  )

  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    setCollapsed(new Set())
  }, [arrange])

  function toggleGroup(collapseKey: string): void {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(collapseKey)) next.delete(collapseKey)
      else next.add(collapseKey)
      return next
    })
  }

  if (groups.length === 0) {
    return <p className="p-4 text-xs text-muted-foreground">{t('tasks.shell.emptyFiltered')}</p>
  }

  const flat = arrange === 'none'

  return (
    <div>
      {groups.map((group) => {
        const collapseKey = taskListGroupCollapseKey(arrange, group)
        const isCollapsed = !flat && collapsed.has(collapseKey)
        return (
          <section key={collapseKey}>
            {!flat && group.label ? (
              <button
                type="button"
                aria-expanded={!isCollapsed}
                className="sticky top-0 z-[1] flex w-full items-center gap-1.5 border-b border-border/60 bg-card/95 px-2 py-1.5 text-left backdrop-blur hover:bg-muted/20"
                onClick={(): void => toggleGroup(collapseKey)}
              >
                {isCollapsed ? (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                )}
                {group.todoKind != null ? (
                  <TodoDueBucketBadge kind={group.todoKind} />
                ) : (
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.label}
                  </span>
                )}
                <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
                  {group.items.length}
                </span>
              </button>
            ) : null}
            {!isCollapsed ? (
              <ul>
                {group.items.map((task) => {
                  const key = taskItemKey(task)
                  const active = selectedKey === key
                  const checked = checkedKeys.has(key)
                  const acc = accountById.get(task.accountId)
                  const stripe = acc ? resolvedAccountColorCss(acc.color) : undefined
                  return (
                    <li
                      key={key}
                      draggable={enableDrag}
                      onDragStart={
                        enableDrag
                          ? (e): void => {
                              if (e.dataTransfer) setCloudTaskDragData(e.dataTransfer, task)
                            }
                          : undefined
                      }
                      className={cn(
                        'relative border-b border-border/60',
                        checked && 'bg-primary/8',
                        active && !checked && 'bg-secondary/30',
                        enableDrag && 'cursor-grab active:cursor-grabbing'
                      )}
                    >
                      {acc ? (
                        <AccountColorStripe
                          color={acc.color}
                          className="left-0 top-1 bottom-1 w-0.5 rounded-full opacity-70"
                        />
                      ) : stripe ? (
                        <span
                          className="pointer-events-none absolute left-0 top-1 bottom-1 w-0.5 rounded-full opacity-70"
                          style={{ backgroundColor: stripe }}
                          aria-hidden
                        />
                      ) : null}
                      <div className="flex items-start gap-1.5 px-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          aria-label={t('tasks.shell.checkTaskAria')}
                          onClick={(e): void => onToggleCheck(task, e)}
                          onChange={(): void => {
                            /* controlled via onClick */
                          }}
                          className="mt-2 h-3.5 w-3.5 shrink-0 cursor-pointer accent-primary"
                        />
                        <button
                          type="button"
                          onClick={(e): void => onTaskClick(task, e)}
                          onDoubleClick={(): void => onSelect(task)}
                          className={cn(
                            'min-w-0 flex-1 py-2 pl-1 pr-1 text-left text-xs',
                            active ? 'font-semibold text-foreground' : 'text-foreground/90',
                            task.completed && 'text-muted-foreground line-through'
                          )}
                        >
                          <span className="flex items-start gap-1.5 line-clamp-2">
                            <TaskDisplayIcon iconId={task.iconId} iconColor={task.iconColor} />
                            <span className="min-w-0 flex-1">{task.title}</span>
                          </span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                            {task.dueIso ? <span>{dueDateLabel(task.dueIso)}</span> : null}
                            {showAccountHint ? (
                              <span className="truncate">
                                {acc?.displayName?.trim() || acc?.email || task.accountId}
                                {task.listName ? ` · ${task.listName}` : ''}
                              </span>
                            ) : task.listName ? (
                              <span className="truncate">{task.listName}</span>
                            ) : null}
                          </span>
                        </button>
                        <button
                          type="button"
                          title={
                            task.completed ? t('tasks.shell.markOpen') : t('tasks.shell.markDone')
                          }
                          onClick={(e): void => {
                            e.stopPropagation()
                            onToggleCompleted(task)
                          }}
                          className="shrink-0 self-start py-2 pl-0.5 text-muted-foreground hover:text-foreground"
                        >
                          {task.completed ? (
                            <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden />
                          ) : (
                            <Circle className="h-4 w-4" aria-hidden />
                          )}
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : null}
          </section>
        )
      })}
    </div>
  )
}
