import type { WorkItem } from '@shared/work-item'
import { workItemEffectiveSortIso } from '@/app/work-items/work-item-bucket'

/** Liegt der Eintrag im halboffenen Intervall [rangeStart, rangeEnd)? */
export function workItemOverlapsRange(
  item: WorkItem,
  rangeStart: Date,
  rangeEnd: Date
): boolean {
  const startMs = rangeStart.getTime()
  const endMs = rangeEnd.getTime()
  if (item.kind === 'calendar_event') {
    const evStart = Date.parse(item.event.startIso)
    const evEnd = Date.parse(item.event.endIso)
    if (!Number.isFinite(evStart) || !Number.isFinite(evEnd)) return false
    return evEnd > startMs && evStart < endMs
  }
  const iso = workItemEffectiveSortIso(item)
  if (!iso) return false
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return false
  return t >= startMs && t < endMs
}

export function filterWorkItemsInRange(
  items: WorkItem[],
  rangeStart: Date,
  rangeEnd: Date
): WorkItem[] {
  return items.filter((item) => workItemOverlapsRange(item, rangeStart, rangeEnd))
}

export function mergeWorkItemsByStableKey(
  prev: WorkItem[],
  incoming: WorkItem[]
): WorkItem[] {
  const map = new Map<string, WorkItem>()
  for (const item of prev) map.set(item.stableKey, item)
  for (const item of incoming) map.set(item.stableKey, item)
  return [...map.values()]
}
