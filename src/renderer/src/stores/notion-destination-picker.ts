import { create } from 'zustand'
import type { CalendarEventView, NotionPickResult } from '@shared/types'

export type NotionPickKind = 'mail' | 'calendar'

export interface NotionPickOptions {
  suggestedTitle?: string
  /** Mail-ID beim Senden aus dem Kontextmenü (für „Neue Seite mit Inhalt“). */
  messageId?: number
  /** Termin beim Senden aus dem Kalender-Kontextmenü. */
  calendarEvent?: CalendarEventView
  localeCode?: 'de' | 'en'
}

interface NotionDestinationPickerStore {
  open: boolean
  kind: NotionPickKind | null
  suggestedTitle: string
  messageId: number | null
  calendarEvent: CalendarEventView | null
  localeCode: 'de' | 'en'
  _finish: ((result: NotionPickResult | null) => void) | null
  close: (result: NotionPickResult | null) => void
}

const initial = {
  open: false,
  kind: null as NotionPickKind | null,
  suggestedTitle: '',
  messageId: null as number | null,
  calendarEvent: null as CalendarEventView | null,
  localeCode: 'de' as const,
  _finish: null as ((result: NotionPickResult | null) => void) | null
}

export const useNotionDestinationPickerStore = create<NotionDestinationPickerStore>((set, get) => ({
  ...initial,

  close(result: NotionPickResult | null): void {
    const fn = get()._finish
    set({ ...initial })
    fn?.(result)
  }
}))

export function pickNotionDestination(
  kind: NotionPickKind,
  options?: NotionPickOptions
): Promise<NotionPickResult | null> {
  return new Promise((resolve) => {
    useNotionDestinationPickerStore.setState({
      open: true,
      kind,
      suggestedTitle: options?.suggestedTitle?.trim() ?? '',
      messageId: options?.messageId ?? null,
      calendarEvent: options?.calendarEvent ?? null,
      localeCode: options?.localeCode === 'en' ? 'en' : 'de',
      _finish: resolve
    })
  })
}
