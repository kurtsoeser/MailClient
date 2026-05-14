import { create } from 'zustand'
import type { CalendarEventView } from '@shared/types'

export type PendingCreateEventOnDay = { dateIso: string; anchor: { x: number; y: number } }

/**
 * Einmaliger Fokus beim Wechsel in den Kalender (z. B. Klick auf Termin auf der Startseite).
 * Peek + clear nach erfolgreichem gotoDate, damit Strict-Mode doppelte Effects nicht die Queue leeren.
 *
 * `pendingGotoDateIso`: nur Datum springen (z. B. Mini-Monat), ohne Termin-Vorschau.
 * `pendingCreateOnDay`: Kalender öffnen, Zieltag ansteuern und Neu-Dialog (ganztägig) anzeigen.
 */
interface CalendarPendingFocusState {
  pendingEvent: CalendarEventView | null
  pendingGotoDateIso: string | null
  pendingCreateOnDay: PendingCreateEventOnDay | null
  queueFocusEvent: (ev: CalendarEventView) => void
  queueGotoDate: (iso: string) => void
  queueCreateEventOnDay: (dateIso: string, anchor: { x: number; y: number }) => void
  peekPendingEvent: () => CalendarEventView | null
  peekPendingGotoDate: () => string | null
  peekPendingCreateOnDay: () => PendingCreateEventOnDay | null
  clearPendingEvent: () => void
  clearPendingGotoDate: () => void
  clearPendingCreateOnDay: () => void
}

export const useCalendarPendingFocusStore = create<CalendarPendingFocusState>((set, get) => ({
  pendingEvent: null,
  pendingGotoDateIso: null,
  pendingCreateOnDay: null,

  queueFocusEvent(ev): void {
    set({ pendingEvent: ev, pendingGotoDateIso: null, pendingCreateOnDay: null })
  },

  queueGotoDate(iso: string): void {
    set({ pendingGotoDateIso: iso, pendingEvent: null, pendingCreateOnDay: null })
  },

  queueCreateEventOnDay(dateIso: string, anchor: { x: number; y: number }): void {
    set({
      pendingCreateOnDay: { dateIso, anchor },
      pendingEvent: null,
      pendingGotoDateIso: null
    })
  },

  peekPendingEvent(): CalendarEventView | null {
    return get().pendingEvent
  },

  peekPendingGotoDate(): string | null {
    return get().pendingGotoDateIso
  },

  peekPendingCreateOnDay(): PendingCreateEventOnDay | null {
    return get().pendingCreateOnDay
  },

  clearPendingEvent(): void {
    set({ pendingEvent: null })
  },

  clearPendingGotoDate(): void {
    set({ pendingGotoDateIso: null })
  },

  clearPendingCreateOnDay(): void {
    set({ pendingCreateOnDay: null })
  }
}))
