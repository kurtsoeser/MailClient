import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  calendarEventIconIsExplicit,
  resolveCalendarEventIcon
} from '@/lib/calendar-event-icons'

/** SVG-Markup für FullCalendar-Event-Inhalt (DOM, kein React-Root). */
export function calendarEventIconSvgMarkup(
  iconId: string | undefined | null,
  className: string
): string | null {
  if (!calendarEventIconIsExplicit(iconId)) return null
  const Icon = resolveCalendarEventIcon(iconId)
  return renderToStaticMarkup(
    createElement(Icon, {
      className,
      size: 14,
      strokeWidth: 2,
      'aria-hidden': true
    })
  )
}

export function appendCalendarEventIconSvg(
  parent: HTMLElement,
  iconId: string | undefined | null,
  className: string
): void {
  const markup = calendarEventIconSvgMarkup(iconId, className)
  if (!markup) return
  const tpl = document.createElement('template')
  tpl.innerHTML = markup.trim()
  const svg = tpl.content.firstElementChild
  if (svg) parent.appendChild(svg)
}
