/**
 * Sidebar-Layout: Konten-Ansicht mit optionalen Untergruppen pro Konto,
 * sowie globale «Sections»-Ansicht (kontoübergreifend).
 * Persistenz: localStorage `mailclient.calendar.sidebarLayoutV1`.
 */

import type { CalendarGraphCalendarRow } from '@shared/types'

export const CAL_SIDEBAR_LAYOUT_KEY = 'mailclient.calendar.sidebarLayoutV1'

/** Einheitlicher Schlüssel für Drag&Drop / Platzierung (`accountId` + Kalender-ID). */
const CAL_KEY_SEP = '\u001d'

export type CalendarSidebarListMode = 'accounts' | 'sections'

export interface SidebarNamedGroup {
  id: string
  name: string
  order: number
}

export interface CalendarSidebarLayoutV1 {
  v: 1
  listMode: CalendarSidebarListMode
  /** Pro Konto: benutzerdefinierte Gruppen (nur Konten-Ansicht). */
  accountGroups: Record<string, SidebarNamedGroup[]>
  /** Konten-Ansicht: Konto -> Gruppen-ID -> geordnete calKeys. */
  accountGroupCalKeys: Record<string, Record<string, string[]>>
  /** Sections-Ansicht: globale Bereiche. */
  globalSections: SidebarNamedGroup[]
  /** Sections-Ansicht: Section-ID -> geordnete calKeys. */
  sectionCalKeys: Record<string, string[]>
}

export function calSidebarKey(accountId: string, graphCalendarId: string): string {
  return `${accountId}${CAL_KEY_SEP}${graphCalendarId}`
}

export function parseCalSidebarKey(key: string): { accountId: string; graphCalendarId: string } | null {
  const i = key.indexOf(CAL_KEY_SEP)
  if (i <= 0) return null
  return { accountId: key.slice(0, i), graphCalendarId: key.slice(i + CAL_KEY_SEP.length) }
}

export const UNGROUPED_BUCKET_ID = '__ungrouped__'

export function defaultSidebarLayout(): CalendarSidebarLayoutV1 {
  return {
    v: 1,
    listMode: 'accounts',
    accountGroups: {},
    accountGroupCalKeys: {},
    globalSections: [],
    sectionCalKeys: {}
  }
}

export function readSidebarLayoutFromStorage(): CalendarSidebarLayoutV1 {
  try {
    const raw = window.localStorage.getItem(CAL_SIDEBAR_LAYOUT_KEY)
    if (!raw) return defaultSidebarLayout()
    const o = JSON.parse(raw) as unknown
    if (!o || typeof o !== 'object' || (o as { v?: unknown }).v !== 1) return defaultSidebarLayout()
    const x = o as Partial<CalendarSidebarLayoutV1>
    return {
      v: 1,
      listMode: x.listMode === 'sections' ? 'sections' : 'accounts',
      accountGroups: sanitizeStringRecord(x.accountGroups, isNamedGroupArray) ?? {},
      accountGroupCalKeys: sanitizeNestedStringArrays(x.accountGroupCalKeys) ?? {},
      globalSections: Array.isArray(x.globalSections) ? x.globalSections.filter(isNamedGroup) : [],
      sectionCalKeys: sanitizeStringRecord(x.sectionCalKeys, isStringArray) ?? {}
    }
  } catch {
    return defaultSidebarLayout()
  }
}

export function persistSidebarLayout(layout: CalendarSidebarLayoutV1): void {
  try {
    window.localStorage.setItem(CAL_SIDEBAR_LAYOUT_KEY, JSON.stringify(layout))
  } catch {
    // ignore
  }
}

function isNamedGroup(x: unknown): x is SidebarNamedGroup {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return typeof o.id === 'string' && o.id.length > 0 && typeof o.name === 'string' && typeof o.order === 'number'
}

function isNamedGroupArray(x: unknown): x is SidebarNamedGroup[] {
  return Array.isArray(x) && x.every(isNamedGroup)
}

function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((s) => typeof s === 'string')
}

function sanitizeStringRecord<T>(
  x: unknown,
  pred: (v: unknown) => v is T
): Record<string, T> | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null
  const out: Record<string, T> = {}
  for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
    if (typeof k !== 'string' || k.length === 0) continue
    if (pred(v)) out[k] = v
  }
  return out
}

