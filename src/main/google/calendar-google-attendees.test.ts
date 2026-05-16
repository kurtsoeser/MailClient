import { describe, expect, it } from 'vitest'
import { buildGoogleAttendees } from './calendar-google'

describe('buildGoogleAttendees', () => {
  it('dedupliziert E-Mail-Adressen', () => {
    expect(buildGoogleAttendees(['a@x.com', 'A@x.com', 'b@y.org'])).toEqual([
      { email: 'a@x.com' },
      { email: 'b@y.org' }
    ])
  })

  it('filtert ungueltige Eintraege', () => {
    expect(buildGoogleAttendees(['kein-email', '', '  '])).toEqual([])
  })
})
