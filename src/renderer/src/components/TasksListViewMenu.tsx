import { useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MenuDivider, MenuRow, MenuSectionTitle } from '@/components/list-view-menu-parts'
import { useAnchoredListViewMenu } from '@/hooks/useAnchoredListViewMenu'
import type {
  TaskListArrangeBy,
  TaskListChronoOrder,
  TaskListFilter
} from '@/app/tasks/task-list-arrange'

const ARRANGE_ORDER: TaskListArrangeBy[] = [
  'calendar_day',
  'todo_bucket',
  'due_date',
  'status',
  'title',
  'list',
  'account',
  'none'
]

interface Props {
  arrange: TaskListArrangeBy
  chrono: TaskListChronoOrder
  filter: TaskListFilter
  filterCounts: { all: number; open: number; completed: number; overdue: number }
  showAccountArrange: boolean
  onArrangeChange: (v: TaskListArrangeBy) => void
  onChronoChange: (v: TaskListChronoOrder) => void
  onFilterChange: (v: TaskListFilter) => void
  disabled?: boolean
  /** MEGA-Zeitliste: nur Filter + chronologische Sortierung. */
  hideArrange?: boolean
}

export function TasksListViewMenu({
  arrange,
  chrono,
  filter,
  filterCounts,
  showAccountArrange,
  onArrangeChange,
  onChronoChange,
  onFilterChange,
  disabled,
  hideArrange = false
}: Props): JSX.Element {
  const { t } = useTranslation()
  const { open, setOpen, btnRef, panelRef, panelStyle } = useAnchoredListViewMenu()

  const arrangeLabel = useCallback(
    (key: TaskListArrangeBy): string => t(`tasks.listArrange.${key}` as const),
    [t]
  )

  const arrangeOptions = useMemo(
    () => (showAccountArrange ? ARRANGE_ORDER : ARRANGE_ORDER.filter((k) => k !== 'account')),
    [showAccountArrange]
  )

  const summary = useMemo(() => arrangeLabel(arrange), [arrange, arrangeLabel])

  return (
    <div className="relative min-w-0 flex-1">
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={(): void => setOpen((o) => !o)}
        className={cn(
          'flex max-w-full min-w-0 items-center gap-1 rounded-md border border-transparent px-2 py-1 text-left text-xs font-medium transition-colors',
          disabled
            ? 'cursor-not-allowed text-muted-foreground'
            : 'text-foreground hover:border-border hover:bg-secondary/60'
        )}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="truncate">
          {t('tasks.listViewMenu.viewByPrefix')} <span className="text-muted-foreground">: </span>
          {summary}
        </span>
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground', open && 'rotate-180')} />
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            aria-label={t('tasks.listViewMenu.menuAria')}
            className={cn(
              'z-[400] overflow-y-auto rounded-lg border border-border bg-popover py-1 shadow-xl',
              'text-popover-foreground'
            )}
            style={panelStyle}
          >
          <MenuSectionTitle>{t('tasks.listViewMenu.filterSection')}</MenuSectionTitle>
          <div className="px-1">
            <MenuRow
              selected={filter === 'all'}
              suffix={filterCounts.all}
              onPick={(): void => {
                onFilterChange('all')
                setOpen(false)
              }}
            >
              {t('tasks.listViewMenu.filterAll')}
            </MenuRow>
            <MenuRow
              selected={filter === 'open'}
              suffix={filterCounts.open > 0 ? filterCounts.open : undefined}
              onPick={(): void => {
                onFilterChange('open')
                setOpen(false)
              }}
            >
              {t('tasks.listViewMenu.filterOpen')}
            </MenuRow>
            <MenuRow
              selected={filter === 'overdue'}
              suffix={filterCounts.overdue > 0 ? filterCounts.overdue : undefined}
              onPick={(): void => {
                onFilterChange('overdue')
                setOpen(false)
              }}
            >
              {t('tasks.listViewMenu.filterOverdue')}
            </MenuRow>
            <MenuRow
              selected={filter === 'completed'}
              suffix={filterCounts.completed > 0 ? filterCounts.completed : undefined}
              onPick={(): void => {
                onFilterChange('completed')
                setOpen(false)
              }}
            >
              {t('tasks.listViewMenu.filterCompleted')}
            </MenuRow>
          </div>

          <MenuDivider />

          {hideArrange ? null : (
            <>
              <MenuSectionTitle>{t('tasks.listViewMenu.arrangeSection')}</MenuSectionTitle>
              <div className="px-1">
                {arrangeOptions.map((key) => (
                  <MenuRow
                    key={key}
                    selected={arrange === key}
                    onPick={(): void => {
                      onArrangeChange(key)
                      setOpen(false)
                    }}
                  >
                    {arrangeLabel(key)}
                  </MenuRow>
                ))}
              </div>
              <MenuDivider />
            </>
          )}

          <MenuSectionTitle>{t('tasks.listViewMenu.sortSection')}</MenuSectionTitle>
          <div className="px-1 pb-1">
            <MenuRow
              selected={chrono === 'newest_on_top'}
              onPick={(): void => {
                onChronoChange('newest_on_top')
                setOpen(false)
              }}
            >
              {t('tasks.listViewMenu.chronoNewest')}
            </MenuRow>
            <MenuRow
              selected={chrono === 'oldest_on_top'}
              onPick={(): void => {
                onChronoChange('oldest_on_top')
                setOpen(false)
              }}
            >
              {t('tasks.listViewMenu.chronoOldest')}
            </MenuRow>
          </div>
        </div>,
          document.body
        )}
    </div>
  )
}
