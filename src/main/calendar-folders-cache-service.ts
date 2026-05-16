import type { CalendarGraphCalendarRow, CalendarM365GroupCalendarsPage } from '@shared/types'
import { listAccounts } from './accounts'
import {
  countM365GroupCalendarFolders,
  getCalendarFoldersSyncState,
  isCalendarFoldersSyncFresh,
  listM365GroupCalendarFoldersPageFromCache,
  listStandardCalendarFoldersFromCache,
  replaceM365GroupCalendarFolders,
  replaceStandardCalendarFolders,
  touchCalendarFoldersSyncState,
  upsertCalendarFolders
} from './db/calendar-folders-repo'
import { listMicrosoft365GroupCalendars, listMicrosoftCalendars } from './calendar-service'
import { isAppOnline } from './network-status'

export const CALENDAR_FOLDERS_CACHE_STALE_MS = 120_000

const M365_GROUP_PAGE_SIZE = 10

async function fetchStandardFoldersFromCloud(accountId: string): Promise<CalendarGraphCalendarRow[]> {
  const accounts = await listAccounts()
  const acc = accounts.find((a) => a.id === accountId)
  if (!acc) return []
  const rows = await listMicrosoftCalendars(accountId, { forceRefresh: true })
  replaceStandardCalendarFolders(accountId, rows)
  return rows
}

async function syncM365GroupFoldersForAccount(accountId: string): Promise<void> {
  const merged: CalendarGraphCalendarRow[] = []
  let offset = 0
  let totalGroups = 0
  let hasMore = true
  while (hasMore) {
    const page = await listMicrosoft365GroupCalendars(accountId, {
      offset,
      limit: M365_GROUP_PAGE_SIZE
    })
    totalGroups = page.totalGroups
    merged.push(...page.calendars)
    offset = page.offset + page.limit
    hasMore = page.hasMore
  }
  replaceM365GroupCalendarFolders(accountId, merged)
  touchCalendarFoldersSyncState(accountId, totalGroups)
}

export async function syncCalendarFoldersForAccount(accountId: string): Promise<void> {
  if (!isAppOnline()) return
  const accounts = await listAccounts()
  const acc = accounts.find((a) => a.id === accountId)
  if (!acc || (acc.provider !== 'microsoft' && acc.provider !== 'google')) return

  await fetchStandardFoldersFromCloud(accountId)
  if (acc.provider === 'microsoft') {
    await syncM365GroupFoldersForAccount(accountId)
  } else {
    touchCalendarFoldersSyncState(accountId, 0)
  }
}

export async function syncAllCalendarFoldersAccounts(): Promise<void> {
  const accounts = await listAccounts()
  for (const acc of accounts) {
    if (acc.provider !== 'microsoft' && acc.provider !== 'google') continue
    try {
      await syncCalendarFoldersForAccount(acc.id)
    } catch (e) {
      console.warn('[calendar-folders-cache] Sync fehlgeschlagen:', acc.id, e)
    }
  }
}

export async function listCalendarsCached(
  accountId: string,
  opts?: { forceRefresh?: boolean }
): Promise<CalendarGraphCalendarRow[]> {
  const cached = listStandardCalendarFoldersFromCache(accountId)
  const force = opts?.forceRefresh === true
  const fresh = isCalendarFoldersSyncFresh(accountId, CALENDAR_FOLDERS_CACHE_STALE_MS)

  if (!force && cached.length > 0 && fresh) {
    return cached
  }

  if (!force && cached.length > 0 && !fresh && isAppOnline()) {
    void fetchStandardFoldersFromCloud(accountId).catch((e) =>
      console.warn('[calendar-folders-cache] Hintergrund-Refresh:', accountId, e)
    )
    return cached
  }

  if (!isAppOnline()) {
    return cached
  }

  return fetchStandardFoldersFromCloud(accountId)
}

export async function listM365GroupCalendarsCached(
  accountId: string,
  opts?: { offset?: number; limit?: number; forceRefresh?: boolean }
): Promise<CalendarM365GroupCalendarsPage> {
  const offset = Math.max(0, opts?.offset ?? 0)
  const limit = Math.max(1, opts?.limit ?? M365_GROUP_PAGE_SIZE)
  const force = opts?.forceRefresh === true
  const cachedPage = listM365GroupCalendarFoldersPageFromCache(accountId, offset, limit)
  const fresh = isCalendarFoldersSyncFresh(accountId, CALENDAR_FOLDERS_CACHE_STALE_MS)
  const hasAnyGroups = countM365GroupCalendarFolders(accountId) > 0
  const st = getCalendarFoldersSyncState(accountId)

  if (!force && fresh && (hasAnyGroups || (st?.m365GroupsTotal ?? 0) === 0)) {
    if (cachedPage.calendars.length > 0 || offset === 0) {
      return cachedPage
    }
  }

  if (!force && cachedPage.calendars.length > 0 && !fresh && isAppOnline()) {
    void syncM365GroupFoldersForAccount(accountId).catch((e) =>
      console.warn('[calendar-folders-cache] Gruppen-Hintergrund-Refresh:', accountId, e)
    )
    return cachedPage
  }

  if (!isAppOnline()) {
    return cachedPage
  }

  const page = await listMicrosoft365GroupCalendars(accountId, { offset, limit })
  upsertCalendarFolders(accountId, page.calendars, 'm365Group', offset)
  touchCalendarFoldersSyncState(accountId, page.totalGroups)
  return page
}
