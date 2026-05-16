import type { ReactNode } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export function MenuSectionTitle({ children }: { children: string }): JSX.Element {
  return (
    <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </div>
  )
}

export function MenuDivider(): JSX.Element {
  return <div className="my-1 border-t border-border/80" role="separator" />
}

export function MenuRow({
  selected,
  onPick,
  disabled,
  title,
  suffix,
  children
}: {
  selected?: boolean
  onPick?: () => void
  disabled?: boolean
  title?: string
  suffix?: ReactNode
  children: React.ReactNode
}): JSX.Element {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={onPick}
      className={cn(
        'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors',
        disabled
          ? 'cursor-not-allowed text-muted-foreground/50'
          : selected
            ? 'bg-secondary text-foreground'
            : 'text-foreground hover:bg-secondary/70'
      )}
    >
      <span className="flex w-4 shrink-0 justify-center">
        {selected && !disabled ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
      </span>
      <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
        <span className="min-w-0 leading-snug">{children}</span>
        {suffix != null ? (
          <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground">{suffix}</span>
        ) : null}
      </span>
    </button>
  )
}
