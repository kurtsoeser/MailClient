import { addDays, format, parseISO } from 'date-fns'
import type { Locale } from 'date-fns'
import type { TFunction } from 'i18next'
import { Copy, ExternalLink, Files, Pencil, StickyNote, Tag, Trash2, Video } from 'lucide-react'
import type { CalendarEventView } from '@shared/types'
import type { ContextMenuItem } from '@/components/ContextMenu'

export function formatCalendarEventClipboardText(
  ev: CalendarEventView,
  t: TFunction,
  locale: Locale,
  isDe: boolean
): string {
  const title = ev.title?.trim() ? ev.title : t('calendar.eventPreview.noTitle')
  const lines: string[] = [title]
  const allDayPrefix = t('calendar.eventClipboard.allDayPrefix')
  try {
    if (ev.isAllDay) {
      const s = parseISO(ev.startIso.length <= 10 ? `${ev.startIso}T12:00:00` : ev.startIso)
      const endEx = parseISO(ev.endIso.length <= 10 ? `${ev.endIso}T12:00:00` : ev.endIso)
      const last = addDays(endEx, -1)
      if (format(s, 'yyyy-MM-dd') === format(last, 'yyyy-MM-dd')) {
        lines.push(
          `${allDayPrefix} ${format(s, isDe ? 'EEEE, d. MMMM yyyy' : 'EEEE, MMMM d, yyyy', { locale })}`
        )
      } else {
        lines.push(
          `${allDayPrefix} ${format(s, isDe ? 'd. MMM yyyy' : 'MMM d, yyyy', { locale })} – ${format(last, isDe ? 'd. MMM yyyy' : 'MMM d, yyyy', { locale })}`
        )
      }
    } else {
      const s = parseISO(ev.startIso)
      const e = parseISO(ev.endIso)
      if (isDe) {
        lines.push(
          `${format(s, 'EEEE, d. MMMM yyyy, HH:mm', { locale })} – ${format(e, 'HH:mm', { locale })} Uhr`
        )
      } else {
        lines.push(
          `${format(s, 'EEEE, MMMM d, yyyy, h:mm a', { locale })} – ${format(e, 'h:mm a', { locale })}`
        )
      }
    }
  } catch {
    lines.push(`${ev.startIso} – ${ev.endIso}`)
  }
  if (ev.location?.trim()) lines.push(`${t('calendar.eventClipboard.location')} ${ev.location}`)
  if (ev.organizer?.trim()) lines.push(`${t('calendar.eventClipboard.organizer')} ${ev.organizer}`)
  if (ev.joinUrl?.trim()) lines.push(`${t('calendar.eventClipboard.teams')} ${ev.joinUrl}`)
  else if (ev.webLink?.trim()) lines.push(`${t('calendar.eventClipboard.link')} ${ev.webLink}`)
  return lines.join('\n')
}

export interface CalendarEventContextHandlers {
  onEdit: () => void
  onDuplicate: () => void
  onOpenNote: () => void
  onCopyDetails: () => void
  onCopyWebLink: () => void
  onCopyJoinUrl: () => void
  onOpenWeb: () => void
  onOpenTeams: () => void
  onDelete: () => void
}

export interface CalendarEventContextMenuExtra {
  categorySubmenu?: ContextMenuItem[]
}

