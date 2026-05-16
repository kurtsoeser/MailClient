import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ConnectedAccount, UserNoteListItem } from '@shared/types'
import { AccountColorStripe } from '@/components/AccountColorStripe'
import { Avatar } from '@/components/Avatar'
import { cn } from '@/lib/utils'
import {
  LOCAL_NOTES_ACCOUNT_KEY,
  buildNoteAccountBuckets
} from '@/lib/notes-sidebar-accounts'
import { isAccountNavSelected, type NotesNavSelection } from '@/lib/notes-nav-selection'
import { noteAccountDropId } from '@/lib/notes-sidebar-dnd'
import { NotesDropZone } from '@/app/notes/notes-dnd-ui'
import {
  persistNotesAccountSidebarOpen,
  readNotesAccountSidebarOpen
} from '@/lib/notes-sidebar-storage'

export function NotesSidebarAccounts({
  accounts,
  notes,
  selection,
  onSelectAccount
}: {
  accounts: ConnectedAccount[]
  notes: UserNoteListItem[]
  selection: NotesNavSelection
  onSelectAccount: (accountKey: string) => void
}): JSX.Element {
  const { t } = useTranslation()
  const buckets = useMemo(() => buildNoteAccountBuckets(accounts, notes), [accounts, notes])
  const [accountOpen, setAccountOpen] = useState<Record<string, boolean>>(() =>
    readNotesAccountSidebarOpen()
  )

  useEffect(() => {
    persistNotesAccountSidebarOpen(accountOpen)
  }, [accountOpen])

  const accountById = useMemo(
    () => new Map(accounts.map((a) => [a.id, a] as const)),
    [accounts]
  )

  if (buckets.length === 0) {
    return <div className="px-3 py-4 text-xs text-muted-foreground">{t('notes.shell.empty')}</div>
  }

  return (
    <div className="space-y-1 px-1 pb-2">
      {buckets.map((bucket) => {
        const account = accountById.get(bucket.accountId)
        const isLocal = bucket.accountId === LOCAL_NOTES_ACCOUNT_KEY
        const displayName = isLocal
          ? t('notes.shell.localAccount')
          : account?.displayName || account?.email || bucket.accountId
        const email = isLocal ? '' : account?.email ?? ''
        const color = account?.color ?? 'bg-muted'
        const selected = isAccountNavSelected(bucket.accountId, selection)

        return (
          <NotesDropZone key={bucket.accountId} id={noteAccountDropId(bucket.accountId)}>
            <button
              type="button"
              onClick={(): void => onSelectAccount(bucket.accountId)}
              className={cn(
                'relative flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                selected ? 'bg-primary/15' : 'hover:bg-secondary/40'
              )}
              title={email || displayName}
            >
              {!isLocal ? (
                <AccountColorStripe
                  color={color}
                  className="absolute bottom-1 left-0 top-1 w-0.5 rounded-full opacity-60"
                />
              ) : null}
              {isLocal ? (
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
                  ···
                </span>
              ) : (
                <Avatar
                  name={account?.displayName}
                  email={account?.email}
                  bgClass={color}
                  accountColor={color}
                  initials={account?.initials}
                  size="sm"
                />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-foreground">{displayName}</span>
                {email ? (
                  <span className="block truncate text-[10px] text-muted-foreground">{email}</span>
                ) : null}
              </span>
              <span className="shrink-0 pr-1 text-[10px] tabular-nums text-muted-foreground">
                {bucket.notes.length}
              </span>
            </button>
          </NotesDropZone>
        )
      })}
    </div>
  )
}
