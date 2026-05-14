import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { GripVertical, PanelRightClose, Pin } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

function readPersistedSize(key: string): { w: number; h: number } | null {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const p = JSON.parse(raw) as { w?: unknown; h?: unknown }
    const w = typeof p.w === 'number' && Number.isFinite(p.w) ? p.w : null
    const h = typeof p.h === 'number' && Number.isFinite(p.h) ? p.h : null
    if (w == null || h == null) return null
    return { w, h }
  } catch {
    return null
  }
}

function writePersistedSize(key: string, w: number, h: number): void {
  try {
    window.localStorage.setItem(key, JSON.stringify({ w: Math.round(w), h: Math.round(h) }))
  } catch {
    // ignore
  }
}

interface CalendarFloatingPanelProps {
  /** Wenn false, rendert nichts (kein Portal). */
  open: boolean
  title: string
  /** Startbreite (px), z. B. aus eingebetteter Spalte. */
  widthPx: number
  /** Starthoehe (px); Standard ~ 58 % Fensterhoehe (gekappt). */
  initialHeightPx?: number
  /** Mindesthoehe des Inhaltsbereichs (flex); Standard 320. */
  minHeightPx?: number
  minResizeWidthPx?: number
  minResizeHeightPx?: number
  maxResizeWidthPx?: number
  maxResizeHeightPx?: number
  /** Optional: zuletzt gewaehlte Groesse merken (`{w,h}` JSON). */
  persistSizeKey?: string
  /** Initiale linke obere Ecke (px); wird beim ersten Oeffnen gesetzt. */
  defaultPosition: { x: number; y: number }
  onClose: () => void
  onDock: () => void
  children: React.ReactNode
  zIndex?: number
}

function defaultFloatHeight(): number {
  if (typeof window === 'undefined') return 520
  return Math.min(720, Math.max(360, Math.round(window.innerHeight * 0.58)))
}

/**
 * Schwebendes Kalender-Seitenpanel: ziehbar, Groesse unten-rechts aenderbar,
 * andockbar, schliessbar.
 */
