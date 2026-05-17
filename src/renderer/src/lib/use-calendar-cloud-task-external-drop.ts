import { useLayoutEffect, type RefObject } from 'react'
import {
  appointmentRangeFromCalendarSlot,
  defaultAppointmentRangeForCalendarDay
} from '@/lib/zoned-iso-date'
import {
  dataTransferLooksLikeCloudTaskDrag,
  readCloudTaskDragPayload,
  type CloudTaskDragPayload
} from '@/app/tasks/tasks-cloud-task-dnd'

const DEFAULT_APPOINTMENT_MINUTES = 30

/**
 * Externes Drag&Drop von Cloud-Aufgaben auf den FullCalendar-Bereich (Planung + Due).
 */
export function useCalendarCloudTaskExternalDrop(
  rootRef: RefObject<HTMLElement | null>,
  options: {
    timeZone: string
    enabled: boolean
    onSchedulePlanned: (payload: CloudTaskDragPayload, startIso: string, endIso: string) => Promise<void>
  }
): void {
  const { timeZone, enabled, onSchedulePlanned } = options

  useLayoutEffect(() => {
    if (!enabled) return
    const root = rootRef.current
    if (!root) return

    const findDateHostFromElement = (start: Element | null): HTMLElement | null => {
      const el = start as HTMLElement | null
      if (!el) return null
      return (
        el.closest('td.fc-timegrid-col[data-date]') ||
        el.closest('td.fc-daygrid-day[data-date]') ||
        el.closest('.fc-daygrid-day[data-date]') ||
        el.closest('th.fc-col-header-cell[data-date]') ||
        el.closest('.fc-daygrid-body td[data-date]') ||
        null
      )
    }

    const findDateHostForDrop = (
      target: EventTarget | null,
      clientX: number,
      clientY: number
    ): HTMLElement | null => {
      const tryOne = (node: Element | null): HTMLElement | null => {
        const cell = findDateHostFromElement(node)
        return cell && root.contains(cell) ? cell : null
      }
      let cell = tryOne(target as Element | null)
      if (cell) return cell
      for (const node of document.elementsFromPoint(clientX, clientY)) {
        if (!root.contains(node)) continue
        cell = tryOne(node)
        if (cell) return cell
      }
      return null
    }

    const scheduleRangeFromDrop = (
      clientX: number,
      clientY: number,
      dateStr: string,
      fcTimeZone: string
    ): { startIso: string; endIso: string } => {
      for (const node of document.elementsFromPoint(clientX, clientY)) {
        if (!(node instanceof HTMLElement) || !root.contains(node)) continue
        if (node.closest('.fc-timegrid-axis')) continue
        const t = node.getAttribute('data-time')
        if (t && /^\d{1,2}:\d{2}/.test(t)) {
          return appointmentRangeFromCalendarSlot(
            dateStr,
            t,
            fcTimeZone,
            DEFAULT_APPOINTMENT_MINUTES
          )
        }
      }
      return defaultAppointmentRangeForCalendarDay(dateStr, fcTimeZone, 9, DEFAULT_APPOINTMENT_MINUTES)
    }

    const onDragHover = (e: DragEvent): void => {
      if (!e.dataTransfer || !dataTransferLooksLikeCloudTaskDrag(e.dataTransfer)) return
      const cell = findDateHostForDrop(e.target, e.clientX, e.clientY)
      if (!cell) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
    }

    const onDrop = (e: DragEvent): void => {
      if (!e.dataTransfer || !dataTransferLooksLikeCloudTaskDrag(e.dataTransfer)) return
      const cell = findDateHostForDrop(e.target, e.clientX, e.clientY)
      if (!cell) return
      const payload = readCloudTaskDragPayload(e.dataTransfer)
      if (!payload) return
      e.preventDefault()
      e.stopPropagation()
      const dateStr = cell.getAttribute('data-date')
      if (!dateStr) return
      const range = scheduleRangeFromDrop(e.clientX, e.clientY, dateStr, timeZone)
      void (async (): Promise<void> => {
        try {
          await onSchedulePlanned(payload, range.startIso, range.endIso)
        } catch {
          /* still */
        }
      })()
    }

    const cap = { capture: true, passive: false } as const
    root.addEventListener('dragenter', onDragHover, cap)
    root.addEventListener('dragover', onDragHover, cap)
    root.addEventListener('drop', onDrop, { capture: true })
    return () => {
      root.removeEventListener('dragenter', onDragHover, cap)
      root.removeEventListener('dragover', onDragHover, cap)
      root.removeEventListener('drop', onDrop, { capture: true })
    }
  }, [rootRef, timeZone, enabled, onSchedulePlanned])
}
