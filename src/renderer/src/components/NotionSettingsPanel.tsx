import { useCallback, useEffect, useState } from 'react'
import { Calendar, Loader2, Mail, Star, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { AppConfig, NotionConnectionStatus, NotionDestinationsConfig } from '@shared/types'
import {
  NOTION_OAUTH_REDIRECT_URI,
  NOTION_OAUTH_REDIRECT_URI_PORTAL_ENTRY
} from '@shared/notion-constants'
import { cn } from '@/lib/utils'

interface Props {
  config: AppConfig | null
  busy: boolean
  onBusy: (v: boolean) => void
  onError: (msg: string | null) => void
  onConfigSaved: (config: AppConfig) => void
}

export function NotionSettingsPanel({
  config,
  busy,
  onBusy,
  onError,
  onConfigSaved
}: Props): JSX.Element {
  const { t } = useTranslation()
  const [clientIdInput, setClientIdInput] = useState('')
  const [clientSecretInput, setClientSecretInput] = useState('')
  const [status, setStatus] = useState<NotionConnectionStatus | null>(null)
  const [destinations, setDestinations] = useState<NotionDestinationsConfig | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchHits, setSearchHits] = useState<
    Array<{ id: string; title: string; icon: string | null }>
  >([])
  const [searchBusy, setSearchBusy] = useState(false)
  const [internalTokenInput, setInternalTokenInput] = useState('')

  const hasClientId = Boolean(config?.notionClientId?.trim())
  const hasClientSecret = Boolean(config?.notionClientSecret?.trim())
  const oauthReady = hasClientId && hasClientSecret

  const refreshStatus = useCallback(async (): Promise<void> => {
    const [st, dest] = await Promise.all([
      window.mailClient.notion.getStatus(),
      window.mailClient.notion.getDestinations()
    ])
    setStatus(st)
    setDestinations(dest)
  }, [])

  useEffect(() => {
    setClientIdInput(config?.notionClientId ?? '')
    setClientSecretInput('')
    void refreshStatus()
  }, [config?.notionClientId, config?.notionClientSecret, refreshStatus])

  async function handleSaveCredentials(): Promise<void> {
    onBusy(true)
    onError(null)
    try {
      const trimmedId = clientIdInput.trim()
      const trimmedSec = clientSecretInput.trim()
      let secretArg: string | null | undefined
      if (trimmedSec.length > 0) {
        secretArg = trimmedSec
      } else if (hasClientSecret) {
        secretArg = undefined
      } else {
        secretArg = null
      }
      const next = await window.mailClient.config.setNotionCredentials(trimmedId, secretArg)
      onConfigSaved(next)
      setClientSecretInput('')
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e))
    } finally {
      onBusy(false)
    }
  }

  async function handleConnectInternal(): Promise<void> {
    onBusy(true)
    onError(null)
    try {
      const st = await window.mailClient.notion.connectInternal(internalTokenInput)
      setStatus(st)
      setInternalTokenInput('')
      await refreshStatus()
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e))
    } finally {
      onBusy(false)
    }
  }

  async function handleConnect(): Promise<void> {
    onBusy(true)
    onError(null)
    try {
      const st = await window.mailClient.notion.connect()
      setStatus(st)
      await refreshStatus()
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e))
    } finally {
      onBusy(false)
    }
  }

  async function handleDisconnect(): Promise<void> {
    onBusy(true)
    onError(null)
    try {
      const st = await window.mailClient.notion.disconnect()
      setStatus(st)
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e))
    } finally {
      onBusy(false)
    }
  }

  async function handleSearch(): Promise<void> {
    if (!status?.connected) return
    setSearchBusy(true)
    onError(null)
    try {
      const hits = await window.mailClient.notion.searchPages(searchQuery)
      setSearchHits(hits.map((h) => ({ id: h.id, title: h.title, icon: h.icon })))
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e))
    } finally {
      setSearchBusy(false)
    }
  }

  async function saveDestinations(patch: Partial<NotionDestinationsConfig>): Promise<void> {
    const base = destinations ?? {
      favorites: [],
      defaultMailPageId: null,
      defaultCalendarPageId: null,
      lastUsedPageId: null,
      newPageParentId: null
    }
    const next = { ...base, ...patch }
    await window.mailClient.notion.setDestinations(next)
    setDestinations(next)
  }

  async function handleRemoveFavorite(pageId: string): Promise<void> {
    const favorites = await window.mailClient.notion.removeFavorite(pageId)
    const base = destinations ?? {
      favorites: [],
      defaultMailPageId: null,
      defaultCalendarPageId: null,
      lastUsedPageId: null,
      newPageParentId: null
    }
    const patch: Partial<NotionDestinationsConfig> = { favorites }
    if (base.defaultMailPageId === pageId) patch.defaultMailPageId = null
    if (base.defaultCalendarPageId === pageId) patch.defaultCalendarPageId = null
    if (base.lastUsedPageId === pageId) patch.lastUsedPageId = null
    await saveDestinations(patch)
  }

  async function handleAddFavorite(hit: {
    id: string
    title: string
    icon: string | null
  }): Promise<void> {
    await window.mailClient.notion.addFavorite({
      id: hit.id,
      title: hit.title,
      icon: hit.icon,
      kind: 'page',
      url: null
    })
    await refreshStatus()
  }

  const favoriteIds = new Set(destinations?.favorites.map((f) => f.id) ?? [])

  return (
    <section className="space-y-3 rounded-md border border-border/60 bg-muted/20 p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t('settings.notionHeading')}
      </h3>
      <p className="text-xs leading-relaxed text-muted-foreground">{t('settings.notionIntro')}</p>

      <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3">
        <p className="text-[11px] font-semibold text-foreground">{t('settings.notionInternalHeading')}</p>
        <p className="text-[10px] leading-relaxed text-muted-foreground">{t('settings.notionInternalIntro')}</p>
        <input
          type="password"
          value={internalTokenInput}
          onChange={(e): void => setInternalTokenInput(e.target.value)}
          placeholder={t('settings.notionInternalTokenPlaceholder')}
          disabled={busy || status?.connected === true}
          className="w-full rounded-md border border-border bg-background px-3 py-1.5 font-mono text-[10px] outline-none focus:border-ring"
        />
        <button
          type="button"
          onClick={(): void => void handleConnectInternal()}
          disabled={busy || status?.connected === true || !internalTokenInput.trim()}
          className={cn(
            'rounded-md px-3 py-1.5 text-xs font-medium',
            busy || status?.connected || !internalTokenInput.trim()
              ? 'bg-secondary text-muted-foreground'
              : 'bg-primary text-primary-foreground hover:bg-primary/90'
          )}
        >
          {t('settings.notionInternalConnect')}
        </button>
      </div>

      <details className="rounded-md border border-border/60 bg-background/30">
        <summary className="cursor-pointer px-3 py-2 text-[11px] font-medium text-foreground">
          {t('settings.notionOAuthSummary')}
        </summary>
        <div className="space-y-2 border-t border-border/50 px-3 py-3">
          <p className="text-[10px] leading-relaxed text-muted-foreground">{t('settings.notionOAuthHint')}</p>
          <p className="rounded-md border border-border/50 bg-background/50 px-2 py-1.5 font-mono text-[10px] leading-relaxed text-muted-foreground">
            {t('settings.notionRedirectPortalHint')}{' '}
            <span className="text-foreground">{NOTION_OAUTH_REDIRECT_URI_PORTAL_ENTRY}</span>
            <br />
            {t('settings.notionRedirectAppHint')}{' '}
            <span className="text-foreground">{NOTION_OAUTH_REDIRECT_URI}</span>
          </p>
          <div className="space-y-2">
            <label className="block text-[11px] font-medium text-foreground" htmlFor="notion-client-id">
              {t('settings.notionClientId')}
            </label>
            <input
              id="notion-client-id"
              type="text"
              value={clientIdInput}
              onChange={(e): void => setClientIdInput(e.target.value)}
              placeholder={t('settings.notionClientIdPlaceholder')}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs outline-none focus:border-ring"
            />
            <label className="block text-[11px] font-medium text-foreground" htmlFor="notion-client-secret">
              {t('settings.notionClientSecret')}
            </label>
            <input
              id="notion-client-secret"
              type="password"
              value={clientSecretInput}
              onChange={(e): void => setClientSecretInput(e.target.value)}
              placeholder={
                hasClientSecret
                  ? t('settings.notionSecretPlaceholderStored')
                  : t('settings.notionSecretPlaceholderNew')
              }
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs outline-none focus:border-ring"
            />
            <button
              type="button"
              onClick={(): void => void handleSaveCredentials()}
              disabled={busy}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                busy
                  ? 'bg-secondary text-muted-foreground'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90'
              )}
            >
              {t('common.save')}
            </button>
            {oauthReady ? (
              <p className="text-[10px] text-emerald-600 dark:text-emerald-500">
                {t('settings.notionCredentialsOk')}
              </p>
            ) : null}
          </div>
          {!status?.connected || status.authMode === 'oauth' ? (
            <button
              type="button"
              onClick={(): void => void handleConnect()}
              disabled={busy || !oauthReady}
              title={!oauthReady ? t('settings.notionConnectDisabledTitle') : undefined}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium',
                busy || !oauthReady
                  ? 'bg-secondary text-muted-foreground'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90'
              )}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
              {t('settings.notionConnect')}
            </button>
          ) : null}
        </div>
      </details>

      <div className="flex flex-wrap gap-2 border-t border-border/50 pt-3">
        {status?.connected ? (
          <>
            <p className="w-full text-[11px] text-muted-foreground">
              {status.authMode === 'internal'
                ? t('settings.notionConnectedInternal')
                : t('settings.notionConnected', {
                    workspace: status.workspaceName ?? '—',
                    user: status.ownerName ?? '—'
                  })}
            </p>
            <button
              type="button"
              onClick={(): void => void handleDisconnect()}
              disabled={busy}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-secondary/60 disabled:opacity-50"
            >
              {t('settings.notionDisconnect')}
            </button>
          </>
        ) : null}
      </div>

      {status?.connected ? (
        <div className="space-y-3 border-t border-border/50 pt-3">
          <div>
            <p className="text-[11px] font-medium text-foreground">{t('settings.notionDestinationsHeading')}</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">{t('settings.notionInternalShareHint')}</p>
          </div>

          <div className="space-y-2 rounded-md border border-border/60 bg-background/40 p-2">
            <p className="text-[11px] font-semibold text-foreground">{t('settings.notionFavoritesHeading')}</p>
            {destinations?.favorites.length ? (
              <ul className="max-h-52 space-y-1 overflow-y-auto">
                {destinations.favorites.map((f) => {
                  const isMailDefault = destinations.defaultMailPageId === f.id
                  const isCalDefault = destinations.defaultCalendarPageId === f.id
                  return (
                    <li
                      key={f.id}
                      className="flex items-start gap-2 rounded-md border border-border/40 bg-muted/20 px-2 py-1.5"
                    >
                      <Star
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400"
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-foreground">
                          {f.icon ? `${f.icon} ` : ''}
                          {f.title}
                        </p>
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {isMailDefault ? (
                            <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[9px] font-medium text-primary">
                              {t('settings.notionBadgeMailDefault')}
                            </span>
                          ) : null}
                          {isCalDefault ? (
                            <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[9px] font-medium text-primary">
                              {t('settings.notionBadgeCalDefault')}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col gap-0.5">
                        <button
                          type="button"
                          title={t('settings.notionSetMailDefault')}
                          disabled={busy || isMailDefault}
                          onClick={(): void => {
                            void saveDestinations({ defaultMailPageId: f.id })
                          }}
                          className={cn(
                            'rounded p-1 transition-colors',
                            isMailDefault
                              ? 'bg-primary/20 text-primary'
                              : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                          )}
                        >
                          <Mail className="h-3.5 w-3.5" aria-hidden />
                        </button>
                        <button
                          type="button"
                          title={t('settings.notionSetCalDefault')}
                          disabled={busy || isCalDefault}
                          onClick={(): void => {
                            void saveDestinations({ defaultCalendarPageId: f.id })
                          }}
                          className={cn(
                            'rounded p-1 transition-colors',
                            isCalDefault
                              ? 'bg-primary/20 text-primary'
                              : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                          )}
                        >
                          <Calendar className="h-3.5 w-3.5" aria-hidden />
                        </button>
                        <button
                          type="button"
                          title={t('settings.notionRemoveFavorite')}
                          disabled={busy}
                          onClick={(): void => void handleRemoveFavorite(f.id)}
                          className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="text-[10px] text-muted-foreground">{t('settings.notionFavoritesEmpty')}</p>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-medium text-foreground">{t('settings.notionAddPageHeading')}</p>
            <div className="flex flex-wrap gap-2">
              <input
                type="search"
                value={searchQuery}
                onChange={(e): void => setSearchQuery(e.target.value)}
                onKeyDown={(e): void => {
                  if (e.key === 'Enter') void handleSearch()
                }}
                placeholder={t('settings.notionSearchPlaceholder')}
                className="min-w-[12rem] flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs outline-none focus:border-ring"
              />
              <button
                type="button"
                onClick={(): void => void handleSearch()}
                disabled={searchBusy || busy}
                className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-secondary/60 disabled:opacity-50"
              >
                {searchBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                {t('settings.notionSearch')}
              </button>
            </div>
            {searchHits.length > 0 ? (
              <ul className="max-h-36 space-y-1 overflow-y-auto rounded-md border border-border/50 p-1">
                {searchHits.map((h) => {
                  const already = favoriteIds.has(h.id)
                  return (
                    <li
                      key={h.id}
                      className="flex items-center justify-between gap-2 rounded px-2 py-1 text-xs hover:bg-muted/50"
                    >
                      <span className="truncate">
                        {h.icon ? `${h.icon} ` : ''}
                        {h.title}
                      </span>
                      {already ? (
                        <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                          <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden />
                          {t('settings.notionAlreadyFavorite')}
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/10"
                          onClick={(): void => void handleAddFavorite(h)}
                        >
                          <Star className="h-3 w-3" aria-hidden />
                          {t('settings.notionAddFavorite')}
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  )
}
