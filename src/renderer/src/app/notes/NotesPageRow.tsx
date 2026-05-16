import { useEffect, useRef, useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { GripVertical } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { UserNoteListItem } from '@shared/types'
import { cn } from '@/lib/utils'
import { noteDragId } from '@/lib/notes-sidebar-dnd'
import { NoteDisplayIcon } from '@/components/NoteDisplayIcon'
import { CalendarEventIconPicker } from '@/components/CalendarEventIconPicker'
import { IconColorPickerFooter } from '@/components/IconColorPickerFooter'
import { resolveEntityIconColor } from '@shared/entity-icon-color'
import { noteTitle } from '@/app/notes/notes-display-helpers'

function NoteDragHandle({ noteId }: { noteId: number }): JSX.Element {
  const { t } = useTranslation()
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: noteDragId(noteId)
  })
  const label = t('notes.sections.dragHandleAria')
  return (
    <button
      type="button"
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        'flex h-7 w-5 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground/60',
        'hover:bg-secondary/60 hover:text-foreground active:cursor-grabbing',
        isDragging && 'opacity-50'
      )}
      aria-label={label}
      title={label}
      onClick={(e): void => e.stopPropagation()}
      onDoubleClick={(e): void => e.stopPropagation()}
    >
      <GripVertical className="h-3.5 w-3.5" />
    </button>
  )
}

export function NotesPageRow({
  note,
  active,
  onOpen,
  onRenameTitle,
  onPatchDisplay
}: {
  note: UserNoteListItem
  active: boolean
  onOpen: (note: UserNoteListItem) => void
  onRenameTitle: (note: UserNoteListItem, title: string) => void | Promise<void>
  onPatchDisplay: (
    note: UserNoteListItem,
    patch: { iconId?: string | null; iconColor?: string | null }
  ) => void | Promise<void>
}): JSX.Element {
  const { t } = useTranslation()
  const untitled = t('notes.shell.untitled')
  const displayTitle = noteTitle(note, untitled)

  const [renaming, setRenaming] = useState(false)
  const [draftTitle, setDraftTitle] = useState(displayTitle)
  const renameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!renaming) setDraftTitle(displayTitle)
  }, [displayTitle, renaming])

  useEffect(() => {
    if (renaming) renameInputRef.current?.focus()
  }, [renaming])

  const commitRename = (): void => {
    const title = draftTitle.trim()
    setRenaming(false)
    if (!title || title === displayTitle) return
    void onRenameTitle(note, title)
  }

  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-0.5 rounded-md transition-colors',
        active ? 'bg-secondary font-medium text-foreground' : 'hover:bg-secondary/60'
      )}
    >
      <NoteDragHandle noteId={note.id} />
      <CalendarEventIconPicker
        layout="compact"
        openOn="doubleClick"
        iconId={note.iconId}
        iconColorHex={resolveEntityIconColor(note.iconColor)}
        title={displayTitle}
        compactButtonClassName="h-7 w-7 shrink-0 border-0 bg-transparent shadow-none hover:bg-secondary/60"
        triggerIcon={<NoteDisplayIcon note={note} />}
        onIconChange={(iconId): void => void onPatchDisplay(note, { iconId: iconId ?? null })}
        footer={
          <IconColorPickerFooter
            iconColor={note.iconColor}
            onIconColorChange={(iconColor): void => void onPatchDisplay(note, { iconColor })}
          />
        }
      />
      {renaming ? (
        <input
          ref={renameInputRef}
          value={draftTitle}
          onChange={(e): void => setDraftTitle(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-border bg-background py-1.5 pr-2 text-xs text-foreground"
          onKeyDown={(e): void => {
            if (e.key === 'Escape') {
              setDraftTitle(displayTitle)
              setRenaming(false)
            }
            if (e.key === 'Enter') commitRename()
          }}
          onBlur={commitRename}
          onClick={(e): void => e.stopPropagation()}
        />
      ) : (
        <button
          type="button"
          onClick={(): void => onOpen(note)}
          onDoubleClick={(e): void => {
            e.preventDefault()
            e.stopPropagation()
            setDraftTitle(note.title?.trim() ?? displayTitle)
            setRenaming(true)
          }}
          className="min-w-0 flex-1 truncate py-2 pr-2 text-left text-xs"
          title={t('notes.sections.renameDoubleClick')}
        >
          {displayTitle}
        </button>
      )}
    </div>
  )
}
