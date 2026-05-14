import type { Ref } from 'react'
import { ArchiveRestore, Plus, RotateCcw, Save } from 'lucide-react'

import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import { DASHBOARD_TILE_IDS, type DashboardTileId } from '@/app/home/dashboard-layout'

import type { DashboardTileCardContent } from '@/app/home/DashboardTileCard'

export function DashboardTileGridToolbar(props: {
  addPanelOpen: boolean
  setAddPanelOpen: (open: boolean | ((o: boolean) => boolean)) => void
  addButtonRef: Ref<HTMLButtonElement>
  addPanelRef: Ref<HTMLDivElement>
  hidden: Set<string>
  tileById: Map<string, DashboardTileCardContent>
  isOnlyVisibleTile: (id: string) => boolean
  setTileVisibleInPanel: (id: DashboardTileId, visible: boolean) => void
  showAllTiles: () => void
  onOpenCustomWizard: () => void
  saveDashboardLayout: () => void
  restoreDashboardUserSnapshot: () => void
  resetLayout: () => void
  snapshotExists: boolean
}): JSX.Element {
  const { t } = useTranslation()
  const {
    addPanelOpen,
    setAddPanelOpen,
    addButtonRef,
    addPanelRef,
    hidden,
    tileById,
    isOnlyVisibleTile,
    setTileVisibleInPanel,
    showAllTiles,
    onOpenCustomWizard,
    saveDashboardLayout,
    restoreDashboardUserSnapshot,
    resetLayout,
    snapshotExists
  } = props

  return (
    <div className="relative mb-2 flex w-full shrink-0 items-center justify-between gap-2 px-1">
      <div className="relative flex items-center gap-1">
        <button
          ref={addButtonRef}
          type="button"
          onClick={(): void => setAddPanelOpen((o) => !o)}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-secondary/50 text-foreground hover:bg-secondary"
          title={t('dashboardGrid.addTilesTitle')}
          aria-label={t('dashboardGrid.addTilesAria')}
          aria-expanded={addPanelOpen}
        >
          <Plus className="h-4 w-4" aria-hidden />
        </button>
        {addPanelOpen ? (
          <div
            ref={addPanelRef}
            className="absolute left-0 top-full z-[80] mt-1 w-[min(100vw-2rem,22rem)] rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-md"
            role="dialog"
            aria-label={t('dashboardGrid.tilesPanelTitle')}
          >
            <div className="mb-2 text-xs font-semibold text-foreground">
              {t('dashboardGrid.tilesPanelTitle')}
            </div>
            <ul className="max-h-[min(60vh,22rem)] space-y-1.5 overflow-y-auto overscroll-contain">
              {DASHBOARD_TILE_IDS.map((id) => {
                const tile = tileById.get(id)
                const label = tile?.title ?? id
                const checked = !hidden.has(id)
                const disableUncheck = checked && isOnlyVisibleTile(id)
                const RowIcon = tile?.icon
                return (
                  <li
                    key={id}
                    className="flex items-start gap-2 rounded-md px-1 py-0.5 hover:bg-muted/50"
                  >
                    <input
                      id={`dash-tile-vis-${id}`}
                      type="checkbox"
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-border accent-primary"
                      checked={checked}
                      disabled={disableUncheck}
                      title={disableUncheck ? t('dashboardGrid.lastVisibleTileHint') : undefined}
                      onChange={(e): void => setTileVisibleInPanel(id, e.target.checked)}
                    />
                    <div className="flex min-w-0 flex-1 gap-2">
                      {RowIcon ? (
                        <RowIcon
                          className="mt-0.5 h-4 w-4 shrink-0 text-primary/80"
                          strokeWidth={2}
                          aria-hidden
                        />
                      ) : null}
                      <label
                        htmlFor={`dash-tile-vis-${id}`}
                        className={cn(
                          'min-w-0 flex-1 cursor-pointer text-xs leading-snug',
                          disableUncheck && 'cursor-not-allowed text-muted-foreground'
                        )}
                      >
                        <span className="font-medium text-foreground">{label}</span>
                        {tile?.subtitle ? (
                          <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                            {tile.subtitle}
                          </span>
                        ) : null}
                      </label>
                    </div>
                  </li>
                )
              })}
            </ul>
            <div className="mt-3 border-t border-border pt-2">
              <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {t('dashboard.customTiles.sectionTitle')}
              </div>
              <button
                type="button"
                onClick={onOpenCustomWizard}
                className="w-full rounded-md border border-dashed border-primary/40 bg-primary/5 px-2 py-2 text-left text-[11px] font-medium text-primary hover:bg-primary/10"
              >
                {t('dashboard.customTiles.addButton')}
              </button>
            </div>
            <div className="mt-3 border-t border-border pt-2">
              <button
                type="button"
                onClick={(): void => {
                  showAllTiles()
                  setAddPanelOpen(false)
                }}
                className="w-full rounded-md border border-border bg-secondary/40 px-2 py-1.5 text-[11px] font-medium text-foreground hover:bg-secondary"
              >
                {t('dashboardGrid.showAllTiles')}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={saveDashboardLayout}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-secondary/50 text-foreground hover:bg-secondary disabled:pointer-events-none disabled:opacity-40"
          title={t('dashboardGrid.saveLayoutTitle')}
          aria-label={t('dashboardGrid.saveLayoutAria')}
        >
          <Save className="h-4 w-4 shrink-0" aria-hidden />
        </button>
        <button
          type="button"
          onClick={restoreDashboardUserSnapshot}
          disabled={!snapshotExists}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-secondary/50 text-foreground hover:bg-secondary disabled:pointer-events-none disabled:opacity-40"
          title={t('dashboardGrid.restoreLayoutTitle')}
          aria-label={t('dashboardGrid.restoreLayoutAria')}
        >
          <ArchiveRestore className="h-4 w-4 shrink-0" aria-hidden />
        </button>
        <button
          type="button"
          onClick={resetLayout}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-secondary/50 text-foreground hover:bg-secondary"
          title={t('dashboardGrid.resetTitle')}
          aria-label={t('dashboardGrid.resetAria')}
        >
          <RotateCcw className="h-4 w-4 shrink-0" aria-hidden />
        </button>
      </div>
    </div>
  )
}
