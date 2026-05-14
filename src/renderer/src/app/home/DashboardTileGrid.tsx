import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { FolderOpen, Calendar, Mail } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { CalendarEventView } from '@shared/types'

import { useTranslation } from 'react-i18next'

import { useAppModeStore } from '@/stores/app-mode'

import { useMailStore } from '@/stores/mail'

import { useUndoStore } from '@/stores/undo'

import {
  DASHBOARD_GRID_STEP_CHANGED_EVENT,
  DASHBOARD_LAYOUT_DEFAULT,
  DASHBOARD_TILE_MIN_H_PX,
  DASHBOARD_TILE_MIN_W_PX,
  applyGroupMoveWithPushMerged,
  applyMoveWithPushMerged,
  buildMergedPlacementMap,
  dashboardTilePlacementValid,
  extractBuiltinLayoutFromMerged,
  finalizeDashboardLayoutWithGrid,
  mergedDashboardTileOrder,
  placementsOverlap,
  readDashboardAlignStepPx,
  readDashboardHiddenFromStorage,
  readDashboardLayoutFromStorage,
  readDashboardPinnedFromStorage,
  snapDashboardTilePlacementToGrid,
  writeDashboardHiddenToStorage,
  writeDashboardLayoutToStorage,
  writeDashboardPinnedToStorage,
  type DashboardTileId,
  type DashboardTilePlacement
} from '@/app/home/dashboard-layout'

import {
  applyCustomPlacementsFromMerged,
  customTilesForLayoutMerge,
  isCustomDashboardTileId,
  readDashboardCustomTilesFromStorage,
  writeDashboardCustomTilesToStorage,
  type DashboardCustomTileStored
} from '@/app/home/dashboard-custom-tiles'

import {
  hasDashboardUserSnapshotV1,
  readDashboardUserSnapshotV1,
  writeDashboardUserSnapshotV1
} from '@/app/home/dashboard-user-snapshot'

import { DashboardCustomTileWizard } from '@/app/home/DashboardCustomTileWizard'
import { DashboardTileCard } from '@/app/home/DashboardTileCard'
import { DashboardTileGridToolbar } from '@/app/home/DashboardTileGridToolbar'
import type { TileDragSession } from '@/app/home/dashboard-tile-grid-drag-types'
import { freeTileStyle, marqueeAsPlacement } from '@/app/home/dashboard-tile-grid-utils'

interface Props {
  tiles: {
    id: DashboardTileId

    title: string

    subtitle?: string

    /** Großes Symbol links, über Titel- und Untertitelzeile. */

    icon?: LucideIcon

    /** Klick auf Titel/Untertitel öffnet die zugehörige Vollansicht (optional). */

    onOpenFull?: () => void

    body: React.ReactNode
  }[]

  /** Inhalt fuer `dashct:…`-Kacheln; wenn fehlt, Platzhalter. */

  getCustomTileBody?: (entry: DashboardCustomTileStored) => React.ReactNode

  /** Termine fuer den Wizard (Agenda + Woche o. a.). */

  customWizardCalendarEvents?: CalendarEventView[]
}

