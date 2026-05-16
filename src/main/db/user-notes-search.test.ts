import { describe, expect, it } from 'vitest'
import { normalizeMessagesFtsMatchQuery } from './messages-repo'

describe('notes FTS query', () => {
  it('requires at least two characters per token', () => {
    expect(normalizeMessagesFtsMatchQuery('a')).toBeNull()
    expect(normalizeMessagesFtsMatchQuery('ab')).toBe('ab*')
    expect(normalizeMessagesFtsMatchQuery('foo bar')).toBe('foo* bar*')
  })
})
