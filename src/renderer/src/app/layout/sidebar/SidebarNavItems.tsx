import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

export function SidebarCollapsibleSection({
  title,
  children,
  defaultOpen = true
}: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}): JSX.Element {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={(): void => setOpen((v) => !v)}
        className="mb-1 flex w-full items-center gap-1 rounded px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground hover:bg-secondary/40 hover:text-foreground"
      >
        {open ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <span>{title}</span>
      </button>
      {open && <ul className="space-y-0.5">{children}</ul>}
    </div>
  )
}

export function SidebarNavItem({
  icon: Icon,
  iconClass,
  label,
  count,
  disabled,
  onClick,
  onContextMenu,
  isSelected
}: {
  icon: React.ComponentType<{ className?: string }>
  iconClass?: string
  label: string
  count?: number
  disabled?: boolean
  onClick?: () => void
  onContextMenu?: (e: React.MouseEvent) => void
  isSelected?: boolean
}): JSX.Element {
  const inactive = disabled === true || !onClick
  return (
    <li>
      <button
        type="button"
        disabled={inactive}
        onClick={onClick}
        onContextMenu={onContextMenu}
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
          inactive
            ? 'cursor-not-allowed text-muted-foreground/60'
            : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
          isSelected && 'bg-secondary/80 text-foreground'
        )}
      >
        <Icon className={cn('h-3.5 w-3.5 shrink-0', iconClass)} />
        <span className="flex-1 truncate text-left">{label}</span>
        {count !== undefined && count > 0 && (
          <span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums text-muted-foreground">
            {count}
          </span>
        )}
      </button>
    </li>
  )
}

