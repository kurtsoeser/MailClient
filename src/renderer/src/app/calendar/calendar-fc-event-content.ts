import type { EventContentArg } from '@fullcalendar/core'
import type { CalendarEventView } from '@shared/types'
import { CALENDAR_KIND_CLOUD_TASK } from '@/app/calendar/cloud-task-calendar'
import { CALENDAR_KIND_MAIL_TODO } from '@/app/calendar/mail-todo-calendar'
import { appendCalendarEventIconSvg } from '@/lib/calendar-event-icon-markup'
import { calendarEventIconIsExplicit } from '@/lib/calendar-event-icons'

export type CalendarFcEntryKind = 'appointment' | 'mail' | 'task'

export type CalendarFcEventContentLabels = {
  appointment: string
  mail: string
  task: string
}

const SVG_NS = 'http://www.w3.org/2000/svg'

/** Lucide-ähnliche Pfade (24×24). */
const KIND_ICON_PATH: Record<CalendarFcEntryKind, string> = {
  appointment:
    'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  mail: 'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zm16 2-8 5.7a2 2 0 0 1-2.1 0L4 6',
  task: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z'
}

export function resolveCalendarFcEntryKind(arg: EventContentArg): CalendarFcEntryKind {
  const kind = arg.event.extendedProps.calendarKind as string | undefined
  if (kind === CALENDAR_KIND_MAIL_TODO) return 'mail'
  if (kind === CALENDAR_KIND_CLOUD_TASK) return 'task'
  return 'appointment'
}

function createKindIcon(kind: CalendarFcEntryKind, label: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('class', 'fc-cal-event-kind-icon')
  svg.setAttribute('role', 'img')
  svg.setAttribute('aria-label', label)
  svg.setAttribute('focusable', 'false')
  const path = document.createElementNS(SVG_NS, 'path')
  path.setAttribute('d', KIND_ICON_PATH[kind])
  path.setAttribute('fill', 'none')
  path.setAttribute('stroke', 'currentColor')
  path.setAttribute('stroke-width', '2')
  path.setAttribute('stroke-linecap', 'round')
  path.setAttribute('stroke-linejoin', 'round')
  svg.appendChild(path)
  return svg
}

/** Einheitlicher Event-Inhalt: Zeit, Titel, Art-Icon rechts oben. */
export function calendarFcEventContent(
  arg: EventContentArg,
  labels: CalendarFcEventContentLabels
): { domNodes: Node[] } {
  const entryKind = resolveCalendarFcEntryKind(arg)
  const root = document.createElement('div')
  root.className = 'fc-cal-event-custom'

  const body = document.createElement('div')
  body.className = 'fc-cal-event-custom-body'

  if (arg.timeText) {
    const timeEl = document.createElement('div')
    timeEl.className = 'fc-cal-event-custom-time'
    timeEl.textContent = arg.timeText
    body.appendChild(timeEl)
  }

  const titleRow = document.createElement('div')
  titleRow.className = 'fc-cal-event-custom-title-row'

  const calEv = arg.event.extendedProps.calendarEvent as CalendarEventView | undefined
  const eventIconId = calEv?.icon
  if (calendarEventIconIsExplicit(eventIconId)) {
    appendCalendarEventIconSvg(titleRow, eventIconId, 'fc-cal-event-custom-title-icon shrink-0')
  }

  const titleEl = document.createElement('span')
  titleEl.className = 'fc-cal-event-custom-title'
  titleEl.textContent = arg.event.title ?? ''
  titleRow.appendChild(titleEl)
  body.appendChild(titleRow)

  root.appendChild(body)
  const showKindIcon = entryKind !== 'appointment' || !calendarEventIconIsExplicit(eventIconId)
  if (showKindIcon) {
    root.appendChild(createKindIcon(entryKind, labels[entryKind]))
  }

  return { domNodes: [root] }
}
