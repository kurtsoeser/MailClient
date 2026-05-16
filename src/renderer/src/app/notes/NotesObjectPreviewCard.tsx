import { CalendarDays, Mail, Paperclip } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { UserNoteListItem } from '@shared/types'
import { formatNoteDate } from '@/app/notes/notes-display-helpers'

export function NotesObjectPreviewCard({
  note,
  accountLabel,
  locale
}: {
  note: UserNoteListItem
  accountLabel: string | null
  locale: string
}): JSX.Element | null {
  const { t } = useTranslation()
  if (note.kind === 'standalone') return null

  if (note.kind === 'mail') {
    const subject = note.mailSubject?.trim() || t('common.noSubject')
    const sender = note.mailFromName?.trim() || note.mailFromAddr?.trim() || accountLabel || t('common.unknown')
    const date = note.mailReceivedAt ?? note.mailSentAt
    return (
      <div className="rounded-lg border border-border bg-background/70 p-3">
        <div className="flex items-start gap-2">
          <Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <div className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">{subject}</div>
              {note.mailHasAttachments ? <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" /> : null}
            </div>
            <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{sender}</div>
            {note.mailSnippet?.trim() ? (
              <div className="mt-1 line-clamp-3 text-[11px] leading-snug text-muted-foreground">
                {note.mailSnippet.trim()}
              </div>
            ) : null}
            <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
              {accountLabel ? <span>{accountLabel}</span> : null}
              {date ? <span>{formatNoteDate(date, locale)}</span> : null}
              {note.mailIsRead === false ? <span>{t('notes.shell.unreadMail')}</span> : null}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const title = note.eventTitleSnapshot?.trim() || t('calendar.eventPreview.noTitle')
  return (
    <div className="rounded-lg border border-border bg-background/70 p-3">
      <div className="flex items-start gap-2">
        <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-foreground">{title}</div>
          <div className="mt-0.5 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            {note.eventStartIsoSnapshot ? <span>{formatNoteDate(note.eventStartIsoSnapshot, locale)}</span> : null}
            {accountLabel ? <span>{accountLabel}</span> : null}
          </div>
        </div>
      </div>
    </div>
  )
}
