export type NotesSidebarListMode = 'accounts' | 'sections'

const LIST_MODE_KEY = 'mailclient.notes.sidebarListMode'
const ACCOUNT_OPEN_KEY = 'mailclient.notes.accountSidebarOpen'

export function readNotesSidebarListMode(): NotesSidebarListMode {
  try {
    const v = window.localStorage.getItem(LIST_MODE_KEY)
    if (v === 'accounts' || v === 'sections') return v
  } catch {
    /* ignore */
  }
  return 'sections'
}

export function persistNotesSidebarListMode(mode: NotesSidebarListMode): void {
  try {
    window.localStorage.setItem(LIST_MODE_KEY, mode)
  } catch {
    /* ignore */
  }
}

export function readNotesAccountSidebarOpen(): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(ACCOUNT_OPEN_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: Record<string, boolean> = {}
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'boolean') out[k] = v
      }
      return out
    }
  } catch {
    /* ignore */
  }
  return {}
}

export function persistNotesAccountSidebarOpen(open: Record<string, boolean>): void {
  try {
    window.localStorage.setItem(ACCOUNT_OPEN_KEY, JSON.stringify(open))
  } catch {
    /* ignore */
  }
}
