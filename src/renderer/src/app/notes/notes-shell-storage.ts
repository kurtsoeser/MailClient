export type NotesLinkedPreviewPlacement = 'dock' | 'float'

export const NOTES_LINKED_PREVIEW_OPEN_KEY = 'mailclient.notesShell.linkedPreviewOpen'
export const NOTES_LINKED_PREVIEW_PLACEMENT_KEY = 'mailclient.notesShell.linkedPreviewPlacement'
export const NOTES_FLOAT_PREVIEW_SIZE_KEY = 'mailclient.notesShell.floatPreviewSize'

export function readNotesLinkedPreviewOpen(): boolean {
  try {
    return window.localStorage.getItem(NOTES_LINKED_PREVIEW_OPEN_KEY) === '1'
  } catch {
    return false
  }
}

export function persistNotesLinkedPreviewOpen(open: boolean): void {
  try {
    window.localStorage.setItem(NOTES_LINKED_PREVIEW_OPEN_KEY, open ? '1' : '0')
  } catch {
    // ignore
  }
}

export function readNotesLinkedPreviewPlacement(): NotesLinkedPreviewPlacement {
  try {
    const v = window.localStorage.getItem(NOTES_LINKED_PREVIEW_PLACEMENT_KEY)
    return v === 'float' ? 'float' : 'dock'
  } catch {
    return 'dock'
  }
}

export function persistNotesLinkedPreviewPlacement(placement: NotesLinkedPreviewPlacement): void {
  try {
    window.localStorage.setItem(NOTES_LINKED_PREVIEW_PLACEMENT_KEY, placement)
  } catch {
    // ignore
  }
}
