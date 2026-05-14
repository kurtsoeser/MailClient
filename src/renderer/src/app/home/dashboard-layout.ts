/** Nur fuer Migration alter Raster-Speicherstaende (12 Spalten). */
export const DASHBOARD_GRID_COLS = 12
export const DASHBOARD_ROW_UNIT_PX = 40
export const DASHBOARD_GRID_GAP_PX = 8

/** Aktuelles Layout (Pixel): links/oben/Breite/Hoehe relativ zum Dashboard-Canvas. */
export const DASHBOARD_LAYOUT_STORAGE_KEY = 'mailclient.dashboardTileLayout.v2'
/** Vorheriges Raster-Layout; wird einmalig nach v2 migriert. */
export const DASHBOARD_LAYOUT_STORAGE_KEY_V1 = 'mailclient.dashboardTileLayout.v1'

export const DASHBOARD_HIDDEN_STORAGE_KEY = 'mailclient.dashboardTileHidden.v1'
/** Gepinnte Kacheln: hoeherer z-Index; Position ist wie bei allen anderen in Pixeln. */
export const DASHBOARD_PINNED_STORAGE_KEY = 'mailclient.dashboardTilePinned.v1'

/** Kantenlaenge des quadratischen Ausrichtungsrasters fuer Kacheln (Pixel), konfigurierbar. */
export const DASHBOARD_GRID_STEP_STORAGE_KEY = 'mailclient.dashboardGridStepPx.v1'
export const DASHBOARD_GRID_STEP_CHANGED_EVENT = 'mailclient.dashboardGridStepChanged'
export const DASHBOARD_GRID_STEP_DEFAULT_PX = 24
export const DASHBOARD_GRID_STEP_MIN_PX = 8
export const DASHBOARD_GRID_STEP_MAX_PX = 64

export type DashboardTileId =
  | 'todo_all'
  | 'todo_overdue'
  | 'todo_today'
  | 'todo_tomorrow'
  | 'todo_week'
  | 'todo_later'
  | 'inbox'
  | 'calendar'
  | 'composer'
  | 'waiting'
  | 'snoozed'
  | 'search'
  | 'week'
  | 'month'
  | 'today_timeline'
  | 'deadlines'
  | 'favorites'
  | 'weather'
  | 'today_clock'
  | 'world_clock'
  | 'next_online_meeting'
  | 'desk_note'

export const DASHBOARD_TILE_IDS: DashboardTileId[] = [
  'todo_all',
  'todo_overdue',
  'todo_today',
  'todo_tomorrow',
  'todo_week',
  'todo_later',
  'inbox',
  'waiting',
  'snoozed',
  'search',
  'calendar',
  'week',
  'month',
  'today_timeline',
  'deadlines',
  'favorites',
  'weather',
  'today_clock',
  'world_clock',
  'next_online_meeting',
  'desk_note',
  'composer'
]

/** x/y = linke obere Ecke im Canvas (px), w/h = Groesse (px). */
export interface DashboardTilePlacement {
  x: number
  y: number
  w: number
  h: number
}

export const DASHBOARD_TILE_MIN_W_PX = 160
export const DASHBOARD_TILE_MIN_H_PX = 120
const MAX_W_PX = 5600
const MAX_H_PX = 5600

type LegacyGridCell = { x: number; y: number; w: number; h: number }

/**
 * Standard-Anordnung (Screenshot „Start“-Dashboard, Mai 2024):
 * Grob 7 Spalten → auf 12 Legacy-Spalten abgebildet; Kachelbreite mindestens 2 Spalten (Mindestpixelbreite).
 * Zeilenhoehe wie bisher: `DASHBOARD_ROW_UNIT_PX` + `DASHBOARD_GRID_GAP_PX` pro Rasterzeile.
 */
