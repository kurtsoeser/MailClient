import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, ChevronRight, ChevronUp, Cloud, File as FileIcon, Folder, Loader2, Pencil, Star, X } from 'lucide-react'
import type {
  ComposeDriveExplorerEntry,
  ComposeDriveExplorerFavorite,
  ComposeDriveExplorerNavCrumb,
  ComposeDriveExplorerScope
} from '@shared/types'
import { cn } from '@/lib/utils'
import { formatBytes } from '@/lib/format-bytes'

type Crumb = ComposeDriveExplorerNavCrumb

function isWellFormedFavorite(f: unknown): f is ComposeDriveExplorerFavorite {
  if (!f || typeof f !== 'object') return false
  const o = f as Record<string, unknown>
  if (typeof o.id !== 'string' || typeof o.label !== 'string' || typeof o.savedAt !== 'string') return false
  if (o.scope !== 'recent' && o.scope !== 'myfiles' && o.scope !== 'shared' && o.scope !== 'sharepoint') return false
  return Array.isArray(o.crumbs)
}

function crumbsMatchNav(
  scopeA: ComposeDriveExplorerScope,
  crumbsA: ComposeDriveExplorerNavCrumb[] | null | undefined,
  scopeB: ComposeDriveExplorerScope,
  crumbsB: Crumb[]
): boolean {
  if (scopeA !== scopeB) return false
  if (!Array.isArray(crumbsA) || !Array.isArray(crumbsB)) return false
  if (crumbsA.length !== crumbsB.length) return false
  return crumbsA.every((c, i) => {
    const d = crumbsB[i]!
    if (
      c.name !== d.name ||
      (c.driveId ?? null) !== (d.driveId ?? null) ||
      (c.siteId ?? null) !== (d.siteId ?? null)
    ) {
      return false
    }
    if (c.id === d.id) return true
    if (scopeA !== 'sharepoint') return false
    const cd = (c.driveId ?? '').trim()
    const dd = (d.driveId ?? '').trim()
    if (!cd || cd !== dd) return false
    const cLibRoot =
      c.id == null || String(c.id).trim() === '' || String(c.id).trim() === cd
    const dLibRoot =
      d.id == null || String(d.id).trim() === '' || String(d.id).trim() === dd
    return cLibRoot && dLibRoot
  })
}

interface Props {
  open: boolean
  accountId: string
  onClose: () => void
  /** Nur Dateien mit gültigem `webUrl` (ReferenceAttachment). */
  onPickFile: (file: { name: string; webUrl: string }) => void
}

