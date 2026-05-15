import type { Locale } from 'date-fns'
import type { TFunction } from 'i18next'
import { Copy, ExternalLink, Files, Pencil, SquareArrowOutUpRight, StickyNote, Tag, Trash2, Video } from 'lucide-react'
import type { CalendarEventView } from '@shared/types'
import { formatCalendarEventClipboardText as formatCalendarEventClipboardTextShared } from '@shared/calendar-event-clipboard'
import type { ContextMenuItem } from '@/components/ContextMenu'

export function formatCalendarEventClipboardText(
  ev: CalendarEventView,
  t: TFunction,
  locale: Locale,
  isDe: boolean
): string {
  return formatCalendarEventClipboardTextShared(
    ev,
    {
      noTitle: t('calendar.eventPreview.noTitle'),
      allDayPrefix: t('calendar.eventClipboard.allDayPrefix'),
      location: t('calendar.eventClipboard.location'),
      organizer: t('calendar.eventClipboard.organizer'),
      teams: t('calendar.eventClipboard.teams'),
      link: t('calendar.eventClipboard.link')
    },
    locale,
    isDe
  )
}

export interface CalendarEventContextHandlers {
  onEdit: () => void
  onDuplicate: () => void
  onOpenNote: () => void
  onSendToNotion?: () => void
  onSendToNotionAsNewPage?: () => void
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
    ...(h.onSendToNotion || h.onSendToNotionAsNewPage
      ? [
          ...(h.onSendToNotion
            ? [
                {
                  id: 'notion',
                  label: t('notion.contextSend'),
                  icon: SquareArrowOutUpRight,
                  onSelect: h.onSendToNotion
                }
              ]
            : []),
          ...(h.onSendToNotionAsNewPage
            ? [
                {
                  id: 'notion-new-page',
                  label: t('notion.contextSendEventAsNewPage'),
                  icon: SquareArrowOutUpRight,
                  onSelect: h.onSendToNotionAsNewPage
                }
              ]
            : [])
        ]
      : []),
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
