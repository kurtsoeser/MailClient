import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import type { ConnectedAccount } from '@shared/types'
import { ListChecks, Loader2, X } from 'lucide-react'
import { useAccountsStore } from '@/stores/accounts'
import { useMailStore } from '@/stores/mail'

interface Props {
  open: boolean
  onClose: () => void
  /** Microsoft- und Gmail-Konten mit Mail; bei leerem Array wird nichts angezeigt. */
  workflowMailAccounts: ConnectedAccount[]
  /** Einstellungen oeffnen (Mail-Tab fuer manuelle Ordnerwahl). */
  onOpenMailSettings: () => void
}

export function WorkflowMailFoldersIntro({
  open,
  onClose,
  workflowMailAccounts,
  onOpenMailSettings
}: Props): JSX.Element | null {
  const { t } = useTranslation()
  const dismissWorkflowMailFoldersIntro = useAccountsStore((s) => s.dismissWorkflowMailFoldersIntro)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open || workflowMailAccounts.length === 0) return null

  async function handleDismissOnly(): Promise<void> {
    setError(null)
    setBusy(true)
    try {
      await dismissWorkflowMailFoldersIntro()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleEnsureFolders(): Promise<void> {
    setError(null)
    setBusy(true)
    try {
      for (const acc of workflowMailAccounts) {
        await window.mailClient.mail.ensureWorkflowMailFolders(acc.id)
      }
      await dismissWorkflowMailFoldersIntro()
      onClose()
      const latest = useAccountsStore.getState().accounts
      void useMailStore
        .getState()
        .refreshAccounts(latest)
        .catch((e) => console.warn('[WorkflowMailFoldersIntro] refreshAccounts:', e))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  function handleOpenSettings(): void {
    onOpenMailSettings()
    void dismissWorkflowMailFoldersIntro().catch(() => undefined)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wf-intro-title"
    >
      <div className="w-[min(520px,92vw)] max-w-[92vw] rounded-xl border border-border bg-card p-5 text-foreground shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ListChecks className="h-5 w-5" aria-hidden />
            </span>
            <h2 id="wf-intro-title" className="text-sm font-semibold leading-tight">
              {t('workflowIntro.title')}
            </h2>
          </div>
          <button
            type="button"
            onClick={(): void => void handleDismissOnly()}
            disabled={busy}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40"
            aria-label={t('workflowIntro.closeAria')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          <Trans
            i18nKey="workflowIntro.body"
            components={{
              term: <strong className="font-medium text-foreground" />,
              wip: <strong className="font-medium text-foreground" />,
              done: <strong className="font-medium text-foreground" />,
              doneFolder: <strong className="font-medium text-foreground" />
            }}
          />
        </p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          <Trans
            i18nKey="workflowIntro.body2"
            components={{
              settings: <span className="font-medium text-foreground" />
            }}
          />
        </p>

        {busy && (
          <p className="mt-2 text-[11px] leading-relaxed text-amber-600/90 dark:text-amber-400/90">
            <Trans
              i18nKey="workflowIntro.busyHint"
              components={{ browser: <strong className="font-medium" /> }}
            />
          </p>
        )}

        {error && (
          <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
            {error}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={(): void => void handleEnsureFolders()}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {t('workflowIntro.ensureFolders')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={handleOpenSettings}
            className="rounded-md border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50"
          >
            {t('workflowIntro.chooseSettings')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={(): void => void handleDismissOnly()}
            className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            {t('workflowIntro.dismiss')}
          </button>
        </div>
      </div>
    </div>
  )
}
