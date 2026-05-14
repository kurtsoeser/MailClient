import type { CSSProperties } from 'react'

import { EyeOff, GripVertical, Pin, PinOff } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

export interface DashboardTileCardContent {
  title: string
  subtitle?: string
  icon?: LucideIcon
  onOpenFull?: () => void
  body: React.ReactNode
}

export function DashboardTileCard(props: {
  id: string
  tile: DashboardTileCardContent
  style: CSSProperties
  isPinned: boolean
  isSelected: boolean
  hideDisabled: boolean
  /** Tooltip für den Griff (inkl. Mehrfachauswahl-Hinweis, falls nötig). */
  dragHandleTitle: string
  /** Tooltip für „Ausblenden“ / „Kachel entfernen“. */
  hideActionTitle: string
  onDragHandlePointerDown: (e: React.PointerEvent) => void
  onHide: () => void
  onTogglePin: () => void
  onResizePointerDown: (e: React.PointerEvent) => void
  onBodyAreaClick: (ev: React.MouseEvent) => void
}): JSX.Element {
  const { t } = useTranslation()
  const {
    id,
    tile,
    style,
    isPinned,
    isSelected,
    hideDisabled,
    dragHandleTitle,
    hideActionTitle,
    onDragHandlePointerDown,
    onHide,
    onTogglePin,
    onResizePointerDown,
    onBodyAreaClick
  } = props

  return (
    <div
      data-dashboard-tile
      className={cn(
        'relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-md',
        isSelected && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
      )}
      style={style}
    >
      <div
        className={cn(
          'flex shrink-0 select-none items-stretch gap-2 border-b border-border bg-secondary/35 px-2 py-1.5',
          'cursor-grab active:cursor-grabbing'
        )}
        onPointerDown={onDragHandlePointerDown}
        title={dragHandleTitle}
      >
        <GripVertical className="h-4 w-4 shrink-0 self-center text-muted-foreground" aria-hidden />
        {tile.icon != null ? (
          <div
            className="flex shrink-0 items-center justify-center self-stretch border-r border-border/60 pr-2"
            aria-hidden
          >
            {(() => {
              const TileIcon = tile.icon
              return (
                <TileIcon
                  className="h-8 w-8 shrink-0 text-primary/85"
                  strokeWidth={1.35}
                  aria-hidden
                />
              )
            })()}
          </div>
        ) : null}
        {tile.onOpenFull ? (
          <button
            type="button"
            className="min-w-0 flex-1 self-center rounded-md px-0.5 py-0 text-left hover:bg-secondary/50"
            onPointerDown={(e): void => e.stopPropagation()}
            onClick={(): void => tile.onOpenFull?.()}
          >
            <div className="truncate text-xs font-semibold text-foreground">{tile.title}</div>
            {tile.subtitle ? (
              <div className="truncate text-[10px] text-muted-foreground">{tile.subtitle}</div>
            ) : null}
          </button>
        ) : (
          <div className="min-w-0 flex-1 self-center">
            <div className="truncate text-xs font-semibold text-foreground">{tile.title}</div>
            {tile.subtitle ? (
              <div className="truncate text-[10px] text-muted-foreground">{tile.subtitle}</div>
            ) : null}
          </div>
        )}
        <button
          type="button"
          disabled={hideDisabled}
          title={hideActionTitle}
          aria-label={t('dashboardGrid.hideTileAria')}
          onPointerDown={(e): void => e.stopPropagation()}
          onClick={onHide}
          className={cn(
            'shrink-0 self-center rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive',
            hideDisabled && 'pointer-events-none opacity-40'
          )}
        >
          <EyeOff className="h-3.5 w-3.5" aria-hidden />
        </button>
        <button
          type="button"
          title={isPinned ? t('dashboardGrid.unpinTileTitle') : t('dashboardGrid.pinTileTitle')}
          aria-label={isPinned ? t('dashboardGrid.unpinTileAria') : t('dashboardGrid.pinTileAria')}
          onPointerDown={(e): void => e.stopPropagation()}
          onClick={onTogglePin}
          className={cn(
            'shrink-0 self-center rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground',
            isPinned && 'text-primary'
          )}
        >
          {isPinned ? (
            <PinOff className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Pin className="h-3.5 w-3.5" aria-hidden />
          )}
        </button>
      </div>

      <div
        className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        role="presentation"
        onClick={onBodyAreaClick}
      >
        {tile.body}
      </div>

      <button
        type="button"
        aria-label={t('dashboardGrid.resizeAria')}
        title={t('dashboardGrid.resizeTitle')}
        onPointerDown={onResizePointerDown}
        className="absolute bottom-0 right-0 z-[2] flex h-9 w-9 cursor-nwse-resize items-end justify-end rounded-md border border-transparent p-1 hover:border-border hover:bg-secondary/50"
      >
        <span className="inline-block h-3 w-3 border-b-2 border-r-2 border-muted-foreground/80" />
      </button>
    </div>
  )
}
