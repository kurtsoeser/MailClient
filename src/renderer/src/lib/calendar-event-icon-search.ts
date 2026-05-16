import type { CalendarEventIconCatalogEntry } from '@/lib/calendar-event-icons'

function normalizeQuery(q: string): string[] {
  return q
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
}

/** Filtert Katalogeinträge (alle Wörter müssen im Suchindex vorkommen). */
export function filterCalendarEventIconCatalog(
  icons: readonly CalendarEventIconCatalogEntry[],
  query: string,
  extraSearchText?: (id: string) => string
): CalendarEventIconCatalogEntry[] {
  const words = normalizeQuery(query)
  if (words.length === 0) return [...icons]
  return icons.filter((entry) => {
    const haystack = `${entry.s} ${extraSearchText?.(entry.id) ?? ''}`.toLowerCase()
    return words.every((w) => haystack.includes(w))
  })
}

export function pickRandomCalendarEventIconId(
  icons: readonly CalendarEventIconCatalogEntry[]
): string | undefined {
  if (icons.length === 0) return undefined
  return icons[Math.floor(Math.random() * icons.length)]!.id
}
