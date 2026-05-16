import type { ClearLocalMailCacheResult } from '@shared/types'
import { listAccounts } from './accounts'
import { runInitialSync } from './sync-runner'
import { isAppOnline } from './network-status'
import { clearLocalMailSyncDataForAccount } from './db/mail-sync-cache-repo'
import { deleteMasterCategoriesDataForAccount } from './db/master-categories-repo'
import { clearGmailMailHistoryCursorForAccount } from './google/google-sync-meta-store'
import { broadcastMailChanged, broadcastNotesChanged } from './ipc/ipc-broadcasts'

/**
 * Löscht den lokalen Mail-Sync-Cache für ein Konto und stößt bei Online-Verbindung
 * sofort einen Erst-Sync wie nach neuer Anmeldung an.
 */
export async function clearMailAccountLocalCacheAndResync(
  accountId: string
): Promise<ClearLocalMailCacheResult> {
  const accounts = await listAccounts()
  const acc = accounts.find((a) => a.id === accountId)
  if (!acc) {
    throw new Error('Konto nicht gefunden.')
  }

  clearLocalMailSyncDataForAccount(accountId)

  if (acc.provider === 'microsoft') {
    deleteMasterCategoriesDataForAccount(accountId)
  } else if (acc.provider === 'google') {
    await clearGmailMailHistoryCursorForAccount(accountId)
  }

  broadcastMailChanged(accountId)
  broadcastNotesChanged({ accountId, messageId: null })

  if (!isAppOnline()) {
    return { resynced: false }
  }

  const syncResult = await runInitialSync(accountId)
  return {
    resynced: true,
    folders: syncResult.folders,
    inboxMessages: syncResult.inboxMessages
  }
}
