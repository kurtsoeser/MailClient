import { describe, expect, it } from 'vitest'
import {
  capEventInputsForMultiMonthView,
  isMultiMonthFcView,
  MULTI_MONTH_QUARTER_VIEW_ID,
  MULTI_MONTH_YEAR_EVENT_CAP,
  MULTI_MONTH_YEAR_VIEW_ID,
  shouldSkipHeavyCalendarLayersForMultiMonth
} from './calendar-fc-multimonth'

describe('isMultiMonthFcView', () => {
  it('erkennt Jahr- und Quartals-Übersicht', () => {
    expect(isMultiMonthFcView(MULTI_MONTH_YEAR_VIEW_ID)).toBe(true)
    expect(isMultiMonthFcView(MULTI_MONTH_QUARTER_VIEW_ID)).toBe(true)
    expect(isMultiMonthFcView('dayGridMonth')).toBe(false)
  })
})

describe('capEventInputsForMultiMonthView', () => {
  it('begrenzt Events in der Jahresansicht', () => {
    const events = Array.from({ length: MULTI_MONTH_YEAR_EVENT_CAP + 50 }, (_, i) => ({
      id: String(i),
      start: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`
    }))
    const capped = capEventInputsForMultiMonthView(events, MULTI_MONTH_YEAR_VIEW_ID)
    expect(capped).toHaveLength(MULTI_MONTH_YEAR_EVENT_CAP)
  })
})

describe('shouldSkipHeavyCalendarLayersForMultiMonth', () => {
  it('ueberspringt Overlays nur in der Jahresansicht', () => {
    expect(shouldSkipHeavyCalendarLayersForMultiMonth(MULTI_MONTH_YEAR_VIEW_ID)).toBe(true)
    expect(shouldSkipHeavyCalendarLayersForMultiMonth(MULTI_MONTH_QUARTER_VIEW_ID)).toBe(false)
  })
})
