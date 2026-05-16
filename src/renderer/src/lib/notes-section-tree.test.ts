import { describe, expect, it } from 'vitest'
import type { NoteSection, UserNoteListItem } from '@shared/types'
import {
  buildNoteSectionTree,
  flattenSectionTree,
  formatSectionOptionLabel,
  sectionHasVisibleContent
} from '@/lib/notes-section-tree'

function section(id: number, name: string, parentId: number | null = null, sortOrder = id): NoteSection {
  return {
    id,
    name,
    icon: null,
    iconColor: null,
    parentId,
    sortOrder,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  }
}

function note(id: number, sectionId: number | null): UserNoteListItem {
  return {
    id,
    kind: 'standalone',
    messageId: null,
    accountId: null,
    calendarSource: null,
    calendarRemoteId: null,
    eventRemoteId: null,
    title: `Note ${id}`,
    body: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    eventTitleSnapshot: null,
    eventStartIsoSnapshot: null,
    scheduledStartIso: null,
    scheduledEndIso: null,
    scheduledAllDay: false,
    sectionId,
    sortOrder: 0,
    mailSubject: null,
    mailAccountId: null,
    mailFromAddr: null,
    mailFromName: null,
    mailSnippet: null,
    mailSentAt: null,
    mailReceivedAt: null,
    mailIsRead: null,
    mailHasAttachments: null
  }
}

describe('buildNoteSectionTree', () => {
  it('nests sections and assigns notes', () => {
    const sections = [section(1, 'A'), section(2, 'B', 1), section(3, 'C', 2)]
    const notes = [note(10, 2), note(11, null)]
    const tree = buildNoteSectionTree(sections, notes)
    expect(tree.ungroupedNotes).toHaveLength(1)
    expect(tree.roots).toHaveLength(1)
    expect(tree.roots[0]?.section.id).toBe(1)
    expect(tree.roots[0]?.children[0]?.section.id).toBe(2)
    expect(tree.roots[0]?.children[0]?.notes).toHaveLength(1)
    expect(tree.roots[0]?.children[0]?.children[0]?.section.id).toBe(3)
  })
})

describe('flattenSectionTree', () => {
  it('returns depth-first order', () => {
    const sections = [section(1, 'A'), section(2, 'B', 1)]
    const tree = buildNoteSectionTree(sections, [])
    const flat = flattenSectionTree(tree.roots)
    expect(flat.map((f) => f.section.id)).toEqual([1, 2])
    expect(flat[1]?.depth).toBe(1)
  })
})

describe('formatSectionOptionLabel', () => {
  it('indents child labels', () => {
    expect(formatSectionOptionLabel('Child', 2)).toContain('↳')
  })
})

describe('sectionHasVisibleContent', () => {
  it('detects notes in subtree', () => {
    const sections = [section(1, 'A'), section(2, 'B', 1)]
    const tree = buildNoteSectionTree(sections, [note(1, 2)])
    expect(sectionHasVisibleContent(tree.roots[0]!)).toBe(true)
  })
})
