import {
  clampDashboardTilePlacement,
  dashboardTilePlacementValid,
  DASHBOARD_LAYOUT_LEGACY_REF_WIDTH_PX,
  isLikelyLegacyGridPlacement,
  migrateGridCellPlacementToPixel,
  readDashboardAlignStepPx,
  snapDashboardTilePlacementToGrid,
  type DashboardTilePlacement
} from '@/app/home/dashboard-layout'

export const DASHBOARD_CUSTOM_TILES_STORAGE_KEY = 'mailclient.dashboardCustomTiles.v1'

export const DASHBOARD_CUSTOM_TILE_ID_PREFIX = 'dashct:'

export type DashboardCustomTileKind = 'folder' | 'calendar_event' | 'mail'

export interface DashboardCustomTileStored {
  id: string
  kind: DashboardCustomTileKind
  accountId: string
  folderId?: number
  /** `CalendarEventView.id` */
  eventId?: string
  eventTitle?: string
  eventStartIso?: string
  messageId?: number
  mailSubject?: string
  label: string
  placement: DashboardTilePlacement
}

export function isCustomDashboardTileId(id: string): boolean {
  return id.startsWith(DASHBOARD_CUSTOM_TILE_ID_PREFIX)
}

export function newCustomDashboardTileId(): string {
  return `${DASHBOARD_CUSTOM_TILE_ID_PREFIX}${crypto.randomUUID()}`
}

function normalizeCustomTilePlacement(raw: Record<string, unknown>): DashboardTilePlacement | null {
  const x = Number(raw.x)
  const y = Number(raw.y)
  const w = Number(raw.w)
  const h = Number(raw.h)
  if (![x, y, w, h].every((n) => Number.isFinite(n))) return null
  const coarse: DashboardTilePlacement = {
    x: Math.round(x),
    y: Math.round(y),
    w: Math.round(w),
    h: Math.round(h)
  }
  const placement = isLikelyLegacyGridPlacement(coarse)
    ? migrateGridCellPlacementToPixel(coarse, DASHBOARD_LAYOUT_LEGACY_REF_WIDTH_PX)
    : clampDashboardTilePlacement(coarse)
  if (!dashboardTilePlacementValid(placement)) return null
  return snapDashboardTilePlacementToGrid(placement, readDashboardAlignStepPx())
}

export function readDashboardCustomTilesFromStorage(): DashboardCustomTileStored[] {
  try {
    const raw = window.localStorage.getItem(DASHBOARD_CUSTOM_TILES_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return []
    const o = parsed as Record<string, unknown>
    const entries = o.entries
    if (!Array.isArray(entries)) return []
    const out: DashboardCustomTileStored[] = []
    for (const row of entries) {
      const e = normalizeCustomTileRow(row)
      if (e) out.push(e)
    }
    return out
  } catch {
    return []
  }
}

export function writeDashboardCustomTilesToStorage(entries: readonly DashboardCustomTileStored[]): void {
  try {
    window.localStorage.setItem(
      DASHBOARD_CUSTOM_TILES_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 2, entries: [...entries] })
    )
  } catch {
    // ignore
  }
}

export function parseCustomTilesSnapshotArray(raw: unknown): DashboardCustomTileStored[] {
  if (!Array.isArray(raw)) return []
  const out: DashboardCustomTileStored[] = []
  for (const row of raw) {
    const e = normalizeCustomTileRow(row)
    if (e) out.push(e)
  }
  return out
}

function normalizeCustomTileRow(raw: unknown): DashboardCustomTileStored | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const id = typeof o.id === 'string' && o.id.startsWith(DASHBOARD_CUSTOM_TILE_ID_PREFIX) ? o.id : null
  const kind = o.kind === 'folder' || o.kind === 'calendar_event' || o.kind === 'mail' ? o.kind : null
  const accountId = typeof o.accountId === 'string' ? o.accountId : null
  const label = typeof o.label === 'string' ? o.label : ''
  if (!id || !kind || !accountId) return null
  const pl = o.placement
  if (!pl || typeof pl !== 'object') return null
  const placement = normalizeCustomTilePlacement(pl as Record<string, unknown>)
  if (!placement) return null
  const folderId = typeof o.folderId === 'number' ? o.folderId : undefined
  const eventId = typeof o.eventId === 'string' ? o.eventId : undefined
  const eventTitle = typeof o.eventTitle === 'string' ? o.eventTitle : undefined
  const eventStartIso = typeof o.eventStartIso === 'string' ? o.eventStartIso : undefined
  const messageId = typeof o.messageId === 'number' ? o.messageId : undefined
  const mailSubject = typeof o.mailSubject === 'string' ? o.mailSubject : undefined
  return {
    id,
    kind,
    accountId,
    folderId,
    eventId,
    eventTitle,
    eventStartIso,
    messageId,
    mailSubject,
    label: label || id,
    placement
  }
}

export function customTilesForLayoutMerge(
  entries: readonly DashboardCustomTileStored[]
): { id: string; placement: DashboardTilePlacement }[] {
  return entries.map((e) => ({ id: e.id, placement: e.placement }))
}

export function applyCustomPlacementsFromMerged(
  entries: readonly DashboardCustomTileStored[],
  full: Record<string, DashboardTilePlacement>
): DashboardCustomTileStored[] {
  return entries.map((e) => {
    const p = full[e.id]
    return p ? { ...e, placement: { ...p } } : { ...e }
  })
}
