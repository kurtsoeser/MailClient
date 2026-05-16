import { cn } from '@/lib/utils'

/**
 * Erste Navigations-Spalte in Modulen (Mail-Ordner, Kalender, Kontakte, Aufgaben, Notizen).
 * Hintergrund immer `bg-sidebar` — hellere Karten (Mini-Monat) nutzen `bg-card` in MiniMonthGrid.
 */
export const moduleNavColumnClass =
  'flex h-full min-h-0 shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-foreground'

/** Scrollbarer Inhalt unter Kopfzeile / Mini-Monat. */
export const moduleNavColumnScrollClass = 'min-h-0 flex-1 overflow-y-auto overflow-x-hidden'

/** Einheitliche Innenabstände wie Kalender-Sidebar (Mini-Monat + Listen). */
export const moduleNavColumnInsetClass = 'space-y-4 px-3 py-4'

/** Wrapper um {@link MiniMonthGrid} in der Nav-Spalte (ohne zusätzliche Karte). */
export const moduleNavColumnMiniMonthSectionClass = 'shrink-0'

export function moduleNavColumnClassNames(...extra: (string | false | null | undefined)[]): string {
  return cn(moduleNavColumnClass, ...extra)
}
