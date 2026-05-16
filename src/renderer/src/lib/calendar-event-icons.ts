import {
  Bike,
  BookOpen,
  Building2,
  Bus,
  Cake,
  Calendar,
  Car,
  Check,
  CircleDot,
  Clapperboard,
  ClipboardList,
  CreditCard,
  Dumbbell,
  Footprints,
  GraduationCap,
  Heart,
  Home,
  Luggage,
  MapPin,
  Music,
  NotebookPen,
  PartyPopper,
  Pill,
  Plane,
  Star,
  Stethoscope,
  Target,
  Ticket,
  Timer,
  TreePalm,
  Trophy,
  Truck,
  Tv,
  User,
  Users,
  Utensils,
  Video,
  Wrench,
  type LucideIcon
} from 'lucide-react'

/** Persistierte Icon-IDs für Kalender-Termine (lokal, nicht Graph/Google). */
export const CALENDAR_EVENT_ICON_IDS = [
  'car',
  'plane',
  'luggage',
  'bus',
  'bike',
  'truck',
  'trophy',
  'music',
  'soccer',
  'film',
  'book-open',
  'dumbbell',
  'sneaker',
  'target',
  'home',
  'users',
  'user',
  'party',
  'heart',
  'cake',
  'graduation-cap',
  'palm-tree',
  'clipboard',
  'first-aid',
  'pill',
  'stopwatch',
  'star',
  'dining',
  'tv',
  'ticket',
  'card',
  'buildings',
  'wrench',
  'check',
  'notes',
  'map-pin',
  'meeting',
  'calendar'
] as const

export type CalendarEventIconId = (typeof CALENDAR_EVENT_ICON_IDS)[number]

const ICON_BY_ID: Record<CalendarEventIconId, LucideIcon> = {
  car: Car,
  plane: Plane,
  luggage: Luggage,
  bus: Bus,
  bike: Bike,
  truck: Truck,
  trophy: Trophy,
  music: Music,
  soccer: CircleDot,
  film: Clapperboard,
  'book-open': BookOpen,
  dumbbell: Dumbbell,
  sneaker: Footprints,
  target: Target,
  home: Home,
  users: Users,
  user: User,
  party: PartyPopper,
  heart: Heart,
  cake: Cake,
  'graduation-cap': GraduationCap,
  'palm-tree': TreePalm,
  clipboard: ClipboardList,
  'first-aid': Stethoscope,
  pill: Pill,
  stopwatch: Timer,
  star: Star,
  dining: Utensils,
  tv: Tv,
  ticket: Ticket,
  card: CreditCard,
  buildings: Building2,
  wrench: Wrench,
  check: Check,
  notes: NotebookPen,
  'map-pin': MapPin,
  meeting: Video,
  calendar: Calendar
}

export function isCalendarEventIconId(id: string): id is CalendarEventIconId {
  return (CALENDAR_EVENT_ICON_IDS as readonly string[]).includes(id)
}

export function resolveCalendarEventIcon(iconId: string | undefined | null): LucideIcon {
  if (iconId && isCalendarEventIconId(iconId)) return ICON_BY_ID[iconId]
  return Calendar
}

/** Kein Icon in der Kalender-Zelle (Standard-Termin ohne Auswahl). */
export function calendarEventIconIsExplicit(iconId: string | undefined | null): boolean {
  return Boolean(iconId?.trim() && isCalendarEventIconId(iconId.trim()))
}