const LEGACY_GRID_LAYOUT: Record<DashboardTileId, LegacyGridCell> = {
  /** Spalte 0–1: Posteingang hoch, darunter „Warten auf Antwort“. */
  inbox: { x: 0, y: 0, w: 2, h: 10 },
  waiting: { x: 0, y: 10, w: 2, h: 5 },
  /** Spalte 2–3: ToDo Alle hoch. */
  todo_all: { x: 2, y: 0, w: 2, h: 10 },
  /** Obere ToDo-Kurzkacheln (Heute / Morgen / Woche). */
  todo_today: { x: 4, y: 0, w: 2, h: 5 },
  todo_tomorrow: { x: 6, y: 0, w: 2, h: 5 },
  todo_week: { x: 8, y: 0, w: 2, h: 5 },
  /** Untere ToDo-Kurzkacheln (Überfällig / Später), Suche kompakt dazwischen. */
  todo_overdue: { x: 4, y: 5, w: 2, h: 5 },
  search: { x: 6, y: 5, w: 2, h: 5 },
  todo_later: { x: 8, y: 5, w: 2, h: 5 },
  /** Großer Mail-Editor unter ToDo Alle (3 Konzeptspalten breit, 2 hoch). */
  composer: { x: 2, y: 10, w: 6, h: 10 },
  /** Zurückgestellt / Favoriten / Kalender Woche im mittleren Streifen. */
  snoozed: { x: 8, y: 10, w: 2, h: 5 },
  favorites: { x: 8, y: 15, w: 2, h: 5 },
  week: { x: 4, y: 20, w: 4, h: 5 },
  /** Heute 7–20 Uhr: links neben der Wochenkachel. */
  today_timeline: { x: 0, y: 20, w: 4, h: 5 },
  /** Rechts: Monatskalender oben, darunter Nächste Termine. */
  month: { x: 10, y: 0, w: 2, h: 9 },
  calendar: { x: 10, y: 9, w: 2, h: 16 },
  /** Unten links: Wetter (unter Warten / neben Fristen). */
  weather: { x: 0, y: 25, w: 2, h: 6 },
  /** Datum & Uhrzeit (live) zwischen Wetter und Fristen. */
  today_clock: { x: 2, y: 25, w: 2, h: 6 },
  /** Unten: Fristen & Flags über die Breite unter Composer/Woche. */
  deadlines: { x: 4, y: 25, w: 8, h: 6 },
  /** Neue Zusatzkacheln unterhalb der Standardansicht, ohne bestehende Kacheln zu verschieben. */
  next_online_meeting: { x: 0, y: 31, w: 4, h: 5 },
  world_clock: { x: 4, y: 31, w: 2, h: 6 },
  desk_note: { x: 6, y: 31, w: 4, h: 5 }
}

/** Referenzbreite fuer Raster→Pixel (Defaults + Migration). */
export const DASHBOARD_LAYOUT_LEGACY_REF_WIDTH_PX = 1280

function legacyGridToPixelPlacement(cell: LegacyGridCell, refContainerWidth: number): DashboardTilePlacement {
  const gap = DASHBOARD_GRID_GAP_PX
  const rowH = DASHBOARD_ROW_UNIT_PX
  const colW = (refContainerWidth - (DASHBOARD_GRID_COLS - 1) * gap) / DASHBOARD_GRID_COLS
  const cW = Math.max(1, colW)
  return {
    x: cell.x * (cW + gap),
    y: cell.y * (rowH + gap),
    w: cell.w * cW + (cell.w - 1) * gap,
    h: cell.h * rowH + (cell.h - 1) * gap
  }
}

function buildDefaultPixelLayout(): Record<DashboardTileId, DashboardTilePlacement> {
  const o = {} as Record<DashboardTileId, DashboardTilePlacement>
  for (const id of DASHBOARD_TILE_IDS) {
    o[id] = legacyGridToPixelPlacement(LEGACY_GRID_LAYOUT[id]!, DASHBOARD_LAYOUT_LEGACY_REF_WIDTH_PX)
  }
  return o
}

export const DASHBOARD_LAYOUT_DEFAULT: Record<DashboardTileId, DashboardTilePlacement> = buildDefaultPixelLayout()

/** Raster-Zellen → Pixel (Migration). */
export function migrateGridCellPlacementToPixel(
  grid: DashboardTilePlacement,
  refContainerWidth: number
): DashboardTilePlacement {
  return legacyGridToPixelPlacement(
    { x: grid.x, y: grid.y, w: grid.w, h: grid.h },
    refContainerWidth
  )
}

