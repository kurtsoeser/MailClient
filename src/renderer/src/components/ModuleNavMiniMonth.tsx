import type { ReactNode } from 'react'
import { MiniMonthGrid, type MiniMonthGridProps } from '@/app/calendar/MiniMonthGrid'
import { moduleNavColumnMiniMonthSectionClass } from '@/components/module-shell-layout'
import { cn } from '@/lib/utils'

export type ModuleNavMiniMonthProps = MiniMonthGridProps & {
  className?: string
  footer?: ReactNode
}

/** Mini-Monat in Modul-Nav-Spalten — gleiche Karte wie im Kalender-Modul (`MiniMonthGrid`). */
export function ModuleNavMiniMonth({
  className,
  footer,
  ...gridProps
}: ModuleNavMiniMonthProps): JSX.Element {
  return (
    <div className={cn(moduleNavColumnMiniMonthSectionClass, className)}>
      <MiniMonthGrid {...gridProps} />
      {footer}
    </div>
  )
}
