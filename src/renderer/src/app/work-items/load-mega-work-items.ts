import type { CalendarEventView, ConnectedAccount } from '@shared/types'
import type { WorkItem } from '@shared/work-item'
import { buildCalendarIncludeCalendars } from '@/lib/build-calendar-include-calendars'
import { loadMasterWorkItems } from '@/app/work-items/load-master-work-items'
import { calendarEventToWorkItem } from '@/app/work-items/work-item-mapper'
import { filterWorkItemsInRange } from '@/app/work-items/work-item-range'

export interface MegaWorkItemsLoadResult {
  items: WorkItem[]
  hiddenMailMessageIds: number[]
  calendarEvents: CalendarEventView[]
}

export interface MegaWorkItemsLoadOptions {
  rangeStart: Date
  rangeEnd: Date
  includeCompletedMail?: boolean
}

export async function loadMegaWorkItems(
  taskAccounts: ConnectedAccount[],
  calendarAccounts: ConnectedAccount[],
  opts: MegaWorkItemsLoadOptions
): Promise<MegaWorkItemsLoadResult> {
  const { rangeStart, rangeEnd } = opts
  const startIso = rangeStart.toISOString()
  const endIso = rangeEnd.toISOString()

  const [master, graphEvents] = await Promise.all([
    loadMasterWorkItems(taskAccounts, { includeCompletedMail: opts.includeCompletedMail ?? true }),
    loadCalendarEventsInRange(calendarAccounts, startIso, endIso)
  ])

  const eventItems = graphEvents.map(calendarEventToWorkItem)
  const merged = [...master.items, ...eventItems]
  return {
    items: filterWorkItemsInRange(merged, rangeStart, rangeEnd),
    hiddenMailMessageIds: master.hiddenMailMessageIds,
    calendarEvents: graphEvents
  }
}

async function loadCalendarEventsInRange(
  calendarAccounts: ConnectedAccount[],
  startIso: string,
  endIso: string
): Promise<CalendarEventView[]> {
  const linked = calendarAccounts.filter(
    (a) => a.provider === 'microsoft' || a.provider === 'google'
  )
  if (linked.length === 0) return []
  try {
    const includeCalendars = await buildCalendarIncludeCalendars(linked)
    return await window.mailClient.calendar.listEvents({
      startIso,
      endIso,
      focusCalendar: null,
      includeCalendars
    })
  } catch {
    return []
  }
}
