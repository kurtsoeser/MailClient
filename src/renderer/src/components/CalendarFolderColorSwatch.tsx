import { Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Gefuellte Farbflaeche wie Terminkachel — nicht nur Outline-Stroke. */
export function CalendarFolderColorSwatch({
  hex,
  className
}: {
  hex: string | null | undefined
  className?: string
}): JSX.Element {
  if (!hex) {
    return <Calendar className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground/90', className)} aria-hidden />
  }
  return (
    <span
      className={cn(
        'inline-block h-3.5 w-3.5 shrink-0 rounded-[4px] border border-black/15 shadow-sm',
        className
      )}
      style={{ backgroundColor: hex }}
      aria-hidden
    />
  )
}
