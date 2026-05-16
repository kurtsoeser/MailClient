import type { NoteSection, UserNoteListItem } from '@shared/types'

export interface NoteSectionTreeNode {
  section: NoteSection
  depth: number
  notes: UserNoteListItem[]
  children: NoteSectionTreeNode[]
}

export interface NoteSectionTree {
  ungroupedNotes: UserNoteListItem[]
  roots: NoteSectionTreeNode[]
}

export function sortNotesByOrder(items: UserNoteListItem[]): UserNoteListItem[] {
  return [...items].sort((a, b) => {
    const o = a.sortOrder - b.sortOrder
    if (o !== 0) return o
    return b.updatedAt.localeCompare(a.updatedAt)
  })
}

function sortSections(a: NoteSection, b: NoteSection): number {
  const o = a.sortOrder - b.sortOrder
  if (o !== 0) return o
  return a.id - b.id
}

export function buildNoteSectionTree(sections: NoteSection[], notes: UserNoteListItem[]): NoteSectionTree {
  const notesBySection = new Map<number, UserNoteListItem[]>()
  for (const note of notes) {
    if (note.sectionId == null) continue
    const list = notesBySection.get(note.sectionId) ?? []
    list.push(note)
    notesBySection.set(note.sectionId, list)
  }

  const childrenByParent = new Map<number | null, NoteSection[]>()
  for (const section of sections) {
    const key = section.parentId ?? null
    const list = childrenByParent.get(key) ?? []
    list.push(section)
    childrenByParent.set(key, list)
  }
  for (const list of childrenByParent.values()) {
    list.sort(sortSections)
  }

  const walk = (parentId: number | null, depth: number): NoteSectionTreeNode[] => {
    const siblings = childrenByParent.get(parentId) ?? []
    return siblings.map((section) => ({
      section,
      depth,
      notes: sortNotesByOrder(notesBySection.get(section.id) ?? []),
      children: walk(section.id, depth + 1)
    }))
  }

  const ungrouped = notes.filter((n) => n.sectionId == null)

  return {
    ungroupedNotes: sortNotesByOrder(ungrouped),
    roots: walk(null, 0)
  }
}

export function flattenSectionTree(roots: NoteSectionTreeNode[]): Array<{ section: NoteSection; depth: number }> {
  const out: Array<{ section: NoteSection; depth: number }> = []
  const visit = (nodes: NoteSectionTreeNode[]): void => {
    for (const node of nodes) {
      out.push({ section: node.section, depth: node.depth })
      visit(node.children)
    }
  }
  visit(roots)
  return out
}

/** Einrueckung fuer Dropdowns (Detail-Spalte). */
export function formatSectionOptionLabel(name: string, depth: number): string {
  const prefix = depth > 0 ? `${'  '.repeat(depth)}↳ ` : ''
  return `${prefix}${name}`
}

export function sectionHasVisibleContent(node: NoteSectionTreeNode): boolean {
  if (node.notes.length > 0) return true
  return node.children.some(sectionHasVisibleContent)
}
