import { describe, expect, it } from 'vitest'
import { graphCalendarColorToDisplayHex, resolveCalendarDisplayHex } from './graph-calendar-colors'

describe('resolveCalendarDisplayHex', () => {
  it('prefers local override over provider hex', () => {
    expect(
      resolveCalendarDisplayHex({
        hexColor: '#4A86E8',
        color: 'lightBlue',
        displayColorOverrideHex: '#AB47BC'
      })
    ).toBe('#AB47BC')
  })

  it('falls back to hex then enum', () => {
    expect(resolveCalendarDisplayHex({ hexColor: '#ff00aa', color: 'lightBlue' })).toBe('#ff00aa')
    expect(resolveCalendarDisplayHex({ hexColor: null, color: 'lightPink' })).toBe(
      graphCalendarColorToDisplayHex(null, 'lightPink')
    )
  })
})
