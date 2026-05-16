import {
  calendarEventIconIsExplicit,
  resolveCalendarEventIcon
} from '@/lib/calendar-event-icons'
import { resolveEntityIconColor } from '@shared/entity-icon-color'
import { cn } from '@/lib/utils'

export function TaskDisplayIcon({
  iconId,
  iconColor,
  className
}: {
  iconId?: string | null
  iconColor?: string | null
  className?: string
}): JSX.Element | null {
  if (!calendarEventIconIsExplicit(iconId)) return null
  const Icon = resolveCalendarEventIcon(iconId)
  const color = resolveEntityIconColor(iconColor)
  return (
    <Icon
      className={cn('h-3.5 w-3.5 shrink-0', className)}
      style={color ? { color } : undefined}
      strokeWidth={2}
      aria-hidden
    />
  )
}
