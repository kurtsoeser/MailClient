import { cn } from '@/lib/utils'

export type StatusVariant =
  | 'unread'
  | 'read'
  | 'todo-today'
  | 'waiting'
  | 'flagged'
  | 'done'
  | 'syncing'

const VARIANT_CLASSES: Record<StatusVariant, string> = {
  unread: 'bg-status-unread',
  read: 'bg-transparent border border-border',
  'todo-today': 'bg-status-todo',
  waiting: 'bg-status-waiting',
  flagged: 'bg-status-flagged',
  done: 'bg-status-done',
  syncing: 'bg-muted-foreground/60'
}

export type StatusSize = 'xs' | 'sm' | 'md'

const SIZE_CLASSES: Record<StatusSize, string> = {
  xs: 'h-1.5 w-1.5',
  sm: 'h-2 w-2',
  md: 'h-2.5 w-2.5'
}

interface Props {
  variant: StatusVariant
  size?: StatusSize
  pulse?: boolean
  className?: string
  title?: string
}

export function StatusDot({
  variant,
  size = 'sm',
  pulse = false,
  className,
  title
}: Props): JSX.Element {
  return (
    <span
      title={title}
      aria-hidden={!title}
      className={cn(
        'inline-block shrink-0 rounded-full',
        SIZE_CLASSES[size],
        VARIANT_CLASSES[variant],
        pulse && (variant === 'unread' || variant === 'syncing') && 'animate-pulse-soft',
        className
      )}
    />
  )
}
