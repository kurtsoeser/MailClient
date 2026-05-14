import { create } from 'zustand'

type ToastVariant = 'info' | 'success' | 'error'

interface ToastEntry {
  id: number
  label: string
  variant: ToastVariant
  /** Optionale Undo-Action; wenn gesetzt, zeigt die Toast einen Undo-Button. */
  onUndo?: () => Promise<void> | void
  /** Auto-Dismiss-Timeout in ms. */
  durationMs: number
}

interface UndoState {
  toasts: ToastEntry[]
  pushToast: (
    entry: Omit<ToastEntry, 'id' | 'durationMs'> & { durationMs?: number }
  ) => number
  dismissToast: (id: number) => void
  undoLast: () => Promise<void>
}

let toastIdCounter = 1

export const useUndoStore = create<UndoState>((set, get) => ({
  toasts: [],

  pushToast(entry): number {
    const id = toastIdCounter++
    const durationMs = entry.durationMs ?? 6000
    set((s) => ({ toasts: [...s.toasts, { ...entry, id, durationMs }] }))
    if (durationMs > 0) {
      window.setTimeout(() => get().dismissToast(id), durationMs)
    }
    return id
  },

  dismissToast(id): void {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },

  async undoLast(): Promise<void> {
    const result = await window.mailClient.mail.undoLast()
    if (result.ok) {
      get().pushToast({
        label: result.label ?? 'Aktion zurueckgenommen',
        variant: 'success'
      })
    } else {
      get().pushToast({
        label: result.error ?? 'Nichts zum Zuruecknehmen',
        variant: 'error'
      })
    }
  }
}))
