import type { ConnectedAccount, NoteSection, UserNoteListItem } from '@shared/types'
import { LOCAL_NOTES_ACCOUNT_KEY, noteAccountKey } from '@/lib/notes-sidebar-accounts'
import type { NotesSidebarListMode } from '@/lib/notes-sidebar-storage'

export type NotesNavSelection =
  | { kind: 'sections'; sectionId: number | null }
  | { kind: 'accounts'; accountKey: string }

const NAV_SELECTION_KEY = 'mailclient.notes.navSelection'

export function defaultNavSelection(mode: NotesSidebarListMode): NotesNavSelection {
  return mode === 'sections'
    ? { kind: 'sections', sectionId: null }
    : { kind: 'accounts', accountKey: LOCAL_NOTES_ACCOUNT_KEY }
}

export function readNotesNavSelection(mode: NotesSidebarListMode): NotesNavSelection {
  try {
    const raw = window.localStorage.getItem(NAV_SELECTION_KEY)
    if (!raw) return defaultNavSelection(mode)
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return defaultNavSelection(mode)
    if (mode === 'sections' && 'sectionId' in parsed) {
      const sectionId = (parsed as { sectionId: unknown }).sectionId
      if (sectionId === null) return { kind: 'sections', sectionId: null }
      if (typeof sectionId === 'number' && sectionId > 0) {
        return { kind: 'sections', sectionId }
      }
    }
    if (mode === 'accounts' && 'accountKey' in parsed) {
      const accountKey = (parsed as { accountKey: unknown }).accountKey
      if (typeof accountKey === 'string' && accountKey) {
        return { kind: 'accounts', accountKey }
      }
    }
  } catch {
    /* ignore */
  }
  return defaultNavSelection(mode)
}

export function persistNotesNavSelection(selection: NotesNavSelection): void {
  try {
    window.localStorage.setItem(NAV_SELECTION_KEY, JSON.stringify(selection))
  } catch {
    /* ignore */
  }
}

export function notesForNavSelection(
  notes: UserNoteListItem[],
  selection: NotesNavSelection
): UserNoteListItem[] {
  const filtered =
    selection.kind === 'sections'
      ? selection.sectionId == null
        ? notes.filter((n) => n.sectionId == null)
        : notes.filter((n) => n.sectionId === selection.sectionId)
      : notes.filter((n) => noteAccountKey(n) === selection.accountKey)
  return filtered
}

export function countNotesInSection(sectionId: number, notes: UserNoteListItem[]): number {
  return notes.filter((n) => n.sectionId === sectionId).length
}

export function navSelectionLabel(
  selection: NotesNavSelection,
  sections: NoteSection[],
  accounts: ConnectedAccount[],
  t: (key: string) => string
): string {
  if (selection.kind === 'sections') {
    if (selection.sectionId == null) return t('notes.sections.ungrouped')
    const section = sections.find((s) => s.id === selection.sectionId)
    return section?.name ?? t('notes.sections.ungrouped')
  }
  if (selection.accountKey === LOCAL_NOTES_ACCOUNT_KEY) {
    return t('notes.shell.localAccount')
  }
  const account = accounts.find((a) => a.id === selection.accountKey)
  return account?.displayName || account?.email || selection.accountKey
}

export function isSectionNavSelected(
  sectionId: number | null,
  selection: NotesNavSelection
): boolean {
  return selection.kind === 'sections' && selection.sectionId === sectionId
}

export function isAccountNavSelected(accountKey: string, selection: NotesNavSelection): boolean {
  return selection.kind === 'accounts' && selection.accountKey === accountKey
}
