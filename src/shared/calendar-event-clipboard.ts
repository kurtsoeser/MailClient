import { addDays, format, parseISO } from 'date-fns'
import type { Locale } from 'date-fns'
import type { CalendarEventView } from './types'

export type CalendarEventClipboardLabels = {
  noTitle: string
  allDayPrefix: string
  location: string
  organizer: string
  teams: string
  link: string
}

const DE_LABELS: CalendarEventClipboardLabels = {
  noTitle: '(Ohne Titel)',
  allDayPrefix: 'Ganztägig',
  location: 'Ort:',
  organizer: 'Organisator:',
  teams: 'Teams:',
  link: 'Link:'
}

const EN_LABELS: CalendarEventClipboardLabels = {
  noTitle: '(No title)',
  allDayPrefix: 'All day',
  location: 'Location:',
  organizer: 'Organizer:',
  teams: 'Teams:',
  link: 'Link:'
}

export function calendarEventClipboardLabels(localeCode: 'de' | 'en'): CalendarEventClipboardLabels {
  return localeCode === 'de' ? DE_LABELS : EN_LABELS
}

export function formatCalendarEventClipboardText(
  ev: CalendarEventView,
  labels: CalendarEventClipboardLabels,
  locale: Locale,
  isDe: boolean
): string {
  const title = ev.title?.trim() ? ev.title : labels.noTitle
  const lines: string[] = [title]
  try {
    if (ev.isAllDay) {
      const s = parseISO(ev.startIso.length <= 10 ? `${ev.startIso}T12:00:00` : ev.startIso)
      const endEx = parseISO(ev.endIso.length <= 10 ? `${ev.endIso}T12:00:00` : ev.endIso)
      const last = addDays(endEx, -1)
      if (format(s, 'yyyy-MM-dd') === format(last, 'yyyy-MM-dd')) {
        lines.push(
          `${labels.allDayPrefix} ${format(s, isDe ? 'EEEE, d. MMMM yyyy' : 'EEEE, MMMM d, yyyy', { locale })}`
        )
      } else {
        lines.push(
          `${labels.allDayPrefix} ${format(s, isDe ? 'd. MMM yyyy' : 'MMM d, yyyy', { locale })} – ${format(last, isDe ? 'd. MMM yyyy' : 'MMM d, yyyy', { locale })}`
        )
      }
    } else {
      const s = parseISO(ev.startIso)
      const e = parseISO(ev.endIso)
      if (isDe) {
        lines.push(
          `${format(s, 'EEEE, d. MMMM yyyy, HH:mm', { locale })} – ${format(e, 'HH:mm', { locale })} Uhr`
        )
      } else {
        lines.push(
          `${format(s, 'EEEE, MMMM d, yyyy, h:mm a', { locale })} – ${format(e, 'h:mm a', { locale })}`
        )
      }
    }
  } catch {
    lines.push(`${ev.startIso} – ${ev.endIso}`)
  }
  if (ev.location?.trim()) lines.push(`${labels.location} ${ev.location}`)
  if (ev.organizer?.trim()) lines.push(`${labels.organizer} ${ev.organizer}`)
  if (ev.joinUrl?.trim()) lines.push(`${labels.teams} ${ev.joinUrl}`)
  else if (ev.webLink?.trim()) lines.push(`${labels.link} ${ev.webLink}`)
  return lines.join('\n')
}
