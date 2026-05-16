import type { CalendarGetEventInput, CalendarGetEventResult } from '@shared/types'
import { getCalendarEventForAccount } from './calendar-service'
import {
  deleteCalendarEventDetails,
  getCalendarEventDetailsFromCache,
  isCalendarEventDetailsFresh,
  upsertCalendarEventDetails
} from './db/calendar-event-details-repo'
import { isAppOnline } from './network-status'

export const CALENDAR_EVENT_DETAILS_STALE_MS = 24 * 60 * 60_000

export async function getCalendarEventCached(
  input: CalendarGetEventInput,
  opts?: { forceRefresh?: boolean }
): Promise<CalendarGetEventResult> {
  const accountId = input.accountId.trim()
  const graphEventId = input.graphEventId.trim()
  const graphCalendarId = input.graphCalendarId?.trim() || null
  const force = opts?.forceRefresh === true

  const cached = getCalendarEventDetailsFromCache(accountId, graphEventId)
  const fresh = isCalendarEventDetailsFresh(accountId, graphEventId, CALENDAR_EVENT_DETAILS_STALE_MS)

  if (!force && cached && fresh) {
    return cached
  }

  if (!force && cached && !fresh && isAppOnline()) {
    void getCalendarEventForAccount({
      accountId,
      graphEventId,
      graphCalendarId
    })
      .then((detail) => {
        upsertCalendarEventDetails(accountId, graphEventId, graphCalendarId, detail)
      })
      .catch((e) => console.warn('[calendar-event-details] Hintergrund-Refresh:', graphEventId, e))
    return cached
  }

  if (!force && cached && !isAppOnline()) {
    return cached
  }

  const detail = await getCalendarEventForAccount({
    accountId,
    graphEventId,
    graphCalendarId
  })
  upsertCalendarEventDetails(accountId, graphEventId, graphCalendarId, detail)
  return detail
}

export { deleteCalendarEventDetails }
