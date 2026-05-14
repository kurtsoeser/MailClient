import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core'
import { useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Folder as FolderIcon,
  Star,
  StarOff
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { nativeDragHasMailMessagePayload } from '@/lib/mail-native-dnd'
import { SIDEBAR_WELL_KNOWN_FOLDER_ICONS } from '@/lib/sidebar-well-known-icons'
import { sidebarWellKnownFolderDisplayName } from '@/lib/sidebar-well-known'
import { resolvedAccountColorCss } from '@/lib/avatar-color'
import type { FolderNode } from '@/lib/folder-tree'
import type { ConnectedAccount, MailFolder } from '@shared/types'
import { SidebarFolderInlineEditor } from '@/app/layout/sidebar/SidebarFolderEditor'

export function SidebarFolderRow({
  node,
  isSelected,
  isCollapsed,
  isRenaming,
  renamingInitialValue,
  onSelect,
  onToggle,
  onContext,
  onRenameSubmit,
  onRenameCancel,
  onToggleQuickAccess,
  onMailDropToFolder
}: {
  node: FolderNode
  isSelected: boolean
  isCollapsed: boolean
  isRenaming: boolean
  renamingInitialValue: string
  onSelect: () => void
  onToggle: () => void
  onContext: (e: React.MouseEvent) => void
  onRenameSubmit: (value: string) => Promise<void>
  onRenameCancel: () => void
  onToggleQuickAccess: () => void
  onMailDropToFolder?: (folder: MailFolder, e: React.DragEvent) => void
}): JSX.Element {
  const { folder, depth, children } = node
  const Icon = (folder.wellKnown && SIDEBAR_WELL_KNOWN_FOLDER_ICONS[folder.wellKnown]) || FolderIcon
  const label = sidebarWellKnownFolderDisplayName(folder.wellKnown ?? undefined, folder.name)
  const hasChildren = children.length > 0
  const hasUnread = folder.unreadCount > 0

  const [mailDragOver, setMailDragOver] = useState(false)

  if (isRenaming) {
    return (
      <li>
        <SidebarFolderInlineEditor
          initialValue={renamingInitialValue}
          depth={depth}
          onSubmit={onRenameSubmit}
          onCancel={onRenameCancel}
        />
      </li>
    )
  }

  return (
    <li>
      <div
        className={cn(
          'group/folder flex w-full items-center gap-1 rounded-md text-xs font-medium transition-colors',
          isSelected
            ? 'bg-secondary text-foreground'
            : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
          mailDragOver && onMailDropToFolder && 'ring-2 ring-primary ring-inset bg-primary/5'
        )}
        style={{ paddingLeft: `${4 + depth * 12}px` }}
        onContextMenu={onContext}
        onDragOver={
          onMailDropToFolder
            ? (e): void => {
                if (!nativeDragHasMailMessagePayload(e.dataTransfer)) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
              }
            : undefined
        }
        onDragEnter={
          onMailDropToFolder
            ? (e): void => {
                if (!nativeDragHasMailMessagePayload(e.dataTransfer)) return
                e.preventDefault()
                setMailDragOver(true)
              }
            : undefined
        }
        onDragLeave={
          onMailDropToFolder
            ? (e): void => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setMailDragOver(false)
              }
            : undefined
        }
        onDrop={
          onMailDropToFolder
            ? (e): void => {
                setMailDragOver(false)
                if (!nativeDragHasMailMessagePayload(e.dataTransfer)) return
                e.preventDefault()
                onMailDropToFolder(folder, e)
              }
            : undefined
        }
      >
        <button
          type="button"
          onClick={(e): void => {
            e.stopPropagation()
            if (hasChildren) onToggle()
          }}
          className={cn(
            'flex h-6 w-4 shrink-0 items-center justify-center text-muted-foreground/70',
            !hasChildren && 'pointer-events-none opacity-0'
          )}
          aria-label={isCollapsed ? 'Aufklappen' : 'Zuklappen'}
        >
          {hasChildren &&
            (isCollapsed ? (
              <ChevronRight className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            ))}
        </button>
        <button
          type="button"
          onClick={onSelect}
          className="flex flex-1 items-center gap-2 py-1.5 pr-2 text-left"
          title={folder.name}
        >
          <Icon
            className={cn(
              'h-3.5 w-3.5 shrink-0 transition-colors',
              hasUnread && !isSelected && 'text-primary'
            )}
          />
          <span
            className={cn(
              'flex-1 truncate transition-colors',
              hasUnread && 'font-semibold text-foreground'
            )}
          >
            {label}
          </span>
          {hasUnread && (
            <span className="shrink-0 rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold tabular-nums text-primary">
              {folder.unreadCount > 999 ? '999+' : folder.unreadCount}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={(e): void => {
            e.stopPropagation()
            onToggleQuickAccess()
          }}
          className={cn(
            'shrink-0 rounded p-0.5 transition-colors hover:bg-secondary',
            folder.isFavorite
              ? 'text-status-flagged opacity-100'
              : 'text-muted-foreground/35 opacity-0 hover:text-status-flagged group-hover/folder:opacity-100'
          )}
          title={
            folder.isFavorite ? 'Aus Schnellzugriff entfernen' : 'Zum Schnellzugriff hinzufuegen'
          }
          aria-label={
            folder.isFavorite ? 'Aus Schnellzugriff entfernen' : 'Zum Schnellzugriff hinzufuegen'
          }
        >
          <Star className={cn('h-3 w-3', folder.isFavorite && 'fill-current')} />
        </button>
      </div>
    </li>
  )
}

export function SidebarFavoriteFolderRow({
  folder,
  account,
  isSelected,
  onSelect,
  onContext,
  onUnfavorite,
  onMailDropToFolder,
  rowSortableProps
}: {
  folder: MailFolder
  account: ConnectedAccount
  isSelected: boolean
  onSelect: () => void
  onContext: (e: React.MouseEvent) => void
  onUnfavorite: () => void
  onMailDropToFolder?: (folder: MailFolder, e: React.DragEvent) => void
  /** Zum manuellen Sortieren (Dnd-Kit) auf die Zeilen-`div`-Flaeche legen. */
  rowSortableProps?: {
    attributes: DraggableAttributes
    listeners: DraggableSyntheticListeners | undefined
  }
}): JSX.Element {
  const Icon = (folder.wellKnown && SIDEBAR_WELL_KNOWN_FOLDER_ICONS[folder.wellKnown]) || FolderIcon
  const label = sidebarWellKnownFolderDisplayName(folder.wellKnown ?? undefined, folder.name)
  const [mailDragOver, setMailDragOver] = useState(false)
  return (
    <div
      {...(rowSortableProps?.attributes ?? {})}
      {...(rowSortableProps?.listeners ?? {})}
      className={cn(
        'group/fav flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
        isSelected
          ? 'bg-secondary text-foreground'
          : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
        mailDragOver && onMailDropToFolder && 'ring-2 ring-primary ring-inset bg-primary/5'
      )}
      onContextMenu={onContext}
        onDragOver={
          onMailDropToFolder
            ? (e): void => {
                if (!nativeDragHasMailMessagePayload(e.dataTransfer)) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
              }
            : undefined
        }
        onDragEnter={
          onMailDropToFolder
            ? (e): void => {
                if (!nativeDragHasMailMessagePayload(e.dataTransfer)) return
                e.preventDefault()
                setMailDragOver(true)
              }
            : undefined
        }
        onDragLeave={
          onMailDropToFolder
            ? (e): void => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setMailDragOver(false)
              }
            : undefined
        }
        onDrop={
          onMailDropToFolder
            ? (e): void => {
                setMailDragOver(false)
                if (!nativeDragHasMailMessagePayload(e.dataTransfer)) return
                e.preventDefault()
                onMailDropToFolder(folder, e)
              }
            : undefined
        }
      >
        <Star
          className="h-3.5 w-3.5 shrink-0 fill-status-flagged text-status-flagged"
          aria-hidden
        />
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <button
          type="button"
          onPointerDown={(e): void => {
            e.stopPropagation()
          }}
          onClick={onSelect}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          title={`${label} (${account.email})`}
        >
          <span className="flex-1 truncate">{label}</span>
          {folder.unreadCount > 0 && (
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {folder.unreadCount}
            </span>
          )}
        </button>
        <span
          className="h-2 w-2 shrink-0 rounded-full opacity-80 ring-1 ring-border/40"
          style={{ backgroundColor: resolvedAccountColorCss(account.color) }}
          title={account.email}
        />
        <button
          type="button"
          onPointerDown={(e): void => {
            e.stopPropagation()
          }}
          onClick={(e): void => {
            e.stopPropagation()
            onUnfavorite()
          }}
          className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-secondary hover:text-status-flagged group-hover/fav:opacity-100"
          aria-label="Aus Schnellzugriff entfernen"
          title="Aus Schnellzugriff entfernen"
        >
          <StarOff className="h-3 w-3" />
        </button>
    </div>
  )
}
