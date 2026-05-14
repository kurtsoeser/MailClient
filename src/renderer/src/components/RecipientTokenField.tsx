import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { ComposeRecipientSuggestion } from '@shared/types'
import {
  formatRecipientsWithTail,
  parseRecipients,
  parseRecipientsWithTail
} from '@/lib/compose-helpers'
import { cn } from '@/lib/utils'

export function RecipientTokenField({
  label,
  value,
  onChange,
  accountId,
  showToggle,
  onToggleCcBcc,
  className
}: {
  label: string
  value: string
  onChange: (v: string) => void
  accountId: string
  showToggle?: boolean
  onToggleCcBcc?: () => void
  className?: string
}): JSX.Element {
  const { complete, tail } = useMemo(() => parseRecipientsWithTail(value), [value])
  const [suggestions, setSuggestions] = useState<ComposeRecipientSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const fetchSuggest = useCallback(
    async (q: string): Promise<void> => {
      const t = q.trim()
      if (t.length < 2) {
        setSuggestions([])
        return
      }
      try {
        const list = await window.mailClient.compose.recipientSuggestions({
          accountId,
          query: t
        })
        setSuggestions(list)
      } catch {
        setSuggestions([])
      }
    },
    [accountId]
  )

  useEffect(() => {
    if (debRef.current) clearTimeout(debRef.current)
    debRef.current = setTimeout(() => {
      void fetchSuggest(tail)
    }, 220)
    return (): void => {
      if (debRef.current) clearTimeout(debRef.current)
    }
  }, [tail, fetchSuggest])

  const commitTailIfEmail = (): void => {
    const extra = parseRecipients(tail)
    if (extra.length === 1 && !tail.includes(',')) {
      onChange(formatRecipientsWithTail([...complete, extra[0]], ''))
      setOpen(false)
    }
  }

  const removeAt = (idx: number): void => {
    const next = complete.filter((_, i) => i !== idx)
    onChange(formatRecipientsWithTail(next, tail))
  }

  const pickSuggestion = (s: ComposeRecipientSuggestion): void => {
    const addr = s.email.trim()
    if (!addr) return
    const next = [...complete, { address: addr, name: s.displayName?.trim() || undefined }]
    onChange(formatRecipientsWithTail(next, ''))
    setOpen(false)
    inputRef.current?.focus()
  }

  return (
    <div className={cn('relative flex items-start border-b border-border/60 px-4 py-2', className)}>
      <span className="mt-1.5 w-12 shrink-0 text-xs text-muted-foreground">{label}</span>
      <div className="relative min-w-0 flex-1">
        <div className="flex min-h-[28px] flex-wrap items-center gap-1 rounded border border-transparent bg-transparent px-0 py-0.5 focus-within:border-border/80">
          {complete.map((r, idx) => (
            <span
              key={`${r.address}-${idx}`}
              className="inline-flex max-w-full items-center gap-0.5 rounded-full border border-border/70 bg-secondary/50 px-2 py-0.5 text-[11px] text-foreground"
            >
              <span className="truncate">
                {r.name ? `${r.name} <${r.address}>` : r.address}
              </span>
              <button
                type="button"
                className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                aria-label="Empfaenger entfernen"
                onClick={(): void => removeAt(idx)}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            type="text"
            value={tail}
            onChange={(e): void => {
              onChange(formatRecipientsWithTail(complete, e.target.value))
              setOpen(true)
            }}
            onFocus={(): void => setOpen(true)}
            onBlur={(): void => {
              window.setTimeout(() => setOpen(false), 180)
            }}
            onKeyDown={(e): void => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault()
                commitTailIfEmail()
              } else if (e.key === 'Backspace' && tail === '' && complete.length > 0) {
                removeAt(complete.length - 1)
              }
            }}
            placeholder={complete.length ? '' : 'name@beispiel.com'}
            className="min-w-[120px] flex-1 bg-transparent py-0.5 text-xs text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
        {open && suggestions.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-md border border-border bg-card py-1 shadow-lg">
            {suggestions.map((s, i) => (
              <button
                key={`${s.email}-${s.source}-${i}`}
                type="button"
                className="flex w-full flex-col items-start gap-0.5 px-3 py-1.5 text-left text-[11px] hover:bg-secondary"
                onMouseDown={(ev): void => {
                  ev.preventDefault()
                  pickSuggestion(s)
                }}
              >
                <span className="font-medium text-foreground">{s.email}</span>
                {s.displayName && (
                  <span className="text-[10px] text-muted-foreground">{s.displayName}</span>
                )}
                <span className="text-[9px] uppercase tracking-wide text-muted-foreground/80">
                  {s.source === 'people-local'
                    ? 'Kontakt'
                    : s.source === 'mail-history'
                      ? 'Verlauf'
                      : 'Microsoft'}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      {showToggle && onToggleCcBcc && (
        <button
          type="button"
          onClick={onToggleCcBcc}
          className="ml-2 mt-1 shrink-0 text-[10px] font-medium text-muted-foreground hover:text-foreground"
        >
          Cc/Bcc
        </button>
      )}
    </div>
  )
}