export function OneDriveExplorerDialog({ open, accountId, onClose, onPickFile }: Props): JSX.Element | null {
  const [scope, setScope] = useState<ComposeDriveExplorerScope>('myfiles')
  const [crumbs, setCrumbs] = useState<Crumb[]>([])
  const [entries, setEntries] = useState<ComposeDriveExplorerEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [favorites, setFavorites] = useState<ComposeDriveExplorerFavorite[]>([])
  const [favoriteHint, setFavoriteHint] = useState<string | null>(null)
  const [savingFavorite, setSavingFavorite] = useState(false)
  const [editingFavoriteId, setEditingFavoriteId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')

  const favoritesRef = useRef(favorites)
  useEffect(() => {
    favoritesRef.current = favorites
  }, [favorites])

  useEffect(() => {
    if (!open || !accountId) return
    const fn = window.mailClient.compose?.listDriveExplorerFavorites
    if (typeof fn !== 'function') {
      setFavorites([])
      return
    }
    void fn
      .call(window.mailClient.compose, accountId)
      .then((rows) => {
        if (!Array.isArray(rows)) {
          setFavorites([])
          return
        }
        setFavorites(rows.filter(isWellFormedFavorite))
      })
      .catch(() => setFavorites([]))
  }, [open, accountId])

  const load = useCallback(async (): Promise<void> => {
    if (!open || !accountId) return
    setLoading(true)
    setLoadError(null)
    const seedFav = favoritesRef.current.find(
      (f) =>
        Array.isArray(f.cachedEntries) &&
        f.cachedEntries.length > 0 &&
        crumbsMatchNav(f.scope, f.crumbs, scope, crumbs)
    )
    if (seedFav?.cachedEntries?.length) {
      setEntries(seedFav.cachedEntries)
    }
    try {
      let folderId: string | null | undefined
      let folderDriveId: string | null | undefined
      let siteId: string | null | undefined

      if (scope === 'sharepoint') {
        if (crumbs.length === 0) {
          siteId = null
          folderId = undefined
          folderDriveId = undefined
        } else {
          const siteIdx = crumbs.findIndex((c) => Boolean(c.siteId))
          if (siteIdx === -1) {
            siteId = null
            folderId = undefined
            folderDriveId = undefined
          } else {
            const siteCrumb = crumbs[siteIdx]!
            const tail = crumbs.slice(siteIdx + 1)
            if (tail.length === 0) {
              siteId = siteCrumb.siteId ?? null
              folderId = null
              folderDriveId = null
            } else {
              const last = tail[tail.length - 1]!
              siteId = siteCrumb.siteId ?? null
              folderDriveId = last.driveId ?? null
              folderId = last.id
            }
          }
        }
      } else {
        const last = crumbs[crumbs.length - 1]
        folderId = last?.id ?? undefined
        folderDriveId = last?.driveId ?? undefined
      }

      const list = await window.mailClient.compose.listDriveExplorer({
        accountId,
        scope,
        ...(scope === 'recent'
          ? {}
          : {
              folderId: folderId ?? null,
              folderDriveId: folderDriveId ?? null
            }),
        ...(scope === 'sharepoint' ? { siteId: siteId ?? null } : {})
      })
      setEntries(list)

      const hit = favoritesRef.current.find((f) => crumbsMatchNav(f.scope, f.crumbs, scope, crumbs))
      if (hit) {
        void window.mailClient.compose
          .updateDriveExplorerFavoriteCache({ accountId, id: hit.id, entries: list })
          .catch(() => undefined)
        setFavorites((prev) =>
          prev.map((p) =>
            p.id === hit.id
              ? { ...p, cachedEntries: list, cachedAt: new Date().toISOString() }
              : p
          )
        )
      }
    } catch (e) {
      setEntries([])
      setLoadError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [open, accountId, scope, crumbs])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!open) {
      setScope('myfiles')
      setCrumbs([])
      setEntries([])
      setLoadError(null)
      setFavoriteHint(null)
      setSavingFavorite(false)
      setEditingFavoriteId(null)
      setEditLabel('')
    }
  }, [open])

  const setSection = (s: ComposeDriveExplorerScope): void => {
    setFavoriteHint(null)
    setScope(s)
    setCrumbs([])
  }

  const applyFavorite = (f: ComposeDriveExplorerFavorite): void => {
    setFavoriteHint(null)
    if (!Array.isArray(f.crumbs)) return
    setScope(f.scope)
    setCrumbs(
      f.crumbs.map((c) => ({
        id: c.id,
        name: c.name,
        driveId: c.driveId ?? null,
        siteId: c.siteId ?? null
      }))
    )
  }

  const openFolder = (row: ComposeDriveExplorerEntry): void => {
    if (!row.isFolder) return
    if (scope === 'sharepoint' && row.siteId) {
      setCrumbs((prev) => [...prev, { id: null, name: row.name, siteId: row.siteId }])
      return
    }
    if (scope === 'sharepoint' && row.driveId?.trim()) {
      const d = row.driveId.trim()
      const i = row.id.trim()
      const isLibraryRoot = !row.siteId && i.length > 0 && i === d
      setCrumbs((prev) => [
        ...prev,
        { id: isLibraryRoot ? null : row.id, name: row.name, driveId: row.driveId ?? null }
      ])
      return
    }
    setCrumbs((prev) => [...prev, { id: row.id, name: row.name, driveId: row.driveId ?? null }])
  }

  const goCrumb = (index: number): void => {
    setCrumbs((prev) => prev.slice(0, index + 1))
  }

  const clearCrumbsToRoot = (): void => {
    setCrumbs([])
  }

  const tryPickFile = (row: ComposeDriveExplorerEntry): void => {
    if (row.isFolder) {
      openFolder(row)
      return
    }
    const url = row.webUrl?.trim()
    if (!url) return
    onPickFile({ name: row.name, webUrl: url })
  }

  const currentPathFavorite = favorites.find((f) => crumbsMatchNav(f.scope, f.crumbs, scope, crumbs)) ?? null

  const refreshFavorites = useCallback(async (): Promise<void> => {
    try {
      setFavorites(await window.mailClient.compose.listDriveExplorerFavorites(accountId))
    } catch {
      setFavorites([])
    }
  }, [accountId])

  const addCurrentAsFavorite = async (): Promise<void> => {
    if (currentPathFavorite) return
    setFavoriteHint(null)
    setSavingFavorite(true)
    try {
      await window.mailClient.compose.addDriveExplorerFavorite({
        accountId,
        scope,
        crumbs: crumbs.map((c) => ({
          id: c.id,
          name: c.name,
          driveId: c.driveId ?? undefined,
          siteId: c.siteId ?? undefined
        })),
        cachedEntries: entries.length > 0 ? entries : null
      })
      await refreshFavorites()
    } catch (e) {
      setFavoriteHint(e instanceof Error ? e.message : String(e))
    } finally {
      setSavingFavorite(false)
    }
  }

  const moveFavorite = async (index: number, delta: -1 | 1): Promise<void> => {
    const ni = index + delta
    if (ni < 0 || ni >= favorites.length) return
    setFavoriteHint(null)
    const next = [...favorites]
    const [row] = next.splice(index, 1)
    if (!row) return
    next.splice(ni, 0, row)
    try {
      await window.mailClient.compose.reorderDriveExplorerFavorites({
        accountId,
        orderedIds: next.map((x) => x.id)
      })
      setFavorites(next)
    } catch (e) {
      setFavoriteHint(e instanceof Error ? e.message : String(e))
    }
  }

  const beginRenameFavorite = (f: ComposeDriveExplorerFavorite): void => {
    setFavoriteHint(null)
    setEditingFavoriteId(f.id)
    setEditLabel(f.label)
  }

  const cancelRenameFavorite = (): void => {
    setEditingFavoriteId(null)
    setEditLabel('')
  }

  const submitRenameFavorite = async (): Promise<void> => {
    const id = editingFavoriteId
    if (!id) return
    const label = editLabel.trim()
    if (!label) {
      setFavoriteHint('Der Name darf nicht leer sein.')
      return
    }
    setFavoriteHint(null)
    try {
      await window.mailClient.compose.renameDriveExplorerFavorite({ accountId, id, label })
      cancelRenameFavorite()
      await refreshFavorites()
    } catch (e) {
      setFavoriteHint(e instanceof Error ? e.message : String(e))
    }
  }

  const removeFavorite = async (f: ComposeDriveExplorerFavorite): Promise<void> => {
    try {
      await window.mailClient.compose.removeDriveExplorerFavorite({ accountId, id: f.id })
      if (editingFavoriteId === f.id) cancelRenameFavorite()
      await refreshFavorites()
    } catch (e) {
      setFavoriteHint(e instanceof Error ? e.message : String(e))
    }
  }

  if (!open) return null

  const rootLabel =
    scope === 'recent'
      ? 'Zuletzt'
      : scope === 'myfiles'
        ? 'Meine Dateien'
        : scope === 'sharepoint'
          ? 'SharePoint'
          : 'Mit mir geteilt'

  const modal = (
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/60 p-3 backdrop-blur-[2px]"
      onClick={onClose}
      onKeyDown={(e): void => {
        if (e.key === 'Escape') {
          if (editingFavoriteId) {
            e.stopPropagation()
            cancelRenameFavorite()
            return
          }
          onClose()
        }
      }}
      role="presentation"
    >
      <div
        className="flex h-[min(560px,78vh)] w-full max-w-[720px] flex-col overflow-hidden rounded-xl border border-border bg-card text-foreground shadow-2xl"
        onClick={(e): void => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="OneDrive und geteilte Dateien"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border/70 px-4 py-3">
          <div className="flex items-center gap-2">
            <Cloud className="h-4 w-4 text-sky-500" />
            <span className="text-sm font-semibold">OneDrive / SharePoint</span>
          </div>
          <button
            type="button"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Schließen"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <nav className="flex w-[208px] shrink-0 flex-col gap-0.5 border-r border-border/60 bg-secondary/20 p-2">
            <div className="px-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Favoriten
            </div>
            <div className="mb-2 max-h-[34vh] min-h-0 space-y-1 overflow-y-auto pr-0.5">
              {favorites.length === 0 ? (
                <p className="px-1.5 py-2 text-[11px] leading-snug text-muted-foreground">
                  Stern oben: Ort merken. Stift: umbenennen. Pfeile: sortieren. Alles lokal.
                </p>
              ) : (
                favorites.map((f, index) => {
                  const active = crumbsMatchNav(f.scope, f.crumbs, scope, crumbs)
                  const editing = editingFavoriteId === f.id
                  return (
                    <div
                      key={f.id}
                      className={cn(
                        'group relative flex gap-0.5 rounded-md border border-transparent',
                        active && !editing && 'border-border/50 bg-secondary shadow-sm'
                      )}
                    >
                      <div className="flex shrink-0 flex-col justify-center py-0.5 pl-0.5">
                        <button
                          type="button"
                          disabled={index === 0}
                          className="rounded p-0 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-25"
                          title="Nach oben"
                          aria-label="Favorit nach oben"
                          onClick={(e): void => {
                            e.stopPropagation()
                            void moveFavorite(index, -1)
                          }}
                        >
                          <ChevronUp className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          disabled={index >= favorites.length - 1}
                          className="rounded p-0 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-25"
                          title="Nach unten"
                          aria-label="Favorit nach unten"
                          onClick={(e): void => {
                            e.stopPropagation()
                            void moveFavorite(index, 1)
                          }}
                        >
                          <ChevronDown className="h-3 w-3" />
                        </button>
                      </div>
                      <div className="min-w-0 flex-1">
                        {editing ? (
                          <form
                            className="flex flex-col gap-1 py-1 pr-1"
                            onSubmit={(e): void => {
                              e.preventDefault()
                              void submitRenameFavorite()
                            }}
                            onClick={(e): void => e.stopPropagation()}
                          >
                            <input
                              value={editLabel}
                              onChange={(e): void => setEditLabel(e.target.value)}
                              className="w-full rounded border border-border bg-background px-1.5 py-0.5 text-[11px] text-foreground outline-none focus:border-ring"
                              maxLength={120}
                              autoComplete="off"
                              autoFocus
                              aria-label="Favoritenname"
                            />
                            <div className="flex flex-wrap gap-1">
                              <button
                                type="submit"
                                className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-foreground hover:bg-secondary"
                              >
                                Speichern
                              </button>
                              <button
                                type="button"
                                className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-secondary hover:text-foreground"
                                onClick={cancelRenameFavorite}
                              >
                                Abbrechen
                              </button>
                            </div>
                          </form>
                        ) : (
                          <button
                            type="button"
                            onClick={(): void => applyFavorite(f)}
                            className={cn(
                              'flex w-full items-start gap-1 rounded-md py-1.5 pl-0.5 pr-12 text-left text-[11px] font-medium leading-snug transition-colors',
                              active
                                ? 'text-foreground'
                                : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                            )}
                            title={f.label}
                          >
                            <Star className="mt-0.5 h-3 w-3 shrink-0 text-amber-500/90" />
                            <span className="line-clamp-2 min-w-0 flex-1">{f.label}</span>
                          </button>
                        )}
                      </div>
                      {!editing ? (
                        <>
                          <button
                            type="button"
                            className="absolute right-5 top-1 rounded p-0.5 text-muted-foreground opacity-0 hover:bg-secondary hover:text-foreground group-hover:opacity-100"
                            aria-label="Umbenennen"
                            title="Umbenennen"
                            onClick={(e): void => {
                              e.stopPropagation()
                              beginRenameFavorite(f)
                            }}
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            className="absolute right-0.5 top-1 rounded p-0.5 text-muted-foreground opacity-0 hover:bg-destructive/15 hover:text-destructive group-hover:opacity-100"
                            aria-label="Favorit entfernen"
                            title="Entfernen"
                            onClick={(e): void => {
                              e.stopPropagation()
                              void removeFavorite(f)
                            }}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </>
                      ) : null}
                    </div>
                  )
                })
              )}
            </div>
            <div className="mb-1.5 h-px shrink-0 bg-border/60" />
            <NavBtn active={scope === 'recent'} label="Zuletzt" onClick={(): void => setSection('recent')} />
            <NavBtn active={scope === 'myfiles'} label="Meine Dateien" onClick={(): void => setSection('myfiles')} />
            <NavBtn active={scope === 'shared'} label="Geteilt" onClick={(): void => setSection('shared')} />
            <NavBtn active={scope === 'sharepoint'} label="SharePoint" onClick={(): void => setSection('sharepoint')} />
          </nav>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border/50 px-3 py-2 text-[11px] text-muted-foreground">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                <button
                  type="button"
                  className={cn(
                    'rounded px-1.5 py-0.5 hover:bg-secondary hover:text-foreground',
                    crumbs.length === 0 && 'font-medium text-foreground'
                  )}
                  onClick={clearCrumbsToRoot}
                >
                  {rootLabel}
                </button>
                {crumbs.map((c, i) => (
                  <span
                    key={`${c.siteId ?? ''}-${c.driveId ?? ''}-${c.id ?? 'r'}-${i}`}
                    className="flex min-w-0 items-center gap-1"
                  >
                    <ChevronRight className="h-3 w-3 shrink-0 opacity-60" />
                    <button
                      type="button"
                      className={cn(
                        'max-w-[160px] truncate rounded px-1.5 py-0.5 hover:bg-secondary hover:text-foreground',
                        i === crumbs.length - 1 && 'font-medium text-foreground'
                      )}
                      title={c.name}
                      onClick={(): void => goCrumb(i)}
                    >
                      {c.name}
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex shrink-0 items-center gap-1.5 pl-1">
                {favoriteHint ? (
                  <span className="max-w-[min(200px,28vw)] truncate text-[10px] text-destructive" title={favoriteHint}>
                    {favoriteHint}
                  </span>
                ) : null}
                {loading && entries.length > 0 ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" aria-hidden />
                ) : null}
                <button
                  type="button"
                  disabled={Boolean(currentPathFavorite) || savingFavorite}
                  className={cn(
                    'rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-40',
                    currentPathFavorite && 'text-amber-500'
                  )}
                  title={
                    currentPathFavorite
                      ? 'Bereits als Favorit gespeichert'
                      : 'Aktuellen Ort als Favorit merken (lokal, mit Schnell-Cache)'
                  }
                  aria-label="Aktuellen Ort als Favorit merken"
                  onClick={(): void => void addCurrentAsFavorite()}
                >
                  <Star className={cn('h-3.5 w-3.5', currentPathFavorite && 'fill-amber-400')} />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-1 py-1">
              {loading && entries.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Laden…
                </div>
              ) : loadError ? (
                <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
                  <p className="text-sm text-destructive">{loadError}</p>
                  <button
                    type="button"
                    className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
                    onClick={(): void => void load()}
                  >
                    Erneut versuchen
                  </button>
                  <p className="max-w-md text-[11px] text-muted-foreground">
                    Haeufig: Konto unter Einstellungen erneut mit Microsoft verbinden, damit die Berechtigungen
                    «Dateien lesen» (Files.Read.All) und «Websites lesen» (Sites.Read.All) im Token enthalten sind
                    — sie werden fuer OneDrive- und SharePoint-Anhaenge benoetigt.
                  </p>
                </div>
              ) : entries.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  {scope === 'recent'
                    ? 'Keine zuletzt verwendeten Dateien.'
                    : scope === 'sharepoint' && crumbs.length === 0
                      ? 'Keine SharePoint-Websites gefunden (verfolgte Sites und Teams). Unter SharePoint Websites «Folgen» oder Teams beitreten, damit sie hier erscheinen.'
                      : 'Keine Einträge in diesem Ordner.'}
                </p>
              ) : (
                <ul className="space-y-0.5">
                  {entries.map((row) => (
                    <li key={`${row.id}-${row.name}`}>
                      <button
                        type="button"
                        className={cn(
                          'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                          'hover:bg-secondary/80',
                          row.isFolder && 'text-foreground'
                        )}
                        onClick={(): void => tryPickFile(row)}
                      >
                        {row.isFolder ? (
                          <Folder className="h-4 w-4 shrink-0 text-amber-600/90 dark:text-amber-400/90" />
                        ) : (
                          <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-foreground">{row.name}</div>
                          {!row.isFolder && row.size != null && (
                            <div className="text-[11px] text-muted-foreground">{formatBytes(row.size)}</div>
                          )}
                          {!row.isFolder && !row.webUrl && (
                            <div className="text-[10px] text-amber-600 dark:text-amber-400">
                              Kein Web-Link — Anhang nicht möglich
                            </div>
                          )}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="shrink-0 border-t border-border/60 bg-secondary/15 px-3 py-2 text-[10px] text-muted-foreground">
              Ordner per Klick öffnen, Datei per Klick als Cloud-Anhang übernehmen. Favoriten lokal (inkl. optionaler
              Dateiliste); Stift zum Umbenennen, Pfeile zum Sortieren. SharePoint: Website, Bibliothek, Ordner.
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}

function NavBtn({
  active,
  label,
  onClick
}: {
  active: boolean
  label: string
  onClick: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md px-2.5 py-2 text-left text-[12px] font-medium transition-colors',
        active
          ? 'bg-secondary text-foreground shadow-sm'
          : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
      )}
    >
      {label}
    </button>
  )
}
