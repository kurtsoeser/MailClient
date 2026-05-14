import { useCallback, useEffect, useState } from 'react'
import { ChevronRight, Cloud, File as FileIcon, Folder, Loader2, X } from 'lucide-react'
import type { ComposeDriveExplorerEntry, ComposeDriveExplorerScope } from '@shared/types'
import { cn } from '@/lib/utils'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

type Crumb = { id: string | null; name: string; driveId?: string | null }

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

  const load = useCallback(async (): Promise<void> => {
    if (!open || !accountId) return
    setLoading(true)
    try {
      const last = crumbs[crumbs.length - 1]
      const folderId = last?.id ?? undefined
      const folderDriveId = last?.driveId ?? undefined
      const list = await window.mailClient.compose.listDriveExplorer({
        accountId,
        scope,
        folderId: scope === 'recent' ? undefined : folderId ?? null,
        folderDriveId: scope === 'recent' ? undefined : folderDriveId ?? null
      })
      setEntries(list)
    } catch {
      setEntries([])
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
    }
  }, [open])

  const setSection = (s: ComposeDriveExplorerScope): void => {
    setScope(s)
    setCrumbs([])
  }

  const openFolder = (row: ComposeDriveExplorerEntry): void => {
    if (!row.isFolder) return
    setCrumbs((prev) => [...prev, { id: row.id, name: row.name, driveId: row.driveId ?? null }])
  }

  const goCrumb = (index: number): void => {
    setCrumbs((prev) => prev.slice(0, index + 1))
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

  if (!open) return null

  const rootLabel =
    scope === 'recent' ? 'Zuletzt' : scope === 'myfiles' ? 'Meine Dateien' : 'Mit mir geteilt'

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-3 backdrop-blur-[2px]"
      onClick={onClose}
      onKeyDown={(e): void => {
        if (e.key === 'Escape') onClose()
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
          <nav className="flex w-[148px] shrink-0 flex-col gap-0.5 border-r border-border/60 bg-secondary/20 p-2">
            <NavBtn active={scope === 'recent'} label="Zuletzt" onClick={(): void => setSection('recent')} />
            <NavBtn active={scope === 'myfiles'} label="Meine Dateien" onClick={(): void => setSection('myfiles')} />
            <NavBtn active={scope === 'shared'} label="Geteilt" onClick={(): void => setSection('shared')} />
          </nav>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border/50 px-3 py-2 text-[11px] text-muted-foreground">
              <button
                type="button"
                className={cn(
                  'rounded px-1.5 py-0.5 hover:bg-secondary hover:text-foreground',
                  crumbs.length === 0 && 'font-medium text-foreground'
                )}
                onClick={(): void => setCrumbs([])}
              >
                {rootLabel}
              </button>
              {crumbs.map((c, i) => (
                <span key={`${c.id ?? 'r'}-${i}`} className="flex items-center gap-1">
                  <ChevronRight className="h-3 w-3 shrink-0 opacity-60" />
                  <button
                    type="button"
                    className={cn(
                      'max-w-[180px] truncate rounded px-1.5 py-0.5 hover:bg-secondary hover:text-foreground',
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

            <div className="min-h-0 flex-1 overflow-y-auto px-1 py-1">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Laden…
                </div>
              ) : entries.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  {scope === 'recent'
                    ? 'Keine zuletzt verwendeten Dateien.'
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
              Ordner per Klick öffnen, Datei per Klick als Cloud-Anhang übernehmen. Team-SharePoint-Seiten
              können bei Bedarf später über zusätzliche Graph-Endpunkte angebunden werden.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
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
