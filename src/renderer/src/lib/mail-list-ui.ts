import type { MailListItem, TodoDueKindList } from '@shared/types'

/** Duenne Konto-Farbleiste links (nur „Alle Posteingaenge“), wie Ordner in der Sidebar. */
export const MAIL_LIST_UNIFIED_INBOX_STRIPE_BAR =
  'pointer-events-none absolute left-0 top-0 bottom-0 z-[1] w-[3px] rounded-r opacity-90'

export function mailListTodoViewTitle(due: TodoDueKindList): string {
  switch (due) {
    case 'overdue':
      return 'ToDo: Überfällig'
    case 'today':
      return 'ToDo: Heute'
    case 'tomorrow':
      return 'ToDo: Morgen'
    case 'this_week':
      return 'ToDo: Diese Woche'
    case 'later':
      return 'ToDo: Später'
    case 'done':
      return 'ToDo: Erledigt'
    default:
      return 'ToDo'
  }
}

export function dedupeMailListThreadMessagesById(msgs: MailListItem[]): MailListItem[] {
  const seen = new Set<number>()
  const out: MailListItem[] = []
  for (const m of msgs) {
    if (seen.has(m.id)) continue
    seen.add(m.id)
    out.push(m)
  }
  return out
}
