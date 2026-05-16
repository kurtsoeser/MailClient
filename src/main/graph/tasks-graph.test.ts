import { describe, expect, it } from 'vitest'
import { dueIsoFromClientInput } from './tasks-graph'

describe('dueIsoFromClientInput', () => {
  it('wandelt YYYY-MM-DD in Storage-ISO', () => {
    expect(dueIsoFromClientInput('2026-05-21')).toBe('2026-05-21T12:00:00.000Z')
  })

  it('null bei leerer Fälligkeit', () => {
    expect(dueIsoFromClientInput(null)).toBeNull()
    expect(dueIsoFromClientInput('')).toBeNull()
  })
})
