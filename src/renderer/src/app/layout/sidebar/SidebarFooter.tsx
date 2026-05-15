import { Plus } from 'lucide-react'
import { Avatar } from '@/components/Avatar'
import { StatusDot } from '@/components/StatusDot'
import { useTranslation } from 'react-i18next'
import type { ConnectedAccount, SyncStatus } from '@shared/types'

function accountSyncDotProps(sync: SyncStatus | undefined): {
  variant: 'done' | 'syncing' | 'flagged'
  pulse: boolean
} {
  const state = sync?.state ?? 'idle'
  if (state === 'error') {
    return { variant: 'flagged', pulse: false }
  }
  if (state === 'syncing-folders' || state === 'syncing-messages') {
    return { variant: 'syncing', pulse: true }
  }
  return { variant: 'done', pulse: false }
}

export function SidebarFooter({
  accounts,
  profilePhotoDataUrls,
  syncByAccount,
  onOpenAccountDialog
}: {
  accounts: ConnectedAccount[]
  profilePhotoDataUrls: Record<string, string>
  syncByAccount: Record<string, SyncStatus>
  onOpenAccountDialog: () => void
}): JSX.Element {
  const { t } = useTranslation()

  return (
    <button
      type="button"
      onClick={onOpenAccountDialog}
      className="group flex w-full items-center gap-2 border-t border-border/60 bg-sidebar px-3 py-2 text-left transition-colors hover:bg-secondary/40"
      title={t('sidebar.footerTitle')}
      aria-label={t('sidebar.openSettingsAria')}
    >
      <div className="flex shrink-0 -space-x-1">
        {accounts.length === 0 ? (
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground ring-2 ring-sidebar">
            ?
          </div>
        ) : (
          accounts.map((acc, index) => {
            const sync = syncByAccount[acc.id]
            const { variant, pulse } = accountSyncDotProps(sync)
            const state = sync?.state ?? 'idle'
            const statusText =
              state === 'error'
                ? t('sidebar.statusError')
                : state === 'syncing-folders' || state === 'syncing-messages'
                  ? t('sidebar.statusSyncing')
                  : t('sidebar.statusOnline')
            const tip = `${acc.displayName} (${acc.email}) — ${statusText}`
            return (
              <span
                key={acc.id}
                className="relative isolate inline-flex rounded-full ring-1 ring-sidebar"
                style={{ zIndex: index + 1 }}
              >
                <Avatar
                  name={acc.displayName}
                  email={acc.email}
                  bgClass={acc.color}
                  accountColor={acc.color}
                  initials={acc.initials}
                  imageSrc={profilePhotoDataUrls[acc.id]}
                  size="sm"
                  title={tip}
                />
                <span
                  className="pointer-events-none absolute bottom-0 right-0 z-10 flex h-3 w-3 items-center justify-center rounded-full border-2 border-sidebar bg-sidebar shadow-sm"
                  title={statusText}
                >
                  <StatusDot variant={variant} size="xs" pulse={pulse} />
                </span>
              </span>
            )
          })
        )}
      </div>
      <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
        {accounts.length === 0
          ? t('sidebar.accountCountNone')
          : accounts.length === 1
            ? t('sidebar.accountCountOne')
            : t('sidebar.accountCountMany', { count: accounts.length })}
      </span>
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors group-hover:text-foreground"
        aria-hidden
      >
        <Plus className="h-3.5 w-3.5" />
      </span>
    </button>
  )
}
