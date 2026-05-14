import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Ueber Glass-Spalten (backdrop-filter = eigener Stacking Context), unter App-Modals (z-[300]). */
const CONTEXT_MENU_Z = 'z-[280]'
const CONTEXT_SUBMENU_Z = 'z-[290]'

export interface ContextMenuItem {
  id: string
  label: string
  icon?: React.ComponentType<{ className?: string }>
  /** Zusätzliche Tailwind-Klassen fürs Icon (z. B. `text-yellow-400`). */
  iconClassName?: string
  disabled?: boolean
  destructive?: boolean
  separator?: boolean
  onSelect?: () => void
  /** Untermenue (oeffnet rechts neben dem Eintrag bei Hover). */
  submenu?: ContextMenuItem[]
  /** Freies Panel statt Liste (z.B. verschieben mit Suche); hat Vorrang vor `submenu`. */
  submenuContent?: ReactNode
  /** Hex-Fuellfarbe fuer kleines Farbquadrat (typ. Untermenue). */
  swatchHex?: string | null
  /** Preset „auto“: neutrales Muster statt `swatchHex`. */
  swatchAuto?: boolean
  /** Aktiver Eintrag: Haken + hervorgehobener Rahmen am Farbfeld. */
  selected?: boolean
}

interface Props {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: Props): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [openSubmenuId, setOpenSubmenuId] = useState<string | null>(null)

  useEffect(() => {
    function onDown(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
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

  function renderSubmenuButton(sub: ContextMenuItem): JSX.Element {
    const showSwatch = sub.swatchAuto || (sub.swatchHex != null && sub.swatchHex !== '')
    const swatchRing = sub.selected
      ? 'border-[3px] border-primary shadow-[0_0_0_1px_hsl(var(--popover))]'
      : 'border border-border/90'

    return (
      <button
        key={sub.id}
        type="button"
        disabled={sub.disabled}
        aria-current={sub.selected ? 'true' : undefined}
        onClick={(): void => {
          if (sub.onSelect) sub.onSelect()
          onClose()
        }}
        className={cn(
          'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors',
          sub.disabled
            ? 'cursor-not-allowed text-muted-foreground/40'
            : sub.destructive
              ? 'hover:bg-destructive/20 hover:text-destructive'
              : 'hover:bg-secondary hover:text-foreground'
        )}
      >
        <span className="flex w-7 shrink-0 items-center justify-center gap-0.5" aria-hidden>
          {showSwatch ? (
            sub.swatchAuto ? (
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
                style={{ backgroundColor: sub.swatchHex ?? undefined }}
              />
            )
          ) : sub.icon ? (
            <sub.icon className={cn('h-3.5 w-3.5 shrink-0', sub.iconClassName)} />
          ) : (
            <span className="h-3.5 w-3.5 shrink-0 rounded-sm border border-border/60 bg-muted/50" />
          )}
          {sub.selected ? <Check className="h-3 w-3 shrink-0 text-primary" strokeWidth={2.75} /> : null}
        </span>
        <span className="min-w-0 flex-1 truncate">{sub.label}</span>
      </button>
    )
  }

  const menu = (
    <div
      ref={ref}
      className={cn(
        'fixed min-w-[200px] rounded-md border border-border bg-popover py-1 text-popover-foreground shadow-lg',
        CONTEXT_MENU_Z
      )}
      style={{ left: adjustedX, top: adjustedY }}
      role="menu"
    >
      {items.map((item, idx) =>
        item.separator ? (
          <div key={`sep-${idx}`} className="my-1 h-px bg-border" />
        ) : item.submenuContent != null ||
          (item.submenu != null && item.submenu.length > 0) ? (
          <div
            key={item.id}
            className="relative"
            onMouseEnter={(): void => setOpenSubmenuId(item.id)}
            onMouseLeave={(): void => setOpenSubmenuId(null)}
          >
            <div
              className={cn(
                'flex w-full cursor-default items-center gap-2 px-3 py-1.5 text-left text-xs text-foreground',
                openSubmenuId === item.id && 'bg-secondary/80'
              )}
            >
              {item.icon && (
                <item.icon
                  className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground', item.iconClassName)}
                />
              )}
              <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            </div>
            {openSubmenuId === item.id && (
              <div
                className={cn(
                  'absolute left-full top-0 ml-0.5 min-w-[min(240px,calc(100vw-2rem))] max-w-[min(320px,calc(100vw-2rem))] max-h-[min(340px,70vh)] rounded-md border border-border bg-popover text-popover-foreground shadow-xl',
                  CONTEXT_SUBMENU_Z,
                  item.submenuContent == null && 'overflow-y-auto py-1'
                )}
                role="menu"
              >
                {item.submenuContent != null ? (
                  item.submenuContent
                ) : (
                  item.submenu?.map((sub) => renderSubmenuButton(sub))
                )}
              </div>
            )}
          </div>
        ) : (
          <button
            key={item.id}
            type="button"
            disabled={item.disabled}
            onClick={(): void => {
              if (item.onSelect) item.onSelect()
              onClose()
            }}
            className={cn(
              'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors',
              item.disabled
                ? 'cursor-not-allowed text-muted-foreground/40'
                : item.destructive
                  ? 'hover:bg-destructive/20 hover:text-destructive'
                  : 'hover:bg-secondary hover:text-foreground'
            )}
          >
            {item.icon && (
              <item.icon className={cn('h-3.5 w-3.5 shrink-0', item.iconClassName)} />
            )}
            <span className="flex-1 truncate">{item.label}</span>
          </button>
        )
      )}
    </div>
  )

  return createPortal(menu, document.body)
}
