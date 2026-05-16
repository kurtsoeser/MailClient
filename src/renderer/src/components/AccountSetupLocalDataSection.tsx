import { useTranslation } from 'react-i18next'
import { Download, Eraser, HardDrive, Loader2, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatBytes } from '@/lib/format-bytes'
import type { LocalDataUsageReport } from '@shared/types'

export interface AccountSetupLocalDataSectionProps {
  localDataUsage: LocalDataUsageReport | null
  localDataScanning: boolean
  localDataBusy: boolean
  backupBusy: boolean
  busy: boolean
  onOptimize: () => void
  onExportPortable: () => void
  onExportFull: () => void
  onImportArchive: () => void
}

export function AccountSetupLocalDataSection({
  localDataUsage,
  localDataScanning,
  localDataBusy,
  backupBusy,
  busy,
  onOptimize,
  onExportPortable,
  onExportFull,
  onImportArchive
}: AccountSetupLocalDataSectionProps): JSX.Element {
  const { t } = useTranslation()

  return (
    <div className="mt-6 space-y-2 border-t border-border pt-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t('settings.localDataHeading')}
      </h3>
      <p className="text-xs leading-relaxed text-muted-foreground">{t('settings.localDataIntro')}</p>
      {localDataUsage ? (
        <p className="text-[10px] text-muted-foreground">
          {t('settings.localDataPath', { path: localDataUsage.userDataPath })}
        </p>
      ) : null}
      {localDataScanning ? (
        <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          {t('settings.localDataScanning')}
        </p>
      ) : localDataUsage ? (
        <div className="space-y-2">
          <p className="text-[11px] text-foreground">
            {t('settings.localDataTotal', {
              size: formatBytes(localDataUsage.totalBytes),
              count: localDataUsage.totalFileCount.toLocaleString()
            })}
          </p>
          {localDataUsage.reclaimableBytes > 0 ? (
            <p className="text-[10px] text-muted-foreground">
              {t('settings.localDataReclaimable', {
                size: formatBytes(localDataUsage.reclaimableBytes)
              })}
            </p>
          ) : null}
          {localDataUsage.totalBytes > 0 ? (
            <div className="space-y-1.5 rounded-md border border-border bg-muted/20 px-2.5 py-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {t('settings.localDataBreakdownTitle')}
              </p>
              {(
                [
                  {
                    label: t('settings.localDataBreakdownDatabase'),
                    bytes: localDataUsage.breakdown.databaseBytes
                  },
                  {
                    label: t('settings.localDataBreakdownCache'),
                    bytes: localDataUsage.breakdown.cacheBytes
                  },
                  {
                    label: t('settings.localDataBreakdownEssential'),
                    bytes: localDataUsage.breakdown.essentialBytes
                  }
                ] as const
              ).map((row) => {
                const pct = Math.round((row.bytes / localDataUsage.totalBytes) * 100)
                return (
                  <div key={row.label} className="space-y-0.5">
                    <div className="flex items-center justify-between gap-2 text-[10px]">
                      <span className="min-w-0 truncate text-muted-foreground">{row.label}</span>
                      <span className="shrink-0 tabular-nums text-foreground">
                        {formatBytes(row.bytes)}
                        {pct > 0 ? ` (${pct}%)` : ''}
                      </span>
                    </div>
                    <div className="h-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary/70"
                        style={{ width: `${Math.max(2, Math.min(100, pct))}%` }}
                      />
                    </div>
                  </div>
                )
              })}
              {localDataUsage.breakdown.attachmentCacheStaleBytes > 0 ? (
                <p className="pt-0.5 text-[10px] leading-snug text-muted-foreground">
                  {t('settings.localDataAttachmentStale', {
                    size: formatBytes(localDataUsage.breakdown.attachmentCacheStaleBytes)
                  })}
                </p>
              ) : null}
            </div>
          ) : null}
          <ul className="max-h-36 space-y-0.5 overflow-y-auto rounded-md border border-border bg-muted/20 px-2 py-1.5 text-[10px]">
            {localDataUsage.categories
              .filter((c) => c.bytes > 0)
              .slice(0, 12)
              .map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-2 text-muted-foreground"
                >
                  <span className="min-w-0 truncate">{t(c.labelKey)}</span>
                  <span className="shrink-0 tabular-nums text-foreground">
                    {formatBytes(c.bytes)}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onOptimize}
          disabled={localDataBusy || backupBusy || busy || localDataScanning}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
            localDataBusy || backupBusy || busy || localDataScanning
              ? 'bg-secondary text-muted-foreground'
              : 'border border-border bg-secondary/80 text-foreground hover:bg-secondary'
          )}
        >
          {localDataBusy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Eraser className="h-3.5 w-3.5" />
          )}
          {localDataBusy ? t('settings.localDataOptimizing') : t('settings.localDataOptimize')}
        </button>
        <button
          type="button"
          onClick={onExportPortable}
          disabled={localDataBusy || backupBusy || busy}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
            localDataBusy || backupBusy || busy
              ? 'bg-secondary text-muted-foreground'
              : 'border border-border bg-secondary/80 text-foreground hover:bg-secondary'
          )}
        >
          <HardDrive className="h-3.5 w-3.5" />
          {t('settings.localDataExportPortable')}
        </button>
        <button
          type="button"
          onClick={onExportFull}
          disabled={localDataBusy || backupBusy || busy}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
            localDataBusy || backupBusy || busy
              ? 'bg-secondary text-muted-foreground'
              : 'border border-border bg-secondary/80 text-foreground hover:bg-secondary'
          )}
        >
          <Download className="h-3.5 w-3.5" />
          {t('settings.localDataExportFull')}
        </button>
        <button
          type="button"
          onClick={onImportArchive}
          disabled={localDataBusy || backupBusy || busy}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
            localDataBusy || backupBusy || busy
              ? 'bg-secondary text-muted-foreground'
              : 'border border-border bg-secondary/80 text-foreground hover:bg-secondary'
          )}
        >
          <Upload className="h-3.5 w-3.5" />
          {t('settings.localDataImportArchive')}
        </button>
      </div>
    </div>
  )
}
