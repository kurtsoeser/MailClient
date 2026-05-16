import type { WorkItem } from '@shared/work-item'
import type { AppShellMode } from '@/stores/app-mode'
import { useCalendarPendingFocusStore } from '@/stores/calendar-pending-focus'
import { persistCalendarContentViewMode } from '@/app/calendar/calendar-content-view-mode-storage'

/** Effektives Datum für Kalender-Sprung: Planung > Fälligkeit > Empfang (Mail). */
export function resolveWorkItemGotoDateIso(item: WorkItem): string | null {
  const planned = item.planned.plannedStartIso?.trim()
  if (planned) {
    if (/^\d{4}-\d{2}-\d{2}/.test(planned)) return planned.slice(0, 10)
    try {
      const d = new Date(planned)
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
    } catch {
      // fall through
    }
  }
  const due = item.dueAtIso?.trim()
  if (due) {
    if (/^\d{4}-\d{2}-\d{2}/.test(due)) return due.slice(0, 10)
    try {
      const d = new Date(due)
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
    } catch {
      // fall through
    }
  }
  if (item.kind === 'mail_todo') {
    const recv = item.mail.receivedAt?.trim() || item.mail.sentAt?.trim()
    if (recv && /^\d{4}-\d{2}-\d{2}/.test(recv)) return recv.slice(0, 10)
  }
  return null
}

export function openWorkItemInCalendar(
  item: WorkItem,
  setAppMode: (mode: AppShellMode) => void
): void {
  persistCalendarContentViewMode('calendar')
  if (item.kind === 'calendar_event') {
    useCalendarPendingFocusStore.getState().queueFocusEvent(item.event)
    setAppMode('calendar')
    return
  }
  const dateIso = resolveWorkItemGotoDateIso(item)
  if (dateIso) {
    useCalendarPendingFocusStore.getState().queueGotoDate(dateIso)
  }
  setAppMode('calendar')
}

export function openCalendarEventInCalendar(
  item: Extract<WorkItem, { kind: 'calendar_event' }>,
  setAppMode: (mode: AppShellMode) => void
): void {
  persistCalendarContentViewMode('calendar')
  useCalendarPendingFocusStore.getState().queueFocusEvent(item.event)
  setAppMode('calendar')
}
