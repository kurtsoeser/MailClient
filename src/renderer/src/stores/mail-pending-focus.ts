import { create } from 'zustand'

interface MailPendingFocusState {
  pendingMessageId: number | null
  setPendingMessageId: (id: number | null) => void
  takePendingMessageId: () => number | null
}

export const useMailPendingFocusStore = create<MailPendingFocusState>((set, get) => ({
  pendingMessageId: null,
  setPendingMessageId(id): void {
    set({ pendingMessageId: id })
  },
  takePendingMessageId(): number | null {
    const id = get().pendingMessageId
    if (id != null) set({ pendingMessageId: null })
    return id
  }
}))
