import { describe, expect, it } from 'vitest'
import { formatPhotonLocation } from './location-search'

describe('formatPhotonLocation', () => {
  it('formatiert Flughafen mit Ort', () => {
    const hit = formatPhotonLocation({
      name: 'Flughafen Wien',
      city: 'Schwechat',
      state: 'Niederösterreich',
      country: 'Österreich'
    })
    expect(hit?.primary).toBe('Flughafen Wien')
    expect(hit?.label).toContain('Schwechat')
  })

  it('formatiert Straßenadresse', () => {
    const hit = formatPhotonLocation({
      street: 'Hauptstraße',
      housenumber: '12',
      city: 'Enns',
      country: 'Österreich'
    })
    expect(hit?.primary).toContain('Hauptstraße')
    expect(hit?.label).toContain('Enns')
  })
})
