import type { DashboardCustomTileStored } from '@/app/home/dashboard-custom-tiles'
import { parseCustomTilesSnapshotArray } from '@/app/home/dashboard-custom-tiles'
import {
  DASHBOARD_LAYOUT_DEFAULT,
  DASHBOARD_TILE_IDS,
  clampDashboardTilePlacement,
  dashboardTilePlacementValid,
  type DashboardTileId,
  type DashboardTilePlacement
} from '@/app/home/dashboard-layout'

/** Separater Snapshot nur fuer explizites „Speichern“ / „Wiederherstellen“. */
export const DASHBOARD_USER_SNAPSHOT_STORAGE_KEY = 'mailclient.dashboardUserSnapshot.v1'

type SnapshotFileV1 = {
  v: 1
  layout: Record<string, unknown>
  hidden: string[]
  pinned: string[]
  customEntries: unknown[]
}

function parseLayoutFromSnapshot(layoutObj: Record<string, unknown>): Record<DashboardTileId, DashboardTilePlacement> | null {
  const merged: Record<DashboardTileId, DashboardTilePlacement> = { ...DASHBOARD_LAYOUT_DEFAULT }
  for (const id of DASHBOARD_TILE_IDS) {
    const pl = layoutObj[id]
    if (!pl || typeof pl !== 'object') {
      continue
    }
    const rec = pl as Record<string, unknown>
    const x = Number(rec.x)
    const y = Number(rec.y)
    const w = Number(rec.w)
    const h = Number(rec.h)
    if (![x, y, w, h].every((n) => Number.isFinite(n))) return null
    const coarse: DashboardTilePlacement = {
      x: Math.round(x),
      y: Math.round(y),
      w: Math.round(w),
      h: Math.round(h)
    }
    const c = clampDashboardTilePlacement(coarse)
    if (!dashboardTilePlacementValid(c)) return null
    merged[id] = c
  }
  return merged
}

export function hasDashboardUserSnapshotV1(): boolean {
  try {
    const raw = window.localStorage.getItem(DASHBOARD_USER_SNAPSHOT_STORAGE_KEY)
    if (!raw) return false
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return false
    const o = parsed as Record<string, unknown>
    return o.v === 1 && o.layout != null && typeof o.layout === 'object'
  } catch {
    return false
  }
}

export function writeDashboardUserSnapshotV1(args: {
  layout: Record<DashboardTileId, DashboardTilePlacement>
  hidden: ReadonlySet<string>
  pinned: ReadonlySet<string>
  customEntries: readonly DashboardCustomTileStored[]
}): void {
  try {
    const payload: SnapshotFileV1 = {
      v: 1,
      layout: { ...args.layout } as Record<string, unknown>,
      hidden: [...args.hidden],
      pinned: [...args.pinned],
      customEntries: [...args.customEntries] as unknown[]
    }
    window.localStorage.setItem(DASHBOARD_USER_SNAPSHOT_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // ignore
  }
}

export function readDashboardUserSnapshotV1(): {
  layout: Record<DashboardTileId, DashboardTilePlacement>
  hidden: Set<string>
  pinned: Set<string>
  customEntries: DashboardCustomTileStored[]
} | null {
  try {
    const raw = window.localStorage.getItem(DASHBOARD_USER_SNAPSHOT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    const o = parsed as SnapshotFileV1
    if (o.v !== 1 || !o.layout || typeof o.layout !== 'object') return null
    const layout = parseLayoutFromSnapshot(o.layout as Record<string, unknown>)
    if (!layout) return null
    const hidden = Array.isArray(o.hidden) ? o.hidden.filter((x): x is string => typeof x === 'string') : []
    const pinned = Array.isArray(o.pinned) ? o.pinned.filter((x): x is string => typeof x === 'string') : []
    const customEntries = parseCustomTilesSnapshotArray(o.customEntries)
    return {
      layout,
      hidden: new Set(hidden),
      pinned: new Set(pinned),
      customEntries
    }
  } catch {
    return null
  }
}
