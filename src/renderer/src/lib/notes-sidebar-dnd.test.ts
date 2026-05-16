import { describe, expect, it } from 'vitest'
import {
  NOTE_DROP_UNGROUPED,
  noteDragId,
  noteSectionDropId,
  parseNoteDragId,
  parseNoteSectionDropId
} from './notes-sidebar-dnd'

describe('notes-sidebar-dnd', () => {
  it('roundtrips note drag ids', () => {
    expect(parseNoteDragId(noteDragId(42))).toBe(42)
    expect(parseNoteDragId('invalid')).toBeNull()
  })

  it('parses section drop targets', () => {
    expect(parseNoteSectionDropId(NOTE_DROP_UNGROUPED)).toEqual({ sectionId: null })
    expect(parseNoteSectionDropId(noteSectionDropId(7))).toEqual({ sectionId: 7 })
    expect(parseNoteSectionDropId('note-drop:sec:0')).toBeNull()
  })
})
