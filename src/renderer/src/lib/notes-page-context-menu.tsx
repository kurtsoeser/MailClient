import { Copy, FolderInput, Link2, Trash2 } from 'lucide-react'
import type { TFunction } from 'i18next'
import type { NoteSection, UserNoteListItem } from '@shared/types'
import type { ContextMenuItem } from '@/components/ContextMenu'
import { buildNoteSectionTree, type NoteSectionTreeNode } from '@/lib/notes-section-tree'

export interface NotesPageContextHandlers {
  t: TFunction
  note: UserNoteListItem
  sections: NoteSection[]
  onDelete: (note: UserNoteListItem) => void | Promise<void>
  onCopy: (note: UserNoteListItem) => void | Promise<void>
  onMove: (note: UserNoteListItem, sectionId: number | null) => void | Promise<void>
  onLink: (note: UserNoteListItem) => void
}

function flattenSectionNodes(nodes: NoteSectionTreeNode[]): Array<{ id: number; label: string }> {
  const out: Array<{ id: number; label: string }> = []
  const walk = (list: NoteSectionTreeNode[]): void => {
    for (const node of list) {
      const prefix = node.depth > 0 ? `${'  '.repeat(node.depth)}` : ''
      out.push({ id: node.section.id, label: `${prefix}${node.section.name}` })
      walk(node.children)
    }
  }
  walk(nodes)
  return out
}

export function buildNotesPageContextMenuItems(handlers: NotesPageContextHandlers): ContextMenuItem[] {
  const { t, note, sections, onDelete, onCopy, onMove, onLink } = handlers
  const tree = buildNoteSectionTree(sections, [])
  const sectionEntries = flattenSectionNodes(tree.roots)

  const moveSubmenu: ContextMenuItem[] = [
    {
      id: 'move-ungrouped',
      label: t('notes.sections.ungrouped'),
      selected: note.sectionId == null,
      onSelect: (): void => {
        if (note.sectionId == null) return
        void onMove(note, null)
      }
    },
    ...sectionEntries.map((entry) => ({
      id: `move-section-${entry.id}`,
      label: entry.label,
      selected: note.sectionId === entry.id,
      onSelect: (): void => {
        if (note.sectionId === entry.id) return
        void onMove(note, entry.id)
      }
    }))
  ]

  return [
    {
      id: 'notes-page-delete',
      label: t('common.delete'),
      icon: Trash2,
      destructive: true,
      onSelect: (): void => void onDelete(note)
    },
    {
      id: 'notes-page-copy',
      label: t('notes.pagesContextMenu.copy'),
      icon: Copy,
      onSelect: (): void => void onCopy(note)
    },
    { id: 'sep-notes-page-1', label: '', separator: true },
    {
      id: 'notes-page-move',
      label: t('notes.pagesContextMenu.move'),
      icon: FolderInput,
      submenu: moveSubmenu
    },
    {
      id: 'notes-page-link',
      label: t('notes.pagesContextMenu.link'),
      icon: Link2,
      onSelect: (): void => onLink(note)
    }
  ]
}