export function isLikelyLegacyGridPlacement(p: DashboardTilePlacement): boolean {
  return (
    p.x >= 0 &&
    p.y >= 0 &&
    p.w >= 1 &&
    p.w <= 12 &&
    p.h >= 5 &&
    p.h <= 48 &&
    p.x + p.w <= 12 &&
    Number.isInteger(p.x) &&
    Number.isInteger(p.y) &&
    Number.isInteger(p.w) &&
    Number.isInteger(p.h)
  )
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Math.round(v)))
}

export function clampDashboardTilePlacement(p: DashboardTilePlacement): DashboardTilePlacement {
  const w = Math.min(MAX_W_PX, Math.max(DASHBOARD_TILE_MIN_W_PX, Math.round(p.w)))
  const h = Math.min(MAX_H_PX, Math.max(DASHBOARD_TILE_MIN_H_PX, Math.round(p.h)))
  const x = Math.max(0, Math.round(p.x))
  const y = Math.max(0, Math.round(p.y))
  return { x, y, w, h }
}

export function readDashboardAlignStepPx(): number {
  try {
    const raw = window.localStorage.getItem(DASHBOARD_GRID_STEP_STORAGE_KEY)
    if (raw == null || raw === '') return DASHBOARD_GRID_STEP_DEFAULT_PX
    const n = Number.parseInt(raw, 10)
    if (!Number.isFinite(n)) return DASHBOARD_GRID_STEP_DEFAULT_PX
    return Math.min(
      DASHBOARD_GRID_STEP_MAX_PX,
      Math.max(DASHBOARD_GRID_STEP_MIN_PX, Math.round(n))
    )
  } catch {
    return DASHBOARD_GRID_STEP_DEFAULT_PX
  }
}

export function writeDashboardAlignStepPx(px: number): void {
  const v = Math.min(
    DASHBOARD_GRID_STEP_MAX_PX,
    Math.max(
      DASHBOARD_GRID_STEP_MIN_PX,
      Math.round(Number.isFinite(px) ? px : DASHBOARD_GRID_STEP_DEFAULT_PX)
    )
  )
  try {
    window.localStorage.setItem(DASHBOARD_GRID_STEP_STORAGE_KEY, String(v))
    window.dispatchEvent(new Event(DASHBOARD_GRID_STEP_CHANGED_EVENT))
  } catch {
    // ignore
  }
}

function coerceDashboardGridStepPx(stepPx: number): number {
  return Math.min(
    DASHBOARD_GRID_STEP_MAX_PX,
    Math.max(
      DASHBOARD_GRID_STEP_MIN_PX,
      Math.round(Number.isFinite(stepPx) ? stepPx : DASHBOARD_GRID_STEP_DEFAULT_PX)
    )
  )
}

/** Position und Groesse auf Vielfache von `stepPx` (mindestens Mindestgroesse der Kachel). */
export function snapDashboardTilePlacementToGrid(
  p: DashboardTilePlacement,
  stepPx: number
): DashboardTilePlacement {
  const step = coerceDashboardGridStepPx(stepPx)
  let { x, y, w, h } = clampDashboardTilePlacement(p)
  const minW = Math.ceil(DASHBOARD_TILE_MIN_W_PX / step) * step
  const minH = Math.ceil(DASHBOARD_TILE_MIN_H_PX / step) * step
  x = Math.max(0, Math.round(x / step) * step)
  y = Math.max(0, Math.round(y / step) * step)
  w = Math.min(MAX_W_PX, Math.max(minW, Math.round(w / step) * step))
  h = Math.min(MAX_H_PX, Math.max(minH, Math.round(h / step) * step))
  return { x, y, w, h }
}

export function snapMergedDashboardPlacements(
  full: Record<string, DashboardTilePlacement>,
  stepPx: number
): Record<string, DashboardTilePlacement> {
  const next: Record<string, DashboardTilePlacement> = { ...full }
  for (const k of Object.keys(next)) {
    const pl = next[k]
    if (pl) next[k] = snapDashboardTilePlacementToGrid(pl, stepPx)
  }
  return next
}

/**
 * Nach Verschieben/Resize: alle Kacheln auf Mindestgroessen begrenzen und auf das Raster schnappen.
 * Ueberlappungen bleiben erlaubt (kein automatisches Wegschieben).
 */
