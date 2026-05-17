import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { ConnectedAccount, NoteSection, UserNoteListItem } from '@shared/types'
import { cn } from '@/lib/utils'
import { NotesSidebarAccounts } from '@/app/notes/NotesSidebarAccounts'
import { NotesSidebarSections } from '@/app/notes/NotesSidebarSections'
import type { NotesNavSelection, NotesSectionsNavScope } from '@/lib/notes-nav-selection'
import {
  type NotesSidebarListMode,
  persistNotesSidebarListMode
} from '@/lib/notes-sidebar-storage'

export function NotesSidebarList({
  accounts,
  sections,
  notes,
  listMode,
  onListModeChange,
  navSelection,
  onSelectScope,
  onSelectAccount,
  onSectionsChanged
}: {
  accounts: ConnectedAccount[]
  sections: NoteSection[]
  notes: UserNoteListItem[]
  listMode: NotesSidebarListMode
  onListModeChange: (mode: NotesSidebarListMode) => void
  navSelection: NotesNavSelection
  onSelectScope: (scope: NotesSectionsNavScope) => void
  onSelectAccount: (accountKey: string) => void
  onSectionsChanged: () => void
}): JSX.Element {
  const { t } = useTranslation()

  useEffect(() => {
    persistNotesSidebarListMode(listMode)
  }, [listMode])

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 space-y-2 px-2 pt-2">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {listMode === 'accounts'
            ? t('calendar.shell.accountsSection')
            : t('calendar.shell.sidebarListModeSections')}
        </p>
        <div className="flex rounded-lg bg-muted/50 p-0.5">
          <button
            type="button"
            onClick={(): void => onListModeChange('accounts')}
            className={cn(
              'flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors',
              listMode === 'accounts'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground'
            )}
          >
            {t('calendar.shell.sidebarListModeAccounts')}
          </button>
          <button
            type="button"
            onClick={(): void => onListModeChange('sections')}
            className={cn(
              'flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors',
              listMode === 'sections'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground'
            )}
          >
            {t('calendar.shell.sidebarListModeSections')}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {listMode === 'accounts' ? (
          <NotesSidebarAccounts
            accounts={accounts}
            notes={notes}
            selection={navSelection}
            onSelectAccount={onSelectAccount}
          />
        ) : (
          <NotesSidebarSections
            embedded
            sections={sections}
            notes={notes}
            selection={navSelection}
            onSelectScope={onSelectScope}
            onSectionsChanged={onSectionsChanged}
          />
        )}
      </div>
    </div>
  )
}
