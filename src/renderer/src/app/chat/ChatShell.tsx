import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react'
import { ExternalLink, MessageCircle, MessageSquare, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  ModuleColumnHeaderIconButton,
  moduleColumnHeaderIconButtonClass,
  moduleColumnHeaderIconGlyphClass,
  moduleColumnHeaderShellBarClass
} from '@/components/ModuleColumnHeader'
import { TeamsChatPanel } from './TeamsChatPanel'
import { GLOBAL_CREATE_EVENT, useGlobalCreateNavigateStore } from '@/lib/global-create'
import { openExternalUrl } from '@/lib/open-external'

const WHATSAPP_WEB_URL = 'https://web.whatsapp.com/'
/** Reduziert "Browser wird nicht unterstuetzt"-Hinweise gegueber dem Standard-Electron-UA. */
const CHROME_LIKE_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

type WebviewEl = HTMLElement & {
  reload?: () => void
}

export type ChatServiceId = 'teams' | 'whatsapp'

type ServiceEntry = {
  id: ChatServiceId
  label: string
  /** Kurz fuer Tooltip / Screenreader-Kontext */
  description: string
  Icon: ComponentType<{ className?: string }>
  /** Kreis-Hintergrund + Iconfarbe (Icon meist weiss) */
  avatarClass: string
}

/**
 * Registrierte Chat-Dienste (links als runde Avatare).
 * Weitere Anbieter: hier einen Eintrag ergaenzen und `surface`-Rendering unten erweitern.
 */
const CHAT_SERVICES: ServiceEntry[] = [
  {
    id: 'teams',
    label: 'Microsoft Teams',
    description: 'Teams-Chats ueber Microsoft Graph',
    Icon: MessageSquare,
    avatarClass: 'bg-[#6264A7] text-white shadow-md shadow-[#6264A7]/25'
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    description: 'WhatsApp Web im eingebetteten Fenster',
    Icon: MessageCircle,
    avatarClass: 'bg-[#25D366] text-white shadow-md shadow-[#25D366]/20'
  }
]

interface Props {
  onOpenAccountDialog?: () => void
}

/**
 * Chat-Modul: linke Dienst-Leiste (Avatar-Buttons), rechts der jeweilige Inhalt.
 */
export function ChatShell({ onOpenAccountDialog }: Props): JSX.Element {
  const [surface, setSurface] = useState<ChatServiceId>('teams')
  const webviewRef = useRef<WebviewEl | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const openTeamsNewChat = useCallback((): void => {
    setSurface('teams')
    void openExternalUrl('https://teams.microsoft.com/l/chat/0/0').catch((e) => {
      console.warn('[ChatShell] open new Teams chat failed', e)
    })
  }, [])

  useEffect(() => {
    const pending = useGlobalCreateNavigateStore.getState().takePendingAfterNavigate()
    if (pending === 'chat') {
      window.setTimeout((): void => openTeamsNewChat(), 0)
    }
  }, [openTeamsNewChat])

  useEffect(() => {
    function onGlobalCreate(e: Event): void {
      const ce = e as CustomEvent<{ kind?: string }>
      if (ce.detail?.kind !== 'chat') return
      openTeamsNewChat()
    }
    window.addEventListener(GLOBAL_CREATE_EVENT, onGlobalCreate as EventListener)
    return (): void => window.removeEventListener(GLOBAL_CREATE_EVENT, onGlobalCreate as EventListener)
  }, [openTeamsNewChat])

  useEffect(() => {
    const wv = webviewRef.current
    if (!wv) return

    const onFail = (e: Event): void => {
      const ev = e as unknown as { isMainFrame?: boolean; errorDescription?: string }
      if (ev.isMainFrame === false) return
      setLoadError(ev.errorDescription?.trim() || 'Laden fehlgeschlagen')
    }
    const onCrashed = (): void => setLoadError('Webview abgestuerzt')

    wv.addEventListener('did-fail-load', onFail)
    wv.addEventListener('crashed', onCrashed)
    return (): void => {
      wv.removeEventListener('did-fail-load', onFail)
      wv.removeEventListener('crashed', onCrashed)
    }
  }, [])

  const handleReloadWhatsapp = useCallback((): void => {
    setLoadError(null)
    webviewRef.current?.reload?.()
  }, [])

  return (
    <main
      className="flex min-h-0 flex-1 flex-row bg-background"
      aria-label="Chat-Modul"
    >
      <nav
        className="flex w-[56px] shrink-0 flex-col border-r border-border bg-card/90 py-3"
        aria-label="Chat-Dienste"
      >
        <div className="flex flex-1 flex-col items-center gap-2.5 px-2">
          {CHAT_SERVICES.map(({ id, label, description, Icon, avatarClass }) => {
            const active = surface === id
            return (
              <button
                key={id}
                type="button"
                onClick={(): void => setSurface(id)}
                title={`${label} — ${description}`}
                aria-label={label}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-transform',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  avatarClass,
                  active
                    ? 'scale-100 ring-2 ring-primary ring-offset-2 ring-offset-background'
                    : 'opacity-90 hover:scale-[1.03] hover:opacity-100 hover:ring-2 hover:ring-border hover:ring-offset-2 hover:ring-offset-background'
                )}
              >
                <Icon className="h-[22px] w-[22px]" aria-hidden />
              </button>
            )
          })}
        </div>
      </nav>

      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        {surface === 'whatsapp' && (
          <header className={moduleColumnHeaderShellBarClass}>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold text-foreground">WhatsApp Web</div>
              <p className="truncate text-[10px] leading-tight text-muted-foreground">
                QR-Code mit dem Handy scannen, um die Sitzung zu koppeln.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <ModuleColumnHeaderIconButton type="button" onClick={handleReloadWhatsapp} title="Neu laden">
                <RefreshCw className={moduleColumnHeaderIconGlyphClass} aria-hidden />
              </ModuleColumnHeaderIconButton>
              <a
                href={WHATSAPP_WEB_URL}
                target="_blank"
                rel="noreferrer"
                title="Im Browser oeffnen"
                className={moduleColumnHeaderIconButtonClass}
              >
                <ExternalLink className={moduleColumnHeaderIconGlyphClass} aria-hidden />
              </a>
            </div>
          </header>
        )}

        <div className="relative flex min-h-0 flex-1 flex-col">
          {surface === 'teams' ? (
            <TeamsChatPanel onOpenAccountDialog={onOpenAccountDialog} />
          ) : (
            <>
              {loadError != null && (
                <div
                  role="alert"
                  className="shrink-0 border-b border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
                >
                  {loadError}
                </div>
              )}
              <div className="relative min-h-0 flex-1 bg-muted/20">
                <webview
                  ref={webviewRef}
                  src={WHATSAPP_WEB_URL}
                  partition="persist:mailclient-whatsapp"
                  useragent={CHROME_LIKE_UA}
                  allowpopups
                  webpreferences="contextIsolation=1,nodeIntegration=0,sandbox=1"
                  style={{ width: '100%', height: '100%', display: 'inline-flex' }}
                  className="absolute inset-0"
                />
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  )
}
