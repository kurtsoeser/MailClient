import { create } from 'zustand'

interface NotesPendingFocusState {
  pendingNoteId: number | null
  setPendingNoteId: (id: number | null) => void
  takePendingNoteId: () => number | null
}

export const useNotesPendingFocusStore = create<NotesPendingFocusState>((set, get) => ({
  pendingNoteId: null,
  setPendingNoteId(id): void {
    set({ pendingNoteId: id })
  },
  takePendingNoteId(): number | null {
    const id = get().pendingNoteId
    if (id != null) set({ pendingNoteId: null })
    return id
  }
}))
