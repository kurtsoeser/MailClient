import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode
} from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Über Glass-Spalten, unter App-Modals (z-[300]). */
const CONTEXT_MENU_Z = 280
const CONTEXT_SUBMENU_Z_BASE = 290

const SUBMENU_WIDTH_PX = 252
const SUBMENU_MAX_HEIGHT_PX = 340
const SUBMENU_GAP_PX = 4
const SUBMENU_CLOSE_DELAY_MS = 120

export interface ContextMenuItem {
  id: string
  label: string
  icon?: React.ComponentType<{ className?: string }>
  iconClassName?: string
  disabled?: boolean
  destructive?: boolean
  separator?: boolean
  onSelect?: () => void
  submenu?: ContextMenuItem[]
  submenuContent?: ReactNode
  swatchHex?: string | null
  swatchAuto?: boolean
  selected?: boolean
}

interface Props {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

function hasSubmenu(item: ContextMenuItem): boolean {
  return item.submenuContent != null || (item.submenu != null && item.submenu.length > 0)
}

function useHoverFlyoutOpen(): {
  open: boolean
  onTriggerEnter: () => void
  onTriggerLeave: () => void
  onFlyoutEnter: () => void
  onFlyoutLeave: () => void
} {
  const [open, setOpen] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearCloseTimer = useCallback((): void => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }, [])

  const onTriggerEnter = useCallback((): void => {
    clearCloseTimer()
    setOpen(true)
  }, [clearCloseTimer])

  const onTriggerLeave = useCallback((): void => {
    clearCloseTimer()
    closeTimer.current = setTimeout(() => setOpen(false), SUBMENU_CLOSE_DELAY_MS)
  }, [clearCloseTimer])

  const onFlyoutEnter = useCallback((): void => {
    clearCloseTimer()
    setOpen(true)
  }, [clearCloseTimer])

  const onFlyoutLeave = useCallback((): void => {
    clearCloseTimer()
    closeTimer.current = setTimeout(() => setOpen(false), SUBMENU_CLOSE_DELAY_MS)
  }, [clearCloseTimer])

  useEffect(() => (): void => clearCloseTimer(), [clearCloseTimer])

  return { open, onTriggerEnter, onTriggerLeave, onFlyoutEnter, onFlyoutLeave }
}

function computeFlyoutStyle(anchorEl: HTMLElement, depth: number): CSSProperties {
  const rect = anchorEl.getBoundingClientRect()
  const margin = 8
  const maxH = Math.min(SUBMENU_MAX_HEIGHT_PX, window.innerHeight - margin * 2)
  let left = rect.right + SUBMENU_GAP_PX
  let top = rect.top

  if (left + SUBMENU_WIDTH_PX > window.innerWidth - margin) {
    left = rect.left - SUBMENU_WIDTH_PX - SUBMENU_GAP_PX
  }
  if (top + maxH > window.innerHeight - margin) {
    top = Math.max(margin, window.innerHeight - margin - maxH)
  }
  if (top < margin) top = margin

  return {
    position: 'fixed',
    left,
    top,
    width: SUBMENU_WIDTH_PX,
    maxHeight: maxH,
    zIndex: CONTEXT_SUBMENU_Z_BASE + depth
  }
}

function ContextMenuFlyout({
  open,
  anchorEl,
  depth,
  onFlyoutEnter,
  onFlyoutLeave,
  children,
  scrollable
}: {
  open: boolean
  anchorEl: HTMLElement | null
  depth: number
  onFlyoutEnter: () => void
  onFlyoutLeave: () => void
  children: ReactNode
  scrollable?: boolean
}): JSX.Element | null {
  const [style, setStyle] = useState<CSSProperties>({})

  useLayoutEffect(() => {
    if (!open || !anchorEl) return
    setStyle(computeFlyoutStyle(anchorEl, depth))
  }, [open, anchorEl, depth])

  if (!open || !anchorEl) return null

  return createPortal(
    <div
      data-mailclient-context-menu=""
      style={style}
      className="flex flex-col overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-xl"
      role="menu"
      onMouseEnter={onFlyoutEnter}
      onMouseLeave={onFlyoutLeave}
    >
      <div
        className={cn(
          'min-h-0 flex-1 py-1',
          scrollable !== false && 'overflow-y-auto overflow-x-hidden'
        )}
      >
        {children}
      </div>
    </div>,
    document.body
  )
}

