import { cn } from '@/lib/utils'
import { resolvedAccountColorCss } from '@/lib/avatar-color'

/** Vertikale Konto-Farbleiste (ersetzt fruehere `before:bg-*`-Tailwind-Pattern). */
export function AccountColorStripe({
  color,
  className
}: {
  color: string
  className?: string
}): JSX.Element {
  return (
    <span
      aria-hidden
      className={cn('pointer-events-none absolute', className)}
      style={{ backgroundColor: resolvedAccountColorCss(color) }}
    />
  )
}
