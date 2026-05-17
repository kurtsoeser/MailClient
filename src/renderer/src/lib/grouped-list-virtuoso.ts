/** Ab dieser Eintragszahl wird react-virtuoso statt DOM-Map genutzt. */
export const GROUPED_LIST_VIRTUALIZE_THRESHOLD = 48

export type GroupedListVirtuosoHeaderRow = {
  kind: 'header'
  key: string
  collapseKey: string
  collapsed: boolean
}

export type GroupedListVirtuosoItemRow<T> = {
  kind: 'item'
  key: string
  item: T
}

export type GroupedListVirtuosoRow<T> =
  | GroupedListVirtuosoHeaderRow
  | GroupedListVirtuosoItemRow<T>

export function flattenGroupedListForVirtuoso<G, T>(opts: {
  groups: G[]
  flat: boolean
  collapsed: Set<string>
  collapseKey: (group: G) => string
  hasHeader: (group: G) => boolean
  items: (group: G) => T[]
  itemKey: (item: T) => string
}): GroupedListVirtuosoRow<T>[] {
  const rows: GroupedListVirtuosoRow<T>[] = []
  for (const group of opts.groups) {
    const collapseKey = opts.collapseKey(group)
    const isCollapsed = !opts.flat && opts.collapsed.has(collapseKey)
    if (!opts.flat && opts.hasHeader(group)) {
      rows.push({
        kind: 'header',
        key: `hdr:${collapseKey}`,
        collapseKey,
        collapsed: isCollapsed
      })
    }
    if (!isCollapsed) {
      for (const item of opts.items(group)) {
        rows.push({ kind: 'item', key: opts.itemKey(item), item })
      }
    }
  }
  return rows
}

export function countGroupedListItems<G>(groups: G[], items: (group: G) => unknown[]): number {
  let n = 0
  for (const g of groups) n += items(g).length
  return n
}