function ContextMenuLeaf({
  item,
  onClose
}: {
  item: ContextMenuItem
  onClose: () => void
}): JSX.Element {
  const showSwatch = item.swatchAuto || (item.swatchHex != null && item.swatchHex !== '')
  const swatchRing = item.selected
    ? 'border-[3px] border-primary shadow-[0_0_0_1px_hsl(var(--popover))]'
    : 'border border-border/90'
  const showLeading = showSwatch || item.icon != null

  return (
    <button
      type="button"
      disabled={item.disabled}
      aria-current={item.selected ? 'true' : undefined}
      onClick={(): void => {
        if (item.onSelect) item.onSelect()
        onClose()
      }}
      className={cn(
        'flex w-full min-w-0 items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors',
        item.disabled
          ? 'cursor-not-allowed text-muted-foreground/40'
          : item.destructive
            ? 'hover:bg-destructive/20 hover:text-destructive'
            : 'hover:bg-secondary hover:text-foreground'
      )}
    >
      {showLeading ? (
        <span className="flex w-7 shrink-0 items-center justify-center gap-0.5" aria-hidden>
          {showSwatch ? (
            item.swatchAuto ? (
              <span
                className={cn(
                  'h-3.5 w-3.5 shrink-0 rounded-sm',
                  swatchRing,
                  'bg-[linear-gradient(135deg,hsl(var(--muted-foreground)/0.38)_25%,transparent_25%,transparent_50%,hsl(var(--muted-foreground)/0.38)_50%,hsl(var(--muted-foreground)/0.38)_75%,transparent_75%,transparent_100%)] bg-[length:5px_5px]'
                )}
              />
            ) : (
              <span
                className={cn('h-3.5 w-3.5 shrink-0 rounded-sm', swatchRing)}
                style={{ backgroundColor: item.swatchHex ?? undefined }}
              />
            )
          ) : item.icon ? (
            <item.icon className={cn('h-3.5 w-3.5 shrink-0', item.iconClassName)} />
          ) : null}
          {item.selected ? (
            <Check className="h-3 w-3 shrink-0 text-primary" strokeWidth={2.75} />
          ) : null}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
    </button>
  )
}

function ContextMenuRow({
  item,
  onClose,
  variant,
  depth
}: {
  item: ContextMenuItem
  onClose: () => void
  variant: 'root' | 'nested'
  depth: number
}): JSX.Element {
  const triggerRef = useRef<HTMLDivElement>(null)
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const { open, onTriggerEnter, onTriggerLeave, onFlyoutEnter, onFlyoutLeave } =
    useHoverFlyoutOpen()

  const handleTriggerEnter = useCallback((): void => {
    setAnchorEl(triggerRef.current)
    onTriggerEnter()
  }, [onTriggerEnter])

  const handleTriggerLeave = useCallback((): void => {
    onTriggerLeave()
  }, [onTriggerLeave])

  useLayoutEffect(() => {
    if (!open) setAnchorEl(null)
  }, [open])

  if (hasSubmenu(item)) {
    return (
      <>
        <div
          ref={triggerRef}
          className={cn(
            'flex w-full min-w-0 cursor-default items-center gap-2 px-3 py-1.5 text-left text-xs text-foreground',
            open && 'bg-secondary/80'
          )}
          onMouseEnter={handleTriggerEnter}
          onMouseLeave={handleTriggerLeave}
        >
          {variant === 'root' && item.icon ? (
            <item.icon
              className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground', item.iconClassName)}
            />
          ) : null}
          <span className={cn('min-w-0 flex-1 truncate', variant === 'root' && 'font-medium')}>
            {item.label}
          </span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        </div>
        <ContextMenuFlyout
          open={open}
          anchorEl={anchorEl}
          depth={depth}
          onFlyoutEnter={onFlyoutEnter}
          onFlyoutLeave={onFlyoutLeave}
          scrollable={item.submenuContent == null}
        >
          {item.submenuContent != null
            ? item.submenuContent
            : item.submenu?.map((sub) => (
                <ContextMenuRow
                  key={sub.id}
                  item={sub}
                  onClose={onClose}
                  variant="nested"
                  depth={depth + 1}
                />
              ))}
        </ContextMenuFlyout>
      </>
    )
  }

  return <ContextMenuLeaf item={item} onClose={onClose} />
}

export function ContextMenu({ x, y, items, onClose }: Props): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDown(e: MouseEvent): void {
      const target = e.target
      if (!(target instanceof Node)) return
      if (ref.current?.contains(target)) return
      if (target instanceof Element && target.closest('[data-mailclient-context-menu]')) return
      onClose()
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return (): void => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const adjustedX = Math.min(x, window.innerWidth - 220)
  const adjustedY = Math.min(y, window.innerHeight - items.length * 32 - 16)

  const menu = (
    <div
      ref={ref}
      data-mailclient-context-menu=""
      className="fixed min-w-[200px] max-w-[min(280px,calc(100vw-2rem))] overflow-visible rounded-md border border-border bg-popover py-1 text-popover-foreground shadow-lg"
      style={{ left: adjustedX, top: adjustedY, zIndex: CONTEXT_MENU_Z }}
      role="menu"
    >
      {items.map((item, idx) =>
        item.separator ? (
          <div key={`sep-${idx}`} className="my-1 h-px bg-border" />
        ) : (
          <ContextMenuRow key={item.id} item={item} onClose={onClose} variant="root" depth={0} />
        )
      )}
    </div>
  )

  return createPortal(menu, document.body)
}
