import { cn } from '@/lib/utils'

export interface FilterTabOption<T extends string> {
  id: T
  label: string
  count?: number
}

interface Props<T extends string> {
  value: T
  options: FilterTabOption<T>[]
  onChange: (id: T) => void
  className?: string
  ariaLabel?: string
}

/**
 * Segmented-Control im Stil von Front/Dappr/BOXMAIL fuer Filter-Tabs
 * ueber Listen. Aktives Element bekommt einen weichen Akzent-Hintergrund
 * + Akzent-Underline, inaktive bleiben rein textbasiert.
 */
export function FilterTabs<T extends string>({
  value,
  options,
  onChange,
  className,
  ariaLabel
}: Props<T>): JSX.Element {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('flex items-center gap-1', className)}
    >
      {options.map((opt) => {
        const active = opt.id === value
        return (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={(): void => onChange(opt.id)}
            className={cn(
              'group relative inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors',
              active
                ? 'bg-secondary text-foreground'
                : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
            )}
          >
            <span>{opt.label}</span>
            {opt.count !== undefined && opt.count > 0 && (
              <span
                className={cn(
                  'rounded-full px-1.5 text-[10px] tabular-nums leading-4',
                  active
                    ? 'bg-primary/15 text-primary'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {opt.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
