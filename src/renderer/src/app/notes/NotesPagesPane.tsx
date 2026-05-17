import { useCallback, useState } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { NoteSection, UserNoteListItem } from '@shared/types'
import { sectionLabelForNote } from '@/lib/notes-nav-selection'
import { NotesPageRow } from '@/app/notes/NotesPageRow'
import { NotesPagesSortMenu } from '@/app/notes/NotesPagesSortMenu'
import { NoteEntityLinkPickerDialog } from '@/app/notes/NoteEntityLinkPickerDialog'
import type { NotesPagesSortKey } from '@/lib/notes-pages-sort'
import { buildNotesPageContextMenuItems } from '@/lib/notes-page-context-menu'
import { cn } from '@/lib/utils'
import { ContextMenu } from '@/components/ContextMenu'
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
  sections,
  loading,
  activeNoteId,
  onOpenNote,
  onRenameNoteTitle,
  onPatchNoteDisplay,
  onDeleteNote,
  onCopyNote,
  onMoveNote,
  onCreateNote,
  creating = false,
  pagesSort,
  onPagesSortChange,
  showSectionLabels = false
}: {
  title: string
  notes: UserNoteListItem[]
  sections: NoteSection[]
  loading: boolean
  activeNoteId: number | null
  onOpenNote: (note: UserNoteListItem) => void
  onRenameNoteTitle: (note: UserNoteListItem, title: string) => void | Promise<void>
  onPatchNoteDisplay: (
    note: UserNoteListItem,
    patch: { iconId?: string | null; iconColor?: string | null }
  ) => void | Promise<void>
  onDeleteNote: (note: UserNoteListItem) => void | Promise<void>
  onCopyNote: (note: UserNoteListItem) => void | Promise<void>
  onMoveNote: (note: UserNoteListItem, sectionId: number | null) => void | Promise<void>
  onCreateNote: () => void
  creating?: boolean
  pagesSort: NotesPagesSortKey
  onPagesSortChange: (key: NotesPagesSortKey) => void
  showSectionLabels?: boolean
}): JSX.Element {
  const { t } = useTranslation()
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; note: UserNoteListItem } | null>(
    null
  )
  const [linkNoteId, setLinkNoteId] = useState<number | null>(null)

  const openContextMenu = useCallback((note: UserNoteListItem, event: React.MouseEvent): void => {
    setContextMenu({ x: event.clientX, y: event.clientY, note })
  }, [])

  const contextMenuItems =
    contextMenu != null
      ? buildNotesPageContextMenuItems({
          t,
          note: contextMenu.note,
          sections,
          onDelete: onDeleteNote,
          onCopy: onCopyNote,
          onMove: onMoveNote,
          onLink: (note): void => {
            setContextMenu(null)
            setLinkNoteId(note.id)
            onOpenNote(note)
          }
        })
      : []

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
                onContextMenu={openContextMenu}
                sectionLabel={
                  showSectionLabels ? sectionLabelForNote(note, sections, t) : undefined
                }
              />
            ))}
          </div>
        )}
      </div>

      {contextMenu ? (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={(): void => setContextMenu(null)}
        />
      ) : null}

      {linkNoteId != null ? (
        <NoteEntityLinkPickerDialog
          noteId={linkNoteId}
          open
          onClose={(): void => setLinkNoteId(null)}
        />
      ) : null}
    </div>
  )
}
