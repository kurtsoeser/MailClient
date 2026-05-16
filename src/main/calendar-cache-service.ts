import { addDays, startOfDay, subDays } from 'date-fns'
import type {
  CalendarEventView,
  CalendarIncludeCalendarRef,
  ConnectedAccount
} from '@shared/types'
import { listAccounts } from './accounts'
import {
  listMergedCalendarEvents,
  listMicrosoftCalendars,
  type ListMergedCalendarEventsOptions
} from './calendar-service'
import { getDb } from './db/index'
import {
  getCalendarSyncState,
  getCalendarSyncStalestMs,
  isCalendarRangeCoveredBySync,
  listCalendarEventsInRange,
  listLinkedCalendarAccountIds,
  mergeCalendarSyncWindow,
  patchCalendarEventIcon,
  pruneCalendarEventsInRange,
  upsertCalendarEvents
} from './db/calendar-events-repo'
import { broadcastCalendarChanged, broadcastCalendarSyncStatus } from './ipc/ipc-broadcasts'
import { isAppOnline } from './network-status'
import { googleListCalendars } from './google/calendar-google'

/** Vergangenheit im lokalen Cache (Tage). */
export const CALENDAR_CACHE_PAST_DAYS = 90
const DEFAULT_CALENDAR_LOAD_AHEAD_DAYS = 365
/** Wie lange ein abgedecktes Sync-Fenster ohne erneuten Abruf gilt. */
export const CALENDAR_CACHE_STALE_MS = 120_000

let refreshSeq = 0
const inflightByKey = new Map<string, Promise<void>>()

function effectiveFetchEndForAccount(acc: ConnectedAccount, viewEnd: Date): Date {
  if (acc.calendarLoadAheadDays === null) {
    return viewEnd
  }
  const days = acc.calendarLoadAheadDays ?? DEFAULT_CALENDAR_LOAD_AHEAD_DAYS
  const cap = addDays(startOfDay(new Date()), days)
  return cap.getTime() < viewEnd.getTime() ? cap : viewEnd
}

export function getDefaultCalendarSyncWindow(): { startIso: string; endIso: string } {
  const start = subDays(startOfDay(new Date()), CALENDAR_CACHE_PAST_DAYS)
  const end = addDays(startOfDay(new Date()), DEFAULT_CALENDAR_LOAD_AHEAD_DAYS)
  return { startIso: start.toISOString(), endIso: end.toISOString() }
}

async function listAllCalendarsForAccount(
  acc: ConnectedAccount
): Promise<CalendarIncludeCalendarRef[]> {
  if (acc.provider === 'microsoft') {
    const rows = await listMicrosoftCalendars(acc.id)
    return rows.map((c) => ({ accountId: acc.id, graphCalendarId: c.id }))
  }
  if (acc.provider === 'google') {
    const rows = await googleListCalendars(acc.id)
    return rows.map((c) => ({ accountId: acc.id, graphCalendarId: c.id }))
  }
  return []
}

function accountIdsFromInclude(include: CalendarIncludeCalendarRef[] | null | undefined): string[] {
  if (!Array.isArray(include)) return []
  return [...new Set(include.map((r) => r.accountId))]
}

function calendarsByAccount(
  include: CalendarIncludeCalendarRef[]
): Map<string, string[]> {
  const m = new Map<string, string[]>()
  for (const ref of include) {
    const cid = ref.graphCalendarId?.trim()
    if (!cid) continue
    const list = m.get(ref.accountId) ?? []
    list.push(cid)
    m.set(ref.accountId, list)
  }
  return m
}

