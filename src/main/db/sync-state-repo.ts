import { getDb } from './index'

interface SyncStateRow {
  account_id: string
  folder_id: number | null
  delta_token: string | null
  last_synced_at: string | null
}

export interface FolderSyncState {
  accountId: string
  folderId: number
  deltaToken: string | null
  lastSyncedAt: string | null
}

/**
 * Liest den Sync-Zustand fuer (Account, Folder). Liefert null, wenn der
 * Folder noch nie gesyncht wurde.
 */
export function getFolderSyncState(
  accountId: string,
  folderId: number
): FolderSyncState | null {
  const db = getDb()
  const row = db
    .prepare<[string, number], SyncStateRow>(
      'SELECT * FROM sync_state WHERE account_id = ? AND folder_id = ?'
    )
    .get(accountId, folderId)
  if (!row) return null
  return {
    accountId: row.account_id,
    folderId: row.folder_id!,
    deltaToken: row.delta_token,
    lastSyncedAt: row.last_synced_at
  }
}

/**
 * Aktualisiert den Sync-Zustand. lastSyncedAt sollte der Server-Timestamp
 * der zuletzt verarbeiteten Mail sein (lastModifiedDateTime) – nicht die
 * Client-Uhrzeit –, damit Zeitversatz uns nicht stoert.
 */
export function upsertFolderSyncState(state: FolderSyncState): void {
  const db = getDb()
  db.prepare(
    `INSERT INTO sync_state (account_id, folder_id, delta_token, last_synced_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(account_id, folder_id) DO UPDATE SET
       delta_token    = excluded.delta_token,
       last_synced_at = excluded.last_synced_at`
  ).run(state.accountId, state.folderId, state.deltaToken, state.lastSyncedAt)
}
