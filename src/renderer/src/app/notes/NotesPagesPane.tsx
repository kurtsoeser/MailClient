import { Loader2, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { UserNoteListItem } from '@shared/types'
import { NotesPageRow } from '@/app/notes/NotesPageRow'
import { NotesPagesSortMenu } from '@/app/notes/NotesPagesSortMenu'
import type { NotesPagesSortKey } from '@/lib/notes-pages-sort'
import { cn } from '@/lib/utils'
import {
  ModuleColumnHeaderIconButton,
  moduleColumnHeaderIconGlyphClass,
  moduleColumnHeaderOutlineSmClass,
  moduleColumnHeaderShellBarClass,
  moduleColumnHeaderTitleClass
} from '@/components/ModuleColumnHeader'

export function NotesPagesPane({
  title,
  notes,
  loading,
  activeNoteId,
  onOpenNote,
  onRenameNoteTitle,
  onPatchNoteDisplay,
  onCreateNote,
  creating = false,
  pagesSort,
  onPagesSortChange
}: {
  title: string
  notes: UserNoteListItem[]
  loading: boolean
  activeNoteId: number | null
  onOpenNote: (note: UserNoteListItem) => void
  onRenameNoteTitle: (note: UserNoteListItem, title: string) => void | Promise<void>
  onPatchNoteDisplay: (
    note: UserNoteListItem,
    patch: { iconId?: string | null; iconColor?: string | null }
  ) => void | Promise<void>
  onCreateNote: () => void
  creating?: boolean
  pagesSort: NotesPagesSortKey
  onPagesSortChange: (key: NotesPagesSortKey) => void
}): JSX.Element {
  const { t } = useTranslation()

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <header className={moduleColumnHeaderShellBarClass}>
        <div className={cn(moduleColumnHeaderTitleClass, 'min-w-0 truncate')}>{title}</div>
        <ModuleColumnHeaderIconButton
          type="button"
          onClick={onCreateNote}
          disabled={creating}
          aria-label={t('notes.shell.newPage')}
          title={t('notes.shell.newPage')}
        >
          {creating ? (
            <Loader2 className={cn(moduleColumnHeaderIconGlyphClass, 'animate-spin')} />
          ) : (
            <Plus className={moduleColumnHeaderIconGlyphClass} />
          )}
        </ModuleColumnHeaderIconButton>
      </header>
      <NotesPagesSortMenu
        sortKey={pagesSort}
        onSortChange={onPagesSortChange}
        disabled={loading && notes.length === 0}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {loading && notes.length === 0 ? (
          <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t('common.loading')}
          </div>
        ) : notes.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-2 py-8">
            <p className="text-center text-xs text-muted-foreground">{t('notes.shell.pagesEmpty')}</p>
            <button
              type="button"
              onClick={onCreateNote}
              disabled={creating}
              className={cn(
                moduleColumnHeaderOutlineSmClass,
                'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium'
              )}
            >
              {creating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              {t('notes.shell.newPage')}
            </button>
          </div>
        ) : (
          <div className="space-y-0.5">
            {notes.map((note) => (
              <NotesPageRow
                key={note.id}
                note={note}
                active={activeNoteId === note.id}
                onOpen={onOpenNote}
                onRenameTitle={onRenameNoteTitle}
                onPatchDisplay={onPatchNoteDisplay}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
