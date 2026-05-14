import { GripVertical } from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'
import type { ConnectedAccount, MailFolder } from '@shared/types'
import type { SidebarInlineEditState } from '@/app/layout/sidebar/sidebar-types'
import { SidebarAccountFolderSection } from '@/app/layout/sidebar/SidebarAccountFolderSection'

export function SidebarSortableAccountFolderSection({
  account,
  showDragHandle,
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
  showDragHandle: boolean
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
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: account.id
  })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging ? { zIndex: 10, position: 'relative' } : {})
  }
  const dragHandle = showDragHandle ? (
    <button
      type="button"
      className="touch-none flex h-5 w-4 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground/50 hover:bg-secondary/60 hover:text-muted-foreground active:cursor-grabbing"
      aria-label="Konto-Reihenfolge aendern"
      title="Ziehen zum Sortieren"
      {...attributes}
      {...listeners}
    >
      <GripVertical className="h-3 w-3" />
    </button>
  ) : undefined

  return (
    <div ref={setNodeRef} style={style} className={cn('mb-3', isDragging && 'opacity-90')}>
      <SidebarAccountFolderSection
        account={account}
        dragHandle={dragHandle}
        profilePhotoDataUrl={profilePhotoDataUrl}
        folders={folders}
        sync={sync}
        selectedFolderId={selectedFolderId}
        inlineEdit={inlineEdit}
        onSelect={onSelect}
        onSync={onSync}
        onContextAccount={onContextAccount}
        onContextFolder={onContextFolder}
        onNewTopLevel={onNewTopLevel}
        onInlineSubmit={onInlineSubmit}
        onInlineCancel={onInlineCancel}
        onToggleFolderQuickAccess={onToggleFolderQuickAccess}
        onMailDropToFolder={onMailDropToFolder}
      />
    </div>
  )
}
