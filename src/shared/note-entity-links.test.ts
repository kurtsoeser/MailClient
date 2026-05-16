import { describe, expect, it } from 'vitest'
import { noteEntityLinkTargetKey, noteEntityLinkTargetsEqual } from './note-entity-links'

describe('noteEntityLinkTargetsEqual', () => {
  it('compares note targets', () => {
    expect(
      noteEntityLinkTargetsEqual({ kind: 'note', noteId: 1 }, { kind: 'note', noteId: 1 })
    ).toBe(true)
    expect(
      noteEntityLinkTargetsEqual({ kind: 'note', noteId: 1 }, { kind: 'note', noteId: 2 })
    ).toBe(false)
  })

  it('builds stable keys', () => {
    expect(noteEntityLinkTargetKey({ kind: 'mail', messageId: 42 })).toBe('mail:42')
    expect(
      noteEntityLinkTargetKey({
        kind: 'cloud_task',
        accountId: 'a',
        listId: 'l',
        taskId: 't'
      })
    ).toBe('task:a:l:t')
  })
})
