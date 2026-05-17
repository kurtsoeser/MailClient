import type { ConnectedAccount, NoteSection, UserNoteListItem } from '@shared/types'
import { LOCAL_NOTES_ACCOUNT_KEY, noteAccountKey } from '@/lib/notes-sidebar-accounts'
import type { NotesSidebarListMode } from '@/lib/notes-sidebar-storage'

/** Filter in der Sektionen-Ansicht der linken Spalte. */
export type NotesSectionsNavScope = 'all' | 'ungrouped' | { sectionId: number }

export type NotesNavSelection =
  | { kind: 'sections'; scope: NotesSectionsNavScope }
  | { kind: 'accounts'; accountKey: string }

const NAV_SELECTION_KEY = 'mailclient.notes.navSelection'

function parseSectionsScope(raw: unknown): NotesSectionsNavScope | null {
  if (raw === 'all' || raw === 'ungrouped') return raw
  if (raw && typeof raw === 'object' && 'sectionId' in raw) {
    const sectionId = (raw as { sectionId: unknown }).sectionId
    if (typeof sectionId === 'number' && sectionId > 0) {
      return { sectionId }
    }
  }
  return null
}

export function defaultNavSelection(mode: NotesSidebarListMode): NotesNavSelection {
  return mode === 'sections'
    ? { kind: 'sections', scope: 'ungrouped' }
    : { kind: 'accounts', accountKey: LOCAL_NOTES_ACCOUNT_KEY }
}

export function readNotesNavSelection(mode: NotesSidebarListMode): NotesNavSelection {
  try {
    const raw = window.localStorage.getItem(NAV_SELECTION_KEY)
    if (!raw) return defaultNavSelection(mode)
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return defaultNavSelection(mode)

    if (mode === 'sections') {
      const p = parsed as Record<string, unknown>
      if (p.allNotes === true) return { kind: 'sections', scope: 'all' }
      const scope = parseSectionsScope(p.scope)
      if (scope) return { kind: 'sections', scope }
      if ('sectionId' in p) {
        const sectionId = p.sectionId
        if (sectionId === null) return { kind: 'sections', scope: 'ungrouped' }
        if (typeof sectionId === 'number' && sectionId > 0) {
          return { kind: 'sections', scope: { sectionId } }
        }
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
  if (selection.kind === 'sections') {
    if (selection.scope === 'all') return notes
    if (selection.scope === 'ungrouped') {
      return notes.filter((n) => n.sectionId == null)
    }
    if (typeof selection.scope === 'object') {
      const { sectionId } = selection.scope
      return notes.filter((n) => n.sectionId === sectionId)
    }
    return notes
  }
  return notes.filter((n) => noteAccountKey(n) === selection.accountKey)
}

export function countNotesInSection(sectionId: number, notes: UserNoteListItem[]): number {
  return notes.filter((n) => n.sectionId === sectionId).length
}

export function sectionLabelForNote(
  note: UserNoteListItem,
  sections: NoteSection[],
  t: (key: string) => string
): string {
  if (note.sectionId == null) return t('notes.sections.ungrouped')
  return sections.find((s) => s.id === note.sectionId)?.name ?? t('notes.sections.ungrouped')
}

export function navSelectionLabel(
  selection: NotesNavSelection,
  sections: NoteSection[],
  accounts: ConnectedAccount[],
  t: (key: string) => string
): string {
  if (selection.kind === 'sections') {
    if (selection.scope === 'all') return t('notes.sections.allNotes')
    if (selection.scope === 'ungrouped') return t('notes.sections.ungrouped')
    const sectionId =
      typeof selection.scope === 'object' ? selection.scope.sectionId : undefined
    const section = sectionId != null ? sections.find((s) => s.id === sectionId) : undefined
    return section?.name ?? t('notes.sections.ungrouped')
  }
  if (selection.accountKey === LOCAL_NOTES_ACCOUNT_KEY) {
    return t('notes.shell.localAccount')
  }
  const account = accounts.find((a) => a.id === selection.accountKey)
  return account?.displayName || account?.email || selection.accountKey
}

export function isAllNotesNavSelected(selection: NotesNavSelection): boolean {
  return selection.kind === 'sections' && selection.scope === 'all'
}

export function isSectionNavSelected(
  sectionId: number | null,
  selection: NotesNavSelection
): boolean {
  if (selection.kind !== 'sections') return false
  if (sectionId == null) return selection.scope === 'ungrouped'
  return (
    typeof selection.scope === 'object' && selection.scope.sectionId === sectionId
  )
}

export function isAccountNavSelected(accountKey: string, selection: NotesNavSelection): boolean {
  return selection.kind === 'accounts' && selection.accountKey === accountKey
}

/** Sektion fuer neue Notizen, wenn die aktuelle Ansicht eine konkrete Sektion ist. */
export function sectionIdForNewNote(selection: NotesNavSelection): number | null {
  if (selection.kind !== 'sections') return null
  if (selection.scope === 'all' || selection.scope === 'ungrouped') return null
  return selection.scope.sectionId
}
