import { create } from 'zustand'

/** Rechte Kalender-Seitenpanels: eingebettet in der Zeile oder als schwebendes Fenster. */
export type CalendarSidePanelPlacement = 'dock' | 'float'

const K_INBOX = 'mailclient.calendarPanel.inboxPlacement'
const K_PREVIEW = 'mailclient.calendarPanel.previewPlacement'

function readPlacement(key: string, fallback: CalendarSidePanelPlacement): CalendarSidePanelPlacement {
  try {
    const v = window.localStorage.getItem(key)
    if (v === 'dock' || v === 'float') return v
  } catch {
    // ignore
  }
  return fallback
}

function writePlacement(key: string, value: CalendarSidePanelPlacement): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // ignore
  }
}

interface CalendarPanelLayoutState {
  inboxPlacement: CalendarSidePanelPlacement
  previewPlacement: CalendarSidePanelPlacement
  setInboxPlacement: (p: CalendarSidePanelPlacement) => void
  setPreviewPlacement: (p: CalendarSidePanelPlacement) => void
}

export const useCalendarPanelLayoutStore = create<CalendarPanelLayoutState>((set) => ({
  inboxPlacement: readPlacement(K_INBOX, 'dock'),
  /** Vorschau: Standard „losgeloest“ (Pop-up); laesst sich andocken. */
  previewPlacement: readPlacement(K_PREVIEW, 'float'),
  setInboxPlacement(p): void {
    writePlacement(K_INBOX, p)
    set({ inboxPlacement: p })
  },
  setPreviewPlacement(p): void {
    writePlacement(K_PREVIEW, p)
    set({ previewPlacement: p })
  }
}))
