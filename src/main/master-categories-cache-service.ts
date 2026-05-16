import type { MailMasterCategory } from '@shared/types'
import { listAccounts } from './accounts'
import {
  invalidateMasterCategoriesSyncState,
  isMasterCategoriesSyncFresh,
  listMasterCategoriesFromCache,
  upsertMasterCategories
} from './db/master-categories-repo'
import { graphListMasterCategories } from './graph/master-categories'
import { isAppOnline } from './network-status'

/** Masterkategorien aendern sich selten — laenger frisch halten. */
export const MASTER_CATEGORIES_CACHE_STALE_MS = 24 * 60 * 60_000

async function fetchMasterCategoriesFromCloud(accountId: string): Promise<MailMasterCategory[]> {
  const rows = await graphListMasterCategories(accountId)
  upsertMasterCategories(accountId, rows)
  return rows
}

export async function syncMasterCategoriesForAccount(accountId: string): Promise<void> {
  if (!isAppOnline()) return
  const accounts = await listAccounts()
  const acc = accounts.find((a) => a.id === accountId)
  if (!acc || acc.provider !== 'microsoft') return
  await fetchMasterCategoriesFromCloud(accountId)
}

export async function syncAllMasterCategoriesAccounts(): Promise<void> {
  const accounts = await listAccounts()
  for (const acc of accounts) {
    if (acc.provider !== 'microsoft') continue
    try {
      await syncMasterCategoriesForAccount(acc.id)
    } catch (e) {
      console.warn('[master-categories-cache] Sync fehlgeschlagen:', acc.id, e)
    }
  }
}

export async function listMasterCategoriesCached(
  accountId: string,
  opts?: { forceRefresh?: boolean }
): Promise<MailMasterCategory[]> {
  const accounts = await listAccounts()
  const acc = accounts.find((a) => a.id === accountId)
  if (!acc || acc.provider !== 'microsoft') {
    return []
  }

  const cached = listMasterCategoriesFromCache(accountId)
  const force = opts?.forceRefresh === true
  const fresh = isMasterCategoriesSyncFresh(accountId, MASTER_CATEGORIES_CACHE_STALE_MS)

  if (!force && cached.length > 0 && fresh) {
    return cached
  }

  if (!force && cached.length > 0 && !fresh && isAppOnline()) {
    void fetchMasterCategoriesFromCloud(accountId).catch((e) =>
      console.warn('[master-categories-cache] Hintergrund-Refresh:', accountId, e)
    )
    return cached
  }

  if (!isAppOnline()) {
    return cached
  }

  return fetchMasterCategoriesFromCloud(accountId)
}

export { invalidateMasterCategoriesSyncState }