export async function buildCalendarEventCategorySubmenuItems(
  ev: CalendarEventView,
  onAfterChange: () => void | Promise<void>,
  t: TFunction,
  collatorLocale: string
): Promise<ContextMenuItem[]> {
  if (ev.source !== 'microsoft' || !ev.graphEventId?.trim()) return []
  try {
    const masters = await window.mailClient.mail.listMasterCategories(ev.accountId)
    const names = [...new Set([...masters.map((m) => m.displayName), ...(ev.categories ?? [])])].sort((a, b) =>
      a.localeCompare(b, collatorLocale)
    )
    if (names.length === 0) return []

    return names.map((name, i) => {
      const on = (ev.categories ?? []).includes(name)
      const label = (on ? '\u2713 ' : '   ') + name
      return {
        id: `cal-cat-${i}`,
        label,
        onSelect: (): void => {
          void (async (): Promise<void> => {
            const next = new Set(ev.categories ?? [])
            if (next.has(name)) next.delete(name)
            else next.add(name)
            await window.mailClient.calendar.patchEventCategories({
              accountId: ev.accountId,
              graphEventId: ev.graphEventId!,
              graphCalendarId: ev.graphCalendarId ?? null,
              categories: Array.from(next).sort((a, b) => a.localeCompare(b, collatorLocale))
            })
            await onAfterChange()
          })()
        }
      }
    })
  } catch {
    return [{ id: 'cal-cat-err', label: t('calendar.eventContextMenu.categoriesLoadError'), disabled: true }]
  }
}

export function buildCalendarEventContextItems(
  ev: CalendarEventView,
  canMutateEvent: boolean,
  canDuplicate: boolean,
  h: CalendarEventContextHandlers,
  t: TFunction,
  extra?: CalendarEventContextMenuExtra
): ContextMenuItem[] {
  const items: ContextMenuItem[] = [
    {
      id: 'edit',
      label: t('calendar.eventContextMenu.edit'),
      icon: Pencil,
      disabled: !canMutateEvent,
      onSelect: h.onEdit
    },
    {
      id: 'dup',
      label: t('calendar.eventContextMenu.duplicate'),
      icon: Files,
      disabled: !canDuplicate,
      onSelect: h.onDuplicate
    },
    {
      id: 'note',
      label: t('notes.contextNew'),
      icon: StickyNote,
      disabled: !ev.graphEventId?.trim(),
      onSelect: h.onOpenNote
    },
    ...(extra?.categorySubmenu && extra.categorySubmenu.length > 0
      ? [
          { id: 'sep-cat', label: '', separator: true },
          {
            id: 'cal-categories',
            label: t('calendar.eventContextMenu.categories'),
            icon: Tag,
            submenu: extra.categorySubmenu
          }
        ]
      : []),
    { id: 'sep1', label: '', separator: true },
    {
      id: 'copy',
      label: t('calendar.eventContextMenu.copyDetails'),
      icon: Copy,
      onSelect: h.onCopyDetails
    }
  ]

  const linkCopies: ContextMenuItem[] = []
  if (ev.webLink?.trim()) {
    linkCopies.push({
      id: 'copyWeb',
      label: t('calendar.eventContextMenu.copyOutlookWebLink'),
      icon: Copy,
      onSelect: h.onCopyWebLink
    })
  }
  if (ev.joinUrl?.trim() && ev.joinUrl.trim() !== ev.webLink?.trim()) {
    linkCopies.push({
      id: 'copyJoin',
      label: t('calendar.eventContextMenu.copyTeamsMeetingLink'),
      icon: Copy,
      onSelect: h.onCopyJoinUrl
    })
  }
  items.push(...linkCopies)

  const openers: ContextMenuItem[] = []
  if (ev.webLink?.trim()) {
    openers.push({
      id: 'openWeb',
      label: t('calendar.eventContextMenu.openInBrowser'),
      icon: ExternalLink,
      onSelect: h.onOpenWeb
    })
  }
  if (ev.joinUrl?.trim()) {
    openers.push({
      id: 'openTeams',
      label: t('calendar.eventContextMenu.openTeamsMeeting'),
      icon: Video,
      onSelect: h.onOpenTeams
    })
  }
  if (openers.length > 0) {
    items.push({ id: 'sep2', label: '', separator: true }, ...openers)
  }

  items.push({ id: 'sep3', label: '', separator: true })
  items.push({
    id: 'delete',
    label: t('calendar.eventContextMenu.delete'),
    icon: Trash2,
    destructive: true,
    disabled: !canMutateEvent,
    onSelect: h.onDelete
  })

  return items
}
