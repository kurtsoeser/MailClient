const RECENT_KEY = 'mailclient.notes.searchRecent'
const MAX_RECENT = 8

export function readNotesSearchRecentIds(): number[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((id): id is number => typeof id === 'number' && id > 0).slice(0, MAX_RECENT)
  } catch {
    return []
  }
}

export function pushNotesSearchRecentId(noteId: number): void {
  if (!Number.isFinite(noteId) || noteId <= 0) return
  const prev = readNotesSearchRecentIds().filter((id) => id !== noteId)
  const next = [noteId, ...prev].slice(0, MAX_RECENT)
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
}
