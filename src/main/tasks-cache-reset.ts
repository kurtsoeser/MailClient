import type { ClearLocalTasksCacheResult } from '@shared/types'
import { listAccounts } from './accounts'
import { deleteCloudTasksDataForAccount } from './db/cloud-tasks-repo'
import { deleteTaskPlannedSchedulesForAccount } from './db/task-planned-schedule-repo'
import { broadcastTasksChanged } from './ipc/ipc-broadcasts'
import { isAppOnline } from './network-status'
import { syncTasksForAccount } from './tasks-cache-service'

/**
 * Löscht den lokalen To-Do-/Aufgaben-Cache (Listen, Aufgabenzeilen, Sync-Zeitstempel)
 * und lokale Planungszeiten für Cloud-Aufgaben dieses Kontos. Server bleibt unverändert.
 */
export async function clearLocalTasksCacheForAccount(
  accountId: string
): Promise<ClearLocalTasksCacheResult> {
  const accounts = await listAccounts()
  const acc = accounts.find((a) => a.id === accountId)
  if (!acc) {
    throw new Error('Konto nicht gefunden.')
  }
  if (acc.provider !== 'microsoft' && acc.provider !== 'google') {
    throw new Error('Aufgaben-Cache ist nur für Microsoft- und Google-Konten verfügbar.')
  }

  deleteTaskPlannedSchedulesForAccount(accountId)
  deleteCloudTasksDataForAccount(accountId)
  broadcastTasksChanged(accountId)

  if (!isAppOnline()) {
    return { resynced: false }
  }

  // Nicht auf `syncTasksForAccount` warten: bei vielen Listen/Aufgaben sind das
  // viele sequenzielle Graph-Seiten — die UI würde Minuten mit Spinner hängen.
  void syncTasksForAccount(accountId).catch((e) => {
    console.warn('[tasks-cache-reset] Hintergrund-Sync nach Cache-Leeren fehlgeschlagen:', accountId, e)
  })
  return { resynced: true }
}
