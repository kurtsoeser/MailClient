import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Search, UserPlus, X } from 'lucide-react'
import type { PeopleContactView } from '@shared/types'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  accountId: string
  onClose: () => void
  /** Wird mit primaerer E-Mail des Kontakts aufgerufen (falls vorhanden). */
  onPick: (email: string, displayName: string | null) => void
}

export function ComposeContactPickerDialog({ open, accountId, onClose, onPick }: Props): JSX.Element | null {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<PeopleContactView[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const list = await window.mailClient.people.list({
        filter: 'all',
        accountId,
        query: query.trim(),
        limit: 400,
        sortBy: 'displayName'
      })
      const withEmail = list.filter((c) => (c.primaryEmail ?? '').trim().length > 0)
      setRows(withEmail)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [accountId, query])

  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => {
      void load()
    }, 200)
    return (): void => clearTimeout(t)
  }, [open, load])

  useEffect(() => {
    if (!open) {
      setQuery('')
      setRows([])
      setError(null)
    }
  }, [open])

  const title = useMemo(() => 'Kontakt als Empfänger', [])

  if (!open) return null

  const labelFor = (c: PeopleContactView): string => {
    const n = [c.displayName, c.givenName, c.surname].filter(Boolean).join(' ').trim()
    return n || c.primaryEmail || 'Kontakt'
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(420px,80vh)] w-[min(440px,94vw)] flex-col rounded-xl border border-border bg-card shadow-2xl"
        onClick={(e): void => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          </div>
          <button
            type="button"
            className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Schließen"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="border-b border-border/60 px-3 py-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e): void => setQuery(e.target.value)}
              placeholder="Name oder E-Mail suchen…"
              className="w-full rounded-md border border-border/70 bg-background py-1.5 pl-8 pr-2 text-xs text-foreground outline-none ring-0 placeholder:text-muted-foreground focus:border-primary/50"
              autoFocus
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-1 py-1">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Kontakte werden geladen…
            </div>
          )}
          {!loading && error && (
            <p className="px-3 py-4 text-center text-xs text-destructive">{error}</p>
          )}
          {!loading && !error && rows.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              Keine Kontakte mit E-Mail-Adresse gefunden. Kontakte unter «Personen» synchronisieren.
            </p>
          )}
          {!loading &&
            !error &&
            rows.map((c) => (
              <button
                key={c.id}
                type="button"
                className={cn(
                  'flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left',
                  'text-xs hover:bg-secondary'
                )}
                onClick={(): void => {
                  const em = (c.primaryEmail ?? '').trim()
                  if (!em) return
                  onPick(em, labelFor(c))
                  onClose()
                }}
              >
                <span className="font-medium text-foreground">{labelFor(c)}</span>
                <span className="text-[11px] text-muted-foreground">{c.primaryEmail}</span>
              </button>
            ))}
        </div>
      </div>
    </div>
  )
}
