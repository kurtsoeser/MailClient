import {
  BookOpen,
  Briefcase,
  Building2,
  Calendar,
  Folder,
  GraduationCap,
  Heart,
  Home,
  Landmark,
  MapPin,
  Music,
  Plane,
  Star,
  Users,
  type LucideIcon
} from 'lucide-react'

/** Persistierte Icon-IDs für globale Kalender-Sections. */
export const CALENDAR_SECTION_ICON_IDS = [
  'folder',
  'home',
  'briefcase',
  'building',
  'graduation-cap',
  'book-open',
  'music',
  'calendar',
  'star',
  'heart',
  'users',
  'map-pin',
  'plane',
  'landmark'
] as const

export type CalendarSectionIconId = (typeof CALENDAR_SECTION_ICON_IDS)[number]

const ICON_BY_ID: Record<CalendarSectionIconId, LucideIcon> = {
  folder: Folder,
  home: Home,
  briefcase: Briefcase,
  building: Building2,
  'graduation-cap': GraduationCap,
  'book-open': BookOpen,
  music: Music,
  calendar: Calendar,
  star: Star,
  heart: Heart,
  users: Users,
  'map-pin': MapPin,
  plane: Plane,
  landmark: Landmark
}

export function isCalendarSectionIconId(id: string): id is CalendarSectionIconId {
  return (CALENDAR_SECTION_ICON_IDS as readonly string[]).includes(id)
}

export function resolveCalendarSectionIcon(iconId: string | undefined): LucideIcon {
  if (iconId && isCalendarSectionIconId(iconId)) return ICON_BY_ID[iconId]
  return Folder
}
