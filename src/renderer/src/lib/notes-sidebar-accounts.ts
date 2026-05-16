import type { ConnectedAccount, UserNoteListItem } from '@shared/types'

/** Notizen ohne Konto (freie Notiz ohne accountId, alte Mail-Daten). */
export const LOCAL_NOTES_ACCOUNT_KEY = '__local__'

export interface NoteAccountBucket {
  accountId: string
  notes: UserNoteListItem[]
}

export function noteAccountKey(note: UserNoteListItem): string {
  if (note.kind === 'mail' && note.mailAccountId?.trim()) return note.mailAccountId.trim()
  if (note.accountId?.trim()) return note.accountId.trim()
  return LOCAL_NOTES_ACCOUNT_KEY
}

function sortNotes(items: UserNoteListItem[]): UserNoteListItem[] {
  return [...items].sort((a, b) => {
    const o = a.sortOrder - b.sortOrder
    if (o !== 0) return o
    return b.updatedAt.localeCompare(a.updatedAt)
  })
}

export function buildNoteAccountBuckets(
  accounts: ConnectedAccount[],
  notes: UserNoteListItem[]
): NoteAccountBucket[] {
  const byAccount = new Map<string, UserNoteListItem[]>()
  for (const note of notes) {
    const key = noteAccountKey(note)
    const list = byAccount.get(key) ?? []
    list.push(note)
    byAccount.set(key, list)
  }

  const buckets: NoteAccountBucket[] = []

  for (const account of accounts) {
    const items = byAccount.get(account.id)
    if (!items?.length) continue
    buckets.push({ accountId: account.id, notes: sortNotes(items) })
    byAccount.delete(account.id)
  }

  const local = byAccount.get(LOCAL_NOTES_ACCOUNT_KEY)
  if (local?.length) {
    buckets.push({ accountId: LOCAL_NOTES_ACCOUNT_KEY, notes: sortNotes(local) })
    byAccount.delete(LOCAL_NOTES_ACCOUNT_KEY)
  }

  for (const [accountId, items] of byAccount) {
    if (!items.length) continue
    buckets.push({ accountId, notes: sortNotes(items) })
  }

  return buckets
}
