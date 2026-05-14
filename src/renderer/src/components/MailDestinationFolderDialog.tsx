import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Loader2, Folder as FolderIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buildFolderTree, flattenTree } from '@/lib/folder-tree'
import { sidebarWellKnownFolderDisplayName } from '@/lib/sidebar-well-known'
import type { MailFolder } from '@shared/types'

export function MailDestinationFolderDialog({
  open,
  folders,
  onClose,
  onPick
}: {
  open: boolean
  folders: MailFolder[]
  onClose: () => void
  onPick: (folderId: number) => void | Promise<void>
}): JSX.Element | null {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const rows = useMemo(() => {
    const tree = buildFolderTree(folders)
    return flattenTree(tree, new Set())
  }, [folders])

  if (!open) return null

  async function handlePick(folderId: number): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await onPick(folderId)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[440px] max-w-[92vw] rounded-xl border border-border bg-card text-foreground shadow-2xl"
        onClick={(e): void => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">{t('mail.move.browseTitle')}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label={t('common.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-3">
          <p className="mb-2 text-xs text-muted-foreground">{t('mail.move.browseHint')}</p>
          {error && (
            <div className="mb-2 rounded border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
              {error}
            </div>
          )}
          <div className="max-h-[min(360px,55vh)] overflow-y-auto rounded-md border border-border bg-background/50 p-1">
            {rows.length === 0 ? (
              <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                {t('mail.move.noFolders')}
              </div>
            ) : (
              rows.map((node) => {
                const f = node.folder
                const label = sidebarWellKnownFolderDisplayName(f.wellKnown ?? undefined, f.name)
                return (
                  <button
                    key={f.id}
                    type="button"
                    disabled={busy}
                    onClick={(): void => {
                      void handlePick(f.id)
                    }}
                    className={cn(
                      'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors',
                      'text-muted-foreground hover:bg-secondary/70 hover:text-foreground'
                    )}
                    style={{ paddingLeft: `${8 + node.depth * 12}px` }}
                  >
                    <FolderIcon className="h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                  </button>
                )
              })
            )}
          </div>
          {busy && (
            <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t('mail.move.working')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
