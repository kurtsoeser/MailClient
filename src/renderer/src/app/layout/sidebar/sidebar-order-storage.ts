/** Feste IDs fuer Eintraege im Schnellzugriff (Reihenfolge per Drag & Drop). */
export const DEFAULT_QUICK_ACCESS_ORDER = [
  'unified_inbox',
  'flagged',
  'todo',
  'snoozed',
  'waiting'
] as const

export type QuickAccessNavId = (typeof DEFAULT_QUICK_ACCESS_ORDER)[number]

const QA_STORAGE_KEY = 'mailclient.sidebarQuickAccessOrder'
const FAV_STORAGE_KEY = 'mailclient.sidebarFavoriteFolderOrder'

const QA_ALLOWED = new Set<string>(DEFAULT_QUICK_ACCESS_ORDER)

export function readQuickAccessOrder(): QuickAccessNavId[] {
  try {
    const raw = window.localStorage.getItem(QA_STORAGE_KEY)
    if (!raw) return [...DEFAULT_QUICK_ACCESS_ORDER]
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return [...DEFAULT_QUICK_ACCESS_ORDER]
    const seen = new Set<string>()
    const out: QuickAccessNavId[] = []
    for (const x of parsed) {
      if (typeof x !== 'string' || !QA_ALLOWED.has(x)) continue
      const id = x as QuickAccessNavId
      if (seen.has(id)) continue
      seen.add(id)
      out.push(id)
    }
    for (const id of DEFAULT_QUICK_ACCESS_ORDER) {
      if (!seen.has(id)) out.push(id)
    }
    return out
  } catch {
    return [...DEFAULT_QUICK_ACCESS_ORDER]
  }
}

export function persistQuickAccessOrder(order: readonly QuickAccessNavId[]): void {
  try {
    window.localStorage.setItem(QA_STORAGE_KEY, JSON.stringify([...order]))
  } catch {
    // ignore
  }
}

export function readFavoriteFolderOrder(): number[] {
  try {
    const raw = window.localStorage.getItem(FAV_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((x) => (typeof x === 'number' && Number.isFinite(x) ? Math.floor(x) : NaN))
      .filter((x) => x > 0)
  } catch {
    return []
  }
}

export function persistFavoriteFolderOrder(order: readonly number[]): void {
  try {
    window.localStorage.setItem(FAV_STORAGE_KEY, JSON.stringify([...order]))
  } catch {
    // ignore
  }
}

/** Gespeicherte Reihenfolge mit aktuellen Favoriten-IDs abgleichen (entfernt/hinzugefuegt). */
export function reconcileFavoriteFolderOrder(
  currentFolderIds: readonly number[],
  stored: readonly number[]
): number[] {
  const cur = new Set(currentFolderIds)
  const out: number[] = []
  const used = new Set<number>()
  for (const id of stored) {
    if (!cur.has(id) || used.has(id)) continue
    out.push(id)
    used.add(id)
  }
  for (const id of currentFolderIds) {
    if (!used.has(id)) out.push(id)
  }
  return out
}
