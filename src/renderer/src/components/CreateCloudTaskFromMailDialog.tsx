import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Loader2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { MailListItem, TaskListRow } from '@shared/types'
import { useAccountsStore } from '@/stores/accounts'
import { accountSupportsCloudTasks, cloudTaskAccountOptionLabel } from '@/lib/cloud-task-accounts'
import { cn } from '@/lib/utils'

function dueDateInputValue(dueIso: string | null | undefined): string {
  if (!dueIso) return ''
  if (/^\d{4}-\d{2}-\d{2}/.test(dueIso)) return dueIso.slice(0, 10)
  try {
    const d = new Date(dueIso)
    if (Number.isNaN(d.getTime())) return ''
    return d.toISOString().slice(0, 10)
  } catch {
    return ''
  }
}

function pickDefaultListId(rows: TaskListRow[]): string | null {
  if (rows.length === 0) return null
  return rows.find((r) => r.isDefault)?.id ?? rows[0]!.id
}

interface Props {
  open: boolean
  message: MailListItem | null
  onClose: () => void
  onCreated: () => void
}

export function CreateCloudTaskFromMailDialog({
  open,
  message,
  onClose,
  onCreated
}: Props): JSX.Element | null {
  const { t } = useTranslation()
  const accounts = useAccountsStore((s) => s.accounts)

  const taskAccounts = useMemo(
    () => accounts.filter((a) => accountSupportsCloudTasks(a)),
    [accounts]
  )

  const messageAccount = useMemo(
    () => (message ? accounts.find((a) => a.id === message.accountId) : undefined),
    [accounts, message]
  )

  const [accountId, setAccountId] = useState('')
  const [listId, setListId] = useState('')
  const [lists, setLists] = useState<TaskListRow[]>([])
  const [listsLoading, setListsLoading] = useState(false)
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [due, setDue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !message) return
    const preferred =
      taskAccounts.find((a) => a.id === message.accountId)?.id ?? taskAccounts[0]?.id ?? ''
    setAccountId(preferred)
    setTitle((message.subject || '').trim() || t('common.noSubject'))
    setNotes('')
    setDue(dueDateInputValue(message.todoDueAt))
    setError(null)
  }, [open, message, taskAccounts, t])

  useEffect(() => {
    if (!open || !accountId) {
      setLists([])
      setListId('')
      return
    }
    let cancelled = false
    setListsLoading(true)
    void window.mailClient.tasks
      .listLists({ accountId })
      .then((rows) => {
        if (cancelled) return
        setLists(rows)
        setListId(pickDefaultListId(rows) ?? '')
      })
      .catch((e) => {
        if (cancelled) return
        setLists([])
        setListId('')
        setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setListsLoading(false)
      })
    return (): void => {
      cancelled = true
    }
  }, [open, accountId])

  if (!open || !message) return null

  const canSubmit =
    taskAccounts.length > 0 &&
    accountId &&
    listId &&
    title.trim().length > 0 &&
    !busy &&
    !listsLoading

  async function handleSubmit(): Promise<void> {
    if (!message || !canSubmit) return
    setBusy(true)
    setError(null)
    try {
      const dueIso = due.trim() ? `${due.trim()}T12:00:00.000Z` : null
      await window.mailClient.tasks.createMailCloudTaskFromMessage({
        messageId: message.id,
        accountId,
        listId,
        title: title.trim(),
        notes: notes.trim() || null,
        dueIso
      })
      onCreated()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const noTaskAccounts = taskAccounts.length === 0
  const wrongAccount =
    messageAccount != null && !accountSupportsCloudTasks(messageAccount) && taskAccounts.length > 0

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-[480px] max-w-[92vw] rounded-xl border border-border bg-card text-foreground shadow-2xl"
        onClick={(e): void => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h2 className="text-sm font-semibold">{t('mail.createCloudTask.title')}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label={t('common.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {noTaskAccounts ? (
            <p className="text-sm text-muted-foreground">{t('mail.createCloudTask.noAccounts')}</p>
          ) : (
            <>
              {wrongAccount ? (
                <p className="text-xs text-amber-500/90">{t('mail.createCloudTask.otherAccountHint')}</p>
              ) : null}

              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">{t('mail.createCloudTask.account')}</span>
                <select
                  value={accountId}
                  onChange={(e): void => setAccountId(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
                >
                  {taskAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {cloudTaskAccountOptionLabel(a)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">{t('mail.createCloudTask.list')}</span>
                <select
                  value={listId}
                  disabled={listsLoading || lists.length === 0}
                  onChange={(e): void => setListId(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm disabled:opacity-50"
                >
                  {lists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">{t('mail.createCloudTask.taskTitle')}</span>
                <input
                  type="text"
                  value={title}
                  onChange={(e): void => setTitle(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">{t('mail.createCloudTask.notes')}</span>
                <textarea
                  value={notes}
                  onChange={(e): void => setNotes(e.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">{t('mail.createCloudTask.due')}</span>
                <input
                  type="date"
                  value={due}
                  onChange={(e): void => setDue(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
                />
              </label>
            </>
          )}

          {error ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            disabled={!canSubmit || noTaskAccounts}
            onClick={(): void => void handleSubmit()}
            className={cn(
              'inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground',
              (!canSubmit || noTaskAccounts) && 'pointer-events-none opacity-50'
            )}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {t('mail.createCloudTask.submit')}
          </button>
        </div>
      </div>
    </div>
  )
}
