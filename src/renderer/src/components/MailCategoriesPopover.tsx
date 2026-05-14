import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import type { ConnectedAccount, MailMasterCategory } from '@shared/types'
import { outlookCategoryDotClass } from '@/lib/outlook-category-colors'
import { Check, Loader2, X } from 'lucide-react'

interface MailCategoriesPopoverProps {
  open: boolean
  anchor: { x: number; y: number }
  messageId: number
  account: ConnectedAccount | null
  selectedNames: string[]
  onClose: () => void
}

export function MailCategoriesPopover({
  open,
  anchor,
  messageId,
  account,
  selectedNames,
  onClose
}: MailCategoriesPopoverProps): JSX.Element | null {
  const rootRef = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [masters, setMasters] = useState<MailMasterCategory[]>([])
  const [distinct, setDistinct] = useState<string[]>([])
  const [freeText, setFreeText] = useState('')
  const [draft, setDraft] = useState<string[]>([])

  const isMicrosoft = account?.provider === 'microsoft'

  const colorByName = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of masters) {
      m.set(c.displayName, c.color)
    }
    return m
  }, [masters])

  useEffect(() => {
    if (open) setDraft([...selectedNames])
  }, [open, selectedNames])

  useEffect(() => {
    if (!open || !account) return
    setLoadErr(null)
    setBusy(true)
    const p = isMicrosoft
      ? window.mailClient.mail.listMasterCategories(account.id)
      : window.mailClient.mail.listDistinctMessageTags(account.id)
    void p
      .then((res) => {
        if (isMicrosoft) {
          setMasters(res as MailMasterCategory[])
          setDistinct([])
        } else {
          setMasters([])
          setDistinct(res as string[])
        }
      })
      .catch((e: unknown) => {
        setLoadErr(e instanceof Error ? e.message : String(e))
      })
      .finally(() => setBusy(false))
  }, [open, account, isMicrosoft])

  useEffect(() => {
    if (!open) return
    function onDocMouseDown(e: MouseEvent): void {
      const el = rootRef.current
      if (!el || el.contains(e.target as Node)) return
      onClose()
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return (): void => document.removeEventListener('mousedown', onDocMouseDown)
  }, [open, onClose])

  if (!open || !account) return null

  async function applyCategories(next: string[]): Promise<void> {
    setBusy(true)
    setLoadErr(null)
    try {
      await window.mailClient.mail.setMessageCategories({ messageId, categories: next })
      onClose()
    } catch (e: unknown) {
      setLoadErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  function toggleDraftName(name: string): void {
    const trimmed = name.trim()
    if (!trimmed) return
    setDraft((d) => {
      const s = new Set(d)
      if (s.has(trimmed)) s.delete(trimmed)
      else s.add(trimmed)
      return Array.from(s).sort((a, b) => a.localeCompare(b, 'de'))
    })
  }

  function addFreeToDraft(): void {
    const t = freeText.trim()
    if (!t) return
    setDraft((d) => Array.from(new Set([...d, t])).sort((a, b) => a.localeCompare(b, 'de')))
    setFreeText('')
  }

  const choiceNames = useMemo(() => {
    if (isMicrosoft) {
      const fromMasters = masters.map((m) => m.displayName)
      const extra = draft.filter((n) => !fromMasters.includes(n))
      return [...new Set([...fromMasters, ...extra])].sort((a, b) => a.localeCompare(b, 'de'))
    }
    return [...new Set([...distinct, ...draft])].sort((a, b) => a.localeCompare(b, 'de'))
  }, [isMicrosoft, masters, distinct, draft])

  return (
    <div
      ref={rootRef}
      className={cn(
        'fixed z-[200] w-[min(22rem,calc(100vw-1.5rem))] rounded-lg border border-border bg-popover p-3 text-xs shadow-xl',
        'text-popover-foreground'
      )}
      style={{ left: anchor.x, top: anchor.y }}
      role="dialog"
      aria-label="Kategorien"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-semibold text-foreground">Kategorien</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label="Schliessen"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {isMicrosoft && (
        <p className="mb-2 leading-relaxed text-[10px] text-muted-foreground">
          Entspricht den Outlook-Kategorien dieses Kontos. Aenderungen an der Masterliste findest du
          unter Einstellungen → Mail.
        </p>
      )}

      {!isMicrosoft && (
        <p className="mb-2 leading-relaxed text-[10px] text-muted-foreground">
          Lokale Kategorien fuer dieses Konto. Bei Microsoft-Konten werden dieselben Namen mit
          Outlook synchronisiert.
        </p>
      )}

      {loadErr && (
        <div className="mb-2 rounded border border-destructive/40 bg-destructive/10 p-2 text-[10px] text-destructive">
          {loadErr}
        </div>
      )}

      {busy && choiceNames.length === 0 && !loadErr ? (
        <div className="flex items-center gap-2 py-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Lade…
        </div>
      ) : (
        <ul className="max-h-56 space-y-0.5 overflow-y-auto pr-0.5">
          {choiceNames.map((name) => {
            const on = draft.includes(name)
            const dot = outlookCategoryDotClass(colorByName.get(name))
            return (
              <li key={name}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={(): void => toggleDraftName(name)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                    on ? 'bg-primary/15 text-foreground' : 'hover:bg-secondary/80'
                  )}
                >
                  <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', dot)} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{name}</span>
                  {on && <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {!isMicrosoft && (
        <div className="mt-3 flex gap-2 border-t border-border pt-3">
          <input
            value={freeText}
            onChange={(e): void => setFreeText(e.target.value)}
            onKeyDown={(e): void => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addFreeToDraft()
              }
            }}
            placeholder="Neue Kategorie…"
            className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button
            type="button"
            disabled={busy || !freeText.trim()}
            onClick={addFreeToDraft}
            className="shrink-0 rounded-md bg-secondary px-2 py-1 text-[10px] font-medium text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50"
          >
            OK
          </button>
        </div>
      )}

      <div className="mt-3 flex justify-end gap-2 border-t border-border pt-3">
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          className="rounded-md px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          Abbrechen
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={(): void => void applyCategories(draft)}
          className="rounded-md bg-primary px-3 py-1 text-[10px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Uebernehmen
        </button>
      </div>

      {isMicrosoft && masters.length === 0 && !busy && !loadErr && (
        <p className="mt-2 text-[10px] text-muted-foreground">
          Noch keine Masterkategorien geladen. Lege welche unter Einstellungen → Mail an oder in
          Outlook.
        </p>
      )}
    </div>
  )
}
