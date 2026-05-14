import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertCircle, Loader2, X } from 'lucide-react'
import type { ConnectedAccount, PeopleContactView, PeopleCreateContactInput } from '@shared/types'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onClose: () => void
  accounts: ConnectedAccount[]
  /** z. B. aktives Nav-Konto */
  preferredAccountId: string | null
  onCreated: (contact: PeopleContactView) => void | Promise<void>
}

function accountLabel(a: ConnectedAccount): string {
  return a.displayName?.trim() || a.email
}

export function PeopleNewContactDialog({
  open,
  onClose,
  accounts,
  preferredAccountId,
  onCreated
}: Props): JSX.Element | null {
  const { t } = useTranslation()
  const [accountId, setAccountId] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [givenName, setGivenName] = useState('')
  const [surname, setSurname] = useState('')
  const [primaryEmail, setPrimaryEmail] = useState('')
  const [company, setCompany] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [mobilePhone, setMobilePhone] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = useMemo(() => {
    const dn = displayName.trim()
    const gn = givenName.trim()
    const sn = surname.trim()
    const em = primaryEmail.trim()
    return Boolean(dn || gn || sn || em) && Boolean(accountId.trim())
  }, [displayName, givenName, surname, primaryEmail, accountId])

  useEffect(() => {
    if (!open) return
    setError(null)
    setBusy(false)
    setDisplayName('')
    setGivenName('')
    setSurname('')
    setPrimaryEmail('')
    setCompany('')
    setJobTitle('')
    setMobilePhone('')
    setNotes('')
    const preferred = preferredAccountId && accounts.some((a) => a.id === preferredAccountId)
    setAccountId(preferred ? preferredAccountId! : accounts[0]?.id ?? '')
  }, [open, accounts, preferredAccountId])

  if (!open) return null

  async function handleSubmit(): Promise<void> {
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    const input: PeopleCreateContactInput = {
      accountId: accountId.trim(),
      displayName: displayName.trim() || null,
      givenName: givenName.trim() || null,
      surname: surname.trim() || null,
      primaryEmail: primaryEmail.trim() || null,
      company: company.trim() || null,
      jobTitle: jobTitle.trim() || null,
      mobilePhone: mobilePhone.trim() || null,
      notes: notes.trim() || null
    }
    try {
      const created = await window.mailClient.people.createContact(input)
      await Promise.resolve(onCreated(created))
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const inputCls =
    'mt-0.5 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none ring-primary focus:ring-1'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-[480px] max-w-[92vw] overflow-hidden rounded-xl border border-border bg-card text-foreground shadow-2xl"
        onClick={(e): void => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h2 className="text-sm font-semibold">{t('people.shell.newContactTitle')}</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
            aria-label={t('people.shell.cancel')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[min(72vh,640px)] overflow-y-auto p-4">
          <p className="mb-3 text-xs text-muted-foreground">{t('people.shell.newContactHint')}</p>

          {accounts.length === 0 ? (
            <p className="text-sm text-destructive">{t('people.shell.noAccounts')}</p>
          ) : (
            <div className="space-y-3">
              <label className="block text-xs">
                <span className="text-muted-foreground">{t('people.shell.newContactAccount')}</span>
                <select
                  className={cn(inputCls, 'mt-0.5')}
                  value={accountId}
                  onChange={(e): void => setAccountId(e.target.value)}
                  disabled={busy}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {accountLabel(a)} ({a.provider === 'microsoft' ? 'Microsoft' : 'Google'})
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs">
                <span className="text-muted-foreground">{t('people.shell.fieldDisplayName')}</span>
                <input className={inputCls} value={displayName} onChange={(e) => setDisplayName(e.target.value)} disabled={busy} />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs">
                  <span className="text-muted-foreground">{t('people.shell.fieldGivenName')}</span>
                  <input className={inputCls} value={givenName} onChange={(e) => setGivenName(e.target.value)} disabled={busy} />
                </label>
                <label className="block text-xs">
                  <span className="text-muted-foreground">{t('people.shell.fieldSurname')}</span>
                  <input className={inputCls} value={surname} onChange={(e) => setSurname(e.target.value)} disabled={busy} />
                </label>
              </div>

              <label className="block text-xs">
                <span className="text-muted-foreground">{t('people.shell.fieldPrimaryEmail')}</span>
                <input
                  type="email"
                  className={inputCls}
                  value={primaryEmail}
                  onChange={(e) => setPrimaryEmail(e.target.value)}
                  disabled={busy}
                />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs">
                  <span className="text-muted-foreground">{t('people.shell.company')}</span>
                  <input className={inputCls} value={company} onChange={(e) => setCompany(e.target.value)} disabled={busy} />
                </label>
                <label className="block text-xs">
                  <span className="text-muted-foreground">{t('people.shell.jobTitle')}</span>
                  <input className={inputCls} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} disabled={busy} />
                </label>
              </div>

              <label className="block text-xs">
                <span className="text-muted-foreground">{t('people.shell.fieldMobile')}</span>
                <input className={inputCls} value={mobilePhone} onChange={(e) => setMobilePhone(e.target.value)} disabled={busy} />
              </label>

              <label className="block text-xs">
                <span className="text-muted-foreground">{t('people.shell.notes')}</span>
                <textarea
                  className={cn(inputCls, 'min-h-[72px] resize-y')}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={busy}
                />
              </label>

              <p className="text-[11px] text-muted-foreground">{t('people.shell.newContactValidation')}</p>

              {error ? (
                <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{error}</span>
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
          >
            {t('people.shell.cancel')}
          </button>
          <button
            type="button"
            onClick={(): void => void handleSubmit()}
            disabled={busy || !canSubmit || accounts.length === 0}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {busy ? t('people.shell.creatingContact') : t('people.shell.createContact')}
          </button>
        </div>
      </div>
    </div>
  )
}
