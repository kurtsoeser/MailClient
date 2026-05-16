export const NOTE_DRAG_PREFIX = 'note-drag:'

export const NOTE_DROP_UNGROUPED = 'note-drop:ungrouped'

const NOTE_DROP_SECTION_PREFIX = 'note-drop:sec:'

export function noteDragId(noteId: number): string {
  return `${NOTE_DRAG_PREFIX}${noteId}`
}

export function parseNoteDragId(id: string): number | null {
  if (!id.startsWith(NOTE_DRAG_PREFIX)) return null
  const raw = id.slice(NOTE_DRAG_PREFIX.length)
  const noteId = Number.parseInt(raw, 10)
  return Number.isFinite(noteId) && noteId > 0 ? noteId : null
}

export function noteSectionDropId(sectionId: number): string {
  return `${NOTE_DROP_SECTION_PREFIX}${sectionId}`
}

export function parseNoteSectionDropId(
  id: string
): { sectionId: number | null } | null {
  if (id === NOTE_DROP_UNGROUPED) return { sectionId: null }
  if (!id.startsWith(NOTE_DROP_SECTION_PREFIX)) return null
  const raw = id.slice(NOTE_DROP_SECTION_PREFIX.length)
  const sectionId = Number.parseInt(raw, 10)
  if (!Number.isFinite(sectionId) || sectionId <= 0) return null
  return { sectionId }
}

const NOTE_DROP_ACCOUNT_PREFIX = 'note-drop:acc:'

export function noteAccountDropId(accountKey: string): string {
  return `${NOTE_DROP_ACCOUNT_PREFIX}${accountKey}`
}

export function parseNoteAccountDropId(id: string): { accountKey: string } | null {
  if (!id.startsWith(NOTE_DROP_ACCOUNT_PREFIX)) return null
  const accountKey = id.slice(NOTE_DROP_ACCOUNT_PREFIX.length)
  return accountKey ? { accountKey } : null
}

export function parseNoteNavDropId(
  id: string
): { sectionId: number | null } | { accountKey: string } | null {
  const section = parseNoteSectionDropId(id)
  if (section) return section
  return parseNoteAccountDropId(id)
}