async function resolveIncludeCalendars(
  options?: ListMergedCalendarEventsOptions
): Promise<CalendarIncludeCalendarRef[] | null | undefined> {
  if (options?.focus?.accountId && options.focus.graphCalendarId) {
    return [
      {
        accountId: options.focus.accountId,
        graphCalendarId: options.focus.graphCalendarId
      }
    ]
  }
  if (Array.isArray(options?.includeCalendars)) {
    return options.includeCalendars
  }
  const accounts = await listAccounts()
  const refs: CalendarIncludeCalendarRef[] = []
  for (const acc of accounts) {
    if (acc.provider !== 'microsoft' && acc.provider !== 'google') continue
    refs.push(...(await listAllCalendarsForAccount(acc)))
  }
  return refs
}

async function fetchFromCloudAndPersist(
  startIso: string,
  endIso: string,
  options: ListMergedCalendarEventsOptions | undefined,
  googleIncremental: boolean
): Promise<CalendarEventView[]> {
  const include = await resolveIncludeCalendars(options)
  const events = await listMergedCalendarEvents(startIso, endIso, {
    ...options,
    includeCalendars: include ?? undefined,
    googleIncremental
  })

  upsertCalendarEvents(events)

  if (Array.isArray(include) && include.length > 0) {
    const byAcc = calendarsByAccount(include)
    for (const [accountId, calIds] of byAcc) {
      const keep = new Set(
        events
          .filter((e) => e.accountId === accountId)
          .map((e) => e.graphEventId ?? e.id.split(':').slice(1).join(':'))
          .filter(Boolean)
      )
      pruneCalendarEventsInRange(accountId, startIso, endIso, calIds, keep)
      mergeCalendarSyncWindow(accountId, startIso, endIso)
    }
  }

  return events
}

function rangeKey(startIso: string, endIso: string, includeKey: string): string {
  return `${startIso}\u001f${endIso}\u001f${includeKey}`
}

async function refreshRange(
  startIso: string,
  endIso: string,
  options: ListMergedCalendarEventsOptions | undefined,
  googleIncremental: boolean
): Promise<void> {
  const include = await resolveIncludeCalendars(options)
  const includeKey = Array.isArray(include)
    ? include.map((r) => `${r.accountId}:${r.graphCalendarId}`).sort().join('|')
    : '*'
  const key = rangeKey(startIso, endIso, includeKey)
  const existing = inflightByKey.get(key)
  if (existing) {
    await existing
    return
  }

  const run = (async (): Promise<void> => {
    if (!isAppOnline()) return
    await fetchFromCloudAndPersist(startIso, endIso, options, googleIncremental)
    const accountIds = accountIdsFromInclude(include)
    for (const id of accountIds) {
      broadcastCalendarChanged(id)
    }
  })().finally(() => {
    if (inflightByKey.get(key) === run) {
      inflightByKey.delete(key)
    }
  })

  inflightByKey.set(key, run)
  await run
}

/**
 * Termine fuer die UI: zuerst SQLite, bei Bedarf Cloud-Abruf oder Hintergrund-Aktualisierung.
 */
export async function listCalendarEventsCached(
  startIso: string,
  endIso: string,
  options?: ListMergedCalendarEventsOptions & { forceRefresh?: boolean }
): Promise<CalendarEventView[]> {
  const include = await resolveIncludeCalendars(options)
  const accountIds = accountIdsFromInclude(include)
  const cached = listCalendarEventsInRange(startIso, endIso, include)
  const force = options?.forceRefresh === true

  const covered = isCalendarRangeCoveredBySync(accountIds, startIso, endIso)
  const staleMs = getCalendarSyncStalestMs(accountIds)
  const isStale = staleMs == null || staleMs >= CALENDAR_CACHE_STALE_MS

  if (!force && cached.length > 0 && covered && !isStale) {
    return cached
  }

  if (!force && cached.length > 0 && covered && isStale && isAppOnline()) {
    const seq = ++refreshSeq
    void refreshRange(startIso, endIso, options, true).then(() => {
      if (seq !== refreshSeq) return
    })
    return cached
  }

  if (!force && cached.length > 0 && !covered && isAppOnline()) {
    void refreshRange(startIso, endIso, options, false)
    return cached
  }

  if (!isAppOnline()) {
    return cached
  }

  if (force || !covered || cached.length === 0) {
    return fetchFromCloudAndPersist(startIso, endIso, options, false)
  }

  if (isStale) {
    return fetchFromCloudAndPersist(startIso, endIso, options, true)
  }

  return cached
}

