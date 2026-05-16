import { AlertCircle, Check, Loader2, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SyncStatus } from '@shared/types'

export function AccountSyncStatusButton({
  sync,
  onSync,
  disabled = false,
  syncedTitle,
  syncingTitle,
  syncTitle,
  errorTitlePrefix,
  className
}: {
  sync?: SyncStatus
  onSync: () => void
  disabled?: boolean
  syncedTitle: string
  syncingTitle: string
  syncTitle: string
  errorTitlePrefix: string
  className?: string
}): JSX.Element {
  const isSyncing = Boolean(sync && sync.state.startsWith('syncing'))
  const isError = sync?.state === 'error'
  const isSyncedOk = sync?.state === 'idle'

  return (
    <button
      type="button"
      onClick={(e): void => {
        e.stopPropagation()
        onSync()
      }}
      disabled={disabled || isSyncing}
      className={cn(
        'flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-secondary disabled:opacity-40',
        isSyncedOk
          ? 'text-emerald-500 hover:text-emerald-400'
          : isError
            ? 'text-destructive hover:text-destructive'
            : 'text-muted-foreground hover:text-foreground',
        className
      )}
      title={
        isError
          ? `${errorTitlePrefix}: ${sync?.message ?? ''}`
          : isSyncing
            ? syncingTitle
            : isSyncedOk
              ? syncedTitle
              : syncTitle
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
  )
}
