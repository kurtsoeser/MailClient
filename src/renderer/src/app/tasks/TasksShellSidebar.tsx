import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { ChevronDown, ChevronRight, Layers, ListTodo, Loader2, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ConnectedAccount, TaskListRow } from '@shared/types'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/Avatar'
import { AccountColorStripe } from '@/components/AccountColorStripe'
import {
  persistTasksSidebarAccountExpanded,
  readTasksSidebarAccountExpanded
} from '@/app/tasks/tasks-sidebar-tree-storage'
import type { TasksViewSelection } from '@/app/tasks/tasks-types'
import {
  moduleColumnHeaderShellBarClass,
  moduleColumnHeaderTitleClass
} from '@/components/ModuleColumnHeader'

export interface TasksShellSidebarProps {
  taskAccounts: ConnectedAccount[]
  profilePhotoDataUrls: Record<string, string>
  listsByAccount: Record<string, TaskListRow[] | undefined>
  listsLoadingByAccount: Record<string, boolean>
  listsErrorByAccount: Record<string, string | null>
  selection: TasksViewSelection | null
  unifiedLoading?: boolean
  onSelectUnified: () => void
  onSelectList: (accountId: string, listId: string) => void
  onRefreshUnified: () => void
  onRefreshAccountLists: (accountId: string) => void
  onAccountExpanded: (accountId: string) => void
  /** Rechtsklick auf Konto-Zeile: Kontofarbe, neue Aufgabe */
  onAccountHeaderContextMenu?: (e: MouseEvent, account: ConnectedAccount) => void
}

function TasksShellSidebarAccountSection({
  account,
  profilePhotoDataUrl,
  lists,
  listsLoading,
  listsError,
  selection,
  onSelectList,
  onRefresh,
  onExpanded,
  onAccountHeaderContextMenu
}: {
  account: ConnectedAccount
  profilePhotoDataUrl?: string
  lists: TaskListRow[] | undefined
  listsLoading: boolean
  listsError: string | null
  selection: TasksViewSelection | null
  onSelectList: (listId: string) => void
  onRefresh: () => void
  onExpanded: () => void
  onAccountHeaderContextMenu?: (e: MouseEvent, account: ConnectedAccount) => void
}): JSX.Element {
  const { t } = useTranslation()
  const [accountOpen, setAccountOpen] = useState(() => readTasksSidebarAccountExpanded(account.id))

  useEffect(() => {
    setAccountOpen(readTasksSidebarAccountExpanded(account.id))
  }, [account.id])

  useEffect(() => {
    persistTasksSidebarAccountExpanded(account.id, accountOpen)
  }, [account.id, accountOpen])

  const onExpandedRef = useRef(onExpanded)
  onExpandedRef.current = onExpanded

  useEffect(() => {
    if (accountOpen) onExpandedRef.current()
  }, [accountOpen, account.id])

  const toggleOpen = (): void => {
    setAccountOpen((v) => !v)
  }

  return (
    <div className="mb-3">
      <div
        className={cn(
          'group flex items-center gap-2 rounded-md px-2 py-2 transition-colors',
          accountOpen ? '' : 'hover:bg-secondary/40'
        )}
        onContextMenu={(e): void => {
          if (!onAccountHeaderContextMenu) return
          onAccountHeaderContextMenu(e, account)
        }}
      >
        <button
          type="button"
          onClick={toggleOpen}
          className="flex h-5 w-4 shrink-0 items-center justify-center text-muted-foreground/70 hover:text-foreground"
          aria-label={
            accountOpen ? t('tasks.shell.accountCollapseAria') : t('tasks.shell.accountExpandAria')
          }
        >
          {accountOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>

        <button
          type="button"
          onClick={toggleOpen}
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
            <span className="block truncate text-xs font-semibold text-foreground">
              {account.displayName || account.email}
            </span>
            <span className="block truncate text-[10px] text-muted-foreground">{account.email}</span>
          </span>
        </button>

        <button
          type="button"
          onClick={(e): void => {
            e.stopPropagation()
            onRefresh()
          }}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition hover:bg-secondary hover:text-foreground group-hover:opacity-100"
          title={t('tasks.shell.refresh')}
          aria-label={t('tasks.shell.refresh')}
        >
          <RefreshCw className={cn('h-3 w-3', listsLoading && 'animate-spin')} />
        </button>
      </div>

      {accountOpen ? (
        <ul className="relative mt-1 ml-3 space-y-0.5 pl-2">
          <AccountColorStripe
            color={account.color}
            className="left-0 top-1 bottom-1 w-0.5 rounded-full opacity-60"
          />
          {listsError ? (
            <li className="px-2 py-1.5 text-[10px] leading-snug text-destructive">{listsError}</li>
          ) : listsLoading && (!lists || lists.length === 0) ? (
            <li className="flex items-center gap-2 px-2 py-1.5 text-[10px] text-muted-foreground">
              <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
              {t('tasks.shell.listsLoading')}
            </li>
          ) : !lists || lists.length === 0 ? (
            <li className="px-2 py-1.5 text-[10px] text-muted-foreground">{t('tasks.shell.listsEmpty')}</li>
          ) : (
            lists.map((L) => {
              const active =
                selection?.kind === 'list' &&
                selection.accountId === account.id &&
                selection.listId === L.id
              return (
                <li key={L.id}>
                  <button
                    type="button"
                    onClick={(): void => onSelectList(L.id)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] transition-colors',
                      active
                        ? 'bg-primary/15 font-medium text-foreground'
                        : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
                    )}
                    title={L.name}
                  >
                    <ListTodo className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{L.name}</span>
                  </button>
                </li>
              )
            })
          )}
        </ul>
      ) : null}
    </div>
  )
}

