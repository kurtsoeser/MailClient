import { startOfDay } from 'date-fns'
import type { ConnectedAccount } from '@shared/types'

import type { WorkItem } from '@shared/work-item'

import { workItemEffectiveSortIso } from '@/app/work-items/work-item-bucket'

import {

  computeWorkItemListLayout,

  type WorkListArrangeBy,

  type WorkListArrangeContext,

  type WorkListChronoOrder,

  type WorkListFilter

} from '@/app/work-items/work-item-list-arrange'

import { workItemsToViews } from '@/app/work-items/work-item-mapper'



export interface MegaDayGroup {

  dayKey: string

  dayLabel: string

  items: WorkItem[]

}



function effectiveSortMs(item: WorkItem): number {

  const iso = workItemEffectiveSortIso(item)

  if (!iso) return Number.POSITIVE_INFINITY

  const t = Date.parse(iso)

  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY

}



function compareItems(a: WorkItem, b: WorkItem, chrono: WorkListChronoOrder, localeCode: string): number {

  const am = effectiveSortMs(a)

  const bm = effectiveSortMs(b)

  if (am !== bm) {

    return chrono === 'newest_on_top' ? bm - am : am - bm

  }

  return a.title.localeCompare(b.title, localeCode.startsWith('de') ? 'de' : 'en', {

    sensitivity: 'base'

  })

}



function filterMegaItems(items: WorkItem[], filter: WorkListFilter, nowMs: number): WorkItem[] {

  const startTodayMs = startOfDay(new Date(nowMs)).getTime()

  return items.filter((item) => {

    if (item.kind === 'calendar_event') {

      const endMs = Date.parse(item.event.endIso)

      switch (filter) {

        case 'all':

          return true

        case 'open':

          return !Number.isFinite(endMs) || endMs >= startTodayMs

        case 'completed':

          return Number.isFinite(endMs) && endMs < startTodayMs

        case 'overdue':

          return false

        default:

          return true

      }

    }

    switch (filter) {

      case 'all':

        return true

      case 'open':

        return !item.completed

      case 'completed':

        return item.completed

      case 'overdue':

        return !item.completed && item.dueAtIso != null && Date.parse(item.dueAtIso) < nowMs

      default:

        return true

    }

  })

}



export function computeMegaTimelineGroups(

  items: WorkItem[],

  filter: WorkListFilter,

  chrono: WorkListChronoOrder,

  arrange: WorkListArrangeBy,

  localeCode: string,

  arrangeCtx: WorkListArrangeContext,

  accountsById: ReadonlyMap<string, ConnectedAccount>,

  timeZone: string,

  nowMs = Date.now()

): MegaDayGroup[] {

  const filtered = filterMegaItems(items, filter, nowMs)

  const itemByKey = new Map(filtered.map((i) => [i.stableKey, i] as const))

  const views = workItemsToViews(filtered, accountsById, timeZone, nowMs)

  const layout = computeWorkItemListLayout(views, arrange, chrono, 'all', arrangeCtx)



  return layout.map((g, idx) => {

    const mapped = g.items

      .map((v) => itemByKey.get(v.stableKey))

      .filter((x): x is WorkItem => x != null)

    mapped.sort((a, b) => compareItems(a, b, chrono, localeCode))



    const dayKey = `${arrange}:${g.key}:${idx}`

    if (arrange === 'none') {

      return { dayKey, dayLabel: '', items: mapped }

    }

    return { dayKey, dayLabel: g.label, items: mapped }

  })

}



export function megaTimelineFilterCounts(

  items: WorkItem[],

  nowMs = Date.now()

): Record<WorkListFilter, number> {

  return {

    all: filterMegaItems(items, 'all', nowMs).length,

    open: filterMegaItems(items, 'open', nowMs).length,

    overdue: filterMegaItems(items, 'overdue', nowMs).length,

    completed: filterMegaItems(items, 'completed', nowMs).length

  }

}


