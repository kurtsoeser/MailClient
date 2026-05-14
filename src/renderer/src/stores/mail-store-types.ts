export type MailFilter = 'all' | 'unread' | 'flagged' | 'with_todo'

export type MailListKind =
  | 'folder'
  | 'todo'
  | 'snoozed'
  | 'waiting'
  | 'unified_inbox'
  | 'meta_folder'

/** Thread-Keys pro Konto trennen (Unified-Inbox und Meta-Ordner). */
export function mailListUsesCrossAccountThreadScope(kind: MailListKind): boolean {
  return kind === 'unified_inbox' || kind === 'meta_folder'
}

export interface AccountListMetaEntry {
  email: string
  displayName: string
}