export function finalizeDashboardLayoutWithGrid(
  fullIn: Record<string, DashboardTilePlacement>,
  _orderedTileIds: readonly string[],
  _hidden: ReadonlySet<string>,
  stepPx: number,
  _pinned: ReadonlySet<string> | null = null
): Record<string, DashboardTilePlacement> {
  const step = coerceDashboardGridStepPx(stepPx)
  let work: Record<string, DashboardTilePlacement> = { ...fullIn }
  for (const k of Object.keys(work)) {
    const pl = work[k]
    if (pl) work[k] = clampDashboardTilePlacement(pl)
  }
  return snapMergedDashboardPlacements(work, step)
}

function finalizeBuiltinLayoutRecord(
  layout: Record<DashboardTileId, DashboardTilePlacement>,
  hidden: ReadonlySet<string>,
  stepPx: number
): Record<DashboardTileId, DashboardTilePlacement> {
  const orderEmpty = mergedDashboardTileOrder([])
  const pin = readDashboardPinnedFromStorage()
  const fullM = finalizeDashboardLayoutWithGrid(buildMergedPlacementMap(layout, []), orderEmpty, hidden, stepPx, pin)
  return extractBuiltinLayoutFromMerged(fullM)
}

function placementValid(p: DashboardTilePlacement): boolean {
  if (![p.x, p.y, p.w, p.h].every((n) => Number.isFinite(n))) return false
  if (p.x < 0 || p.y < 0) return false
  if (p.w < DASHBOARD_TILE_MIN_W_PX || p.h < DASHBOARD_TILE_MIN_H_PX) return false
  if (p.w > MAX_W_PX || p.h > MAX_H_PX) return false
  return true
}

export function dashboardTilePlacementValid(p: DashboardTilePlacement): boolean {
  return placementValid(p)
}

export function placementsOverlap(a: DashboardTilePlacement, b: DashboardTilePlacement): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

export function mergedDashboardTileOrder(customIds: readonly string[]): string[] {
  return [...DASHBOARD_TILE_IDS, ...customIds]
}

export function buildMergedPlacementMap(
  builtin: Record<DashboardTileId, DashboardTilePlacement>,
  custom: ReadonlyArray<{ id: string; placement: DashboardTilePlacement }>
): Record<string, DashboardTilePlacement> {
  const m: Record<string, DashboardTilePlacement> = {}
  for (const id of DASHBOARD_TILE_IDS) {
    m[id] = { ...builtin[id]! }
  }
  for (const c of custom) {
    m[c.id] = { ...c.placement }
  }
  return m
}

export function extractBuiltinLayoutFromMerged(
  full: Record<string, DashboardTilePlacement>
): Record<DashboardTileId, DashboardTilePlacement> {
  const next = {} as Record<DashboardTileId, DashboardTilePlacement>
  for (const id of DASHBOARD_TILE_IDS) {
    const p = full[id]
    next[id] = p ? { ...p } : { ...DASHBOARD_LAYOUT_DEFAULT[id]! }
  }
  return next
}

/** Gueltige Groessen/Positionen je sichtbarer Kachel; Ueberlappungen sind erlaubt. */
export function dashboardLayoutValidMerged(
  full: Record<string, DashboardTilePlacement>,
  orderedTileIds: readonly string[],
  hidden: ReadonlySet<string>,
  _pinned: ReadonlySet<string> | null = null
): boolean {
  for (const id of orderedTileIds) {
    if (hidden.has(id)) continue
    const p = full[id]
    if (!p || !placementValid(p)) return false
  }
  return true
}

/** Wendet nur die neue Position der verschobenen Kachel an (kein Wegschieben anderer Kacheln). */
export function applyMoveWithPushMerged(
  fullBefore: Record<string, DashboardTilePlacement>,
  _orderedTileIds: readonly string[],
  _hidden: ReadonlySet<string>,
  _pinned: ReadonlySet<string> | null,
  moverId: string,
  newMover: DashboardTilePlacement
): Record<string, DashboardTilePlacement> | null {
  const c = clampDashboardTilePlacement(newMover)
  if (!placementValid(c)) return null
  return { ...fullBefore, [moverId]: c }
}

