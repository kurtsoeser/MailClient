import { create } from 'zustand'

interface PeoplePendingFocusState {
  pendingContactId: number | null
  setPendingContactId: (id: number | null) => void
  takePendingContactId: () => number | null
}

export const usePeoplePendingFocusStore = create<PeoplePendingFocusState>((set, get) => ({
  pendingContactId: null,
  setPendingContactId(id): void {
    set({ pendingContactId: id })
  },
  takePendingContactId(): number | null {
    const id = get().pendingContactId
    if (id != null) set({ pendingContactId: null })
    return id
  }
}))
