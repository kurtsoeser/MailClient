import type { ConnectedAccount, NoteSection, UserNoteListItem } from '@shared/types'
import { noteTitle } from '@/app/notes/notes-display-helpers'
import { LOCAL_NOTES_ACCOUNT_KEY, noteAccountKey } from '@/lib/notes-sidebar-accounts'

function sectionPathNames(sectionId: number, sections: NoteSection[]): string[] {
  const byId = new Map(sections.map((s) => [s.id, s]))
  const names: string[] = []
  let cur: number | null = sectionId
  const seen = new Set<number>()
  while (cur != null && !seen.has(cur)) {
    seen.add(cur)
    const section = byId.get(cur)
    if (!section) break
    names.unshift(section.name)
    cur = section.parentId
  }
  return names
}

export function noteSearchBreadcrumb(
  note: UserNoteListItem,
  sections: NoteSection[],
  accounts: ConnectedAccount[],
  t: (key: string) => string
): string {
  const parts: string[] = []
  const accountKey = noteAccountKey(note)
  if (accountKey === LOCAL_NOTES_ACCOUNT_KEY) {
    parts.push(t('notes.shell.localAccount'))
  } else {
    const account = accounts.find((a) => a.id === accountKey)
    parts.push(account?.displayName || account?.email || accountKey)
  }

  if (note.sectionId != null) {
    parts.push(...sectionPathNames(note.sectionId, sections))
  } else {
    parts.push(t('notes.sections.ungrouped'))
  }

  return parts.join(' » ')
}

export function noteSearchResultTitle(note: UserNoteListItem, untitledLabel: string): string {
  return noteTitle(note, untitledLabel)
}