/** Verschiebt alle Kacheln in `groupIds` um das gleiche Delta wie `primaryId` → `newPrimary` (ohne andere Kacheln zu verschieben). */
export function applyGroupMoveWithPushMerged(
  fullBefore: Record<string, DashboardTilePlacement>,
  _orderedTileIds: readonly string[],
  _hidden: ReadonlySet<string>,
  _pinned: ReadonlySet<string> | null,
  groupIds: readonly string[],
  groupStarts: Record<string, DashboardTilePlacement>,
  primaryId: string,
  newPrimary: DashboardTilePlacement
): Record<string, DashboardTilePlacement> | null {
  const primaryStart = groupStarts[primaryId]
  if (!primaryStart) return null
  const clampedPrimary = clampDashboardTilePlacement(newPrimary)
  if (!placementValid(clampedPrimary)) return null
  const dx = clampedPrimary.x - primaryStart.x
  const dy = clampedPrimary.y - primaryStart.y

  const work: Record<string, DashboardTilePlacement> = { ...fullBefore }
  for (const gid of groupIds) {
    const s = groupStarts[gid]
    if (!s) continue
    const np = clampDashboardTilePlacement({
      ...s,
      x: s.x + dx,
      y: s.y + dy,
      w: s.w,
      h: s.h
    })
    if (!placementValid(np)) return null
    work[gid] = np
  }
  return work
}

export function snapFocusedTileInMergedLayout(
  full: Record<string, DashboardTilePlacement>,
  _orderedTileIds: readonly string[],
  _hidden: ReadonlySet<string>,
  focusId: string,
  _pinned: ReadonlySet<string> | null = null
): Record<string, DashboardTilePlacement> {
  const focus = full[focusId]
  if (!focus) return { ...full }
  return {
    ...full,
    [focusId]: clampDashboardTilePlacement(focus)
  }
}

export function snapFocusedTileAfterResizeMerged(
  full: Record<string, DashboardTilePlacement>,
  orderedTileIds: readonly string[],
  hidden: ReadonlySet<string>,
  focusId: string,
  pinned: ReadonlySet<string> | null = null
): Record<string, DashboardTilePlacement> {
  return snapFocusedTileInMergedLayout(full, orderedTileIds, hidden, focusId, pinned)
}

export function dashboardLayoutValid(layout: Record<DashboardTileId, DashboardTilePlacement>): boolean {
  const noneHidden = new Set<string>()
  return dashboardLayoutValidForVisible(layout, noneHidden)
}

export function dashboardLayoutValidForVisible(
  layout: Record<DashboardTileId, DashboardTilePlacement>,
  hidden: ReadonlySet<string>,
  pinned: ReadonlySet<string> | null = null
): boolean {
  const full = buildMergedPlacementMap(layout, [])
  return dashboardLayoutValidMerged(full, mergedDashboardTileOrder([]), hidden, pinned)
}

function isStoredHiddenOrPinnedId(s: string): boolean {
  return (DASHBOARD_TILE_IDS as string[]).includes(s) || s.startsWith('dashct:')
}

