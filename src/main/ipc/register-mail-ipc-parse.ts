import type {
  ComposeDriveExplorerEntry,
  ComposeDriveExplorerNavCrumb,
  ComposeDriveExplorerScope
} from '@shared/types'

export function parseDriveExplorerScope(raw: unknown): ComposeDriveExplorerScope | null {
  if (raw === 'recent' || raw === 'myfiles' || raw === 'shared' || raw === 'sharepoint') return raw
  return null
}

export function parseDriveExplorerNavCrumbs(raw: unknown): ComposeDriveExplorerNavCrumb[] {
  if (!Array.isArray(raw)) return []
  const out: ComposeDriveExplorerNavCrumb[] = []
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue
    const o = x as Record<string, unknown>
    const id = o.id === null ? null : typeof o.id === 'string' ? o.id : null
    const name = typeof o.name === 'string' ? o.name : ''
    const driveId =
      typeof o.driveId === 'string'
        ? o.driveId.trim() || null
        : o.driveId === null
          ? null
          : undefined
    const siteId =
      typeof o.siteId === 'string'
        ? o.siteId.trim() || null
        : o.siteId === null
          ? null
          : undefined
    if (id === null && !name.trim() && siteId == null && driveId == null) continue
    out.push({ id, name: name.trim() || '—', driveId: driveId ?? undefined, siteId: siteId ?? undefined })
  }
  return out
}

export function parseDriveExplorerEntries(raw: unknown): ComposeDriveExplorerEntry[] | null {
  if (!Array.isArray(raw)) return null
  const out: ComposeDriveExplorerEntry[] = []
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue
    const o = x as Record<string, unknown>
    const id = typeof o.id === 'string' ? o.id.trim() : ''
    const name = typeof o.name === 'string' ? o.name.trim() : ''
    if (!id || !name) continue
    const webUrl = typeof o.webUrl === 'string' && o.webUrl ? o.webUrl : null
    const size = typeof o.size === 'number' ? o.size : null
    const mimeType = typeof o.mimeType === 'string' ? o.mimeType : null
    const isFolder = o.isFolder === true
    const driveId =
      typeof o.driveId === 'string'
        ? o.driveId.trim() || null
        : o.driveId === null
          ? null
          : undefined
    const siteId =
      typeof o.siteId === 'string'
        ? o.siteId.trim() || null
        : o.siteId === null
          ? null
          : undefined
    out.push({
      id,
      name,
      webUrl,
      size,
      mimeType,
      isFolder,
      driveId: driveId ?? undefined,
      siteId: siteId ?? undefined
    })
  }
  return out.length ? out : null
}
