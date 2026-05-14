import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronRight, ExternalLink, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { openExternalUrl } from '@/lib/open-external'
import { ACCOUNT_COLOR_PRESET_OPTIONS, isPresetAccountColorClass } from '@shared/account-colors'
import { accountColorToCssBackground } from '@/lib/avatar-color'
import type { Provider } from '@shared/types'

/** Offizielle Kontoverwaltung im Browser (MSA / Google; Microsoft-Arbeitskonten leiten ggf. weiter). */
const PROVIDER_ACCOUNT_PORTAL_URL: Record<Provider, string> = {
  microsoft: 'https://myaccount.microsoft.com/',
  google: 'https://myaccount.google.com/'
}

interface Props {
  provider: Provider
  disabled: boolean
  saving: boolean
  accountId: string
  accountEmail: string
  /** Aktuell gespeicherte Kontofarbe (Preset-Klasse oder Hex). */
  color: string
  onColorChange: (next: string) => void
}

/**
 * Kompaktes Konto-Menue: Trigger «Eigenschaften», darin Untermenue «Kontofarbe»
 * (aufklappbar unter der Zeile), Platz fuer spaetere weitere Eintraege.
 */
export function AccountPropertiesMenu({
  provider,
  disabled,
  saving,
  accountId,
  accountEmail,
  color,
  onColorChange
}: Props): JSX.Element {
  const { t } = useTranslation()
  const rootRef = useRef<HTMLDivElement>(null)
  const [mainOpen, setMainOpen] = useState(false)
  const [colorExpanded, setColorExpanded] = useState(false)

  useEffect(() => {
    if (!mainOpen) return
    function onDocMouseDown(e: MouseEvent): void {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setMainOpen(false)
        setColorExpanded(false)
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return (): void => document.removeEventListener('mousedown', onDocMouseDown)
  }, [mainOpen])

  useEffect(() => {
    if (!mainOpen) {
      setColorExpanded(false)
    }
  }, [mainOpen])

  return (
    <div ref={rootRef} className="relative inline-flex flex-col items-start">
      <button
        type="button"
        disabled={disabled}
        onClick={(): void => {
          if (disabled) return
          setMainOpen((v) => !v)
        }}
        className={cn(
          'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium outline-none transition-colors',
          disabled
            ? 'cursor-not-allowed opacity-40'
            : 'hover:bg-secondary/80 focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/40'
        )}
        aria-expanded={mainOpen}
        aria-haspopup="menu"
      >
        Eigenschaften
        <ChevronDown
          className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', mainOpen && 'rotate-180')}
          aria-hidden
        />
      </button>

      {mainOpen && (
        <div
          role="menu"
          className="absolute left-0 top-full z-[60] mt-1 w-max min-w-[220px] max-w-[min(280px,calc(100vw-2rem))] rounded-md border border-border bg-popover py-1 text-popover-foreground shadow-lg"
        >
          <div className="px-0">
            <button
              type="button"
              disabled={disabled}
              title={t('settings.accountOnlineTitle')}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-foreground outline-none transition-colors',
                disabled
                  ? 'cursor-not-allowed opacity-40'
                  : 'hover:bg-secondary/60 focus-visible:bg-secondary/60'
              )}
              onClick={(): void => {
                if (disabled) return
                setMainOpen(false)
                setColorExpanded(false)
                const url = PROVIDER_ACCOUNT_PORTAL_URL[provider]
                void openExternalUrl(url).catch((err) =>
                  console.warn('[AccountPropertiesMenu] openExternal', err)
                )
              }}
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate font-medium">
                {provider === 'microsoft'
                  ? t('settings.accountOnlineMicrosoft')
                  : t('settings.accountOnlineGoogle')}
              </span>
            </button>

            <div className="my-1 h-px bg-border/60" role="separator" />

            <button
              type="button"
              className={cn(
                'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-foreground outline-none transition-colors',
                colorExpanded ? 'bg-secondary/80' : 'hover:bg-secondary/60'
              )}
              onClick={(): void => setColorExpanded((e) => !e)}
            >
              <span className="min-w-0 flex-1 truncate font-medium">Kontofarbe</span>
              <ChevronRight
                className={cn(
                  'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform',
                  colorExpanded && 'rotate-90'
                )}
                aria-hidden
              />
            </button>

            {colorExpanded && (
              <div
                className="border-t border-border/50 bg-secondary/15 px-2 py-2"
                role="group"
                aria-label="Kontofarbe waehlen"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <label htmlFor={`props-color-${accountId}`} className="sr-only">
                    Kontofarbe Preset
                  </label>
                  <select
                    id={`props-color-${accountId}`}
                    className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] outline-none focus:border-ring"
                    disabled={disabled || saving}
                    value={isPresetAccountColorClass(color) ? color : '__custom__'}
                    onChange={(e): void => {
                      const v = e.target.value
                      if (v === '__custom__') {
                        const base = accountColorToCssBackground(color) ?? '#64748b'
                        onColorChange(base)
                      } else {
                        onColorChange(v)
                      }
                    }}
                  >
                    {ACCOUNT_COLOR_PRESET_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                    <option value="__custom__">Eigene Farbe (Hex)…</option>
                  </select>
                  {!isPresetAccountColorClass(color) && (
                    <input
                      type="color"
                      aria-label={`Kontofarbe ${accountEmail}`}
                      className="h-7 w-9 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0 disabled:opacity-40"
                      value={accountColorToCssBackground(color) ?? '#64748b'}
                      disabled={disabled || saving}
                      onChange={(e): void => onColorChange(e.target.value)}
                    />
                  )}
                  {saving && (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
