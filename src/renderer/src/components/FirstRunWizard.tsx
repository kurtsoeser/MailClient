import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAccountsStore } from '@/stores/accounts'
import { cn } from '@/lib/utils'
import { Loader2, Mail, Shield, ArrowRight, ArrowLeft, X } from 'lucide-react'

type StepId = 'welcome' | 'microsoft' | 'google' | 'done'

interface Props {
  onOpenSettings: (tab: 'general' | 'accounts') => void
}

export function FirstRunWizard({ onOpenSettings }: Props): JSX.Element {
  const { t } = useTranslation()
  const config = useAccountsStore((s) => s.config)
  const accounts = useAccountsStore((s) => s.accounts)
  const addMicrosoftAccount = useAccountsStore((s) => s.addMicrosoftAccount)
  const addGoogleAccount = useAccountsStore((s) => s.addGoogleAccount)
  const storeError = useAccountsStore((s) => s.error)
  const setFirstRunSetupCompleted = useAccountsStore((s) => s.setFirstRunSetupCompleted)
  const initialize = useAccountsStore((s) => s.initialize)

  const [step, setStep] = useState<StepId>('welcome')
  const [localError, setLocalError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const hasMicrosoft = accounts.some((a) => a.provider === 'microsoft')
  const hasGoogle = accounts.some((a) => a.provider === 'google')
  const canMicrosoft = Boolean(config?.microsoftClientId?.trim())
  const canGoogle = Boolean(config?.googleClientId?.trim())

  const finishWizard = useCallback(async (): Promise<void> => {
    setBusy(true)
    setLocalError(null)
    try {
      await setFirstRunSetupCompleted(true)
      await initialize()
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [initialize, setFirstRunSetupCompleted])

  const openUrl = useCallback(async (url: string | null | undefined): Promise<void> => {
    const u = (url ?? '').trim()
    if (!u) return
    await window.mailClient.app.openExternal(u)
  }, [])

  async function handleAddMicrosoft(): Promise<void> {
    if (!canMicrosoft) {
      setLocalError(t('firstRun.errMicrosoft'))
      return
    }
    setBusy(true)
    setLocalError(null)
    try {
      await addMicrosoftAccount()
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleAddGoogle(): Promise<void> {
    if (!canGoogle) {
      setLocalError(t('firstRun.errGoogle'))
      return
    }
    setBusy(true)
    setLocalError(null)
    try {
      await addGoogleAccount()
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const err = localError ?? storeError

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div
        className="w-[min(520px,94vw)] max-h-[min(640px,92vh)] overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-2xl"
        role="dialog"
        aria-labelledby="first-run-title"
        aria-modal="true"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Mail className="h-4 w-4" />
            </div>
            <div>
              <h1 id="first-run-title" className="text-sm font-semibold text-foreground">
                {t('firstRun.title')}
              </h1>
              <p className="text-[11px] text-muted-foreground">{t('firstRun.subtitle')}</p>
            </div>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={(): void => void finishWizard()}
            className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40"
            title={t('firstRun.skipTitle')}
            aria-label={t('firstRun.skipAria')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {step === 'welcome' && (
          <div className="space-y-4 text-xs leading-relaxed text-muted-foreground">
            <p>{t('firstRun.welcomeP1')}</p>
            <div className="flex items-start gap-2 rounded-md border border-border bg-background/50 p-3 text-[11px]">
              <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <span>{t('firstRun.welcomeShield')}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {config?.publisherPrivacyUrl ? (
                <button
                  type="button"
                  className="text-[11px] font-medium text-primary underline-offset-2 hover:underline"
                  onClick={(): void => void openUrl(config.publisherPrivacyUrl)}
                >
                  {t('firstRun.privacy')}
                </button>
              ) : null}
              {config?.publisherHelpUrl ? (
                <button
                  type="button"
                  className="text-[11px] font-medium text-primary underline-offset-2 hover:underline"
                  onClick={(): void => void openUrl(config.publisherHelpUrl)}
                >
                  {t('firstRun.help')}
                </button>
              ) : null}
              <button
                type="button"
                className="text-[11px] font-medium text-muted-foreground underline-offset-2 hover:underline"
                onClick={(): void => onOpenSettings('general')}
              >
                {t('firstRun.advancedOAuth')}
              </button>
            </div>
          </div>
        )}

        {step === 'microsoft' && (
          <div className="space-y-3 text-xs leading-relaxed text-muted-foreground">
            <p className="font-medium text-foreground">{t('firstRun.msHeading')}</p>
            <p>{t('firstRun.msIntro')}</p>
            <ul className="list-inside list-disc space-y-1 pl-0.5 text-[11px]">
              <li>{t('firstRun.msLi1')}</li>
              <li>{t('firstRun.msLi2')}</li>
              <li>{t('firstRun.msLi3')}</li>
              <li>{t('firstRun.msLi4')}</li>
              <li>{t('firstRun.msLi5')}</li>
            </ul>
            <p className="text-[11px]">{t('firstRun.msDetails')}</p>
            {hasMicrosoft ? (
              <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-700 dark:text-emerald-400">
                {t('firstRun.msConnected')}
              </p>
            ) : (
              <button
                type="button"
                disabled={busy || !canMicrosoft}
                onClick={(): void => void handleAddMicrosoft()}
                className={cn(
                  'inline-flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition-colors',
                  busy || !canMicrosoft
                    ? 'bg-secondary text-muted-foreground'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90'
                )}
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {t('firstRun.msConnect')}
              </button>
            )}
            {!canMicrosoft ? (
              <p className="text-[11px] text-amber-600 dark:text-amber-500">{t('firstRun.msNoClient')}</p>
            ) : null}
          </div>
        )}

        {step === 'google' && (
          <div className="space-y-3 text-xs leading-relaxed text-muted-foreground">
            <p className="font-medium text-foreground">{t('firstRun.googleHeading')}</p>
            <p>{t('firstRun.googleIntro')}</p>
            <ul className="list-inside list-disc space-y-1 pl-0.5 text-[11px]">
              <li>{t('firstRun.googleLi1')}</li>
              <li>{t('firstRun.googleLi2')}</li>
              <li>{t('firstRun.googleLi3')}</li>
              <li>{t('firstRun.googleLi4')}</li>
            </ul>
            <p className="text-[11px]">{t('firstRun.googleDetails')}</p>
            {hasGoogle ? (
              <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-700 dark:text-emerald-400">
                {t('firstRun.googleConnected')}
              </p>
            ) : (
              <button
                type="button"
                disabled={busy || !canGoogle}
                onClick={(): void => void handleAddGoogle()}
                className={cn(
                  'inline-flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition-colors',
                  busy || !canGoogle
                    ? 'bg-secondary text-muted-foreground'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90'
                )}
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {t('firstRun.googleConnect')}
              </button>
            )}
            {!canGoogle ? (
              <p className="text-[11px] text-amber-600 dark:text-amber-500">{t('firstRun.googleNoClient')}</p>
            ) : null}
          </div>
        )}

        {step === 'done' && (
          <div className="space-y-3 text-xs leading-relaxed text-muted-foreground">
            <p className="font-medium text-foreground">{t('firstRun.doneHeading')}</p>
            <p>{t('firstRun.doneP1')}</p>
            {accounts.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">{t('firstRun.doneNoAccount')}</p>
            ) : null}
          </div>
        )}

        {err ? (
          <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-[11px] text-destructive">
            {err}
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
          <button
            type="button"
            disabled={busy || step === 'welcome'}
            onClick={(): void => {
              if (step === 'microsoft') setStep('welcome')
              else if (step === 'google') setStep('microsoft')
              else if (step === 'done') setStep('google')
            }}
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              busy || step === 'welcome'
                ? 'text-muted-foreground opacity-40'
                : 'text-foreground hover:bg-secondary'
            )}
          >
            <ArrowLeft className="h-3 w-3" />
            {t('firstRun.back')}
          </button>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={(): void => void finishWizard()}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40"
            >
              {t('firstRun.skip')}
            </button>
            {step !== 'done' ? (
              <button
                type="button"
                disabled={busy}
                onClick={(): void => {
                  if (step === 'welcome') setStep('microsoft')
                  else if (step === 'microsoft') setStep('google')
                  else if (step === 'google') setStep('done')
                }}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
              >
                {t('firstRun.next')}
                <ArrowRight className="h-3 w-3" />
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={(): void => void finishWizard()}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
              >
                {t('firstRun.toApp')}
                <ArrowRight className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