export function DashboardTileGrid({
  tiles,
  getCustomTileBody,
  customWizardCalendarEvents
}: Props): JSX.Element {
  const { t } = useTranslation()

  const setAppMode = useAppModeStore((s) => s.setMode)

  const selectFolder = useMailStore((s) => s.selectFolder)

  const openMessageInFolder = useMailStore((s) => s.openMessageInFolder)

  const gridRef = useRef<HTMLDivElement>(null)

  const layoutRef = useRef(readDashboardLayoutFromStorage())

  const persistTimerRef = useRef<number | null>(null)

  const [layout, setLayout] = useState<Record<DashboardTileId, DashboardTilePlacement>>(() =>
    readDashboardLayoutFromStorage()
  )

  const [hidden, setHidden] = useState<Set<string>>(() => readDashboardHiddenFromStorage())

  const hiddenRef = useRef(hidden)

  const [pinned, setPinned] = useState<Set<string>>(() => readDashboardPinnedFromStorage())

  const pinnedRef = useRef(pinned)

  const [customEntries, setCustomEntries] = useState<DashboardCustomTileStored[]>(() =>
    readDashboardCustomTilesFromStorage()
  )

  const customEntriesRef = useRef(customEntries)

  const [customWizardOpen, setCustomWizardOpen] = useState(false)

  const [addPanelOpen, setAddPanelOpen] = useState(false)

  const addPanelRef = useRef<HTMLDivElement>(null)

  const addButtonRef = useRef<HTMLButtonElement>(null)

  const [selectedIds, setSelected] = useState<Set<string>>(() => new Set())

  const selectedIdsRef = useRef<Set<string>>(selectedIds)

  const [marqueeRect, setMarqueeRect] = useState<{
    x0: number

    y0: number

    x1: number

    y1: number
  } | null>(null)

  const marqueeSessionRef = useRef<{
    pointerId: number

    additive: boolean
  } | null>(null)

  const marqueeGeomRef = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null)

  useEffect(() => {
    selectedIdsRef.current = selectedIds
  }, [selectedIds])

  useEffect(() => {
    setSelected((prev) => {
      const next = new Set<string>()

      for (const id of prev) {
        if (!hidden.has(id)) next.add(id)
      }

      return next.size === prev.size ? prev : next
    })
  }, [hidden])

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') setSelected(new Set())
    }

    window.addEventListener('keydown', onKey)

    return (): void => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    layoutRef.current = layout
  }, [layout])

  useEffect(() => {
    hiddenRef.current = hidden
  }, [hidden])

  useEffect(() => {
    pinnedRef.current = pinned
  }, [pinned])

  const [stack, setStack] = useState<string[]>(() =>
    mergedDashboardTileOrder(readDashboardCustomTilesFromStorage().map((e) => e.id))
  )

  const [snapshotExists, setSnapshotExists] = useState(() => hasDashboardUserSnapshotV1())

  const schedulePersist = useCallback((next: Record<DashboardTileId, DashboardTilePlacement>) => {
    if (persistTimerRef.current != null) window.clearTimeout(persistTimerRef.current)

    persistTimerRef.current = window.setTimeout(() => {
      persistTimerRef.current = null

      writeDashboardLayoutToStorage(next)
    }, 350)
  }, [])

  const saveDashboardLayout = useCallback((): void => {
    if (persistTimerRef.current != null) {
      window.clearTimeout(persistTimerRef.current)

      persistTimerRef.current = null
    }

    const cust = customEntriesRef.current

    const full0 = buildMergedPlacementMap(layoutRef.current, customTilesForLayoutMerge(cust))

    const full: Record<string, DashboardTilePlacement> = { ...full0 }

    const order = mergedDashboardTileOrder(cust.map((e) => e.id))

    const finalized = finalizeDashboardLayoutWithGrid(
      full,

      order,

      hiddenRef.current,

      readDashboardAlignStepPx(),

      pinnedRef.current
    )

    const nextB = extractBuiltinLayoutFromMerged(finalized)

    const nextC = applyCustomPlacementsFromMerged(cust, finalized)

    layoutRef.current = nextB

    customEntriesRef.current = nextC

    setLayout(nextB)

    setCustomEntries(nextC)

    writeDashboardLayoutToStorage(nextB)

    writeDashboardCustomTilesToStorage(nextC)

    writeDashboardHiddenToStorage(hiddenRef.current)

    writeDashboardPinnedToStorage(pinnedRef.current)

    writeDashboardUserSnapshotV1({
      layout: nextB,

      hidden: hiddenRef.current,

      pinned: pinnedRef.current,

      customEntries: nextC
    })

    setSnapshotExists(true)

    useUndoStore.getState().pushToast({
      label: t('dashboardGrid.layoutSavedToast'),

      variant: 'success',

      durationMs: 3500
    })
  }, [t])

  const restoreDashboardUserSnapshot = useCallback((): void => {
    const rawSnap = readDashboardUserSnapshotV1()

    if (!rawSnap) {
      useUndoStore.getState().pushToast({
        label: t('dashboardGrid.restoreNothingToast'),

        variant: 'info',

        durationMs: 5000
      })

      setSnapshotExists(false)

      return
    }

    if (persistTimerRef.current != null) {
      window.clearTimeout(persistTimerRef.current)

      persistTimerRef.current = null
    }

    const full0 = buildMergedPlacementMap(
      rawSnap.layout,
      customTilesForLayoutMerge(rawSnap.customEntries)
    )

    const full: Record<string, DashboardTilePlacement> = { ...full0 }

    const order = mergedDashboardTileOrder(rawSnap.customEntries.map((e) => e.id))

    const finalized = finalizeDashboardLayoutWithGrid(
      full,

      order,

      rawSnap.hidden,

      readDashboardAlignStepPx(),

      rawSnap.pinned
    )

    const nextB = extractBuiltinLayoutFromMerged(finalized)

    const nextC = applyCustomPlacementsFromMerged(rawSnap.customEntries, finalized)

    const nextHidden = new Set(rawSnap.hidden)

    const nextPinned = new Set(rawSnap.pinned)

    layoutRef.current = nextB

    customEntriesRef.current = nextC

    hiddenRef.current = nextHidden

    pinnedRef.current = nextPinned

    setLayout(nextB)

    setCustomEntries(nextC)

    setHidden(nextHidden)

    setPinned(nextPinned)

    setSelected(new Set())

    setStack((s) => {
      const want = mergedDashboardTileOrder(nextC.map((e) => e.id))

      const seen = new Set(want)

      const tail = s.filter((id) => !seen.has(id))

      return [...want, ...tail]
    })

    writeDashboardLayoutToStorage(nextB)

    writeDashboardCustomTilesToStorage(nextC)

    writeDashboardHiddenToStorage(nextHidden)

    writeDashboardPinnedToStorage(nextPinned)

    useUndoStore.getState().pushToast({
      label: t('dashboardGrid.restoreSuccessToast'),

      variant: 'success',

      durationMs: 3500
    })
  }, [t])

  useEffect(() => {
    writeDashboardCustomTilesToStorage(customEntries)
  }, [customEntries])

  useEffect(() => {
    customEntriesRef.current = customEntries
  }, [customEntries])

  useEffect(() => {
    const step = readDashboardAlignStepPx()

    const cust = customEntriesRef.current

    const order = mergedDashboardTileOrder(cust.map((e) => e.id))

    let full = buildMergedPlacementMap(layoutRef.current, cust)

    full = finalizeDashboardLayoutWithGrid(full, order, hiddenRef.current, step, pinnedRef.current)

    const nextB = extractBuiltinLayoutFromMerged(full)

    const nextC = applyCustomPlacementsFromMerged(cust, full)

    if (
      JSON.stringify(layoutRef.current) === JSON.stringify(nextB) &&
      JSON.stringify(cust) === JSON.stringify(nextC)
    ) {
      return
    }

    layoutRef.current = nextB

    customEntriesRef.current = nextC

    setLayout(nextB)

    setCustomEntries(nextC)

    writeDashboardLayoutToStorage(nextB)

    writeDashboardCustomTilesToStorage(nextC)
  }, [])

  useEffect(() => {
    const onStep = (): void => {
      const step = readDashboardAlignStepPx()

      const cust = customEntriesRef.current

      const order = mergedDashboardTileOrder(cust.map((e) => e.id))

      let full = buildMergedPlacementMap(layoutRef.current, cust)

      full = finalizeDashboardLayoutWithGrid(
        full,
        order,
        hiddenRef.current,
        step,
        pinnedRef.current
      )

      const nextB = extractBuiltinLayoutFromMerged(full)

      const nextC = applyCustomPlacementsFromMerged(cust, full)

      layoutRef.current = nextB

      customEntriesRef.current = nextC

      setLayout(nextB)

      setCustomEntries(nextC)

      writeDashboardLayoutToStorage(nextB)

      writeDashboardCustomTilesToStorage(nextC)
    }

    window.addEventListener(DASHBOARD_GRID_STEP_CHANGED_EVENT, onStep)

    return (): void => window.removeEventListener(DASHBOARD_GRID_STEP_CHANGED_EVENT, onStep)
  }, [])

  useEffect(() => {
    setStack((s) => {
      const want = mergedDashboardTileOrder(customEntries.map((e) => e.id))

      const seen = new Set(want)

      const tail = s.filter((id) => !seen.has(id))

      return [...want, ...tail]
    })
  }, [customEntries])

  useEffect(
    () => (): void => {
      if (persistTimerRef.current != null) window.clearTimeout(persistTimerRef.current)
    },

    []
  )

  useEffect(() => {
    if (!addPanelOpen) return

    function onDocMouseDown(e: MouseEvent): void {
      const panel = addPanelRef.current

      const btn = addButtonRef.current

      const t = e.target as Node

      if (panel?.contains(t) || btn?.contains(t)) return

      setAddPanelOpen(false)
    }

    document.addEventListener('mousedown', onDocMouseDown)

    return (): void => document.removeEventListener('mousedown', onDocMouseDown)
  }, [addPanelOpen])

  const lift = useCallback((id: string): void => {
    setStack((s) => {
      const rest = s.filter((x) => x !== id)

      return [...rest, id]
    })
  }, [])

  const dragRef = useRef<TileDragSession | null>(null)

  const endDragSession = useCallback((): void => {
    const session = dragRef.current

    dragRef.current = null

    if (!session) return

    const cust = customEntriesRef.current

    const full0 = buildMergedPlacementMap(layoutRef.current, customTilesForLayoutMerge(cust))

    const full: Record<string, DashboardTilePlacement> = { ...full0 }

    const order = mergedDashboardTileOrder(cust.map((e) => e.id))

    const finalized = finalizeDashboardLayoutWithGrid(
      full,
      order,
      hiddenRef.current,
      readDashboardAlignStepPx(),
      pinnedRef.current
    )

    const nextB = extractBuiltinLayoutFromMerged(finalized)

    const nextC = applyCustomPlacementsFromMerged(cust, finalized)

    layoutRef.current = nextB

    customEntriesRef.current = nextC

    setLayout(nextB)

    setCustomEntries(nextC)

    writeDashboardCustomTilesToStorage(nextC)

    schedulePersist(nextB)
  }, [schedulePersist])

  const onWindowPointerMove = useCallback((e: PointerEvent): void => {
    const d = dragRef.current

    if (!d) return

    const el = gridRef.current

    if (!el) return

    const r = el.getBoundingClientRect()

    const localX = e.clientX - r.left

    const localY = e.clientY - r.top

    if (d.kind === 'move') {
      let nx = localX - d.grabOffX

      let ny = localY - d.grabOffY

      nx = Math.max(0, nx)

      ny = Math.max(0, ny)

      const cust = customEntriesRef.current

      const step = readDashboardAlignStepPx()

      const baseFull = buildMergedPlacementMap(layoutRef.current, customTilesForLayoutMerge(cust))

      const curPl = baseFull[d.id]

      if (!curPl) return

      const me = snapDashboardTilePlacementToGrid(
        { ...curPl, x: nx, y: ny, w: d.startW, h: d.startH },
        step
      )

      if (!dashboardTilePlacementValid(me)) return

      const order = mergedDashboardTileOrder(cust.map((e) => e.id))

      const pushed = applyMoveWithPushMerged(
        baseFull,
        order,
        hiddenRef.current,
        pinnedRef.current,
        d.id,
        me
      )

      const curFull = pushed != null ? pushed : baseFull

      const curBuiltin = extractBuiltinLayoutFromMerged(curFull)

      const nextCustom = applyCustomPlacementsFromMerged(cust, curFull)

      layoutRef.current = curBuiltin

      customEntriesRef.current = nextCustom

      setLayout(curBuiltin)

      setCustomEntries(nextCustom)

      return
    }

    if (d.kind === 'groupMove') {
      let nx = localX - d.grabOffX

      let ny = localY - d.grabOffY

      nx = Math.max(0, nx)

      ny = Math.max(0, ny)

      const cust = customEntriesRef.current

      const step = readDashboardAlignStepPx()

      const baseFull = buildMergedPlacementMap(layoutRef.current, customTilesForLayoutMerge(cust))

      const curPl = baseFull[d.primaryId]

      if (!curPl) return

      const me = snapDashboardTilePlacementToGrid(
        { ...curPl, x: nx, y: ny, w: d.startW, h: d.startH },
        step
      )

      if (!dashboardTilePlacementValid(me)) return

      const order = mergedDashboardTileOrder(cust.map((e) => e.id))

      const pushed = applyGroupMoveWithPushMerged(
        baseFull,

        order,

        hiddenRef.current,

        pinnedRef.current,

        d.groupIds,

        d.groupStarts,

        d.primaryId,

        me
      )

      const curFull = pushed != null ? pushed : baseFull

      const curBuiltin = extractBuiltinLayoutFromMerged(curFull)

      const nextCustom = applyCustomPlacementsFromMerged(cust, curFull)

      layoutRef.current = curBuiltin

      customEntriesRef.current = nextCustom

      setLayout(curBuiltin)

      setCustomEntries(nextCustom)

      return
    }

    if (d.kind !== 'resize') return

    const custR = customEntriesRef.current

    const baseFullR = buildMergedPlacementMap(layoutRef.current, customTilesForLayoutMerge(custR))

    const curPlR = baseFullR[d.id]

    if (!curPlR) return

    const step = readDashboardAlignStepPx()

    const minWg = Math.ceil(DASHBOARD_TILE_MIN_W_PX / step) * step

    const minHg = Math.ceil(DASHBOARD_TILE_MIN_H_PX / step) * step

    let nw = localX - d.startX

    let nh = localY - d.startY

    nw = Math.max(minWg, Math.round(nw / step) * step)

    nh = Math.max(minHg, Math.round(nh / step) * step)

    const meR = { ...curPlR, x: d.startX, y: d.startY, w: nw, h: nh }

    if (!dashboardTilePlacementValid(meR)) return

    const orderR = mergedDashboardTileOrder(custR.map((e) => e.id))

    const pushedR = applyMoveWithPushMerged(
      baseFullR,
      orderR,
      hiddenRef.current,
      pinnedRef.current,
      d.id,
      meR
    )

    const curFullR = pushedR != null ? pushedR : baseFullR

    const curBuiltinR = extractBuiltinLayoutFromMerged(curFullR)

    const nextCustomR = applyCustomPlacementsFromMerged(custR, curFullR)

    layoutRef.current = curBuiltinR

    customEntriesRef.current = nextCustomR

    setLayout(curBuiltinR)

    setCustomEntries(nextCustomR)
  }, [])

  const onDragHandleDown = useCallback(
    (id: string, e: React.PointerEvent): void => {
      if (e.button !== 0) return

      const tgt = e.target as HTMLElement

      if (tgt.closest('button, a, input, select, textarea')) return

      if (e.ctrlKey || e.metaKey || e.shiftKey) {
        e.preventDefault()

        setSelected((prev) => {
          const n = new Set(prev)

          if (n.has(id)) n.delete(id)
          else n.add(id)

          return n
        })

        return
      }

      if (pinnedRef.current.has(id)) {
        e.preventDefault()

        return
      }

      e.preventDefault()

      const el = gridRef.current

      if (!el) return

      const r = el.getBoundingClientRect()

      const localX = e.clientX - r.left

      const localY = e.clientY - r.top

      const cust = customEntriesRef.current

      const full = buildMergedPlacementMap(layoutRef.current, customTilesForLayoutMerge(cust))

      const p = full[id]

      if (!p) return

      const sel = selectedIdsRef.current

      const doGroup = sel.has(id) && sel.size > 1

      if (doGroup && [...sel].some((gid) => pinnedRef.current.has(gid))) {
        return
      }

      const cap = e.currentTarget as HTMLElement

      try {
        cap.setPointerCapture(e.pointerId)
      } catch {
        // ignore
      }

      if (doGroup) {
        const groupStarts: Record<string, DashboardTilePlacement> = {}

        for (const gid of sel) {
          const gp = full[gid]

          if (gp) groupStarts[gid] = { ...gp }
        }

        for (const gid of sel) {
          lift(gid)
        }

        dragRef.current = {
          kind: 'groupMove',

          groupIds: [...sel],

          groupStarts,

          primaryId: id,

          grabOffX: localX - p.x,

          grabOffY: localY - p.y,

          startW: p.w,

          startH: p.h,

          captureEl: cap,

          pointerId: e.pointerId
        }
      } else {
        setSelected(new Set([id]))

        lift(id)

        dragRef.current = {
          kind: 'move',

          id,

          grabOffX: localX - p.x,

          grabOffY: localY - p.y,

          startW: p.w,

          startH: p.h,

          captureEl: cap,

          pointerId: e.pointerId
        }
      }

      const finish = (): void => {
        window.removeEventListener('pointermove', onWindowPointerMove)

        window.removeEventListener('pointerup', finish)

        window.removeEventListener('pointercancel', finish)

        const capS = dragRef.current

        if (capS?.captureEl?.hasPointerCapture(capS.pointerId)) {
          try {
            capS.captureEl.releasePointerCapture(capS.pointerId)
          } catch {
            // ignore
          }
        }

        endDragSession()
      }

      window.addEventListener('pointermove', onWindowPointerMove)

      window.addEventListener('pointerup', finish)

      window.addEventListener('pointercancel', finish)
    },

    [endDragSession, lift, onWindowPointerMove, setSelected]
  )

  const onResizeDown = useCallback(
    (id: string, e: React.PointerEvent): void => {
      if (e.button !== 0) return

      if (pinnedRef.current.has(id)) return

      e.preventDefault()

      e.stopPropagation()

      setSelected(new Set([id]))

      lift(id)

      const cust = customEntriesRef.current

      const full = buildMergedPlacementMap(layoutRef.current, customTilesForLayoutMerge(cust))

      const p = full[id]

      if (!p) return

      const cap = e.currentTarget as HTMLElement

      try {
        cap.setPointerCapture(e.pointerId)
      } catch {
        // ignore
      }

      dragRef.current = {
        kind: 'resize',

        id,

        grabOffX: 0,

        grabOffY: 0,

        startX: p.x,

        startY: p.y,

        startW: p.w,

        startH: p.h,

        captureEl: cap,

        pointerId: e.pointerId
      }

      const finish = (): void => {
        window.removeEventListener('pointermove', onWindowPointerMove)

        window.removeEventListener('pointerup', finish)

        window.removeEventListener('pointercancel', finish)

        const capS = dragRef.current

        if (capS?.captureEl?.hasPointerCapture(capS.pointerId)) {
          try {
            capS.captureEl.releasePointerCapture(capS.pointerId)
          } catch {
            // ignore
          }
        }

        endDragSession()
      }

      window.addEventListener('pointermove', onWindowPointerMove)

      window.addEventListener('pointerup', finish)

      window.addEventListener('pointercancel', finish)
    },

    [endDragSession, lift, onWindowPointerMove, setSelected]
  )

  const resetLayout = useCallback((): void => {
    const cust = customEntriesRef.current

    const order = mergedDashboardTileOrder(cust.map((e) => e.id))

    const full = finalizeDashboardLayoutWithGrid(
      buildMergedPlacementMap({ ...DASHBOARD_LAYOUT_DEFAULT }, cust),

      order,

      hiddenRef.current,

      readDashboardAlignStepPx(),

      pinnedRef.current
    )

    const nextB = extractBuiltinLayoutFromMerged(full)

    const nextC = applyCustomPlacementsFromMerged(cust, full)

    layoutRef.current = nextB

    customEntriesRef.current = nextC

    setLayout(nextB)

    setCustomEntries(nextC)

    setSelected(new Set())

    writeDashboardLayoutToStorage(nextB)

    writeDashboardCustomTilesToStorage(nextC)
  }, [])

  const allOrderedTileIds = useMemo(
    () => mergedDashboardTileOrder(customEntries.map((e) => e.id)),

    [customEntries]
  )

  const placementMap = useMemo(
    () => buildMergedPlacementMap(layout, customTilesForLayoutMerge(customEntries)),

    [layout, customEntries]
  )

  const visibleIds = useMemo(
    () => allOrderedTileIds.filter((id) => !hidden.has(id)),
    [allOrderedTileIds, hidden]
  )

  const isOnlyVisibleTile = useCallback(
    (id: string): boolean => visibleIds.length === 1 && visibleIds[0] === id,

    [visibleIds]
  )

  const hideTile = useCallback((id: string): void => {
    if (isCustomDashboardTileId(id)) {
      setPinned((prevPin) => {
        if (!prevPin.has(id)) return prevPin

        const np = new Set(prevPin)

        np.delete(id)

        writeDashboardPinnedToStorage(np)

        return np
      })

      setCustomEntries((prev) => {
        const next = prev.filter((e) => e.id !== id)

        writeDashboardCustomTilesToStorage(next)

        return next
      })

      setHidden((prev) => {
        const n = new Set(prev)

        n.delete(id)

        writeDashboardHiddenToStorage(n)

        return n
      })

      setStack((s) => s.filter((x) => x !== id))

      return
    }

    setPinned((prevPin) => {
      if (!prevPin.has(id)) return prevPin

      const np = new Set(prevPin)

      np.delete(id)

      writeDashboardPinnedToStorage(np)

      return np
    })

    setHidden((prev) => {
      const vis = mergedDashboardTileOrder(customEntriesRef.current.map((e) => e.id)).filter(
        (x) => !prev.has(x)
      )

      if (vis.length <= 1 && vis[0] === id) return prev

      const next = new Set(prev)

      next.add(id)

      writeDashboardHiddenToStorage(next)

      return next
    })
  }, [])

  const setTileVisibleInPanel = useCallback((id: DashboardTileId, visible: boolean): void => {
    if (visible) {
      setHidden((prev) => {
        if (!prev.has(id)) return prev

        const nextHidden = new Set(prev)

        nextHidden.delete(id)

        writeDashboardHiddenToStorage(nextHidden)

        return nextHidden
      })
    } else {
      setHidden((prev) => {
        const vis = mergedDashboardTileOrder(customEntriesRef.current.map((e) => e.id)).filter(
          (x) => !prev.has(x)
        )

        if (vis.length <= 1 && vis[0] === id) return prev

        const next = new Set(prev)

        next.add(id)

        writeDashboardHiddenToStorage(next)

        setPinned((pp) => {
          if (!pp.has(id)) return pp

          const np = new Set(pp)

          np.delete(id)

          writeDashboardPinnedToStorage(np)

          return np
        })

        return next
      })
    }
  }, [])

  const showAllTiles = useCallback((): void => {
    setHidden(new Set())

    writeDashboardHiddenToStorage(new Set())
  }, [])

  const customTileSpecs = useMemo((): Props['tiles'] => {
    return customEntries.map((e) => {
      const Icon = e.kind === 'folder' ? FolderOpen : e.kind === 'calendar_event' ? Calendar : Mail

      const subtitle =
        e.kind === 'folder'
          ? t('dashboard.customTiles.subFolder')
          : e.kind === 'calendar_event'
            ? t('dashboard.customTiles.subEvent')
            : t('dashboard.customTiles.subMail')

      const onOpenFull = (): void => {
        if (e.kind === 'folder' && e.folderId != null)
          void selectFolder(e.accountId, e.folderId).then(() => setAppMode('mail'))
        else if (e.kind === 'calendar_event') setAppMode('calendar')
        else if (e.kind === 'mail' && e.messageId != null)
          void openMessageInFolder(e.messageId).then(() => setAppMode('mail'))
      }

      return {
        id: e.id as DashboardTileId,

        title: e.label,

        subtitle,

        icon: Icon,

        onOpenFull,

        body: getCustomTileBody?.(e) ?? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            {t('dashboard.customTiles.placeholderBody')}
          </div>
        )
      }
    })
  }, [customEntries, getCustomTileBody, openMessageInFolder, selectFolder, setAppMode, t])

  const tileById = useMemo(() => {
    const m = new Map<string, Props['tiles'][number]>()

    for (const t of tiles) m.set(t.id, t)

    for (const t of customTileSpecs) m.set(t.id, t)

    return m
  }, [tiles, customTileSpecs])

  const togglePin = useCallback((id: string): void => {
    setPinned((prev) => {
      const next = new Set(prev)

      if (next.has(id)) next.delete(id)
      else next.add(id)

      writeDashboardPinnedToStorage(next)

      return next
    })
  }, [])

  const canvasTilesSorted = useMemo(() => {
    const visible = allOrderedTileIds.filter((x) => !hidden.has(x))

    return [...visible].sort((a, b) => {
      const za = (pinned.has(a) ? 1000 : 0) + stack.indexOf(a)

      const zb = (pinned.has(b) ? 1000 : 0) + stack.indexOf(b)

      return za - zb
    })
  }, [allOrderedTileIds, hidden, pinned, stack])

  const canvasMinHPx = useMemo(() => {
    let m = 320

    for (const id of visibleIds) {
      const p = placementMap[id]

      if (p) m = Math.max(m, p.y + p.h)
    }

    return m + 24
  }, [visibleIds, placementMap])

  const canvasMinWPx = useMemo(() => {
    let m = 320

    for (const id of visibleIds) {
      const p = placementMap[id]

      if (p) m = Math.max(m, p.x + p.w)
    }

    return m + 24
  }, [visibleIds, placementMap])

  useEffect(() => {
    const g = gridRef.current

    if (!g) return

    const onCapDown = (e: PointerEvent): void => {
      if (e.button !== 0) return

      if (!(e.ctrlKey || e.metaKey || e.shiftKey)) return

      const tgtEl = e.target as HTMLElement

      if (tgtEl.closest('[data-dashboard-tile]')) return

      if (tgtEl.closest('button, a, input, textarea, select')) return

      e.preventDefault()

      e.stopPropagation()

      const sx = e.clientX - g.getBoundingClientRect().left

      const sy = e.clientY - g.getBoundingClientRect().top

      marqueeSessionRef.current = { pointerId: e.pointerId, additive: e.shiftKey }

      const initial = { x0: sx, y0: sy, x1: sx, y1: sy }

      marqueeGeomRef.current = initial

      setMarqueeRect(initial)

      try {
        g.setPointerCapture(e.pointerId)
      } catch {
        // ignore
      }

      const move = (ev: PointerEvent): void => {
        if (ev.pointerId !== e.pointerId) return

        const rr = g.getBoundingClientRect()

        const x1 = ev.clientX - rr.left

        const y1 = ev.clientY - rr.top

        setMarqueeRect((prev) => {
          const next = prev ? { ...prev, x1, y1 } : null

          if (next) marqueeGeomRef.current = next

          return next
        })
      }

      const up = (ev: PointerEvent): void => {
        if (ev.pointerId !== e.pointerId) return

        window.removeEventListener('pointermove', move)

        window.removeEventListener('pointerup', up)

        window.removeEventListener('pointercancel', up)

        try {
          if (g.hasPointerCapture(ev.pointerId)) g.releasePointerCapture(ev.pointerId)
        } catch {
          // ignore
        }

        const sess = marqueeSessionRef.current

        marqueeSessionRef.current = null

        const geom = marqueeGeomRef.current

        marqueeGeomRef.current = null

        setMarqueeRect(null)

        if (!geom) return

        const mq = marqueeAsPlacement(geom)

        if (mq.w < 4 && mq.h < 4) return

        const order = mergedDashboardTileOrder(customEntriesRef.current.map((e) => e.id))

        const full = buildMergedPlacementMap(
          layoutRef.current,
          customTilesForLayoutMerge(customEntriesRef.current)
        )

        const hits = new Set<string>()

        for (const tid of order) {
          if (hiddenRef.current.has(tid)) continue

          const pl = full[tid]

          if (!pl) continue

          if (placementsOverlap(pl, mq)) hits.add(tid)
        }

        setSelected((prev) => {
          const additive = Boolean(sess?.additive || ev.shiftKey)

          if (additive) {
            const n = new Set(prev)

            for (const h of hits) n.add(h)

            return n
          }

          return hits
        })
      }

      window.addEventListener('pointermove', move)

      window.addEventListener('pointerup', up)

      window.addEventListener('pointercancel', up)
    }

    g.addEventListener('pointerdown', onCapDown, true)

    return (): void => g.removeEventListener('pointerdown', onCapDown, true)
  }, [canvasMinHPx, canvasMinWPx, canvasTilesSorted.length])

  const renderTileCard = (id: string): JSX.Element | null => {
    const isPinned = pinned.has(id)
    const isSelected = selectedIds.has(id)
    const pl = placementMap[id]
    const tile = tileById.get(id)
    if (!pl || !tile) return null
    const zi = (isPinned ? 40 : 10) + stack.indexOf(id)
    const hideDisabled = isOnlyVisibleTile(id)
    const style = freeTileStyle(pl, zi)
    const dragHandleTitle =
      selectedIds.size > 1 && selectedIds.has(id)
        ? `${t('dashboardGrid.dragTileTitle')} · ${t('dashboardGrid.multiDragHint')}`
        : t('dashboardGrid.dragTileTitle')
    const hideActionTitle = hideDisabled
      ? t('dashboardGrid.lastVisibleTileHint')
      : isCustomDashboardTileId(id)
        ? t('dashboard.customTiles.removeTileTitle')
        : t('dashboardGrid.hideTileTitle')
    return (
      <DashboardTileCard
        key={id}
        id={id}
        tile={tile}
        style={style}
        isPinned={isPinned}
        isSelected={isSelected}
        hideDisabled={hideDisabled}
        dragHandleTitle={dragHandleTitle}
        hideActionTitle={hideActionTitle}
        onDragHandlePointerDown={(e): void => {
          onDragHandleDown(id, e)
        }}
        onHide={(): void => {
          hideTile(id)
        }}
        onTogglePin={(): void => {
          togglePin(id)
        }}
        onResizePointerDown={(e): void => {
          onResizeDown(id, e)
        }}
        onBodyAreaClick={(ev): void => {
          const tgt = ev.target as HTMLElement
          if (tgt.closest('button, a')) return
          if (ev.ctrlKey || ev.metaKey || ev.shiftKey) {
            ev.stopPropagation()
            setSelected((prev) => {
              const n = new Set(prev)
              if (n.has(id)) n.delete(id)
              else n.add(id)
              return n
            })
            return
          }
          setSelected(new Set([id]))
        }}
      />
    )
  }

  const onCustomWizardCreate = useCallback(
    (entry: DashboardCustomTileStored): void => {
      const prev = customEntriesRef.current

      const nextList = [...prev, entry]

      const order = mergedDashboardTileOrder(nextList.map((e) => e.id))

      const step = readDashboardAlignStepPx()

      let full = buildMergedPlacementMap(layoutRef.current, customTilesForLayoutMerge(nextList))

      full = finalizeDashboardLayoutWithGrid(
        full,
        order,
        hiddenRef.current,
        step,
        pinnedRef.current
      )

      const nextB = extractBuiltinLayoutFromMerged(full)

      const nextC = applyCustomPlacementsFromMerged(nextList, full)

      layoutRef.current = nextB

      customEntriesRef.current = nextC

      setLayout(nextB)

      setCustomEntries(nextC)

      schedulePersist(nextB)

      setCustomWizardOpen(false)

      setPinned((p) => {
        const n = new Set(p)

        n.delete(entry.id)

        writeDashboardPinnedToStorage(n)

        return n
      })

      setHidden((h) => {
        const n = new Set(h)

        n.delete(entry.id)

        writeDashboardHiddenToStorage(n)

        return n
      })

      setStack((s) => (s.includes(entry.id) ? s : [...s, entry.id]))
    },

    [schedulePersist]
  )

  return (
    <div className="flex w-full min-w-0 shrink-0 flex-col px-3 pb-6 pt-1">
      <DashboardTileGridToolbar
        addPanelOpen={addPanelOpen}
        setAddPanelOpen={setAddPanelOpen}
        addButtonRef={addButtonRef}
        addPanelRef={addPanelRef}
        hidden={hidden}
        tileById={tileById}
        isOnlyVisibleTile={isOnlyVisibleTile}
        setTileVisibleInPanel={setTileVisibleInPanel}
        showAllTiles={showAllTiles}
        onOpenCustomWizard={(): void => {
          setAddPanelOpen(false)
          setCustomWizardOpen(true)
        }}
        saveDashboardLayout={saveDashboardLayout}
        restoreDashboardUserSnapshot={restoreDashboardUserSnapshot}
        resetLayout={resetLayout}
        snapshotExists={snapshotExists}
      />

      <div className="w-full min-w-0 overflow-x-auto overflow-y-visible overscroll-x-contain">
        <div
          ref={gridRef}
          className="relative"
          style={{
            minHeight: canvasMinHPx,

            width: `max(100%, ${canvasMinWPx}px)`
          }}
          title={t('dashboardGrid.marqueeHint')}
        >
          {marqueeRect ? (
            <div
              className="pointer-events-none absolute z-[70] border border-dashed border-primary/80 bg-primary/10"
              style={{
                left: Math.min(marqueeRect.x0, marqueeRect.x1),

                top: Math.min(marqueeRect.y0, marqueeRect.y1),

                width: Math.abs(marqueeRect.x1 - marqueeRect.x0),

                height: Math.abs(marqueeRect.y1 - marqueeRect.y0)
              }}
              aria-hidden
            />
          ) : null}

          {canvasTilesSorted.map((id) => renderTileCard(id))}
        </div>
      </div>

      <DashboardCustomTileWizard
        open={customWizardOpen}
        onClose={(): void => setCustomWizardOpen(false)}
        calendarEvents={customWizardCalendarEvents ?? []}
        onCreate={onCustomWizardCreate}
      />
    </div>
  )
}