export function CalendarFloatingPanel(props: CalendarFloatingPanelProps): JSX.Element | null {
  const { t } = useTranslation()
  const {
    open,
    title,
    widthPx,
    initialHeightPx,
    minHeightPx = 320,
    minResizeWidthPx = 260,
    minResizeHeightPx = 280,
    maxResizeWidthPx = 1200,
    maxResizeHeightPx = 1000,
    persistSizeKey,
    defaultPosition,
    onClose,
    onDock,
    children,
    zIndex = 90
  } = props

  const startH = initialHeightPx ?? defaultFloatHeight()
  const [pos, setPos] = useState(defaultPosition)
  const [size, setSize] = useState({ w: widthPx, h: startH })
  const posRef = useRef(pos)
  const sizeRef = useRef(size)
  posRef.current = pos
  sizeRef.current = size

  const moveDragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(
    null
  )
  const resizeDragRef = useRef<{
    startX: number
    startY: number
    startW: number
    startH: number
  } | null>(null)
  const prevOpenRef = useRef(false)

  const [portalMounted, setPortalMounted] = useState(open)
  const [slideEntered, setSlideEntered] = useState(false)

  useEffect(() => {
    if (open) {
      setPortalMounted(true)
    }
  }, [open])

  useLayoutEffect(() => {
    if (typeof document === 'undefined') return
    if (!open) {
      setSlideEntered(false)
      if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        setPortalMounted(false)
      }
      return
    }
    setSlideEntered(false)
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setSlideEntered(true)
      })
    })
    return (): void => cancelAnimationFrame(id)
  }, [open])

  const maxWForPos = useCallback((x: number): number => {
    return Math.max(minResizeWidthPx, window.innerWidth - x - 8)
  }, [minResizeWidthPx])

  const maxHForPos = useCallback((y: number): number => {
    return Math.max(minResizeHeightPx, window.innerHeight - y - 8)
  }, [minResizeHeightPx])

  const clampSizeToViewport = useCallback(
    (w: number, h: number, x: number, y: number): { w: number; h: number } => {
      const mw = Math.min(maxResizeWidthPx, maxWForPos(x))
      const mh = Math.min(maxResizeHeightPx, maxHForPos(y))
      return {
        w: clamp(w, minResizeWidthPx, mw),
        h: clamp(h, minResizeHeightPx, mh)
      }
    },
    [maxResizeWidthPx, maxResizeHeightPx, maxWForPos, maxHForPos, minResizeWidthPx, minResizeHeightPx]
  )

  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setPos({ x: defaultPosition.x, y: defaultPosition.y })
      let w = widthPx
      let h = startH
      if (persistSizeKey) {
        const stored = readPersistedSize(persistSizeKey)
        if (stored) {
          w = stored.w
          h = stored.h
        }
      }
      const x = defaultPosition.x
      const y = defaultPosition.y
      const next = clampSizeToViewport(w, h, x, y)
      setSize(next)
    }
    prevOpenRef.current = open
  }, [
    open,
    defaultPosition.x,
    defaultPosition.y,
    widthPx,
    startH,
    persistSizeKey,
    clampSizeToViewport
  ])

  useEffect(() => {
    if (!open) return
    setPos((p) => ({
      x: clamp(p.x, 8, Math.max(8, window.innerWidth - sizeRef.current.w - 8)),
      y: clamp(p.y, 8, Math.max(8, window.innerHeight - sizeRef.current.h - 8))
    }))
  }, [open, size.w, size.h])

  const endMove = useCallback((): void => {
    moveDragRef.current = null
    window.removeEventListener('pointermove', onMovePointerMove)
    window.removeEventListener('pointerup', endMove)
    window.removeEventListener('pointercancel', endMove)
  }, [])

  const onMovePointerMove = useCallback((e: PointerEvent): void => {
    const d = moveDragRef.current
    if (!d) return
    const w = sizeRef.current.w
    const h = sizeRef.current.h
    const nx = clamp(d.originX + (e.clientX - d.startX), 8, window.innerWidth - w - 8)
    const ny = clamp(d.originY + (e.clientY - d.startY), 8, window.innerHeight - h - 8)
    setPos({ x: nx, y: ny })
  }, [])

  const onHeaderPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>): void => {
      if (e.button !== 0) return
      e.preventDefault()
      if (resizeDragRef.current) return
      moveDragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        originX: posRef.current.x,
        originY: posRef.current.y
      }
      window.addEventListener('pointermove', onMovePointerMove)
      window.addEventListener('pointerup', endMove)
      window.addEventListener('pointercancel', endMove)
    },
    [onMovePointerMove, endMove]
  )

  const onResizePointerMove = useCallback(
    (e: PointerEvent): void => {
      const d = resizeDragRef.current
      if (!d) return
      const x = posRef.current.x
      const y = posRef.current.y
      const nwRaw = d.startW + (e.clientX - d.startX)
      const nhRaw = d.startH + (e.clientY - d.startY)
      const next = clampSizeToViewport(nwRaw, nhRaw, x, y)
      setSize(next)
    },
    [clampSizeToViewport]
  )

  const endResize = useCallback((): void => {
    const was = resizeDragRef.current
    resizeDragRef.current = null
    window.removeEventListener('pointermove', onResizePointerMove)
    window.removeEventListener('pointerup', endResize)
    window.removeEventListener('pointercancel', endResize)
    if (persistSizeKey && was) {
      writePersistedSize(persistSizeKey, sizeRef.current.w, sizeRef.current.h)
    }
  }, [persistSizeKey, onResizePointerMove])

  const onResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>): void => {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      if (moveDragRef.current) return
      resizeDragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startW: sizeRef.current.w,
        startH: sizeRef.current.h
      }
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      window.addEventListener('pointermove', onResizePointerMove)
      window.addEventListener('pointerup', endResize)
      window.addEventListener('pointercancel', endResize)
    },
    [onResizePointerMove, endResize]
  )

  useEffect(() => {
    return (): void => {
      window.removeEventListener('pointermove', onMovePointerMove)
      window.removeEventListener('pointerup', endMove)
      window.removeEventListener('pointercancel', endMove)
      window.removeEventListener('pointermove', onResizePointerMove)
      window.removeEventListener('pointerup', endResize)
      window.removeEventListener('pointercancel', endResize)
    }
  }, [onMovePointerMove, endMove, onResizePointerMove, endResize])

  if (typeof document === 'undefined') return null
  if (!(open || portalMounted)) return null

  const headerH = 40

  return createPortal(
    <div
      style={{
        left: pos.x,
        top: pos.y,
        width: size.w,
        height: size.h,
        zIndex
      }}
      className={cn(
        'fixed flex min-h-0 flex-col overflow-hidden rounded-xl border border-border',
        'bg-card text-card-foreground shadow-2xl ring-1 ring-black/10 dark:ring-white/10',
        'transition-transform duration-300 ease-out motion-reduce:transition-none',
        slideEntered ? 'translate-x-0' : 'translate-x-full'
      )}
      role="dialog"
      aria-label={title}
      onTransitionEnd={(e): void => {
        if (e.target !== e.currentTarget) return
        if (e.propertyName !== 'transform') return
        if (open) return
        setPortalMounted(false)
      }}
    >
      <div
        className="flex h-10 shrink-0 cursor-grab items-center gap-1 border-b border-border bg-muted/40 px-2 active:cursor-grabbing"
        onPointerDown={onHeaderPointerDown}
      >
        <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-foreground">{title}</span>
        <button
          type="button"
          title={t('calendar.floatingPanel.dockTitle')}
          onClick={(e): void => {
            e.stopPropagation()
            onDock()
          }}
          onPointerDown={(e): void => e.stopPropagation()}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <Pin className="h-4 w-4" />
        </button>
        <button
          type="button"
          title={t('calendar.floatingPanel.closeTitle')}
          onClick={(e): void => {
            e.stopPropagation()
            onClose()
          }}
          onPointerDown={(e): void => e.stopPropagation()}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <PanelRightClose className="h-4 w-4" />
        </button>
      </div>
      <div
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
        style={{ minHeight: Math.max(0, minHeightPx - headerH) }}
      >
        {children}
      </div>
      <div
        role="separator"
        aria-label={t('calendar.floatingPanel.resizeAria')}
        title={t('calendar.floatingPanel.resizeTitle')}
        onPointerDown={onResizePointerDown}
        className={cn(
          'absolute bottom-0 right-0 z-[2] h-5 w-5 cursor-se-resize rounded-br-[10px]',
          'border-l border-t border-border/70 bg-muted/60 hover:bg-muted'
        )}
      />
    </div>,
    document.body
  )
}
