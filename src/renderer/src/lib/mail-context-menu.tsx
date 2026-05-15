import type { ReactNode } from 'react'
import type { MailFull, MailListItem } from '@shared/types'

import type { ContextMenuItem } from '@/components/ContextMenu'

import {

  Reply,

  ReplyAll,

  Forward,

  MailOpen,

  Star,

  Clock,

  CheckSquare,

  CircleCheckBig,

  Hourglass,

  Crown,

  Archive,

  Trash2,

  Tag,
  StickyNote,
  FolderInput,
  SquareArrowOutUpRight

} from 'lucide-react'

import type { TFunction } from 'i18next'

const MAIL_CTX_TODO_FALLBACK = {
  today: 'ToDo: Heute',
  tomorrow: 'ToDo: Morgen',
  this_week: 'ToDo: Diese Woche',
  later: 'ToDo: Später',
  done: 'ToDo: Erledigt'
} as const

function mailContextTodoViewLabel(
  tr: TFunction | undefined,
  key: keyof typeof MAIL_CTX_TODO_FALLBACK
): string {
  return tr ? tr(`mail.todoViewTitle.${key}`) : MAIL_CTX_TODO_FALLBACK[key]
}

export interface MailContextHandlers {

  openReply: (mode: 'reply' | 'replyAll', message: MailFull) => void

  openForward: (message: MailFull) => void

  openNote?: (message: MailListItem) => void

  sendToNotion?: (message: MailListItem) => void | Promise<void>

  sendToNotionAsNewPage?: (message: MailListItem) => void | Promise<void>

  setMessageRead: (messageId: number, isRead: boolean) => void | Promise<void>

  toggleMessageFlag: (messageId: number) => void | Promise<void>

  archiveMessage: (messageId: number) => void | Promise<void>

  deleteMessage: (messageId: number) => void | Promise<void>

  setTodoForMessage: (messageId: number, dueKind: import('@shared/types').TodoDueKindOpen) => void | Promise<void>

  completeTodoForMessage: (messageId: number) => void | Promise<void>

  setWaitingForMessage: (messageId: number, days?: number) => void | Promise<void>

  clearWaitingForMessage: (messageId: number) => void | Promise<void>

  openSnoozePicker: (messageId: number, anchor: { x: number; y: number }) => void

  refreshNow: () => void | Promise<void>

}



export interface MailContextMenuUi {

  snoozeAnchor: { x: number; y: number }

  /**

   * Wenn gesetzt, wirken Massen-Aktionen (ToDo, Archiv, Loeschen, …) auf alle IDs.

   * Antworten/Weiterleiten bleiben auf der angezeigten Mail (`msg`).

   */

  applyToMessageIds?: number[]

  /** Fuer Labels und Lesen/Stern/Warten bei Konversations-Kontext. */

  threadMessagesForContext?: MailListItem[]

  /** Outlook-Kategorien als Untermenue (von aussen async geladen). */

  categorySubmenu?: ContextMenuItem[]

  /** Mailliste im Papierkorb: Loeschen = endgueltig. */

  deletedItemsFolder?: boolean

  /** Optional i18next translate function for dynamic menu labels. */

  t?: TFunction

  /** Panel „Verschieben“ (Suche, Zuletzt, …). */

  moveSubmenuContent?: ReactNode

}



async function withFullMessage<T>(

  messageId: number,

  fn: (msg: MailFull) => Promise<T> | T

): Promise<T | void> {

  const full = await window.mailClient.mail.getMessage(messageId)

  if (!full) return

  return fn(full)

}



function resolveTargetIds(msg: MailListItem, ui: MailContextMenuUi): number[] {

  const raw = ui.applyToMessageIds?.filter((id) => Number.isFinite(id)) ?? []

  if (raw.length === 0) return [msg.id]

  return [...new Set(raw)]

}



function resolveContextMessages(msg: MailListItem, ui: MailContextMenuUi): MailListItem[] {

  const t = ui.threadMessagesForContext

  if (t && t.length > 0) return t

  return [msg]

}



/**

 * Untermenue-Eintraege: Kategorie an/aus fuer eine oder mehrere Mails.

 */

