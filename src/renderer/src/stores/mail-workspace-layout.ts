import { create } from 'zustand'

export type MailWorkspaceSidePlacement = 'dock' | 'float'

const K_READING_PLACEMENT = 'mailclient.mailWorkspace.readingPlacement'
const K_CALENDAR_PLACEMENT = 'mailclient.mailWorkspace.inboxCalendarPlacement'
const K_READING_OPEN = 'mailclient.mailWorkspace.readingOpen'
const K_CALENDAR_OPEN = 'mailclient.mailWorkspace.inboxCalendarOpen'

function readPlacement(key: string, fallback: MailWorkspaceSidePlacement): MailWorkspaceSidePlacement {
  try {
    const v = window.localStorage.getItem(key)
    if (v === 'dock' || v === 'float') return v
  } catch {
    // ignore
  }
  return fallback
}

function writePlacement(key: string, value: MailWorkspaceSidePlacement): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // ignore
  }
}

function readBool(key: string, fallback: boolean): boolean {
  try {
    const v = window.localStorage.getItem(key)
    if (v === '0') return false
    if (v === '1') return true
  } catch {
    // ignore
  }
  return fallback
}

function writeBool(key: string, value: boolean): void {
  try {
    window.localStorage.setItem(key, value ? '1' : '0')
  } catch {
    // ignore
  }
}

interface MailWorkspaceLayoutState {
  readingPlacement: MailWorkspaceSidePlacement
  calendarPlacement: MailWorkspaceSidePlacement
  readingOpen: boolean
  calendarOpen: boolean
  setReadingPlacement: (p: MailWorkspaceSidePlacement) => void
  setCalendarPlacement: (p: MailWorkspaceSidePlacement) => void
  setReadingOpen: (open: boolean) => void
  setCalendarOpen: (open: boolean) => void
}

export const useMailWorkspaceLayoutStore = create<MailWorkspaceLayoutState>((set) => ({
  readingPlacement: readPlacement(K_READING_PLACEMENT, 'dock'),
  calendarPlacement: readPlacement(K_CALENDAR_PLACEMENT, 'dock'),
  readingOpen: readBool(K_READING_OPEN, true),
  calendarOpen: readBool(K_CALENDAR_OPEN, true),
  setReadingPlacement(p): void {
    writePlacement(K_READING_PLACEMENT, p)
    set({ readingPlacement: p })
  },
  setCalendarPlacement(p): void {
    writePlacement(K_CALENDAR_PLACEMENT, p)
    set({ calendarPlacement: p })
  },
  setReadingOpen(open): void {
    writeBool(K_READING_OPEN, open)
    set({ readingOpen: open })
  },
  setCalendarOpen(open): void {
    writeBool(K_CALENDAR_OPEN, open)
    set({ calendarOpen: open })
  }
}))
