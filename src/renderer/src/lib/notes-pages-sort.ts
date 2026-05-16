import type { UserNoteListItem } from '@shared/types'
import { noteTitle } from '@/app/notes/notes-display-helpers'

export const NOTES_PAGES_SORT_KEYS = [
  'manual',
  'title_asc',
  'title_desc',
  'created_asc',
  'created_desc',
  'updated_asc',
  'updated_desc',
  'scheduled_asc',
  'scheduled_desc'
] as const

export type NotesPagesSortKey = (typeof NOTES_PAGES_SORT_KEYS)[number]

const STORAGE_KEY = 'mailclient.notes.pagesSort.v1'
const DEFAULT_SORT: NotesPagesSortKey = 'manual'

export function isNotesPagesSortKey(value: string): value is NotesPagesSortKey {
  return (NOTES_PAGES_SORT_KEYS as readonly string[]).includes(value)
}

export function readNotesPagesSort(): NotesPagesSortKey {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)?.trim()
    if (raw && isNotesPagesSortKey(raw)) return raw
  } catch {
    /* ignore */
  }
  return DEFAULT_SORT
}

export function persistNotesPagesSort(key: NotesPagesSortKey): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, key)
  } catch {
    /* ignore */
  }
}

function compareIso(a: string, b: string, asc: boolean): number {
  const cmp = a.localeCompare(b)
  return asc ? cmp : -cmp
}

function compareNullableIso(a: string | null, b: string | null, asc: boolean): number {
  if (!a && !b) return 0
  if (!a) return 1
  if (!b) return -1
  return compareIso(a, b, asc)
}

function compareManual(a: UserNoteListItem, b: UserNoteListItem): number {
  const o = a.sortOrder - b.sortOrder
  if (o !== 0) return o
  return b.updatedAt.localeCompare(a.updatedAt)
}

export function sortNotesPages(
  notes: UserNoteListItem[],
  sortKey: NotesPagesSortKey,
  untitledLabel: string
): UserNoteListItem[] {
  const items = [...notes]
  switch (sortKey) {
    case 'manual':
      items.sort(compareManual)
      break
    case 'title_asc':
      items.sort((a, b) =>
        noteTitle(a, untitledLabel).localeCompare(noteTitle(b, untitledLabel), undefined, {
          sensitivity: 'base'
        })
      )
      break
    case 'title_desc':
      items.sort((a, b) =>
        noteTitle(b, untitledLabel).localeCompare(noteTitle(a, untitledLabel), undefined, {
          sensitivity: 'base'
        })
      )
      break
    case 'created_asc':
      items.sort((a, b) => compareIso(a.createdAt, b.createdAt, true))
      break
    case 'created_desc':
      items.sort((a, b) => compareIso(a.createdAt, b.createdAt, false))
      break
    case 'updated_asc':
      items.sort((a, b) => compareIso(a.updatedAt, b.updatedAt, true))
      break
    case 'updated_desc':
      items.sort((a, b) => compareIso(a.updatedAt, b.updatedAt, false))
      break
    case 'scheduled_asc':
      items.sort((a, b) => compareNullableIso(a.scheduledStartIso, b.scheduledStartIso, true))
      break
    case 'scheduled_desc':
      items.sort((a, b) => compareNullableIso(a.scheduledStartIso, b.scheduledStartIso, false))
      break
    default:
      items.sort(compareManual)
  }
  return items
}

export function notesPagesSortLabelKey(sortKey: NotesPagesSortKey): string {
  return `notes.shell.pagesSort.${sortKey}`
}