/** Alle verbundenen Kalender-Konten im Standardfenster synchronisieren. */
export async function syncAllCalendarAccounts(
  opts?: { googleIncremental?: boolean }
): Promise<void> {
  if (!isAppOnline()) return
  const accounts = await listAccounts()
  const linked = accounts.filter((a) => a.provider === 'microsoft' || a.provider === 'google')
  if (linked.length === 0) return

  const { startIso, endIso } = getDefaultCalendarSyncWindow()
  const include: CalendarIncludeCalendarRef[] = []
  for (const acc of linked) {
    include.push(...(await listAllCalendarsForAccount(acc)))
  }
  if (include.length === 0) return

  for (const acc of linked) {
    broadcastCalendarSyncStatus({ accountId: acc.id, state: 'syncing-folders' })
  }
  try {
    await fetchFromCloudAndPersist(
      startIso,
      endIso,
      { includeCalendars: include },
      opts?.googleIncremental === true
    )
    for (const acc of linked) {
      broadcastCalendarSyncStatus({ accountId: acc.id, state: 'idle' })
      broadcastCalendarChanged(acc.id)
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    for (const acc of linked) {
      broadcastCalendarSyncStatus({ accountId: acc.id, state: 'error', message })
    }
    throw e
  }
}

export async function syncCalendarAccount(
  accountId: string,
  opts?: { googleIncremental?: boolean }
): Promise<void> {
  if (!isAppOnline()) return
  const accounts = await listAccounts()
  const acc = accounts.find((a) => a.id === accountId)
  if (!acc || (acc.provider !== 'microsoft' && acc.provider !== 'google')) return

  const { startIso, endIso } = getDefaultCalendarSyncWindow()
  const include = await listAllCalendarsForAccount(acc)
  if (include.length === 0) return

  broadcastCalendarSyncStatus({ accountId, state: 'syncing-folders' })
  try {
    await fetchFromCloudAndPersist(
      startIso,
      endIso,
      { includeCalendars: include },
      opts?.googleIncremental === true
    )
    broadcastCalendarSyncStatus({ accountId, state: 'idle' })
    broadcastCalendarChanged(accountId)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    broadcastCalendarSyncStatus({ accountId, state: 'error', message })
    throw e
  }
}

export function patchCachedCalendarEventSchedule(
  accountId: string,
  graphEventId: string,
  patch: { startIso: string; endIso: string; isAllDay: boolean }
): void {
  getDb()
    .prepare(
      `UPDATE calendar_events
       SET start_iso = ?, end_iso = ?, is_all_day = ?, synced_at = datetime('now')
       WHERE account_id = ? AND graph_event_id = ?`
    )
    .run(patch.startIso, patch.endIso, patch.isAllDay ? 1 : 0, accountId, graphEventId.trim())
}

export function patchCachedCalendarEventIcon(
  accountId: string,
  graphEventId: string,
  iconId: string | null
): void {
  patchCalendarEventIcon(accountId, graphEventId, iconId)
}

export function invalidateCalendarCacheForAccount(accountId: string): void {
  if (!getCalendarSyncState(accountId)) return
  getDb().prepare('DELETE FROM calendar_sync_state WHERE account_id = ?').run(accountId)
}

export async function listCalendarAccountSyncStates(): Promise<
  Array<{ accountId: string; hasSynced: boolean }>
> {
  const accounts = await listAccounts()
  return accounts
    .filter((a) => a.provider === 'microsoft' || a.provider === 'google')
    .map((a) => ({
      accountId: a.id,
      hasSynced: getCalendarSyncState(a.id) != null
    }))
}

export { listLinkedCalendarAccountIds }
