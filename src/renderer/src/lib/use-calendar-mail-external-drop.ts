import { useLayoutEffect, type RefObject } from 'react'
import { DateTime } from 'luxon'
import { MIME_CLOUD_TASK_KEY } from '@/app/tasks/tasks-cloud-task-dnd'
import { MIME_THREAD_IDS, readDraggedWorkflowMessageIds } from '@/lib/workflow-dnd'

const DEFAULT_APPOINTMENT_MINUTES = 30

function endDateFromStart(start: Date, minutes: number): Date {
  return new Date(start.getTime() + minutes * 60 * 1000)
}

function defaultScheduleForCalendarDay(
  dateStr: string,
  fcTimeZone: string
): { startIso: string; endIso: string } {
  const zone = fcTimeZone === 'local' ? 'local' : fcTimeZone
  const start = DateTime.fromISO(`${dateStr}T09:00:00`, { zone })
  if (!start.isValid) {
    const d = new Date(`${dateStr}T09:00:00`)
    const end = endDateFromStart(d, DEFAULT_APPOINTMENT_MINUTES)
    return { startIso: d.toISOString(), endIso: end.toISOString() }
  }
  const end = start.plus({ minutes: DEFAULT_APPOINTMENT_MINUTES })
  return { startIso: start.toISO()!, endIso: end.toISO()! }
}

function dataTransferLooksLikeMailDrag(dt: DataTransfer): boolean {
  const types = Array.from(dt.types ?? [])
  if (types.includes(MIME_CLOUD_TASK_KEY)) return false
  return (
    types.includes(MIME_THREAD_IDS) ||
    types.includes('text/plain') ||
    types.includes('text/mailclient-message-id') ||
    types.includes('application/x-mailclient-message-id')
  )
}

/**
 * Externes Drag&Drop von Mails auf den FullCalendar-Bereich (lokale Terminierung, kein Graph-POST).
 */
export function useCalendarMailExternalDrop(
  rootRef: RefObject<HTMLElement | null>,
  options: {
    timeZone: string
    enabled: boolean
    onScheduleMany: (messageIds: number[], startIso: string, endIso: string) => Promise<void>
  }
): void {
  const { timeZone, enabled, onScheduleMany } = options

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

    const scheduleRangeFromInboxDrop = (
      clientX: number,
      clientY: number,
      dateStr: string,
      fcTimeZone: string
    ): { startIso: string; endIso: string } => {
      let slotTime: string | undefined
      for (const node of document.elementsFromPoint(clientX, clientY)) {
        if (!(node instanceof HTMLElement) || !root.contains(node)) continue
        if (node.closest('.fc-timegrid-axis')) continue
        const t = node.getAttribute('data-time')
        if (t && /^\d{1,2}:\d{2}/.test(t)) {
          slotTime = t
          break
        }
      }
      if (slotTime) {
        const zone = fcTimeZone === 'local' ? 'local' : fcTimeZone
        const normalized = slotTime.length <= 5 ? `${slotTime}:00` : slotTime
        const start = DateTime.fromISO(`${dateStr}T${normalized}`, { zone })
        if (start.isValid) {
          const end = start.plus({ minutes: DEFAULT_APPOINTMENT_MINUTES })
          return { startIso: start.toISO()!, endIso: end.toISO()! }
        }
      }
      return defaultScheduleForCalendarDay(dateStr, fcTimeZone)
    }

    const onDragHoverNative = (e: DragEvent): void => {
      if (!e.dataTransfer) return
      if (!dataTransferLooksLikeMailDrag(e.dataTransfer)) return
      const cell = findDateHostForDrop(e.target, e.clientX, e.clientY)
      if (!cell) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
    }

    const onDrop = (e: DragEvent): void => {
      if (!e.dataTransfer) return
      if (!dataTransferLooksLikeMailDrag(e.dataTransfer)) return
      const cell = findDateHostForDrop(e.target, e.clientX, e.clientY)
      if (!cell) return
      const dragged = readDraggedWorkflowMessageIds(e.dataTransfer)
      if (dragged.length === 0) return
      e.preventDefault()
      e.stopPropagation()
      const dateStr = cell.getAttribute('data-date')
      if (!dateStr) return
      const range = scheduleRangeFromInboxDrop(e.clientX, e.clientY, dateStr, timeZone)
      void (async (): Promise<void> => {
        try {
          await onScheduleMany(dragged, range.startIso, range.endIso)
        } catch {
          /* still */
        }
      })()
    }

    const capHover = { capture: true, passive: false } as const
    root.addEventListener('dragenter', onDragHoverNative, capHover)
    root.addEventListener('dragover', onDragHoverNative, capHover)
    root.addEventListener('drop', onDrop, { capture: true })
    return () => {
      root.removeEventListener('dragenter', onDragHoverNative, capHover)
      root.removeEventListener('dragover', onDragHoverNative, capHover)
      root.removeEventListener('drop', onDrop, { capture: true })
    }
  }, [rootRef, timeZone, enabled, onScheduleMany])
}
