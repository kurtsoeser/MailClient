import { useMemo, useState } from 'react'
import { X, Loader2, AlertCircle, Folder as FolderIcon, Home } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buildFolderTree, flattenTree } from '@/lib/folder-tree'
import type { MailFolder } from '@shared/types'

interface Props {
  open: boolean
  folder: MailFolder | null
  allFolders: MailFolder[]
  onClose: () => void
  onMove: (destinationFolderId: number | null) => Promise<void>
}

export function MoveFolderDialog({
  open,
  folder,
  allFolders,
  onClose,
  onMove
}: Props): JSX.Element | null {
  const [selectedDestId, setSelectedDestId] = useState<number | 'root' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const eligibleNodes = useMemo(() => {
    if (!folder) return []
    const tree = buildFolderTree(allFolders)
    const allVisible = flattenTree(tree, new Set())

    // descendants des zu verschiebenden Ordners ausschliessen (sonst Zyklus)
    const forbidden = new Set<number>([folder.id])
    let changed = true
    while (changed) {
      changed = false
      for (const n of allVisible) {
        const parent = allFolders.find((f) => f.remoteId === n.folder.parentRemoteId)
        if (parent && forbidden.has(parent.id) && !forbidden.has(n.folder.id)) {
          forbidden.add(n.folder.id)
          changed = true
        }
      }
    }

    return allVisible.filter((n) => !forbidden.has(n.folder.id))
  }, [folder, allFolders])

  if (!open || !folder) return null

  async function handleMove(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const dest = selectedDestId === 'root' ? null : selectedDestId
      await onMove(dest)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[460px] max-w-[90vw] rounded-xl border border-border bg-card text-foreground shadow-2xl"
        onClick={(e): void => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h2 className="text-sm font-semibold">
            Ordner verschieben:{' '}
            <span className="font-normal text-muted-foreground">{folder.name}</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Schliessen"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4">
          <p className="mb-2 text-xs text-muted-foreground">
            Waehle das Ziel, wohin <span className="text-foreground">{folder.name}</span>{' '}
            verschoben werden soll.
          </p>

          <div className="max-h-[320px] overflow-y-auto rounded-md border border-border bg-background/40 p-1">
            <button
              type="button"
              onClick={(): void => setSelectedDestId('root')}
              className={cn(
                'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors',
                selectedDestId === 'root'
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
              )}
            >
              <Home className="h-3.5 w-3.5 shrink-0" />
              <span>(Oberste Ebene)</span>
            </button>

            {eligibleNodes.map((node) => (
              <button
                key={node.folder.id}
                type="button"
                onClick={(): void => setSelectedDestId(node.folder.id)}
                className={cn(
                  'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors',
                  selectedDestId === node.folder.id
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
                )}
                style={{ paddingLeft: `${8 + node.depth * 12}px` }}
              >
                <FolderIcon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{node.folder.name}</span>
              </button>
            ))}
          </div>

          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleMove}
            disabled={busy || selectedDestId === null}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              busy || selectedDestId === null
                ? 'bg-secondary text-muted-foreground'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            )}
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Verschieben
          </button>
        </div>
      </div>
    </div>
  )
}