export async function buildMailCategorySubmenuItems(

  msg: MailListItem,

  ui: MailContextMenuUi,

  onAfterChange: () => void | Promise<void>

): Promise<ContextMenuItem[]> {

  const ids = resolveTargetIds(msg, ui)

  const ctx = resolveContextMessages(msg, ui)

  const accountId = msg.accountId



  let nameList: string[] = []

  try {

    const masters = await window.mailClient.mail.listMasterCategories(accountId)

    nameList = masters.map((m) => m.displayName)

  } catch {

    try {

      nameList = await window.mailClient.mail.listDistinctMessageTags(accountId)

    } catch {

      return []

    }

  }



  const extraFromMail = ctx.flatMap((m) => m.categories ?? [])

  const allNames = [...new Set([...nameList, ...extraFromMail])].sort((a, b) =>

    a.localeCompare(b, 'de')

  )

  if (allNames.length === 0) return []



  return allNames.map((name, i) => {

    const listed = ids

      .map((id) => ctx.find((m) => m.id === id))

      .filter((m): m is MailListItem => m != null)

    const allHave = listed.length > 0 && listed.every((m) => (m.categories ?? []).includes(name))

    const anyHave = listed.some((m) => (m.categories ?? []).includes(name))

    const prefix = allHave ? '\u2713 ' : anyHave ? '\u25CC ' : '   '

    return {

      id: `mail-cat-${i}`,

      label: `${prefix}${name}`,

      onSelect: (): void => {

        void (async (): Promise<void> => {

          for (const id of ids) {

            const full = await window.mailClient.mail.getMessage(id)

            if (!full) continue

            const set = new Set(full.categories ?? [])

            if (allHave) set.delete(name)

            else set.add(name)

            await window.mailClient.mail.setMessageCategories({

              messageId: id,

              categories: Array.from(set).sort((a, b) => a.localeCompare(b, 'de'))

            })

          }

          await onAfterChange()

        })()

      }

    }

  })

}



/**

 * Kontextmenue-Eintraege fuer eine Mail (identisch fuer Mailliste und Workflow-Kanban).

 */

