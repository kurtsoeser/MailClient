import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Loader2 } from 'lucide-react'
import type { MailBulkUnflagProgressPayload } from '@shared/types'
import { useAccountsStore } from '@/stores/accounts'
import { useConnectivityStore } from '@/stores/connectivity'
import { showAppConfirm } from '@/stores/app-dialog'
import { cn } from '@/lib/utils'

export function BulkUnflagServerDialog({
  open,
  onClose
}: {
  open: boolean
  onClose: () => void
}): JSX.Element | null {
  const { t } = useTranslation()
  const accounts = useAccountsStore((s) => s.accounts)
  const mailAccounts = accounts.filter((a) => a.provider === 'microsoft' || a.provider === 'google')
  const online = useConnectivityStore((s) => s.online)

  const [accountId, setAccountId] = useState<string>('')
  const [excludeDeletedJunk, setExcludeDeletedJunk] = useState(true)
  const [dryCount, setDryCount] = useState<number | null>(null)
  const [dryLoading, setDryLoading] = useState(false)
  const [dryError, setDryError] = useState<string | null>(null)
  const [runBusy, setRunBusy] = useState(false)
  const [progress, setProgress] = useState<MailBulkUnflagProgressPayload | null>(null)
  const [runResult, setRunResult] = useState<{
    processed: number
    failed: number
    firstError: string | null
  } | null>(null)

  useEffect(() => {
    if (!open) return
    setDryCount(null)
    setDryError(null)
    setRunResult(null)
    setProgress(null)
    setRunBusy(false)
    setDryLoading(false)
    setAccountId((prev) => {
      if (mailAccounts.some((a) => a.id === prev)) return prev
      return mailAccounts[0]?.id ?? ''
    })
  }, [open, mailAccounts])

  const runDry = useCallback(async (): Promise<void> => {
    if (!accountId) return
    setDryLoading(true)
    setDryError(null)
    setDryCount(null)
    try {
      const r = await window.mailClient.mail.bulkUnflagFlaggedMessages({
        accountId,
        excludeDeletedJunk,
        dryRun: true
      })
      if (r.dryRun) setDryCount(r.count)
    } catch (e) {
      setDryError(e instanceof Error ? e.message : String(e))
    } finally {
      setDryLoading(false)
    }
  }, [accountId, excludeDeletedJunk])

  useEffect(() => {
    if (!open || !accountId) return
    void runDry()
  }, [open, accountId, excludeDeletedJunk, runDry])

  useEffect(() => {
    if (!open || !runBusy) return
    const off = window.mailClient.events.onMailBulkUnflagProgress((p) => {
      if (p.accountId === accountId) setProgress(p)
    })
    return off
  }, [open, runBusy, accountId])

  const handleExecute = useCallback(async (): Promise<void> => {
    if (!accountId || !online) return
    const n = dryCount ?? 0
    if (n === 0) {
      setDryError(t('settings.bulkUnflagNothing'))
      return
    }
    const ok1 = await showAppConfirm(t('settings.bulkUnflagConfirm1', { count: String(n) }), {
      title: t('settings.bulkUnflagTitle'),
      variant: 'danger',
      confirmLabel: t('settings.bulkUnflagConfirmButton')
    })
    if (!ok1) return
    const ok2 = await showAppConfirm(t('settings.bulkUnflagConfirm2'), {
      title: t('settings.bulkUnflagTitle'),
      variant: 'danger',
      confirmLabel: t('settings.bulkUnflagExecuteButton')
    })
    if (!ok2) return

    setRunBusy(true)
    setProgress(null)
    setRunResult(null)
    setDryError(null)
    try {
      const r = await window.mailClient.mail.bulkUnflagFlaggedMessages({
        accountId,
        excludeDeletedJunk,
        dryRun: false
      })
      if (!r.dryRun) {
        setRunResult({
          processed: r.processed,
          failed: r.failed,
          firstError: r.firstError
        })
      }
    } catch (e) {
      setDryError(e instanceof Error ? e.message : String(e))
    } finally {
      setRunBusy(false)
      setProgress(null)
    }
  }, [accountId, excludeDeletedJunk, dryCount, online, t])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal
      aria-labelledby="bulk-unflag-title"
    >
      <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 id="bulk-unflag-title" className="text-sm font-semibold text-foreground">
            {t('settings.bulkUnflagTitle')}
          </h2>
          <button
            type="button"
            onClick={(): void => {
              if (!runBusy) onClose()
            }}
            disabled={runBusy}
            className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40"
            aria-label={t('common.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 text-xs">
          {mailAccounts.length === 0 ? (
            <p className="text-muted-foreground">{t('settings.bulkUnflagNeedAccount')}</p>
          ) : (
            <>
              <p className="leading-relaxed text-muted-foreground">{t('settings.bulkUnflagIntro')}</p>

              <div className="space-y-1">
                <label className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t('settings.bulkUnflagAccount')}
                </label>
                <select
                  value={accountId}
                  onChange={(e): void => setAccountId(e.target.value)}
                  disabled={runBusy}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 outline-none focus:border-ring"
                >
                  {mailAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.email}
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  checked={excludeDeletedJunk}
                  onChange={(e): void => setExcludeDeletedJunk(e.target.checked)}
                  disabled={runBusy}
                  className="mt-0.5 h-4 w-4 accent-primary"
                />
                <span className="leading-relaxed text-foreground">{t('settings.bulkUnflagExcludeDeletedJunk')}</span>
              </label>

              <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
                {dryLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t('settings.bulkUnflagCountLoading')}
                  </div>
                ) : dryCount != null ? (
                  <p className="font-medium text-foreground">
                    {t('settings.bulkUnflagCountResult', { count: String(dryCount) })}
                  </p>
                ) : (
                  <p className="text-muted-foreground">{t('settings.bulkUnflagCountUnknown')}</p>
                )}
              </div>

              {progress && runBusy ? (
                <div className="space-y-1">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{
                        width: `${progress.total > 0 ? Math.min(100, (100 * progress.done) / progress.total) : 0}%`
                      }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {t('settings.bulkUnflagProgress', { done: String(progress.done), total: String(progress.total) })}
                  </p>
                </div>
              ) : null}

              {dryError ? <p className="text-destructive">{dryError}</p> : null}

              {runResult ? (
                <div className="rounded-md border border-border bg-card px-3 py-2 text-foreground">
                  <p>{t('settings.bulkUnflagDone', { ok: String(runResult.processed), fail: String(runResult.failed) })}</p>
                  {runResult.firstError ? (
                    <p className="mt-1 text-[10px] text-destructive">{runResult.firstError}</p>
                  ) : null}
                </div>
              ) : null}

              {!online ? <p className="text-destructive">{t('settings.bulkUnflagOffline')}</p> : null}

              <div className="flex flex-wrap justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={runBusy}
                  className={cn(
                    'rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors',
                    runBusy ? 'cursor-not-allowed opacity-40' : 'hover:bg-secondary'
                  )}
                >
                  {runResult ? t('common.close') : t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={(): void => void handleExecute()}
                  disabled={runBusy || !online || dryLoading || mailAccounts.length === 0}
                  className={cn(
                    'rounded-md border border-destructive/50 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive transition-colors',
                    runBusy || !online || dryLoading || mailAccounts.length === 0
                      ? 'cursor-not-allowed opacity-40'
                      : 'hover:bg-destructive/20'
                  )}
                >
                  {runBusy ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {t('settings.bulkUnflagRunning')}
                    </span>
                  ) : (
                    t('settings.bulkUnflagExecuteButton')
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
