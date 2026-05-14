import { create } from 'zustand'

interface SnoozePickerAnchor {
  x: number
  y: number
}

interface SnoozeUiState {
  /** Mail, fuer die der Picker geoeffnet ist. null = geschlossen. */
  pendingMessageId: number | null
  anchor: SnoozePickerAnchor | null
  open: (messageId: number, anchor: SnoozePickerAnchor) => void
  close: () => void
}

/**
 * Steuert das Snooze-Picker-Overlay. Mehrere Aufrufer (Triage-Bar,
 * MailRow-Actions, globaler Shortcut) koennen den Picker oeffnen,
 * ohne dass der Picker an einem konkreten Component haengt.
 */
export const useSnoozeUiStore = create<SnoozeUiState>((set) => ({
  pendingMessageId: null,
  anchor: null,
  open(messageId, anchor): void {
    set({ pendingMessageId: messageId, anchor })
  },
  close(): void {
    set({ pendingMessageId: null, anchor: null })
  }
}))
