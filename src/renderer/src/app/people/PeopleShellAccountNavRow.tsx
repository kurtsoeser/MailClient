import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { AlertCircle, ChevronRight, GripVertical, Loader2, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ConnectedAccount } from '@shared/types'
import { Avatar } from '@/components/Avatar'
import { cn } from '@/lib/utils'

export function PeopleShellSortableAccountNavRow({
  account,
  profilePhotoDataUrl,
  contactCount,
  active,
  showDragHandle,
  syncSpin,
  syncDisabled,
  syncError,
  syncErrorMessage,
  onSelect,
  onSync
}: {
  account: ConnectedAccount
  profilePhotoDataUrl?: string
  contactCount: number
  active: boolean
  showDragHandle: boolean
  /** Loader im Sync-Button (dieses Konto oder globaler Sync). */
  syncSpin: boolean
  /** Sync-Button deaktivieren (anderes Konto sync't / global). */
  syncDisabled: boolean
  syncError: boolean
  /** Kurztext fuer Tooltip bei Fehler */
  syncErrorMessage?: string | null
  onSelect: () => void
  onSync: () => void
}): JSX.Element {
  const { t } = useTranslation()
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
      aria-label={t('people.shell.accountSortAria')}
      title={t('people.shell.accountSortTitle')}
      {...attributes}
      {...listeners}
    >
      <GripVertical className="h-3 w-3" />
    </button>
  ) : (
    <span className="w-4 shrink-0" aria-hidden />
  )

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn('group mb-1', isDragging && 'opacity-90')}
    >
      <div
        className={cn(
          'flex items-center gap-1.5 rounded-md px-1.5 py-2 transition-colors',
          active ? 'bg-primary/15' : 'hover:bg-secondary/40'
        )}
      >
        {dragHandle}
        <span
          className="flex h-5 w-4 shrink-0 items-center justify-center text-muted-foreground/60"
          aria-hidden
        >
          <ChevronRight className="h-3 w-3" />
        </span>

        <button
          type="button"
          onClick={onSelect}
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
                {account.displayName?.trim() || account.email}
              </span>
              <span className="shrink-0 text-[10px] font-medium tabular-nums text-muted-foreground">
                {t('people.shell.countSuffix', { count: contactCount })}
              </span>
            </span>
            <span className="block truncate text-[10px] text-muted-foreground">{account.email}</span>
          </span>
        </button>

        <button
          type="button"
          onClick={(e): void => {
            e.stopPropagation()
            onSync()
          }}
          disabled={syncDisabled}
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-secondary disabled:opacity-40',
            syncError ? 'text-destructive hover:text-destructive' : 'text-muted-foreground hover:text-foreground'
          )}
          title={
            syncError && syncErrorMessage?.trim()
              ? `${t('people.shell.accountSyncTitle')}: ${syncErrorMessage.trim()}`
              : t('people.shell.accountSyncTitle')
          }
          aria-label={t('people.shell.accountSyncAria')}
        >
          {syncSpin ? (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          ) : syncError ? (
            <AlertCircle className="h-3 w-3" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
        </button>
      </div>
    </div>
  )
}
