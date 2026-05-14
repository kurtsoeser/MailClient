/**
 * Persistente „Zuletzt verwendet“-Ziele fuer Mail-Verschiebung (localStorage).
 */
const STORAGE_KEY = 'mailclient.recentMailMoveFolders'
const MAX = 12

export type RecentMailMoveFolder = {
  folderId: number
  accountId: string
  /** ISO Zeitstempel der letzten Nutzung */
  usedAt: string
}

function safeParse(raw: string | null): RecentMailMoveFolder[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw) as unknown
    if (!Array.isArray(v)) return []
    const out: RecentMailMoveFolder[] = []
    for (const row of v) {
      if (!row || typeof row !== 'object') continue
      const o = row as Record<string, unknown>
      const folderId = o.folderId
      const accountId = o.accountId
      const usedAt = o.usedAt
      if (typeof folderId !== 'number' || !Number.isFinite(folderId)) continue
      if (typeof accountId !== 'string' || !accountId) continue
      if (typeof usedAt !== 'string' || !usedAt) continue
      out.push({ folderId, accountId, usedAt })
    }
    return out
  } catch {
    return []
  }
}

export function readRecentMailMoveFolders(): RecentMailMoveFolder[] {
  return safeParse(typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY))
}

export function touchRecentMailMoveFolder(accountId: string, folderId: number): void {
  try {
    const prev = readRecentMailMoveFolders()
    const rest = prev.filter((e) => !(e.folderId === folderId && e.accountId === accountId))
    const next: RecentMailMoveFolder[] = [
      {
        folderId,
        accountId,
        usedAt: new Date().toISOString()
      },
      ...rest
    ].slice(0, MAX)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Ignore Quota oder private Mode
  }
}
