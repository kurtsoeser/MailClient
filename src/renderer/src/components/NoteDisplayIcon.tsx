import type { UserNote, UserNoteKind, UserNoteListItem } from '@shared/types'
import {
  calendarEventIconIsExplicit,
  resolveCalendarEventIcon
} from '@/lib/calendar-event-icons'
import {
  noteDisplayIcon,
  resolveNoteDisplayIconKind
} from '@/app/notes/notes-display-helpers'
import { resolveEntityIconColor } from '@shared/entity-icon-color'
import { cn } from '@/lib/utils'

export function NoteDisplayIcon({
  note,
  kind,
  iconId,
  iconColor,
  primaryLinkKind,
  className
}: {
  /** Bevorzugt: volles Notiz-Objekt fuer Standard-Icon nach Typ/Verknuepfung. */
  note?: Pick<UserNoteListItem, 'kind' | 'iconId' | 'iconColor' | 'primaryLinkKind'>
  kind?: UserNoteKind
  iconId?: string | null
  iconColor?: string | null
  primaryLinkKind?: UserNoteListItem['primaryLinkKind']
  className?: string
}): JSX.Element {
  const resolvedNote =
    note ??
    ({
      kind: kind ?? 'standalone',
      iconId,
      iconColor,
      primaryLinkKind
    } as Pick<UserNote, 'kind'> & Pick<Partial<UserNoteListItem>, 'primaryLinkKind'> & {
      iconId?: string | null
      iconColor?: string | null
    })

  const color = resolveEntityIconColor(resolvedNote.iconColor ?? iconColor)
  const explicitIconId = resolvedNote.iconId ?? iconId

  if (calendarEventIconIsExplicit(explicitIconId)) {
    const Icon = resolveCalendarEventIcon(explicitIconId)
    return (
      <Icon
        className={cn('h-3.5 w-3.5 shrink-0', className)}
        style={color ? { color } : undefined}
        strokeWidth={2}
        aria-hidden
      />
    )
  }

  const Fallback = noteDisplayIcon(resolveNoteDisplayIconKind(resolvedNote))
  return (
    <Fallback className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground', className)} aria-hidden />
  )
}