function sanitizeNestedStringArrays(x: unknown): Record<string, Record<string, string[]>> | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null
  const out: Record<string, Record<string, string[]>> = {}
  for (const [accId, inner] of Object.entries(x as Record<string, unknown>)) {
    if (typeof accId !== 'string' || !inner || typeof inner !== 'object' || Array.isArray(inner)) continue
    const m: Record<string, string[]> = {}
    for (const [bid, arr] of Object.entries(inner as Record<string, unknown>)) {
      if (typeof bid !== 'string' || !isStringArray(arr)) continue
      m[bid] = arr.filter((s) => s.length > 0)
    }
    out[accId] = m
  }
  return out
}

export function newGroupId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? `g-${crypto.randomUUID()}`
    : `g-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function addAccountGroup(layout: CalendarSidebarLayoutV1, accountId: string, name: string): CalendarSidebarLayoutV1 {
  const g = [...(layout.accountGroups[accountId] ?? [])]
  const order = g.length === 0 ? 0 : Math.max(...g.map((x) => x.order)) + 1
  const id = newGroupId()
  g.push({ id, name: name.trim() || 'Gruppe', order })
  g.sort((a, b) => a.order - b.order)
  return {
    ...layout,
    accountGroups: { ...layout.accountGroups, [accountId]: g },
    accountGroupCalKeys: {
      ...layout.accountGroupCalKeys,
      [accountId]: { ...(layout.accountGroupCalKeys[accountId] ?? {}), [id]: [] }
    }
  }
}

export function addGlobalSection(layout: CalendarSidebarLayoutV1, name: string): CalendarSidebarLayoutV1 {
  const g = [...layout.globalSections]
  const order = g.length === 0 ? 0 : Math.max(...g.map((x) => x.order)) + 1
  const id = newGroupId()
  g.push({ id, name: name.trim() || 'Section', order })
  g.sort((a, b) => a.order - b.order)
  return {
    ...layout,
    globalSections: g,
    sectionCalKeys: { ...layout.sectionCalKeys, [id]: [] }
  }
}

/** Entfernt einen calKey überall aus Platzierungs-Arrays. */
function stripKeyFromNested(targetKey: string, nested: Record<string, Record<string, string[]>>): Record<string, Record<string, string[]>> {
  const out: Record<string, Record<string, string[]>> = {}
  for (const [acc, buckets] of Object.entries(nested)) {
    const nb: Record<string, string[]> = {}
    for (const [bid, keys] of Object.entries(buckets)) {
      nb[bid] = keys.filter((k) => k !== targetKey)
    }
    out[acc] = nb
  }
  return out
}

function stripKeyFromSections(targetKey: string, sectionCalKeys: Record<string, string[]>): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const [sid, keys] of Object.entries(sectionCalKeys)) {
    out[sid] = keys.filter((k) => k !== targetKey)
  }
  return out
}

export function removeCalFromAccountBuckets(layout: CalendarSidebarLayoutV1, calKey: string): CalendarSidebarLayoutV1 {
  return {
    ...layout,
    accountGroupCalKeys: stripKeyFromNested(calKey, layout.accountGroupCalKeys)
  }
}

export function removeCalFromSectionBuckets(layout: CalendarSidebarLayoutV1, calKey: string): CalendarSidebarLayoutV1 {
  return {
    ...layout,
    sectionCalKeys: stripKeyFromSections(calKey, layout.sectionCalKeys)
  }
}

export function moveCalToAccountGroup(
  layout: CalendarSidebarLayoutV1,
  accountId: string,
  calKey: string,
  targetGroupId: string,
  insertIndex: number
): CalendarSidebarLayoutV1 {
  let next: CalendarSidebarLayoutV1 = {
    ...layout,
    accountGroupCalKeys: stripKeyFromNested(calKey, layout.accountGroupCalKeys)
  }
  if (targetGroupId === UNGROUPED_BUCKET_ID) {
    return next
  }
  const buckets = { ...(next.accountGroupCalKeys[accountId] ?? {}) }
  const list = [...(buckets[targetGroupId] ?? [])].filter((k) => k !== calKey)
  const idx = Math.max(0, Math.min(insertIndex, list.length))
  list.splice(idx, 0, calKey)
  buckets[targetGroupId] = list
  next = {
    ...next,
    accountGroupCalKeys: { ...next.accountGroupCalKeys, [accountId]: buckets }
  }
  return next
}

export function moveCalToSection(
  layout: CalendarSidebarLayoutV1,
  calKey: string,
  targetSectionId: string,
  insertIndex: number
): CalendarSidebarLayoutV1 {
  let next: CalendarSidebarLayoutV1 = {
    ...layout,
    sectionCalKeys: stripKeyFromSections(calKey, layout.sectionCalKeys)
  }
  if (targetSectionId === UNGROUPED_BUCKET_ID) {
    return next
  }
  const list = [...(next.sectionCalKeys[targetSectionId] ?? [])].filter((k) => k !== calKey)
  const idx = Math.max(0, Math.min(insertIndex, list.length))
  list.splice(idx, 0, calKey)
  next = {
    ...next,
    sectionCalKeys: { ...next.sectionCalKeys, [targetSectionId]: list }
  }
  return next
}

export interface AccountBucketsView {
  /** Kalender ohne Zuordnung zu einer benutzerdefinierten Gruppe (oberer Block). */
  ungrouped: CalendarGraphCalendarRow[]
  /** Benannte Gruppen mit Kalendern (Reihenfolge aus Layout). */
  groups: Array<{ group: SidebarNamedGroup; calendars: CalendarGraphCalendarRow[] }>
}

export function buildAccountBucketsView(
  accountId: string,
  calendars: CalendarGraphCalendarRow[],
  layout: CalendarSidebarLayoutV1
): AccountBucketsView {
  const byKey = new Map(calendars.map((c) => [calSidebarKey(accountId, c.id), c]))
  const groups = [...(layout.accountGroups[accountId] ?? [])].sort((a, b) => a.order - b.order)
  const buckets = layout.accountGroupCalKeys[accountId] ?? {}
  const assigned = new Set<string>()
  for (const keys of Object.values(buckets)) {
    for (const k of keys) assigned.add(k)
  }
  const ungroupedKeys = calendars
    .map((c) => calSidebarKey(accountId, c.id))
    .filter((k) => !assigned.has(k))
  const ungrouped = ungroupedKeys.map((k) => byKey.get(k)).filter(Boolean) as CalendarGraphCalendarRow[]

  const outGroups: AccountBucketsView['groups'] = []
  for (const g of groups) {
    const keys = buckets[g.id] ?? []
    const cals = keys.map((k) => byKey.get(k)).filter(Boolean) as CalendarGraphCalendarRow[]
    outGroups.push({ group: g, calendars: cals })
  }
  return { ungrouped, groups: outGroups }
}

export interface SectionBucketsView {
  unassigned: Array<{ cal: CalendarGraphCalendarRow; accountId: string }>
  sections: Array<{ section: SidebarNamedGroup; items: Array<{ cal: CalendarGraphCalendarRow; accountId: string }> }>
}

export function buildSectionBucketsView(
  accounts: Array<{ id: string }>,
  calendarsByAccount: Record<string, CalendarGraphCalendarRow[]>,
  layout: CalendarSidebarLayoutV1
): SectionBucketsView {
  const all: Array<{ key: string; cal: CalendarGraphCalendarRow; accountId: string }> = []
  for (const a of accounts) {
    const rows = calendarsByAccount[a.id] ?? []
    for (const c of rows) {
      all.push({ key: calSidebarKey(a.id, c.id), cal: c, accountId: a.id })
    }
  }
  const assigned = new Set<string>()
  for (const keys of Object.values(layout.sectionCalKeys)) {
    for (const k of keys) assigned.add(k)
  }
  const byKey = new Map(all.map((x) => [x.key, x]))
  const unassigned = all
    .filter((x) => !assigned.has(x.key))
    .map((x) => ({ cal: x.cal, accountId: x.accountId }))

  const sections = [...layout.globalSections].sort((a, b) => a.order - b.order)
  const out: SectionBucketsView['sections'] = []
  for (const s of sections) {
    const keys = layout.sectionCalKeys[s.id] ?? []
    const items = keys
      .map((k) => {
        const hit = byKey.get(k)
        return hit ? { cal: hit.cal, accountId: hit.accountId } : null
      })
      .filter(Boolean) as Array<{ cal: CalendarGraphCalendarRow; accountId: string }>
    out.push({ section: s, items })
  }
  return { unassigned, sections: out }
}