export function readDashboardHiddenFromStorage(): Set<string> {
  try {
    const raw = window.localStorage.getItem(DASHBOARD_HIDDEN_STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    const out = new Set<string>()
    for (const x of parsed) {
      if (typeof x === 'string' && isStoredHiddenOrPinnedId(x)) {
        out.add(x)
      }
    }
    return out
  } catch {
    return new Set()
  }
}

export function writeDashboardHiddenToStorage(hidden: ReadonlySet<string>): void {
  try {
    window.localStorage.setItem(DASHBOARD_HIDDEN_STORAGE_KEY, JSON.stringify([...hidden]))
  } catch {
    // ignore
  }
}

export function readDashboardPinnedFromStorage(): Set<string> {
  try {
    const raw = window.localStorage.getItem(DASHBOARD_PINNED_STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    const out = new Set<string>()
    for (const x of parsed) {
      if (typeof x === 'string' && isStoredHiddenOrPinnedId(x)) {
        out.add(x)
      }
    }
    return out
  } catch {
    return new Set()
  }
}

export function writeDashboardPinnedToStorage(pinned: ReadonlySet<string>): void {
  try {
    window.localStorage.setItem(DASHBOARD_PINNED_STORAGE_KEY, JSON.stringify([...pinned]))
  } catch {
    // ignore
  }
}

export function repairLayoutAfterTileShown(
  layout: Record<DashboardTileId, DashboardTilePlacement>,
  _hidden: ReadonlySet<string>,
  _shownId: DashboardTileId,
  _pinned: ReadonlySet<string> | null = null
): Record<DashboardTileId, DashboardTilePlacement> {
  return cloneDashboardLayout(layout)
}

export function cloneDashboardLayout(
  src: Record<DashboardTileId, DashboardTilePlacement>
): Record<DashboardTileId, DashboardTilePlacement> {
  const next = {} as Record<DashboardTileId, DashboardTilePlacement>
  for (const id of DASHBOARD_TILE_IDS) {
    next[id] = { ...src[id]! }
  }
  return next
}

export function applyMoveWithPush(
  layout: Record<DashboardTileId, DashboardTilePlacement>,
  hidden: ReadonlySet<string>,
  pinned: ReadonlySet<string> | null,
  moverId: DashboardTileId,
  newMover: DashboardTilePlacement
): Record<DashboardTileId, DashboardTilePlacement> | null {
  const full = buildMergedPlacementMap(layout, [])
  const order = mergedDashboardTileOrder([])
  const r = applyMoveWithPushMerged(
    full,
    order,
    hidden as ReadonlySet<string>,
    pinned as ReadonlySet<string> | null,
    moverId,
    newMover
  )
  if (!r) return null
  return extractBuiltinLayoutFromMerged(r)
}

export function snapFocusedTileToValidLayout(
  layout: Record<DashboardTileId, DashboardTilePlacement>,
  hidden: ReadonlySet<string>,
  focusId: DashboardTileId,
  pinned: ReadonlySet<string> | null = null
): Record<DashboardTileId, DashboardTilePlacement> {
  const full = buildMergedPlacementMap(layout, [])
  const order = mergedDashboardTileOrder([])
  const merged = snapFocusedTileInMergedLayout(
    full,
    order,
    hidden as ReadonlySet<string>,
    focusId,
    pinned as ReadonlySet<string> | null
  )
  return extractBuiltinLayoutFromMerged(merged)
}

export function snapFocusedTileAfterResize(
  layout: Record<DashboardTileId, DashboardTilePlacement>,
  hidden: ReadonlySet<string>,
  focusId: DashboardTileId,
  pinned: ReadonlySet<string> | null = null
): Record<DashboardTileId, DashboardTilePlacement> {
  const full = buildMergedPlacementMap(layout, [])
  const order = mergedDashboardTileOrder([])
  const merged = snapFocusedTileAfterResizeMerged(
    full,
    order,
    hidden as ReadonlySet<string>,
    focusId,
    pinned as ReadonlySet<string> | null
  )
  return extractBuiltinLayoutFromMerged(merged)
}

const LEGACY_MIN_H = 5
const LEGACY_MAX_H = 48

function normalizeLegacyGridPlacementFromStorage(raw: unknown): DashboardTilePlacement | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const x = clampInt(Number(o.x), 0, DASHBOARD_GRID_COLS - 1)
  const y = clampInt(Number(o.y), 0, 400)
  const w = clampInt(Number(o.w), 1, DASHBOARD_GRID_COLS)
  const h = clampInt(Number(o.h), LEGACY_MIN_H, LEGACY_MAX_H)
  const p: DashboardTilePlacement = { x, y, w, h }
  if (p.x + p.w > DASHBOARD_GRID_COLS) p.x = Math.max(0, DASHBOARD_GRID_COLS - p.w)
  if (p.w < 1 || p.h < LEGACY_MIN_H) return null
  return p
}

function normalizePixelPlacement(raw: unknown): DashboardTilePlacement | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const x = Number(o.x)
  const y = Number(o.y)
  const w = Number(o.w)
  const h = Number(o.h)
  if (![x, y, w, h].every((n) => Number.isFinite(n))) return null
  const p = clampDashboardTilePlacement({ x, y, w, h })
  return placementValid(p) ? p : null
}

