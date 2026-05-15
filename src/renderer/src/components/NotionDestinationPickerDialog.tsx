import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ChevronRight,
  FileText,
  FilePlus2,
  Loader2,
  Search,
  Star,
  X
} from 'lucide-react'
import { showAppPrompt } from '@/stores/app-dialog'
import type { NotionSavedDestination, NotionSearchPageHit } from '@shared/types'
import { cn } from '@/lib/utils'
import { useNotionDestinationPickerStore } from '@/stores/notion-destination-picker'

interface PickerRow {
  id: string
  title: string
  icon: string | null
  badge?: string
}

function NotionPageIcon({ icon }: { icon: string | null }): JSX.Element {
  if (icon?.startsWith('http')) {
    return (
      <img
        src={icon}
        alt=""
        className="h-4 w-4 shrink-0 rounded object-cover"
        width={16}
        height={16}
      />
    )
  }
  if (icon) {
    return (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center text-sm leading-none">
        {icon}
      </span>
    )
  }
  return <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
}

function PickerListSection({
  title,
  rows,
  busy,
  onPick,
  onCreateUnder
}: {
  title: string
  rows: PickerRow[]
  busy: boolean
  onPick: (id: string) => void
  onCreateUnder?: (parentId: string) => void
}): JSX.Element | null {
  const { t } = useTranslation()
  if (rows.length === 0) return null
  return (
    <section className="py-1">
      <p className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <ul>
        {rows.map((row) => (
          <li key={row.id}>
            <div
              className={cn(
                'flex w-full items-center gap-0.5 px-1 py-0.5',
                busy && 'opacity-50'
              )}
            >
              <button
                type="button"
                disabled={busy}
                onClick={(): void => onPick(row.id)}
                className={cn(
                  'flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left text-sm transition-colors',
                  'text-foreground hover:bg-secondary/80 disabled:opacity-50'
                )}
              >
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" aria-hidden />
                <NotionPageIcon icon={row.icon} />
                <span className="min-w-0 flex-1 truncate">{row.title}</span>
                {row.badge ? (
                  <span className="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[9px] font-medium text-primary">
                    {row.badge}
                  </span>
                ) : null}
              </button>
              {onCreateUnder ? (
                <button
                  type="button"
                  title={t('notion.pickerNewSubpage')}
                  disabled={busy}
                  onClick={(): void => onCreateUnder(row.id)}
                  className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                >
                  <FilePlus2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function NotionDestinationPickerDialog(): JSX.Element | null {
  const { t } = useTranslation()
  const open = useNotionDestinationPickerStore((s) => s.open)
  const kind = useNotionDestinationPickerStore((s) => s.kind)
  const suggestedTitle = useNotionDestinationPickerStore((s) => s.suggestedTitle)
  const messageId = useNotionDestinationPickerStore((s) => s.messageId)
  const calendarEvent = useNotionDestinationPickerStore((s) => s.calendarEvent)
  const localeCode = useNotionDestinationPickerStore((s) => s.localeCode)
  const close = useNotionDestinationPickerStore((s) => s.close)

  const [query, setQuery] = useState('')
  const [createBusy, setCreateBusy] = useState(false)
  const [searchBusy, setSearchBusy] = useState(false)
  const [searchHits, setSearchHits] = useState<NotionSearchPageHit[]>([])
  const [favorites, setFavorites] = useState<NotionSavedDestination[]>([])
  const [defaultMailPageId, setDefaultMailPageId] = useState<string | null>(null)
  const [defaultCalendarPageId, setDefaultCalendarPageId] = useState<string | null>(null)
  const [lastUsedPageId, setLastUsedPageId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const loadDestinations = useCallback(async (): Promise<void> => {
    const dest = await window.mailClient.notion.getDestinations()
    setFavorites(dest.favorites)
    setDefaultMailPageId(dest.defaultMailPageId)
    setDefaultCalendarPageId(dest.defaultCalendarPageId)
    setLastUsedPageId(dest.lastUsedPageId)
  }, [])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setSearchHits([])
    setError(null)
    void loadDestinations()
    const tId = window.setTimeout(() => inputRef.current?.focus(), 0)
    return (): void => clearTimeout(tId)
  }, [open, loadDestinations])

  useEffect(() => {
    if (!open) return
    const q = query.trim()
    if (!q) {
      setSearchHits([])
      setSearchBusy(false)
      return
    }
    setSearchBusy(true)
    const tId = window.setTimeout(() => {
      void (async (): Promise<void> => {
        try {
          const hits = await window.mailClient.notion.searchPages(q)
          setSearchHits(hits)
          setError(null)
        } catch (e) {
          setSearchHits([])
          setError(e instanceof Error ? e.message : String(e))
        } finally {
          setSearchBusy(false)
        }
      })()
    }, 280)
    return (): void => clearTimeout(tId)
  }, [open, query])

  const defaultPageId =
    kind === 'mail' ? defaultMailPageId : kind === 'calendar' ? defaultCalendarPageId : null

  const suggestedRows = useMemo((): PickerRow[] => {
    if (query.trim()) return []
    const seen = new Set<string>()
    const rows: PickerRow[] = []

    const add = (row: PickerRow): void => {
      if (seen.has(row.id)) return
      seen.add(row.id)
      rows.push(row)
    }

    const favById = new Map(favorites.map((f) => [f.id, f]))

    if (lastUsedPageId) {
      const f = favById.get(lastUsedPageId)
      add({
        id: lastUsedPageId,
        title: f?.title ?? t('notion.pickerLastUsed'),
        icon: f?.icon ?? null,
        badge: t('notion.pickerBadgeLast')
      })
    }

    if (defaultPageId) {
      const f = favById.get(defaultPageId)
      add({
        id: defaultPageId,
        title: f?.title ?? t('notion.pickerDefault'),
        icon: f?.icon ?? null,
        badge:
          kind === 'mail'
            ? t('settings.notionBadgeMailDefault')
            : t('settings.notionBadgeCalDefault')
      })
    }

    for (const f of favorites) {
      add({
        id: f.id,
        title: f.title,
        icon: f.icon,
        badge:
          f.id === defaultPageId
            ? kind === 'mail'
              ? t('settings.notionBadgeMailDefault')
              : t('settings.notionBadgeCalDefault')
            : undefined
      })
    }

    return rows
  }, [
    query,
    favorites,
    lastUsedPageId,
    defaultPageId,
    kind,
    t
  ])

  const searchRows = useMemo((): PickerRow[] => {
    if (!query.trim()) return []
    return searchHits.map((h) => ({
      id: h.id,
      title: h.title,
      icon: h.icon
    }))
  }, [query, searchHits])

  if (!open || !kind) return null

  function handlePick(pageId: string): void {
    close({ mode: 'append', pageId })
  }

  function handleClose(): void {
    close(null)
  }

  async function handleCreateNewPage(parentPageId?: string | null): Promise<void> {
    if (!kind || createBusy) return
    const defaultTitle =
      suggestedTitle ||
      (kind === 'mail' ? t('notion.newPageDefaultMail') : t('notion.newPageDefaultEvent'))
    const title = await showAppPrompt(t('notion.newPageTitlePrompt'), {
      title: t('notion.pickerNewPage'),
      defaultValue: defaultTitle,
      placeholder: t('notion.newPageTitlePlaceholder'),
      confirmLabel: t('common.create')
    })
    if (title === null) return
    const pageTitle = title.trim() || defaultTitle
    setCreateBusy(true)
    setError(null)
    try {
      if (kind === 'mail' && messageId != null) {
        const created = await window.mailClient.notion.createMailPage({
          messageId,
          title: pageTitle,
          parentPageId: parentPageId ?? null
        })
        close({ mode: 'created', pageId: created.pageId, pageUrl: created.pageUrl })
        return
      }
      if (kind === 'calendar' && calendarEvent) {
        const created = await window.mailClient.notion.createEventPage({
          event: calendarEvent,
          title: pageTitle,
          parentPageId: parentPageId ?? null,
          localeCode
        })
        close({ mode: 'created', pageId: created.pageId, pageUrl: created.pageUrl })
        return
      }
      const created = await window.mailClient.notion.createPage({
        title: pageTitle,
        parentPageId: parentPageId ?? null,
        kind
      })
      close({ mode: 'append', pageId: created.pageId })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCreateBusy(false)
    }
  }

  const title =
    kind === 'mail' ? t('notion.pickerTitleMail') : t('notion.pickerTitleCalendar')

  return (
    <div
      className="fixed inset-0 z-[300] flex items-start justify-center bg-black/55 pt-[12vh] backdrop-blur-sm"
      role="presentation"
      onClick={handleClose}
      onKeyDown={(e): void => {
        if (e.key === 'Escape') handleClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="notion-picker-title"
        className="flex max-h-[min(480px,72vh)] w-[min(420px,94vw)] flex-col overflow-hidden rounded-xl border border-border bg-card text-foreground shadow-2xl"
        onClick={(e): void => e.stopPropagation()}
      >
        <div className="border-b border-border/60 px-3 py-2.5">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e): void => setQuery(e.target.value)}
              placeholder={title}
              className="w-full rounded-lg border border-primary/40 bg-background py-2 pl-9 pr-8 text-sm text-foreground outline-none ring-0 placeholder:text-muted-foreground focus:border-primary"
            />
            {searchBusy ? (
              <Loader2
                className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground"
                aria-hidden
              />
            ) : (
              <button
                type="button"
                onClick={handleClose}
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                aria-label={t('common.close')}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          {error ? (
            <p className="px-3 py-2 text-xs text-destructive">{error}</p>
          ) : null}

          <div className="border-b border-border/50 px-1 py-1">
            <button
              type="button"
              disabled={createBusy || searchBusy}
              onClick={(): void => void handleCreateNewPage(null)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-medium transition-colors',
                'text-primary hover:bg-primary/10 disabled:opacity-50'
              )}
            >
              {createBusy ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
              ) : (
                <FilePlus2 className="h-4 w-4 shrink-0" aria-hidden />
              )}
              {t('notion.pickerNewPage')}
            </button>
          </div>

          {!query.trim() ? (
            <>
              <PickerListSection
                title={t('notion.pickerSuggested')}
                rows={suggestedRows}
                busy={createBusy}
                onPick={handlePick}
                onCreateUnder={(parentId): void => void handleCreateNewPage(parentId)}
              />
              {suggestedRows.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                  {t('notion.pickerEmpty')}
                </p>
              ) : null}
            </>
          ) : (
            <>
              <PickerListSection
                title={t('notion.pickerSearchResults')}
                rows={searchRows}
                busy={searchBusy || createBusy}
                onPick={handlePick}
                onCreateUnder={(parentId): void => void handleCreateNewPage(parentId)}
              />
              {!searchBusy && searchRows.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                  {t('notion.pickerNoResults')}
                </p>
              ) : null}
            </>
          )}
        </div>

        <div className="flex items-center gap-1.5 border-t border-border/60 px-3 py-2 text-[10px] text-muted-foreground">
          <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden />
          {t('notion.pickerFavoritesHint')}
        </div>
      </div>
    </div>
  )
}
