import { describe, expect, it } from 'vitest'
import { cn } from './utils'

describe('cn', () => {
  it('fuehrt Klassen zusammen', () => {
    expect(cn('a', false && 'b', 'c')).toMatch(/a/)
    expect(cn('a', 'c')).toContain('a')
    expect(cn('a', 'c')).toContain('c')
  })

  it('merge konfligierende Tailwind-Utilities (tailwind-merge)', () => {
    expect(cn('px-2', 'px-4')).toMatch(/px-4/)
    expect(cn('p-2', 'p-4')).toMatch(/p-4/)
  })
})
