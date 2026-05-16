import { Calendar, icons, type LucideIcon } from 'lucide-react'
import catalogJson from '@/lib/generated/calendar-event-icon-catalog.json'

export type CalendarEventIconCatalogEntry = {
  id: string
  /** Anzeigename (Englisch, aus Lucide). */
  l: string
  /** Suchindex (kleingeschrieben). */
  s: string
}

type IconCatalogFile = {
  version: number
  icons: CalendarEventIconCatalogEntry[]
}

const catalogFile = catalogJson as IconCatalogFile

/** Alle wählbaren Icon-IDs (Lucide + Legacy-Aliase). */
export const CALENDAR_EVENT_ICON_CATALOG: readonly CalendarEventIconCatalogEntry[] = catalogFile.icons

const CATALOG_BY_ID = new Map(CALENDAR_EVENT_ICON_CATALOG.map((e) => [e.id, e]))

export const CALENDAR_EVENT_ICON_IDS = CALENDAR_EVENT_ICON_CATALOG.map((e) => e.id) as readonly string[]

export type CalendarEventIconId = string

/**
 * Ältere gespeicherte IDs → Lucide-Komponentenname (PascalCase).
 * Abweichend vom automatischen kebab→Pascal-Mapping.
 */
const LEGACY_LUCIDE_NAME: Record<string, string> = {
  'first-aid': 'Stethoscope',
  soccer: 'CircleDot',
  sneaker: 'Footprints',
  party: 'PartyPopper',
  dining: 'Utensils',
  meeting: 'Video',
  buildings: 'Building2',
  notes: 'NotebookPen',
  card: 'CreditCard',
  stopwatch: 'Timer',
  'palm-tree': 'TreePalm',
  'graduation-cap': 'GraduationCap',
  'book-open': 'BookOpen',
  'map-pin': 'MapPin'
}

function kebabToPascal(kebab: string): string {
  return kebab
    .split('-')
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : ''))
    .join('')
}

function lucideNameForIconId(iconId: string): string {
  return LEGACY_LUCIDE_NAME[iconId] ?? kebabToPascal(iconId)
}

export function isCalendarEventIconId(id: string): boolean {
  return CATALOG_BY_ID.has(id.trim())
}

export function getCalendarEventIconCatalogEntry(
  iconId: string | undefined | null
): CalendarEventIconCatalogEntry | null {
  const id = iconId?.trim()
  if (!id) return null
  return CATALOG_BY_ID.get(id) ?? null
}

export function resolveCalendarEventIcon(iconId: string | undefined | null): LucideIcon {
  const id = iconId?.trim()
  if (!id) return Calendar
  const pascal = lucideNameForIconId(id)
  const Icon = icons[pascal as keyof typeof icons]
  if (Icon) return Icon
  return Calendar
}

/** Kein Icon in der Kalender-Zelle (Standard-Termin ohne Auswahl). */
export function calendarEventIconIsExplicit(iconId: string | undefined | null): boolean {
  const id = iconId?.trim()
  if (!id) return false
  if (id === 'calendar') return false
  return isCalendarEventIconId(id)
}

export function calendarEventIconLabel(
  iconId: string,
  translate?: (key: string) => string
): string {
  const entry = getCalendarEventIconCatalogEntry(iconId)
  if (translate) {
    const key = `calendar.eventIcon.${iconId}`
    const localized = translate(key)
    if (localized !== key) return localized
  }
  return entry?.l ?? iconId.replace(/-/g, ' ')
}