export function TasksShellSidebar({
  taskAccounts,
  profilePhotoDataUrls,
  listsByAccount,
  listsLoadingByAccount,
  listsErrorByAccount,
  selection,
  unifiedLoading = false,
  onSelectUnified,
  onSelectList,
  onRefreshUnified,
  onRefreshAccountLists,
  onAccountExpanded,
  onAccountHeaderContextMenu
}: TasksShellSidebarProps): JSX.Element {
  const { t } = useTranslation()
  const unifiedActive = selection?.kind === 'unified'

  return (
    <aside className="glass-sidebar flex h-full w-full flex-col text-sidebar-foreground">
      <header className={cn(moduleColumnHeaderShellBarClass, 'shrink-0 border-b border-border')}>
        <span className={moduleColumnHeaderTitleClass}>{t('tasks.shell.title')}</span>
      </header>
      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 pt-3">
        {taskAccounts.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">{t('tasks.shell.noAccounts')}</p>
        ) : (
          <>
            <div className="mb-3">
              <div
                className={cn(
                  'group flex items-center gap-2 rounded-md px-2 py-2 transition-colors',
                  unifiedActive ? 'bg-primary/10' : 'hover:bg-secondary/40'
                )}
              >
                <button
                  type="button"
                  onClick={onSelectUnified}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <Layers className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                  <span className="truncate text-xs font-semibold text-foreground">
                    {t('tasks.shell.unifiedTitle')}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={(e): void => {
                    e.stopPropagation()
                    onRefreshUnified()
                  }}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
                  title={t('tasks.shell.refreshUnified')}
                  aria-label={t('tasks.shell.refreshUnified')}
                >
                  <RefreshCw className={cn('h-3 w-3', unifiedLoading && 'animate-spin')} />
                </button>
              </div>
            </div>

            {taskAccounts.map((account) => (
              <TasksShellSidebarAccountSection
                key={account.id}
                account={account}
                profilePhotoDataUrl={profilePhotoDataUrls[account.id]}
                lists={listsByAccount[account.id]}
                listsLoading={listsLoadingByAccount[account.id] === true}
                listsError={listsErrorByAccount[account.id] ?? null}
                selection={selection}
                onSelectList={(listId): void => onSelectList(account.id, listId)}
                onRefresh={(): void => onRefreshAccountLists(account.id)}
                onExpanded={(): void => onAccountExpanded(account.id)}
                onAccountHeaderContextMenu={onAccountHeaderContextMenu}
              />
            ))}
          </>
        )}
      </nav>
    </aside>
  )
}