export function buildMailContextItems(

  msg: MailListItem,

  h: MailContextHandlers,

  ui: MailContextMenuUi

): ContextMenuItem[] {

  const ids = resolveTargetIds(msg, ui)

  const isBulk = ids.length > 1

  const deleteLabel =

    ui.deletedItemsFolder === true

      ? isBulk

        ? `Endgueltig loeschen (${ids.length})`

        : 'Endgueltig loeschen'

      : isBulk

        ? `Loeschen (${ids.length})`

        : 'Loeschen'

  const ctx = resolveContextMessages(msg, ui)

  const anyUnread = ctx.some((m) => !m.isRead)

  const readLabel = isBulk

    ? anyUnread

      ? 'Alle als gelesen markieren'

      : 'Alle als ungelesen markieren'

    : msg.isRead

      ? 'Als ungelesen markieren'

      : 'Als gelesen markieren'



  const listed = ids

    .map((id) => ctx.find((m) => m.id === id))

    .filter((m): m is MailListItem => m != null)

  const allFlagged = listed.length > 0 && listed.every((m) => m.isFlagged)

  const flagLabel = isBulk

    ? allFlagged

      ? 'Stern bei allen entfernen'

      : 'Alle mit Stern markieren'

    : msg.isFlagged

      ? 'Stern entfernen'

      : 'Mit Stern markieren'



  const anyWaiting = ctx.some((m) => m.waitingForReplyUntil)

  const tr = ui.t



  return [

    {

      id: 'reply',

      label: 'Antworten',

      icon: Reply,

      onSelect: (): void => {

        void withFullMessage(msg.id, (full) => h.openReply('reply', full))

      }

    },

    {

      id: 'replyAll',

      label: 'Allen antworten',

      icon: ReplyAll,

      onSelect: (): void => {

        void withFullMessage(msg.id, (full) => h.openReply('replyAll', full))

      }

    },

    {

      id: 'forward',

      label: 'Weiterleiten',

      icon: Forward,

      onSelect: (): void => {

        void withFullMessage(msg.id, (full) => h.openForward(full))

      }

    },
    ...(h.openNote
      ? [
          {
            id: 'note',
            label: tr ? tr('notes.contextNew') : 'Kernnotiz...',
            icon: StickyNote,
            onSelect: (): void => h.openNote?.(msg)
          }
        ]
      : []),
    ...(h.sendToNotion || h.sendToNotionAsNewPage
      ? [
          ...(h.sendToNotion
            ? [
                {
                  id: 'notion',
                  label: tr ? tr('notion.contextSend') : 'Nach Notion…',
                  icon: SquareArrowOutUpRight,
                  onSelect: (): void => {
                    void h.sendToNotion?.(msg)
                  }
                }
              ]
            : []),
          ...(h.sendToNotionAsNewPage
            ? [
                {
                  id: 'notion-new-page',
                  label: tr ? tr('notion.contextSendAsNewPage') : 'Als neue Notion-Seite…',
                  icon: SquareArrowOutUpRight,
                  onSelect: (): void => {
                    void h.sendToNotionAsNewPage?.(msg)
                  }
                }
              ]
            : [])
        ]
      : []),

    { id: 'sep1', label: '', separator: true },

    {

      id: 'toggleRead',

      label: readLabel,

      icon: MailOpen,

      onSelect: (): void => {

        if (isBulk) {

          void (async (): Promise<void> => {

            const targetRead = anyUnread

            for (const id of ids) await h.setMessageRead(id, targetRead)

          })()

        } else {

          void h.setMessageRead(msg.id, !msg.isRead)

        }

      }

    },

    {

      id: 'flag',

      label: flagLabel,

      icon: Star,

      onSelect: (): void => {

        if (isBulk) {

          void (async (): Promise<void> => {

            for (const id of ids) {

              const m = ctx.find((x) => x.id === id)

              if (!m) continue

              if (allFlagged && m.isFlagged) await h.toggleMessageFlag(id)

              if (!allFlagged && !m.isFlagged) await h.toggleMessageFlag(id)

            }

          })()

        } else {

          void h.toggleMessageFlag(msg.id)

        }

      }

    },

    { id: 'sep2', label: '', separator: true },

    {

      id: 'snooze',

      label: msg.snoozedUntil ? 'Snooze aendern...' : 'Snooze...',

      icon: Clock,

      disabled: isBulk,

      onSelect: (): void => {

        h.openSnoozePicker(msg.id, ui.snoozeAnchor)

      }

    },

    { id: 'sep-todo', label: '', separator: true },

    {

      id: 'todo-today',

      label: mailContextTodoViewLabel(tr, 'today'),

      icon: CheckSquare,

      iconClassName: 'text-yellow-400',

      onSelect: (): void => {

        void (async (): Promise<void> => {

          for (const id of ids) await h.setTodoForMessage(id, 'today')

        })()

      }

    },

    {

      id: 'todo-tomorrow',

      label: mailContextTodoViewLabel(tr, 'tomorrow'),

      icon: CheckSquare,

      iconClassName: 'text-yellow-400',

      onSelect: (): void => {

        void (async (): Promise<void> => {

          for (const id of ids) await h.setTodoForMessage(id, 'tomorrow')

        })()

      }

    },

    {

      id: 'todo-week',

      label: mailContextTodoViewLabel(tr, 'this_week'),

      icon: CheckSquare,

      iconClassName: 'text-yellow-400',

      onSelect: (): void => {

        void (async (): Promise<void> => {

          for (const id of ids) await h.setTodoForMessage(id, 'this_week')

        })()

      }

    },

    {

      id: 'todo-later',

      label: mailContextTodoViewLabel(tr, 'later'),

      icon: CheckSquare,

      iconClassName: 'text-yellow-400',

      onSelect: (): void => {

        void (async (): Promise<void> => {

          for (const id of ids) await h.setTodoForMessage(id, 'later')

        })()

      }

    },

    {

      id: 'todo-done',

      label: mailContextTodoViewLabel(tr, 'done'),

      icon: CircleCheckBig,

      iconClassName: 'text-emerald-500',

      onSelect: (): void => {

        void (async (): Promise<void> => {

          for (const id of ids) await h.completeTodoForMessage(id)

        })()

      }

    },

    { id: 'sep-wait', label: '', separator: true },

    {

      id: 'wait-7',

      label: 'Warten: Antwort in 7 Tagen',

      icon: Hourglass,

      onSelect: (): void => {

        void (async (): Promise<void> => {

          for (const id of ids) await h.setWaitingForMessage(id, 7)

        })()

      }

    },

    {

      id: 'wait-clear',

      label: 'Warten beenden',

      icon: Hourglass,

      disabled: isBulk ? !anyWaiting : !msg.waitingForReplyUntil,

      onSelect: (): void => {

        void (async (): Promise<void> => {

          for (const id of ids) await h.clearWaitingForMessage(id)

        })()

      }

    },

    { id: 'sep3', label: '', separator: true },

    {

      id: 'vip-toggle',

      label: msg.isVipSender ? 'VIP entfernen' : 'Als VIP markieren',

      icon: Crown,

      disabled: isBulk,

      onSelect: (): void => {

        void (async (): Promise<void> => {

          const email = msg.fromAddr ?? ''

          if (!email) return

          if (msg.isVipSender) {

            await window.mailClient.vip.remove({ accountId: msg.accountId, email })

          } else {

            await window.mailClient.vip.add({ accountId: msg.accountId, email })

          }

          await h.refreshNow()

        })()

      }

    },

    ...(ui.categorySubmenu && ui.categorySubmenu.length > 0

      ? [

          { id: 'sep-cat', label: '', separator: true },

          {

            id: 'mail-categories',

            label: 'Kategorien',

            icon: Tag,

            submenu: ui.categorySubmenu

          }

        ]

      : []),

    ...(ui.moveSubmenuContent != null

      ? [

          { id: 'sep-move-entry', label: '', separator: true },

          {

            id: 'move-mail',

            label: ui.t ? ui.t('mail.move.menu') : 'Verschieben',

            icon: FolderInput,

            submenuContent: ui.moveSubmenuContent

          }

        ]

      : []),

    {

      id: 'archive',

      label: isBulk ? `Archivieren (${ids.length})` : 'Archivieren',

      icon: Archive,

      onSelect: (): void => {

        void (async (): Promise<void> => {

          for (const id of ids) await h.archiveMessage(id)

        })()

      }

    },

    {

      id: 'delete',

      label: deleteLabel,

      icon: Trash2,

      destructive: true,

      onSelect: (): void => {

        void (async (): Promise<void> => {

          for (const id of ids) await h.deleteMessage(id)

        })()

      }

    }

  ]

}


