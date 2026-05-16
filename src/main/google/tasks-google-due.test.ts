import { describe, expect, it } from 'vitest'
import { dueIsoToGoogleTasksDue } from './tasks-google-due'

describe('dueIsoToGoogleTasksDue', () => {
  it('wandelt YYYY-MM-DD in RFC-3339 Mitternacht UTC um', () => {
    expect(dueIsoToGoogleTasksDue('2026-05-21')).toBe('2026-05-21T00:00:00.000Z')
  })

  it('nutzt Kalendertag aus ISO mit Uhrzeit', () => {
    expect(dueIsoToGoogleTasksDue('2026-05-21T21:59:59.000Z')).toBe('2026-05-21T00:00:00.000Z')
    expect(dueIsoToGoogleTasksDue('2026-05-21T10:00:00.000+02:00')).toBe('2026-05-21T00:00:00.000Z')
  })

  it('lehnt ungültige Werte ab', () => {
    expect(() => dueIsoToGoogleTasksDue('invalid')).toThrow('Ungültiges Fälligkeitsdatum.')
  })
})
