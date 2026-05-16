import { describe, expect, it } from 'vitest'
import { CALENDAR_EVENT_ICON_CATALOG } from '@/lib/calendar-event-icons'
import { filterCalendarEventIconCatalog } from '@/lib/calendar-event-icon-search'

describe('filterCalendarEventIconCatalog', () => {
  it('findet Icons per englischem Namen', () => {
    const hits = filterCalendarEventIconCatalog(CALENDAR_EVENT_ICON_CATALOG, 'stethoscope')
    expect(hits.some((h) => h.id === 'stethoscope')).toBe(true)
  })

  it('findet Legacy-ID über Zusatz-Keywords', () => {
    const hits = filterCalendarEventIconCatalog(CALENDAR_EVENT_ICON_CATALOG, 'gesundheit')
    expect(hits.some((h) => h.id === 'first-aid' || h.id === 'stethoscope')).toBe(true)
  })

  it('liefert alle bei leerer Suche', () => {
    expect(filterCalendarEventIconCatalog(CALENDAR_EVENT_ICON_CATALOG, '').length).toBe(
      CALENDAR_EVENT_ICON_CATALOG.length
    )
  })
})
