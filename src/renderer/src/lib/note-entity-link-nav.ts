import type { NoteEntityLinkTarget } from '@shared/note-entity-links'
import type { AppShellMode } from '@/stores/app-mode'
import { useCalendarPendingFocusStore } from '@/stores/calendar-pending-focus'
import { useNotesPendingFocusStore } from '@/stores/notes-pending-focus'
import { useTasksPendingFocusStore } from '@/stores/tasks-pending-focus'
import { useMailPendingFocusStore } from '@/stores/mail-pending-focus'
import { persistTasksViewSelection } from '@/app/tasks/tasks-view-storage'

export async function openNoteEntityLinkTarget(
  target: NoteEntityLinkTarget,
  setAppMode: (mode: AppShellMode) => void
): Promise<void> {
  switch (target.kind) {
    case 'note':
      useNotesPendingFocusStore.getState().setPendingNoteId(target.noteId)
      setAppMode('notes')
      return
    case 'mail':
      useMailPendingFocusStore.getState().setPendingMessageId(target.messageId)
      setAppMode('mail')
      return
    case 'calendar_event': {
      setAppMode('calendar')
      try {
        const now = new Date()
        const start = new Date(now)
        start.setMonth(start.getMonth() - 6)
        const end = new Date(now)
        end.setMonth(end.getMonth() + 12)
        const events = await window.mailClient.calendar.listEvents({
          startIso: start.toISOString(),
          endIso: end.toISOString()
        })
        const ev = events.find(
          (row) =>
            row.accountId === target.accountId && row.graphEventId === target.graphEventId
        )
        if (ev) {
          useCalendarPendingFocusStore.getState().queueFocusEvent(ev)
        } else if (events[0]?.startIso) {
          useCalendarPendingFocusStore.getState().queueGotoDate(events[0].startIso.slice(0, 10))
        }
      } catch {
        /* Kalender oeffnen; Termin ggf. nicht im Cache */
      }
      return
    }
    case 'cloud_task':
      useTasksPendingFocusStore.getState().queueTask({
        accountId: target.accountId,
        listId: target.listId,
        taskId: target.taskId
      })
      persistTasksViewSelection({
        kind: 'list',
        accountId: target.accountId,
        listId: target.listId
      })
      setAppMode('tasks')
      return
    default:
      return
  }
}
