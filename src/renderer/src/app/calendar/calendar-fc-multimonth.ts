import type { EventContentArg, EventInput, EventMountArg } from '@fullcalendar/core'
import { tailwindAccountBgToHex } from '@/lib/calendar-event-chip-style'
import { QUICK_CREATE_PLACEHOLDER_EVENT_ID } from '@/app/calendar/calendar-quick-create-placeholder'

/** FullCalendar Multi-Month-Ansichten (Jahr / mehrere Monate). */
export const MULTI_MONTH_YEAR_VIEW_ID = 'multiMonthYear'
export const MULTI_MONTH_QUARTER_VIEW_ID = 'multiMonthQuarter'

/** Obergrenze FC-Events in der Jahresuebersicht (sonst UI-Freeze). */
export const MULTI_MONTH_YEAR_EVENT_CAP = 900
export const MULTI_MONTH_QUARTER_EVENT_CAP = 500

const MULTI_MONTH_VIEW_IDS = new Set([MULTI_MONTH_YEAR_VIEW_ID, MULTI_MONTH_QUARTER_VIEW_ID])

export function isMultiMonthFcView(viewType: string): boolean {
  return MULTI_MONTH_VIEW_IDS.has(viewType)
}

/** Mail-/Aufgaben-Layer in der Jahresansicht weglassen (weniger DOM + IPC). */
export function shouldSkipHeavyCalendarLayersForMultiMonth(viewType: string): boolean {
  return viewType === MULTI_MONTH_YEAR_VIEW_ID
}

export function multiMonthDatesSetKey(viewType: string, start: Date, end: Date): string {
  return `${viewType}|${start.getTime()}|${end.getTime()}`
}

function eventStartSortKey(ev: EventInput): string {
  const s = ev.start
  if (s == null) return ''
  if (s instanceof Date) return s.toISOString()
  if (Array.isArray(s)) return String(s[0] ?? '')
  return String(s)
}

/** Begrenzt die Anzahl der gerenderten Termine in Multi-Month-Ansichten. */
export function capEventInputsForMultiMonthView(
  events: EventInput[],
  viewType: string
): EventInput[] {
  const cap =
    viewType === MULTI_MONTH_YEAR_VIEW_ID
      ? MULTI_MONTH_YEAR_EVENT_CAP
      : viewType === MULTI_MONTH_QUARTER_VIEW_ID
        ? MULTI_MONTH_QUARTER_EVENT_CAP
        : null
  if (cap == null || events.length <= cap) return events
  return [...events]
    .sort((a, b) => eventStartSortKey(a).localeCompare(eventStartSortKey(b)))
    .slice(0, cap)
}

/** Nur farbiger Punkt — keine Titel/Zeiten in der Übersicht. */
export function multiMonthFcEventContent(arg: EventContentArg): { domNodes: Node[] } {
  if (arg.event.id === QUICK_CREATE_PLACEHOLDER_EVENT_ID || arg.isMirror) {
    return { domNodes: [] }
  }
  const dot = document.createElement('span')
  dot.className = 'fc-cal-multimonth-dot'
  dot.setAttribute('aria-hidden', 'true')
  return { domNodes: [dot] }
}

function resolveEventFillHex(info: EventMountArg): string | null {
  const fromExt = info.event.extendedProps.displayColorHex as string | null | undefined
  if (typeof fromExt === 'string' && fromExt.trim()) {
    return fromExt.trim()
  }
  const tw = info.event.extendedProps.accountColor as string | undefined
  return tailwindAccountBgToHex(tw ?? undefined)
}

/** Punkt-Optik auf dem FC-Event-Wrapper (Farbe aus Kalender/Konto). */
export function applyMultiMonthEventDotMount(info: EventMountArg): void {
  const el = info.el as HTMLElement
  el.classList.add('fc-cal-multimonth-event')
  const fill = resolveEventFillHex(info)
  if (fill) {
    el.style.setProperty('--fc-cal-multimonth-dot-color', fill)
  }
}
