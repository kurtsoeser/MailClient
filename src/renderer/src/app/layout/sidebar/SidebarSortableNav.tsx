import { useSortable } from '@dnd-kit/sortable'
import type { UniqueIdentifier } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'
import type { ConnectedAccount, MailFolder } from '@shared/types'
import { SidebarFavoriteFolderRow } from '@/app/layout/sidebar/SidebarFolderRows'

export function SortableSidebarFavoriteRow({
  folder,
  account,
  isSelected,
  onSelect,
  onContext,
  onUnfavorite,
  onMailDropToFolder
}: {
  folder: MailFolder
  account: ConnectedAccount
  isSelected: boolean
  onSelect: () => void
  onContext: (e: React.MouseEvent) => void
  onUnfavorite: () => void
  onMailDropToFolder?: (folder: MailFolder, e: React.DragEvent) => void
}): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: folder.id
  })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging ? { position: 'relative', zIndex: 2, opacity: 0.92 } : {})
  }
  return (
    <li ref={setNodeRef} style={style} className="list-none">
      <SidebarFavoriteFolderRow
        folder={folder}
        account={account}
        isSelected={isSelected}
        onSelect={onSelect}
        onContext={onContext}
        onUnfavorite={onUnfavorite}
        onMailDropToFolder={onMailDropToFolder}
        rowSortableProps={{ attributes, listeners }}
      />
    </li>
  )
}

export function SortableSidebarNavButton({
  id,
  icon: Icon,
  iconClass,
  label,
  count,
  disabled,
  onClick,
  onContextMenu,
  isSelected,
  dragTitle,
  dragAria
}: {
  id: UniqueIdentifier
  icon: React.ComponentType<{ className?: string }>
  iconClass?: string
  label: string
  count?: number
  disabled?: boolean
  onClick?: () => void
  onContextMenu?: (e: React.MouseEvent) => void
  isSelected?: boolean
  dragTitle: string
  dragAria: string
}): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id
  })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging ? { position: 'relative', zIndex: 2, opacity: 0.92 } : {})
  }
  const isInactive = disabled === true || !onClick
  return (
    <li ref={setNodeRef} style={style} className="list-none">
      <button
        type="button"
        {...attributes}
        {...listeners}
        onClick={(): void => {
          if (isInactive) return
          onClick?.()
        }}
        onContextMenu={onContextMenu}
        title={dragTitle}
        aria-label={isInactive ? label : `${label}. ${dragAria}`}
        aria-disabled={isInactive ? true : undefined}
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
          isInactive
            ? 'cursor-not-allowed text-muted-foreground/60'
            : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
          isSelected && 'bg-secondary/80 text-foreground'
        )}
      >
        <Icon className={cn('h-3.5 w-3.5 shrink-0', iconClass)} />
        <span className="flex-1 truncate text-left">{label}</span>
        {count !== undefined && count > 0 && (
          <span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums text-muted-foreground">
            {count}
          </span>
        )}
      </button>
    </li>
  )
}
