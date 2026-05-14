import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FolderIcon, FolderPlus, ListTree } from 'lucide-react'
import { cn } from '@/lib/utils'
import { sidebarWellKnownFolderDisplayName } from '@/lib/sidebar-well-known'
import { readRecentMailMoveFolders } from '@/lib/mail-move-recent'
import { useMailStore } from '@/stores/mail'
import { showAppPrompt } from '@/stores/app-dialog'
import type { MailFolder } from '@shared/types'

function labelFor(f: MailFolder): string {
  return sidebarWellKnownFolderDisplayName(f.wellKnown ?? undefined, f.name)
}

export function MailMoveSubmenuPanel(props: {
  messageIds: number[]
  accountId: string
  folders: MailFolder[]
  isGmail: boolean
  onCloseRoot: () => void
  onBrowseOther: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const moveMessagesToFolder = useMailStore((s) => s.moveMessagesToFolder)
  const createFolder = useMailStore((s) => s.createFolder)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)

  const byId = useMemo(() => new Map(props.folders.map((f) => [f.id, f] as const)), [props.folders])

  const recentFolders = useMemo((): MailFolder[] => {
    const rec = readRecentMailMoveFolders().filter((r) => r.accountId === props.accountId)
    const out: MailFolder[] = []
    const seen = new Set<number>()
    for (const r of rec) {
      const f = byId.get(r.folderId)
      if (f && !seen.has(f.id)) {
        seen.add(f.id)
        out.push(f)
      }
    }
    return out.slice(0, 8)
  }, [byId, props.accountId, props.folders])

  const q = query.trim().toLocaleLowerCase('de')
  const searchHits = useMemo((): MailFolder[] => {
    if (!q) return []
    return props.folders.filter((f) => labelFor(f).toLocaleLowerCase('de').includes(q))
  }, [props.folders, q])

  async function moveTo(folderId: number): Promise<void> {
    if (busy) return
    setBusy(true)
    try {
      await moveMessagesToFolder(props.messageIds, folderId)
      props.onCloseRoot()
    } finally {
      setBusy(false)
    }
  }

  async function onCreateFolder(): Promise<void> {
    const def = props.isGmail ? t('mail.move.newFolderDefaultGmail') : t('mail.move.newFolderDefaultImap')
    const name = await showAppPrompt(t('mail.move.newFolderPrompt'), {
      title: t('mail.move.newFolderTitle'),
      defaultValue: def,
      placeholder: t('mail.move.newFolderPlaceholder'),
      confirmLabel: t('common.create'),
      cancelLabel: t('common.cancel')
    })
    if (name == null || !name.trim()) return
    setBusy(true)
    try {
      const created = await createFolder(props.accountId, null, name.trim())
      await moveMessagesToFolder(props.messageIds, created.id)
      props.onCloseRoot()
    } catch {
      // Fehler erscheint im Store / Toast
    } finally {
      setBusy(false)
    }
  }

  function FolderPickRow({ f }: { f: MailFolder }): JSX.Element {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={(): void => void moveTo(f.id)}
        className={cn(
          'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors text-foreground hover:bg-secondary/80',
          busy && 'pointer-events-none opacity-50'
        )}
      >
        <FolderIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{labelFor(f)}</span>
      </button>
    )
  }

  return (
    <div className="flex max-h-[min(320px,65vh)] flex-col gap-2 p-2">
      <input
        type="search"
        autoFocus
        value={query}
        onChange={(e): void => setQuery(e.target.value)}
        onKeyDown={(e): void => e.stopPropagation()}
        onMouseDown={(e): void => e.stopPropagation()}
        placeholder={t('mail.move.searchPlaceholder')}
        className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={t('mail.move.searchPlaceholder')}
      />

      {q === '' && (
        <>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t('mail.move.recentSection')}
          </div>
          <div className="max-h-[7.5rem] space-y-px overflow-y-auto pr-0.5">
            {recentFolders.length === 0 ? (
              <div className="px-2 py-1 text-[11px] text-muted-foreground/80">{t('mail.move.recentEmpty')}</div>
            ) : (
              recentFolders.map((f) => <FolderPickRow key={f.id} f={f} />)
            )}
          </div>
          <div className="h-px bg-border" />
        </>
      )}

      <div className="min-h-0 flex-1 space-y-px overflow-y-auto pr-0.5">
        {q !== '' &&
          (searchHits.length === 0 ? (
            <div className="px-2 py-2 text-[11px] text-muted-foreground">{t('mail.move.searchNoResults')}</div>
          ) : (
            searchHits.map((f) => <FolderPickRow key={f.id} f={f} />)
          ))}
      </div>

      <div className="h-px bg-border" />

      <button
        type="button"
        disabled={busy}
        onClick={(): void => {
          props.onBrowseOther()
          props.onCloseRoot()
        }}
        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-secondary/80 disabled:pointer-events-none disabled:opacity-45"
      >
        <ListTree className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span>{t('mail.move.browseAction')}</span>
      </button>

      <div className="h-px bg-border" />

      <button
        type="button"
        disabled={busy}
        onClick={(): void => void onCreateFolder()}
        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-secondary/80 disabled:pointer-events-none disabled:opacity-45"
      >
        <FolderPlus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span>{t('mail.move.newFolderAction')}</span>
      </button>
    </div>
  )
}
