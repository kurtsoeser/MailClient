import type { TodoDueKindList } from '@shared/types'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import {
  AlertTriangle,
  Calendar,
  Sunrise,
  CalendarRange,
  CalendarClock,
  CheckCircle2,
  type LucideIcon
} from 'lucide-react'

const ICONS: Record<TodoDueKindList, LucideIcon> = {
  overdue: AlertTriangle,
  today: Calendar,
  tomorrow: Sunrise,
  this_week: CalendarRange,
  later: CalendarClock,
  done: CheckCircle2
}

interface Props {
  kind: TodoDueKindList
  /** Nur Icon, kein Kurztext. */
  compact?: boolean
  className?: string
}

/**
 * ToDo-Faelligkeit wie Schnellzugriff (Icon + Kurzlabel), Tooltip mit vollem Titel.
 */
export function TodoDueBucketBadge({ kind, compact = false, className }: Props): JSX.Element {
  const { t } = useTranslation()
  const Icon = ICONS[kind]
  const overdue = kind === 'overdue'
  const title = t(`mail.todoBucket.${kind}`)
  const shortLabel = t(`mail.todoNav.${kind}`)
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium',
        overdue ? 'bg-destructive/15 text-destructive' : 'bg-status-todo/15 text-status-todo',
        className
      )}
      title={title}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      {!compact && <span className="max-w-[5.5rem] truncate">{shortLabel}</span>}
    </span>
  )
}
