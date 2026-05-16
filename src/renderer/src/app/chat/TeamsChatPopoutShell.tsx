import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Pin, RefreshCw, Search, SendHorizonal, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  ModuleColumnHeaderIconButton,
  moduleColumnHeaderIconGlyphClass,
  moduleColumnHeaderShellBarClass
} from '@/components/ModuleColumnHeader'
import {
  loadTeamsChatPopoutAlwaysOnTopDefault,
  saveTeamsChatPopoutAlwaysOnTopDefault
} from './teams-chat-popout-prefs'
import { useAccountsStore } from '@/stores/accounts'
import type { TeamsChatMessageView, TeamsChatSummary } from '@shared/types'
import { parseTeamsChatPopoutRoute } from './teams-chat-popout-route'
import { chatTitle } from './teams-chat-helpers'
import { TeamsChatMessageRow, type TeamsChatMessageRowCtx } from './TeamsChatMessageRow'

interface GraphMe {
  id: string
  displayName?: string
}

export function TeamsChatPopoutShell(): JSX.Element {
  const route = parseTeamsChatPopoutRoute()
  const accounts = useAccountsStore((s) => s.accounts)
  const msAccounts = useMemo(() => accounts.filter((a) => a.id.startsWith('ms:')), [accounts])

  const accountId = route?.accountId ?? null
  const chatId = route?.chatId ?? null

  const currentAccount = useMemo(
    () => (accountId != null ? msAccounts.find((a) => a.id === accountId) : undefined),
    [accountId, msAccounts]
  )
  const accountLabel = currentAccount?.displayName ?? currentAccount?.email ?? ''

  const [chatSummary, setChatSummary] = useState<TeamsChatSummary | null>(null)
  const [myGraphUserId, setMyGraphUserId] = useState<string | null>(null)
  const [messages, setMessages] = useState<TeamsChatMessageView[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [messagesError, setMessagesError] = useState<string | null>(null)
  const [messageSearchQuery, setMessageSearchQuery] = useState('')
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [alwaysOnTop, setAlwaysOnTop] = useState(() => loadTeamsChatPopoutAlwaysOnTopDefault())
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    void useAccountsStore.getState().initialize()
  }, [])

  useEffect(() => {
    if (!accountId) {
      setMyGraphUserId(null)
      return
    }
    let cancelled = false
    void (async (): Promise<void> => {
      try {
        const me = (await window.mailClient.graph.getMe(accountId)) as GraphMe
        if (!cancelled && me?.id) setMyGraphUserId(me.id)
      } catch {
        if (!cancelled) setMyGraphUserId(null)
      }
    })()
    return (): void => {
      cancelled = true
    }
  }, [accountId])

  useEffect(() => {
    if (!accountId || !chatId) {
      setChatSummary(null)
      return
    }
    let cancelled = false
    void (async (): Promise<void> => {
      try {
        const list = await window.mailClient.graph.listTeamsChats(accountId)
        if (cancelled) return
        const found = list.find((c) => c.id === chatId) ?? null
        setChatSummary(found)
        if (found) {
          document.title = `${chatTitle(found)} — Teams-Chat`
        }
      } catch {
        if (!cancelled) setChatSummary(null)
      }
    })()
    return (): void => {
      cancelled = true
    }
  }, [accountId, chatId])

  const loadMessages = useCallback(async (): Promise<void> => {
    if (!accountId || !chatId) {
      setMessages([])
      return
    }
    setMessagesLoading(true)
    setMessagesError(null)
    try {
      const list = await window.mailClient.graph.listTeamsChatMessages({
        accountId,
        chatId,
        limit: 50
      })
      setMessages(list)
    } catch (e) {
      setMessagesError(e instanceof Error ? e.message : String(e))
      setMessages([])
    } finally {
      setMessagesLoading(false)
    }
  }, [accountId, chatId])

  useEffect(() => {
    void loadMessages()
  }, [loadMessages])

  useEffect(() => {
    if (!accountId || !chatId) return
    let cancelled = false
    void window.mailClient.teamsChatPopout.getAlwaysOnTop({ accountId, chatId }).then((v) => {
      if (!cancelled) setAlwaysOnTop(v)
    })
    return (): void => {
      cancelled = true
    }
  }, [accountId, chatId])

  const handleToggleAlwaysOnTop = (): void => {
    if (!accountId || !chatId) return
    const next = !alwaysOnTop
    setAlwaysOnTop(next)
    saveTeamsChatPopoutAlwaysOnTopDefault(next)
    void window.mailClient.teamsChatPopout.setAlwaysOnTop({ accountId, chatId, alwaysOnTop: next })
  }

  const handleSend = useCallback(async (): Promise<void> => {
    if (!accountId || !chatId || sending) return
    const text = draft.trim()
    if (!text) return
    setSending(true)
    setMessagesError(null)
    try {
      await window.mailClient.graph.sendTeamsChatMessage({ accountId, chatId, text })
      setDraft('')
      await loadMessages()
    } catch (e) {
      setMessagesError(e instanceof Error ? e.message : String(e))
    } finally {
      setSending(false)
    }
  }, [accountId, chatId, draft, sending, loadMessages])

  const displayedMessages = useMemo(() => {
    const needle = messageSearchQuery.trim().toLowerCase()
    if (!needle) return messages
    return messages.filter((m) => {
      const body = (m.bodyPreview ?? '').toLowerCase()
      const who = (m.fromDisplayName ?? '').toLowerCase()
      return body.includes(needle) || who.includes(needle)
    })
  }, [messages, messageSearchQuery])

  const msgRowCtx = useMemo<TeamsChatMessageRowCtx>(
    () => ({ myGraphUserId, accountLabel }),
    [myGraphUserId, accountLabel]
  )

  useLayoutEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' })
  }, [displayedMessages, messageSearchQuery])

  const handleClose = (): void => {
    if (accountId && chatId) {
      void window.mailClient.teamsChatPopout.close({ accountId, chatId })
    } else {
      window.close()
    }
  }

  if (!route) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6 text-sm text-muted-foreground">
        Ungueltige Popout-Adresse.
      </div>
    )
  }

  if (!currentAccount) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6 text-center text-sm text-muted-foreground">
        Microsoft-Konto nicht gefunden. Bitte im Hauptfenster erneut anmelden.
      </div>
    )
  }

  const title = chatSummary != null ? chatTitle(chatSummary) : 'Teams-Chat'

  return (
    <div className="flex h-screen min-h-0 flex-col bg-background text-foreground">
      <header className={moduleColumnHeaderShellBarClass}>
        <div className="min-w-0 flex-1 truncate text-xs font-semibold">{title}</div>
        <div className="flex shrink-0 items-center gap-0.5">
          <ModuleColumnHeaderIconButton
            type="button"
            variant="toolbar"
            pressed={alwaysOnTop}
            onClick={handleToggleAlwaysOnTop}
            title={
              alwaysOnTop
                ? 'Immer im Vordergrund (aktiv) — Klicken zum Deaktivieren'
                : 'Immer im Vordergrund — Fenster ueber anderen Apps halten'
            }
            aria-label="Immer im Vordergrund"
          >
            <Pin className={moduleColumnHeaderIconGlyphClass} aria-hidden />
          </ModuleColumnHeaderIconButton>
          <ModuleColumnHeaderIconButton
            type="button"
            onClick={(): void => void loadMessages()}
            disabled={messagesLoading}
            title="Nachrichten neu laden"
          >
            <RefreshCw
              className={cn(moduleColumnHeaderIconGlyphClass, messagesLoading && 'animate-spin')}
              aria-hidden
            />
          </ModuleColumnHeaderIconButton>
          <ModuleColumnHeaderIconButton type="button" onClick={handleClose} title="Fenster schliessen">
            <X className={moduleColumnHeaderIconGlyphClass} aria-hidden />
          </ModuleColumnHeaderIconButton>
        </div>
      </header>

      {messagesError != null && (
        <div
          role="alert"
          className="shrink-0 border-b border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {messagesError}
        </div>
      )}

      <div className="shrink-0 border-b border-border bg-muted/20 px-3 py-2">
        <div className="relative max-w-full">
          <Search
            className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            value={messageSearchQuery}
            onChange={(e): void => setMessageSearchQuery(e.target.value)}
            placeholder="In diesem Chat suchen …"
            className="w-full rounded-md border border-border bg-background py-1.5 pl-7 pr-2 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            aria-label="In diesem Chat suchen"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-muted/15 to-background px-3 py-3">
        {messagesLoading && messages.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">Nachrichten laden …</p>
        ) : messages.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">Keine Nachrichten in diesem Chat.</p>
        ) : displayedMessages.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">Keine Nachrichten passen zur Suche.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {displayedMessages.map((m, idx) => (
              <TeamsChatMessageRow
                key={m.id}
                m={m}
                prev={displayedMessages[idx - 1]}
                ctx={msgRowCtx}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-border bg-card/80 p-2">
        <div className="flex items-end gap-2">
          <textarea
            className={cn(
              'min-h-[44px] flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground',
              'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              sending && 'cursor-not-allowed opacity-60'
            )}
            rows={2}
            placeholder="Nachricht schreiben … (Umschalt+Enter fuer Zeilenumbruch)"
            value={draft}
            disabled={sending}
            onChange={(e): void => setDraft(e.target.value)}
            onKeyDown={(e): void => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void handleSend()
              }
            }}
          />
          <button
            type="button"
            disabled={sending || !draft.trim()}
            onClick={(): void => void handleSend()}
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-opacity',
              'hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40'
            )}
            title="Senden"
          >
            <SendHorizonal className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  )
}
