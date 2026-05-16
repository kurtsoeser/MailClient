import type { NoteSection, UserNoteListItem } from '@shared/types'
import { buildNoteSectionTree, sortNotesByOrder } from '@/lib/notes-section-tree'

export const UNGROUPED_NOTE_SECTION_ID = null

export interface NoteSectionBucket {
  section: NoteSection | null
  notes: UserNoteListItem[]
}

/** Flache Liste (Legacy); neue UI nutzt {@link buildNoteSectionTree}. */
export function buildNoteSectionBuckets(
  sections: NoteSection[],
  notes: UserNoteListItem[]
): NoteSectionBucket[] {
  const tree = buildNoteSectionTree(sections, notes)
  const buckets: NoteSectionBucket[] = []
  if (tree.ungroupedNotes.length) {
    buckets.push({ section: null, notes: tree.ungroupedNotes })
  }
  const walk = (nodes: ReturnType<typeof buildNoteSectionTree>['roots']): void => {
    for (const node of nodes) {
      if (node.notes.length) {
        buckets.push({ section: node.section, notes: node.notes })
      }
      walk(node.children)
    }
  }
  walk(tree.roots)
  return buckets
}

export { sortNotesByOrder }
