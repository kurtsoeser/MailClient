import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { CalendarEventView, ConnectedAccount, UserNote } from '@shared/types'
import type { NoteEntityLinkTarget } from '@shared/note-entity-links'
import { CalendarEventPreview } from '@/app/calendar/CalendarEventPreview'
import { CloudTaskItemPreview } from '@/app/calendar/CloudTaskItemPreview'
import type { TaskItemWithContext } from '@/app/tasks/tasks-types'
import { ReadingPane } from '@/app/layout/ReadingPane'
import { formatNoteDate, noteTitle } from '@/app/notes/notes-display-helpers'
import { NoteDisplayIcon } from '@/components/NoteDisplayIcon'
import { RichTextNotesPreview } from '@/components/RichTextNotesPreview'
import { useThemeStore } from '@/stores/theme'
import { useMailStore } from '@/stores/mail'

export function NotesLinkedItemPreview({
  target,
  accounts,
  editingNoteId,
  editingMessageId,
  editingNoteKind
}: {
  target: NoteEntityLinkTarget
  accounts: ConnectedAccount[]
  editingNoteId: number
  editingMessageId: number | null
  editingNoteKind: UserNote['kind']
}): JSX.Element {
  const { t, i18n } = useTranslation()
  const viewerTheme = useThemeStore((s) => s.effective)
  const selectMessageWithThreadPreview = useMailStore((s) => s.selectMessageWithThreadPreview)
  const clearSelectedMessage = useMailStore((s) => s.clearSelectedMessage)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [linkedNote, setLinkedNote] = useState<UserNote | null>(null)
  const [calendarEvent, setCalendarEvent] = useState<CalendarEventView | null>(null)
  const [cloudTask, setCloudTask] = useState<TaskItemWithContext | null>(null)

  useEffect(() => {
    if (target.kind !== 'mail') return
    void selectMessageWithThreadPreview(target.messageId)
    return (): void => {
      if (editingNoteKind === 'mail' && editingMessageId != null) {
        void selectMessageWithThreadPreview(editingMessageId)
      } else {
        clearSelectedMessage()
      }
    }
  }, [
    target,
    editingMessageId,
    editingNoteKind,
    selectMessageWithThreadPreview,
    clearSelectedMessage
  ])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setLinkedNote(null)
    setCalendarEvent(null)
    setCloudTask(null)

    void (async (): Promise<void> => {
      try {
        if (target.kind === 'note') {
          if (target.noteId === editingNoteId) {
            setError(t('notes.preview.selfLink'))
            return
          }
          const note = await window.mailClient.notes.getById(target.noteId)
          if (!cancelled) setLinkedNote(note)
          return
        }

        if (target.kind === 'calendar_event') {
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
          if (!cancelled) setCalendarEvent(ev ?? null)
          return
        }

        if (target.kind === 'cloud_task') {
          const rows = await window.mailClient.tasks.listTasks({
            accountId: target.accountId,
            listId: target.listId,
            showCompleted: true,
            cacheOnly: true
          })
          const row = rows.find((r) => r.id === target.taskId)
          if (!row) {
            if (!cancelled) setCloudTask(null)
            return
          }
          const account = accounts.find((a) => a.id === target.accountId)
          const lists = await window.mailClient.tasks.listLists({ accountId: target.accountId })
          const listName = lists.find((l) => l.id === target.listId)?.name ?? ''
          if (!cancelled) {
            setCloudTask({
              ...row,
              accountId: target.accountId,
              listName
            })
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return (): void => {
      cancelled = true
    }
  }, [target, accounts, editingNoteId, t])

  const accountLabel = useMemo((): string | null => {
    if (target.kind !== 'calendar_event' && target.kind !== 'cloud_task') return null
    return accounts.find((a) => a.id === target.accountId)?.displayName ?? target.accountId
  }, [target, accounts])

  if (target.kind === 'mail') {
    return (
      <ReadingPane
        hideChromeWhenEmpty
        emptySelectionTitle={t('notes.shell.linkedMailTitle')}
        emptySelectionBody={t('notes.shell.linkedMailEmpty')}
      />
    )
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 p-6 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t('notes.preview.loading')}
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center text-xs text-destructive">
        {error}
      </div>
    )
  }

  if (target.kind === 'note') {
    if (!linkedNote) {
      return (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-xs text-muted-foreground">
          {t('notes.preview.noteNotFound')}
        </div>
      )
    }
    const title = noteTitle(linkedNote, t('notes.shell.untitled'))
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        <div className="flex items-start gap-2">
          <NoteDisplayIcon note={linkedNote} className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-foreground">{title}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {t(`notes.kind.${linkedNote.kind}`)}
              {' · '}
              {formatNoteDate(linkedNote.updatedAt, i18n.language)}
            </div>
          </div>
        </div>
        {linkedNote.body.trim() ? (
          <RichTextNotesPreview notes={linkedNote.body} viewerTheme={viewerTheme} />
        ) : (
          <p className="text-xs text-muted-foreground">{t('notes.shell.emptyBody')}</p>
        )}
      </div>
    )
  }

  if (target.kind === 'calendar_event') {
    if (!calendarEvent) {
      return (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-xs text-muted-foreground">
          {t('notes.preview.eventNotFound')}
        </div>
      )
    }
    return (
      <CalendarEventPreview
        event={calendarEvent}
        calendarName={accountLabel}
        onEdit={(): void => undefined}
      />
    )
  }

  if (target.kind === 'cloud_task') {
    if (!cloudTask) {
      return (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-xs text-muted-foreground">
          {t('notes.preview.taskNotFound')}
        </div>
      )
    }
    return (
      <CloudTaskItemPreview task={cloudTask} accountDisplayName={accountLabel ?? undefined} />
    )
  }

  return (
    <div className="flex flex-1 items-center justify-center p-6 text-xs text-muted-foreground">
      {t('notes.preview.unsupported')}
    </div>
  )
}
