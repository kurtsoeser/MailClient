import { useMemo, useState } from 'react'
import { BookmarkPlus, ChevronDown, Star, Trash2 } from 'lucide-react'
import type { AccountSignatureTemplate } from '@shared/types'
import { useAccountsStore } from '@/stores/accounts'
import { showAppAlert, showAppConfirm, showAppPrompt } from '@/stores/app-dialog'
import { sanitizeComposeHtmlFragment } from '@/lib/sanitize-compose-html'
import { cn } from '@/lib/utils'

interface Props {
  accountId: string
  signatureRichHtml: string
  onSignatureHtmlChange: (html: string) => void
  /** Schmalere Abstaende (Dashboard-Kachel). */
  compact?: boolean
}

function newTemplateId(): string {
  return `sig-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function SignatureTemplateControls({
  accountId,
  signatureRichHtml,
  onSignatureHtmlChange,
  compact
}: Props): JSX.Element {
  const accounts = useAccountsStore((s) => s.accounts)
  const patchAccountSignatures = useAccountsStore((s) => s.patchAccountSignatures)
  const account = accounts.find((a) => a.id === accountId)
  const templates = account?.signatureTemplates ?? []
  const defaultId = account?.defaultSignatureTemplateId ?? null

  const [manageOpen, setManageOpen] = useState(false)
  const [applyKey, setApplyKey] = useState(0)

  const sorted = useMemo(
    () => [...templates].sort((a, b) => a.name.localeCompare(b.name, 'de')),
    [templates]
  )

  const applyById = (id: string): void => {
    const tpl = templates.find((t) => t.id === id)
    if (!tpl) return
    onSignatureHtmlChange(sanitizeComposeHtmlFragment(tpl.html))
    setApplyKey((k) => k + 1)
  }

  const saveCurrentAsTemplate = (): void => {
    void (async (): Promise<void> => {
      const raw = signatureRichHtml.trim()
      if (!raw) {
        void showAppAlert('Bitte zuerst eine Signatur im Editor eintragen.', {
          title: 'Signaturvorlage'
        })
        return
      }
      const name = await showAppPrompt('Name der neuen Signaturvorlage:', {
        title: 'Vorlage speichern',
        defaultValue: 'Meine Signatur',
        placeholder: 'z. B. Geschäftlich'
      })
      if (name === null) return
      const trimmed = name.trim()
      if (!trimmed) return
      const html = sanitizeComposeHtmlFragment(raw)
      const next: AccountSignatureTemplate[] = [
        ...templates,
        { id: newTemplateId(), name: trimmed, html }
      ]
      try {
        await patchAccountSignatures(accountId, { signatureTemplates: next })
      } catch (e) {
        console.warn('[signature] Speichern:', e)
      }
    })()
  }

  const setDefaultForAccount = (templateId: string | null): void => {
    void (async (): Promise<void> => {
      try {
        await patchAccountSignatures(accountId, { defaultSignatureTemplateId: templateId })
      } catch (e) {
        console.warn('[signature] Standard setzen:', e)
      }
    })()
  }

  const removeTemplate = (tpl: AccountSignatureTemplate): void => {
    void (async (): Promise<void> => {
      const ok = await showAppConfirm(`Vorlage «${tpl.name}» wirklich löschen?`, {
        title: 'Signaturvorlage löschen',
        variant: 'danger',
        confirmLabel: 'Löschen'
      })
      if (!ok) return
      const next = templates.filter((t) => t.id !== tpl.id)
      const newDefault = defaultId === tpl.id ? null : defaultId
      try {
        await patchAccountSignatures(accountId, {
          signatureTemplates: next,
          defaultSignatureTemplateId: newDefault
        })
      } catch (e) {
        console.warn('[signature] Löschen:', e)
      }
    })()
  }

  const selClass = compact
    ? 'max-w-[min(200px,46vw)] rounded border border-border/60 bg-background px-1 py-0.5 text-[10px]'
    : 'max-w-[min(260px,52vw)] rounded border border-border/60 bg-background px-2 py-1 text-xs'

  const btnClass = compact
    ? 'inline-flex shrink-0 items-center gap-0.5 rounded border border-border/60 bg-background px-1 py-0.5 text-[10px] text-muted-foreground hover:bg-secondary hover:text-foreground'
    : 'inline-flex shrink-0 items-center gap-1 rounded border border-border/60 bg-background px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground'

  return (
    <div className={cn('flex flex-col gap-1', compact ? '' : 'gap-1.5')}>
      <div className={cn('flex flex-wrap items-center gap-1', compact ? '' : 'gap-1.5')}>
        <select
          key={`apply-${applyKey}`}
          className={selClass}
          aria-label="Signaturvorlage einfügen"
          title="Vorlage in die Signatur übernehmen"
          defaultValue=""
          onChange={(e): void => {
            const v = e.target.value
            e.currentTarget.selectedIndex = 0
            if (!v) return
            if (v === '__empty__') {
              onSignatureHtmlChange('')
              return
            }
            applyById(v)
          }}
        >
          <option value="">Vorlage wählen…</option>
          <option value="__empty__">— Leer (keine Signatur)</option>
          {sorted.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>

        <button type="button" className={btnClass} title="Aktuelle Signatur als Vorlage speichern" onClick={saveCurrentAsTemplate}>
          <BookmarkPlus className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
          {!compact && <span>Speichern</span>}
        </button>

        <div className="flex items-center gap-0.5">
          <Star className={cn('shrink-0 text-muted-foreground', compact ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
          <select
            className={selClass}
            aria-label="Standard-Signatur für neues Schreiben"
            title="Für neue Mails automatisch einfügen"
            value={
              defaultId && templates.some((t) => t.id === defaultId) ? defaultId : ''
            }
            onChange={(e): void => {
              const v = e.target.value
              setDefaultForAccount(v === '' ? null : v)
            }}
          >
            <option value="">Standard: keine</option>
            {sorted.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        {templates.length > 0 && (
          <button
            type="button"
            className={btnClass}
            onClick={(): void => setManageOpen((o) => !o)}
            title="Vorlagen verwalten"
          >
            <ChevronDown className={cn('h-3 w-3 transition-transform', manageOpen && 'rotate-180')} />
            {!compact && <span>Verwalten</span>}
          </button>
        )}
      </div>

      {manageOpen && templates.length > 0 && (
        <ul
          className={cn(
            'max-h-32 overflow-y-auto rounded border border-border/50 bg-background/90 p-1 text-[10px]',
            compact ? 'text-[10px]' : 'text-xs'
          )}
        >
          {sorted.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between gap-2 rounded px-1 py-0.5 hover:bg-secondary/60"
            >
              <span className="min-w-0 truncate">{t.name}</span>
              <button
                type="button"
                className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                title="Vorlage löschen"
                aria-label={`Vorlage ${t.name} löschen`}
                onClick={(): void => removeTemplate(t)}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
