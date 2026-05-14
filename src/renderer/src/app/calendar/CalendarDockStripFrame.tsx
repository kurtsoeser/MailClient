import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

/** Vertikaler Splitter in `ResizableSplitter` ist `w-px` (1px). */
export const CALENDAR_DOCK_SPLITTER_W = 1

export interface CalendarDockStripFrameProps {
  visible: boolean
  panelWidthPx: number
  onExitTransitionComplete?: () => void
  splitter: ReactNode
  children: ReactNode
  /** Zusaetzliche Klassen auf dem aeusseren max-width-Wrapper (z. B. `self-stretch`). */
  className?: string
}

/**
 * Gemeinsame animierte Breiten-/Translate-Huelle fuer Dock-Spalten (Posteingang, Vorschau).
 * `CalendarDockPanelSlide` ist ein duenner Alias darauf.
 */
export function CalendarDockStripFrame({
  visible,
  panelWidthPx,
  onExitTransitionComplete,
  splitter,
  children,
  className
}: CalendarDockStripFrameProps): JSX.Element {
  const safePanelW =
    typeof panelWidthPx === 'number' && Number.isFinite(panelWidthPx) ? Math.max(0, panelWidthPx) : 0
  const innerW = safePanelW + CALENDAR_DOCK_SPLITTER_W
  const onExitRef = useRef(onExitTransitionComplete)
  onExitRef.current = onExitTransitionComplete

  const lastW = useRef(panelWidthPx)
  const lastVisible = useRef(visible)
  const [suppressMaxWidthTransition, setSuppressMaxWidthTransition] = useState(false)

  useLayoutEffect(() => {
    const wChanged = panelWidthPx !== lastW.current
    const vChanged = visible !== lastVisible.current
    if (vChanged) {
      setSuppressMaxWidthTransition(false)
    } else if (visible && wChanged) {
      setSuppressMaxWidthTransition(true)
    }
    lastW.current = panelWidthPx
    lastVisible.current = visible
  }, [visible, panelWidthPx])

  useEffect(() => {
    if (visible) return
    if (typeof window === 'undefined') return
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const id = requestAnimationFrame(() => {
      onExitRef.current?.()
    })
    return (): void => cancelAnimationFrame(id)
  }, [visible])

  return (
    <div
      className={cn(
        'h-full min-h-0 shrink-0 overflow-hidden motion-reduce:transition-none',
        suppressMaxWidthTransition
          ? 'transition-none'
          : 'transition-[max-width] duration-300 ease-out',
        className
      )}
      style={{ maxWidth: visible ? innerW : 0 }}
      onTransitionEnd={(e): void => {
        if (e.target !== e.currentTarget) return
        if (e.propertyName !== 'max-width') return
        if (visible) return
        onExitTransitionComplete?.()
      }}
    >
      <div
        className={cn(
          'flex h-full min-h-0 shrink-0 transition-transform duration-300 ease-out motion-reduce:transition-none',
          visible ? 'translate-x-0' : 'translate-x-full'
        )}
        style={{ width: innerW }}
      >
        {splitter}
        {children}
      </div>
    </div>
  )
}
