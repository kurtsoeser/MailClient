import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  FolderPlus,
  Loader2,
  RefreshCw
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { buildFolderTree, flattenTree } from '@/lib/folder-tree'
import { sidebarInitialCollapsedRemoteIds } from '@/lib/sidebar-well-known'
import { Avatar } from '@/components/Avatar'
import { AccountColorStripe } from '@/components/AccountColorStripe'
import type { ConnectedAccount, MailFolder } from '@shared/types'
import type { SidebarInlineEditState } from '@/app/layout/sidebar/sidebar-types'
import { SidebarFolderInlineEditor } from '@/app/layout/sidebar/SidebarFolderEditor'
import { SidebarFolderRow } from '@/app/layout/sidebar/SidebarFolderRows'

export function SidebarAccountFolderSection({
  account,
  dragHandle,
  profilePhotoDataUrl,
  folders,
  sync,
  selectedFolderId,
  inlineEdit,
  onSelect,
  onSync,
  onContextAccount,
  onContextFolder,
  onNewTopLevel,
  onInlineSubmit,
  onInlineCancel,
  onToggleFolderQuickAccess,
  onMailDropToFolder
}: {
  account: ConnectedAccount
  dragHandle?: React.ReactNode
  profilePhotoDataUrl?: string
  folders: MailFolder[]
  sync?: { state: string; message?: string }
  selectedFolderId: number | null
  inlineEdit: SidebarInlineEditState | null
  onSelect: (folderId: number) => void
  onSync: () => void
  onContextAccount: (e: React.MouseEvent) => void
  onContextFolder: (e: React.MouseEvent, folder: MailFolder) => void
  onNewTopLevel: () => void
  onInlineSubmit: (value: string) => Promise<void>
  onInlineCancel: () => void
  onToggleFolderQuickAccess: (folder: MailFolder) => void
  onMailDropToFolder?: (folder: MailFolder, e: React.DragEvent) => void
}): JSX.Element {
  const isSyncing = Boolean(sync && sync.state.startsWith('syncing'))
  const isError = sync?.state === 'error'
  const isSyncedOk = sync?.state === 'idle'

  const tree = useMemo(() => buildFolderTree(folders), [folders])
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() =>
    sidebarInitialCollapsedRemoteIds(tree)
  )
  const [accountOpen, setAccountOpen] = useState(true)
  const visible = useMemo(() => flattenTree(tree, collapsedFolders), [tree, collapsedFolders])

  function toggleFolder(remoteId: string): void {
    setCollapsedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(remoteId)) next.delete(remoteId)
      else next.add(remoteId)
      return next
    })
  }

  const inboxUnread = folders.find((f) => f.wellKnown === 'inbox')?.unreadCount ?? 0

  return (
    <div>
      <div
        className={cn(
          'group flex items-center gap-2 rounded-md px-2 py-2 transition-colors',
          accountOpen ? '' : 'hover:bg-secondary/40'
        )}
        onContextMenu={onContextAccount}
      >
        {dragHandle}
        <button
          type="button"
          onClick={(): void => setAccountOpen((v) => !v)}
          className="flex h-5 w-4 shrink-0 items-center justify-center text-muted-foreground/70 hover:text-foreground"
          aria-label={accountOpen ? 'Konto zuklappen' : 'Konto aufklappen'}
        >
          {accountOpen ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </button>

        <button
          type="button"
          onClick={(): void => setAccountOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          title={account.email}
        >
          <Avatar
            name={account.displayName}
            email={account.email}
            bgClass={account.color}
            accountColor={account.color}
            initials={account.initials}
            imageSrc={profilePhotoDataUrl}
            size="sm"
          />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-xs font-semibold text-foreground">
                {account.displayName}
              </span>
              {!accountOpen && inboxUnread > 0 && (
                <span className="shrink-0 rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold tabular-nums text-primary">
                  {inboxUnread > 999 ? '999+' : inboxUnread}
                </span>
              )}
            </span>
            <span className="block truncate text-[10px] text-muted-foreground">
              {account.email}
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={(e): void => {
            e.stopPropagation()
            onNewTopLevel()
          }}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition hover:bg-secondary hover:text-foreground group-hover:opacity-100"
          title="Neuer Ordner"
        >
          <FolderPlus className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={(e): void => {
            e.stopPropagation()
            onSync()
          }}
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-secondary',
            isSyncedOk
              ? 'text-emerald-500 hover:text-emerald-400'
              : isError
                ? 'text-destructive hover:text-destructive'
                : 'text-muted-foreground hover:text-foreground'
          )}
          title={
            isError
              ? `Fehler: ${sync?.message ?? ''}`
              : isSyncing
                ? 'Synchronisiert …'
                : isSyncedOk
                  ? 'Synchronisiert. Klicken zum Aktualisieren.'
                  : 'Synchronisieren'
          }
        >
          {isSyncing ? (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          ) : isError ? (
            <AlertCircle className="h-3 w-3" />
          ) : isSyncedOk ? (
            <Check className="h-3.5 w-3.5 stroke-[2.5]" strokeLinecap="round" strokeLinejoin="round" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
        </button>
      </div>

      {accountOpen && (
        <ul className="relative mt-1 ml-3 space-y-0.5 pl-2">
          <AccountColorStripe
            color={account.color}
            className="left-0 top-1 bottom-1 w-0.5 rounded-full opacity-60"
          />
          {visible.length === 0 && !isSyncing && !inlineEdit && (
            <li className="px-2 py-1 text-[10px] text-muted-foreground/60">Noch keine Ordner</li>
          )}
          {visible.map((node) => (
            <SidebarFolderRow
              key={node.folder.id}
              node={node}
              isSelected={node.folder.id === selectedFolderId}
              isCollapsed={collapsedFolders.has(node.folder.remoteId)}
              isRenaming={inlineEdit?.mode === 'rename' && inlineEdit.folderId === node.folder.id}
              renamingInitialValue={inlineEdit?.initialValue ?? ''}
              onSelect={(): void => onSelect(node.folder.id)}
              onToggle={(): void => toggleFolder(node.folder.remoteId)}
              onContext={(e): void => onContextFolder(e, node.folder)}
              onRenameSubmit={onInlineSubmit}
              onRenameCancel={onInlineCancel}
              onToggleQuickAccess={(): void => onToggleFolderQuickAccess(node.folder)}
              onMailDropToFolder={onMailDropToFolder}
            />
          ))}

          {inlineEdit?.mode === 'create' && inlineEdit.parentFolderId === null && (
            <li>
              <SidebarFolderInlineEditor
                initialValue={inlineEdit.initialValue}
                depth={0}
                onSubmit={onInlineSubmit}
                onCancel={onInlineCancel}
              />
            </li>
          )}

          {inlineEdit?.mode === 'create' &&
            inlineEdit.parentFolderId != null &&
            (() => {
              const parentNode = visible.find((n) => n.folder.id === inlineEdit.parentFolderId)
              if (!parentNode) return null
              return (
                <li>
                  <SidebarFolderInlineEditor
                    initialValue={inlineEdit.initialValue}
                    depth={parentNode.depth + 1}
                    onSubmit={onInlineSubmit}
                    onCancel={onInlineCancel}
                  />
                </li>
              )
            })()}
        </ul>
      )}
    </div>
  )
}
