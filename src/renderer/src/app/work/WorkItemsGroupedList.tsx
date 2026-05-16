import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { CheckCircle2, ChevronDown, ChevronRight, Circle, Mail } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { format, parseISO } from 'date-fns'
import { de, enUS } from 'date-fns/locale'
import type { ConnectedAccount } from '@shared/types'
import type { WorkItem } from '@shared/work-item'
import { cn } from '@/lib/utils'
import { resolvedAccountColorCss } from '@/lib/avatar-color'
import { AccountColorStripe } from '@/components/AccountColorStripe'
import { TodoDueBucketBadge } from '@/components/TodoDueBucketBadge'
import {
  computeWorkItemListLayout,
  workListGroupCollapseKey,
  type WorkListArrangeBy,
  type WorkListArrangeContext,
  type WorkListChronoOrder,
  type WorkListFilter
} from '@/app/work-items/work-item-list-arrange'
import { workItemsToViews } from '@/app/work-items/work-item-mapper'

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

export interface WorkItemsGroupedListProps {
  items: WorkItem[]
  accounts: ConnectedAccount[]
  arrange: WorkListArrangeBy
  chrono: WorkListChronoOrder
  filter: WorkListFilter
  selectedKey: string | null
  onSelect: (item: WorkItem) => void
  onItemClick: (item: WorkItem) => void
  onToggleCompleted: (item: WorkItem) => void
  onContextMenu?: (item: WorkItem, event: ReactMouseEvent) => void
}

export function WorkItemsGroupedList({
  items,
  accounts,
  arrange,
  chrono,
  filter,
  selectedKey,
  onSelect,
  onItemClick,
  onToggleCompleted,
  onContextMenu
}: WorkItemsGroupedListProps): JSX.Element {
  const { t, i18n } = useTranslation()
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a] as const)), [accounts])
  const itemByKey = useMemo(() => new Map(items.map((i) => [i.stableKey, i] as const)), [items])
  const dfLocale = i18n.language.startsWith('de') ? de : enUS

  const arrangeCtx = useMemo((): WorkListArrangeContext => {
    return {
      accountLabel: (accountId: string): string => {
        const a = accountById.get(accountId)
        return a?.displayName?.trim() || a?.email || accountId
      },
      todoBucketLabel: (kind) => t(`mail.todoBucket.${kind}` as const),
      noDueLabel: t('work.listArrange.noDue'),
      openLabel: t('work.listArrange.statusOpen'),
      doneLabel: t('work.listArrange.statusDone'),
      mailSourceLabel: t('work.listArrange.sourceMail'),
      formatCalendarDayGroupLabel: (dayKey: string): string => {
        try {
          return format(parseISO(`${dayKey}T12:00:00`), 'EEEE, d. MMMM yyyy', { locale: dfLocale })
        } catch {
          return dayKey
        }
      }
    }
  }, [accountById, t, dfLocale])

  const views = useMemo(
    () => workItemsToViews(items, accountById, timeZone),
    [items, accountById, timeZone]
  )

  const groups = useMemo(
    () => computeWorkItemListLayout(views, arrange, chrono, filter, arrangeCtx),
    [views, arrange, chrono, filter, arrangeCtx]
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
    return <p className="p-4 text-xs text-muted-foreground">{t('work.shell.emptyFiltered')}</p>
  }

  const flat = arrange === 'none'

  return (
    <div>
      {groups.map((group) => {
        const collapseKey = workListGroupCollapseKey(arrange, group)
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
                {group.items.map((view) => {
                  const item = itemByKey.get(view.stableKey)
                  if (!item) return null
                  const active = selectedKey === view.stableKey
                  const acc = accountById.get(view.accountId)
                  const stripe = acc ? resolvedAccountColorCss(acc.color) : undefined
                  const isMail = view.kind === 'mail_todo'
                  return (
                    <li
                      key={view.stableKey}
                      className={cn(
                        'relative border-b border-border/60',
                        active && 'bg-secondary/30'
                      )}
                      onContextMenu={
                        onContextMenu
                          ? (e): void => onContextMenu(item, e)
                          : undefined
                      }
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
                        <button
                          type="button"
                          onClick={(): void => onItemClick(item)}
                          onDoubleClick={(): void => onSelect(item)}
                          className={cn(
                            'min-w-0 flex-1 py-2 pl-1 pr-1 text-left text-xs',
                            active ? 'font-semibold text-foreground' : 'text-foreground/90',
                            view.completed && 'text-muted-foreground line-through'
                          )}
                        >
                          <span className="line-clamp-2">{view.title}</span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                            {isMail ? (
                              <Mail className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
                            ) : null}
                            {view.dueAtIso ? <span>{dueDateLabel(view.dueAtIso)}</span> : null}
                            <span className="truncate">{view.sourceLabel}</span>
                          </span>
                        </button>
                        <button
                          type="button"
                          title={
                            view.completed ? t('work.shell.markOpen') : t('work.shell.markDone')
                          }
                          onClick={(e): void => {
                            e.stopPropagation()
                            onToggleCompleted(item)
                          }}
                          className="shrink-0 self-start py-2 pl-0.5 text-muted-foreground hover:text-foreground"
                        >
                          {view.completed ? (
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