/** v2-Datei kann noch alte Rasterzahlen enthalten → dann nach Pixel migrieren. */
function normalizeStoredPlacement(raw: unknown): DashboardTilePlacement | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const x = Number(o.x)
  const y = Number(o.y)
  const w = Number(o.w)
  const h = Number(o.h)
  if (![x, y, w, h].every((n) => Number.isFinite(n))) return null
  const coarse: DashboardTilePlacement = {
    x: Math.round(x),
    y: Math.round(y),
    w: Math.round(w),
    h: Math.round(h)
  }
  if (isLikelyLegacyGridPlacement(coarse)) {
    const m = migrateGridCellPlacementToPixel(coarse, DASHBOARD_LAYOUT_LEGACY_REF_WIDTH_PX)
    return placementValid(m) ? m : null
  }
  return normalizePixelPlacement(raw)
}

function isLegacyThreeTileLayout(o: Record<string, unknown>): boolean {
  return !('waiting' in o)
}

function isLegacyLayoutBeforeTodoTiles(o: Record<string, unknown>): boolean {
  return !('todo_all' in o)
}

export function readDashboardLayoutFromStorage(): Record<DashboardTileId, DashboardTilePlacement> {
  const base = { ...DASHBOARD_LAYOUT_DEFAULT }
  const migrateV1 = (o: Record<string, unknown>): Record<DashboardTileId, DashboardTilePlacement> | null => {
    if (isLegacyThreeTileLayout(o) || isLegacyLayoutBeforeTodoTiles(o)) return null
    const migrated = { ...base }
    let any = false
    for (const id of DASHBOARD_TILE_IDS) {
      if (!Object.prototype.hasOwnProperty.call(o, id)) continue
      const n = normalizeLegacyGridPlacementFromStorage(o[id])
      if (n) {
        migrated[id] = migrateGridCellPlacementToPixel(n, DASHBOARD_LAYOUT_LEGACY_REF_WIDTH_PX)
        any = true
      }
    }
    return any ? migrated : null
  }

  try {
    const raw2 = window.localStorage.getItem(DASHBOARD_LAYOUT_STORAGE_KEY)
    if (raw2) {
      const parsed = JSON.parse(raw2) as unknown
      if (parsed && typeof parsed === 'object') {
        const o = parsed as Record<string, unknown>
        if (!isLegacyThreeTileLayout(o) && !isLegacyLayoutBeforeTodoTiles(o)) {
          const next = { ...base }
          let allOk = true
          for (const id of DASHBOARD_TILE_IDS) {
            if (!Object.prototype.hasOwnProperty.call(o, id)) continue
            const n = normalizeStoredPlacement(o[id])
            if (n) next[id] = n
            else allOk = false
          }
          const hidden = readDashboardHiddenFromStorage()
          if (allOk) {
            const step = readDashboardAlignStepPx()
            return finalizeBuiltinLayoutRecord(next, hidden, step)
          }
        }
      }
    }

    const raw1 = window.localStorage.getItem(DASHBOARD_LAYOUT_STORAGE_KEY_V1)
    if (raw1) {
      const parsed = JSON.parse(raw1) as unknown
      if (parsed && typeof parsed === 'object') {
        const migratedInit = migrateV1(parsed as Record<string, unknown>)
        if (migratedInit) {
          const hiddenM = readDashboardHiddenFromStorage()
          const stepM = readDashboardAlignStepPx()
          const migratedFin = finalizeBuiltinLayoutRecord(migratedInit, hiddenM, stepM)
          writeDashboardLayoutToStorage(migratedFin)
          try {
            window.localStorage.removeItem(DASHBOARD_LAYOUT_STORAGE_KEY_V1)
          } catch {
            // ignore
          }
          return migratedFin
        }
      }
    }
  } catch {
    // ignore
  }
  return finalizeBuiltinLayoutRecord(base, readDashboardHiddenFromStorage(), readDashboardAlignStepPx())
}

export function writeDashboardLayoutToStorage(
  layout: Record<DashboardTileId, DashboardTilePlacement>
): void {
  try {
    window.localStorage.setItem(DASHBOARD_LAYOUT_STORAGE_KEY, JSON.stringify(layout))
  } catch {
    // ignore
  }
}

/** @deprecated Nutze clampDashboardTilePlacement */
export function clampPlacementToGrid(p: DashboardTilePlacement): DashboardTilePlacement {
  return clampDashboardTilePlacement(p)
}
