import { syncAllCalendarAccounts } from './calendar-cache-service'
import { syncAllCalendarFoldersAccounts } from './calendar-folders-cache-service'
import { syncAllMasterCategoriesAccounts } from './master-categories-cache-service'
import { syncPeopleForAllAccounts } from './people-service'
import { syncAllTasksAccounts } from './tasks-cache-service'
import { isAppOnline } from './network-status'

const CALENDAR_SYNC_INTERVAL_MS = 3 * 60_000

let timer: NodeJS.Timeout | null = null
let running = false
let stopRequested = false
let initialSyncDone = false

async function tick(incremental: boolean): Promise<void> {
  if (running || stopRequested || !isAppOnline()) return
  running = true
  try {
    await Promise.all([
      syncAllCalendarAccounts({ googleIncremental: incremental }),
      syncAllTasksAccounts(),
      syncPeopleForAllAccounts().catch((e) => console.warn('[cloud-sync] Kontakte:', e)),
      syncAllCalendarFoldersAccounts().catch((e) =>
        console.warn('[cloud-sync] Kalender-Ordner:', e)
      ),
      syncAllMasterCategoriesAccounts().catch((e) =>
        console.warn('[cloud-sync] Masterkategorien:', e)
      )
    ])
  } catch (e) {
    console.warn('[calendar-sync] tick error', e)
  } finally {
    running = false
  }
}

export function startCalendarSync(): void {
  if (timer) return
  stopRequested = false
  setTimeout(() => {
    if (stopRequested) return
    void tick(false).then(() => {
      initialSyncDone = true
    })
  }, 20_000)
  timer = setInterval(() => {
    void tick(initialSyncDone)
  }, CALENDAR_SYNC_INTERVAL_MS)
}

export function stopCalendarSync(): void {
  stopRequested = true
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

/** Manueller Refresh (z. B. nach Kalender-Sichtbarkeit). */
export async function triggerCalendarSync(forceFull = false): Promise<void> {
  await tick(!forceFull && initialSyncDone)
}
