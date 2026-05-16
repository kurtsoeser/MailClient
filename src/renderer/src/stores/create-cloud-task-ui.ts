import { create } from 'zustand'
import type { MailListItem } from '@shared/types'

interface CreateCloudTaskUiState {
  pendingMessage: MailListItem | null
  /** Wird nach erfolgreicher Erstellung erhöht (z. B. Master-Liste). */
  createdSignal: number
  open: (message: MailListItem) => void
  close: () => void
  notifyCreated: () => void
}

export const useCreateCloudTaskUiStore = create<CreateCloudTaskUiState>((set) => ({
  pendingMessage: null,
  createdSignal: 0,
  open(message): void {
    set({ pendingMessage: message })
  },
  close(): void {
    set({ pendingMessage: null })
  },
  notifyCreated(): void {
    set((s) => ({ createdSignal: s.createdSignal + 1, pendingMessage: null }))
  }
}))
