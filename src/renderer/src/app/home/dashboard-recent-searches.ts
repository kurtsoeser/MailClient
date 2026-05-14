const STORAGE_KEY = 'mailclient.dashboard.recentSearches.v1'
const MAX = 5

export function readRecentSearches(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((x): x is string => typeof x === 'string')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(0, MAX)
  } catch {
    return []
  }
}

export function pushRecentSearch(query: string): void {
  const q = query.trim()
  if (q.length < 2) return
  try {
    const prev = readRecentSearches().filter((x) => x.toLowerCase() !== q.toLowerCase())
    const next = [q, ...prev].slice(0, MAX)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // ignore
  }
}
