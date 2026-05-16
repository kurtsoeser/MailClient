import { describe, expect, it } from 'vitest'
import { buildPhotonSearchUrl, PHOTON_SEARCH_LAYERS } from './location-search'

describe('buildPhotonSearchUrl', () => {
  it('nutzt gueltige Photon-layer-Werte (kein kommaseparierter layer-Parameter)', () => {
    const url = buildPhotonSearchUrl('Steyr', 'de')
    expect(url).toContain('q=Steyr')
    expect(url).not.toContain('layer=address')
    for (const layer of PHOTON_SEARCH_LAYERS) {
      expect(url).toContain(`layer=${layer}`)
    }
  })
})
