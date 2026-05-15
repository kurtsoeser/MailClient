import { getDb } from './index'
import type { MailFolder } from '@shared/types'

interface FolderRow {
  id: number
  account_id: string
  remote_id: string
  name: string
  parent_remote_id: string | null
  path: string | null
  well_known: string | null
  is_favorite: number
  unread_count: number
  total_count: number
}

function rowToFolder(r: FolderRow): MailFolder {
  return {
    id: r.id,
    accountId: r.account_id,
    remoteId: r.remote_id,
    name: r.name,
    parentRemoteId: r.parent_remote_id,
    path: r.path,
    wellKnown: r.well_known,
    isFavorite: !!r.is_favorite,
    unreadCount: r.unread_count,
    totalCount: r.total_count
  }
}

export interface UpsertFolderInput {
  accountId: string
  remoteId: string
  name: string
  parentRemoteId: string | null
  wellKnown: string | null
  unreadCount: number
  totalCount: number
}

export function upsertFolders(input: UpsertFolderInput[]): void {
  if (input.length === 0) return
  const db = getDb()
  // WICHTIG: bestehende `well_known`-Markierungen NICHT mit NULL ueberschreiben.
  // Graph liefert fuer App-eigene Ordner (z.B. unseren "Snoozed"-Folder)
  // kein wellKnownName, doch wir setzen den Marker lokal in `setFolderWellKnownLocal`.
  // Daher hier COALESCE: nur ueberschreiben, wenn Graph einen Wert liefert.
  const stmt = db.prepare(`
    INSERT INTO folders (account_id, remote_id, name, parent_remote_id, well_known,
                         unread_count, total_count, last_synced_at)
    VALUES (@accountId, @remoteId, @name, @parentRemoteId, @wellKnown,
            @unreadCount, @totalCount, datetime('now'))
    ON CONFLICT(account_id, remote_id) DO UPDATE SET
      name             = excluded.name,
      parent_remote_id = excluded.parent_remote_id,
      well_known       = COALESCE(excluded.well_known, folders.well_known),
      unread_count     = excluded.unread_count,
      total_count      = excluded.total_count,
      last_synced_at   = datetime('now')
  `)
  const tx = db.transaction((items: UpsertFolderInput[]) => {
    for (const item of items) stmt.run(item)
  })
  tx(input)
}

export function listFoldersByAccount(accountId: string): MailFolder[] {
  const db = getDb()
  const rows = db
    .prepare<[string], FolderRow>(
      `SELECT * FROM folders WHERE account_id = ? ORDER BY
        CASE
          WHEN well_known = 'inbox' THEN 0
          WHEN well_known = 'sentitems' THEN 1
          WHEN well_known = 'drafts' THEN 2
          WHEN well_known = 'snoozed' THEN 3
          WHEN well_known = 'mailclient_wip' THEN 4
          WHEN well_known = 'mailclient_done' THEN 5
          WHEN well_known = 'archive' THEN 6
          WHEN well_known = 'outbox' THEN 7
          WHEN well_known = 'syncissues' THEN 8
          WHEN well_known = 'conflicts' THEN 9
          WHEN well_known = 'serverfailures' THEN 10
          WHEN well_known = 'localfailures' THEN 11
          WHEN well_known = 'conversationhistory' THEN 12
          WHEN well_known = 'junkemail' THEN 13
          WHEN well_known = 'deleteditems' THEN 14
          ELSE 15
        END,
        LOWER(name) ASC`
    )
    .all(accountId)
  return rows.map(rowToFolder)
}

export function findFolderByRemoteId(
  accountId: string,
  remoteId: string
): MailFolder | null {
  const db = getDb()
  const row = db
    .prepare<[string, string], FolderRow>(
      'SELECT * FROM folders WHERE account_id = ? AND remote_id = ?'
    )
    .get(accountId, remoteId)
  return row ? rowToFolder(row) : null
}

export function findFolderByWellKnown(
  accountId: string,
  wellKnown: string
): MailFolder | null {
  const db = getDb()
  const row = db
    .prepare<[string, string], FolderRow>(
      'SELECT * FROM folders WHERE account_id = ? AND well_known = ?'
    )
    .get(accountId, wellKnown)
  return row ? rowToFolder(row) : null
}

export function adjustFolderUnread(folderId: number, delta: number): void {
  const db = getDb()
  db.prepare(
    'UPDATE folders SET unread_count = MAX(0, unread_count + ?) WHERE id = ?'
  ).run(delta, folderId)
}

export function renameFolderLocal(id: number, name: string): void {
  const db = getDb()
  db.prepare('UPDATE folders SET name = ? WHERE id = ?').run(name, id)
}

export function deleteFolderLocal(id: number): void {
  const db = getDb()
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM messages WHERE folder_id = ?').run(id)
    db.prepare('DELETE FROM folders WHERE id = ?').run(id)
  })
  tx()
}

export function updateFolderParentLocal(id: number, parentRemoteId: string | null): void {
  const db = getDb()
  db.prepare('UPDATE folders SET parent_remote_id = ? WHERE id = ?').run(parentRemoteId, id)
}

export function insertFolderLocal(input: UpsertFolderInput): number {
  const db = getDb()
  const result = db
    .prepare(
      `INSERT INTO folders (account_id, remote_id, name, parent_remote_id, well_known,
                            unread_count, total_count, last_synced_at)
       VALUES (@accountId, @remoteId, @name, @parentRemoteId, @wellKnown,
               @unreadCount, @totalCount, datetime('now'))
       ON CONFLICT(account_id, remote_id) DO UPDATE SET
         name             = excluded.name,
         parent_remote_id = excluded.parent_remote_id,
         last_synced_at   = datetime('now')`
    )
    .run(input)
  const row = db
    .prepare<[string, string], { id: number }>(
      'SELECT id FROM folders WHERE account_id = ? AND remote_id = ?'
    )
    .get(input.accountId, input.remoteId)
  return row?.id ?? Number(result.lastInsertRowid)
}

/**
 * Ordner mit well-known-Alias gelten als geschuetzt – nicht loeschbar/umbenennbar.
 */
export function isProtectedFolder(folder: MailFolder): boolean {
  if (!folder.wellKnown) return false
  const protectedAliases = new Set([
    'inbox',
    'sentitems',
    'drafts',
    'deleteditems',
    'archive',
    'junkemail',
    'outbox',
    'snoozed',
    /** MailClient-Triage (nicht loeschen/umbenennen). */
    'mailclient_wip',
    'mailclient_done',
    /** Postfach-Wurzel (Top of Information Store). */
    'msgfolderroot',
    /** Papierkorb-Retention / Wiederherstellung. */
    'recoverableitemsdeletions',
    /** Elternordner der Suchordner. */
    'searchfolders'
  ])
  return protectedAliases.has(folder.wellKnown)
}

/**
 * Markiert einen lokalen Ordner mit einem `well_known`-Alias.
 * Wird z.B. fuer unseren eigenen "Snoozed"-Ordner verwendet, der von
 * Graph nicht als wellKnownName geliefert wird.
 */
export function setFolderWellKnownLocal(id: number, wellKnown: string | null): void {
  const db = getDb()
  db.prepare('UPDATE folders SET well_known = ? WHERE id = ?').run(wellKnown, id)
}

export function findFolderById(id: number): MailFolder | null {
  const db = getDb()
  const row = db
    .prepare<[number], FolderRow>('SELECT * FROM folders WHERE id = ?')
    .get(id)
  return row ? rowToFolder(row) : null
}

export function setFolderFavoriteLocal(id: number, value: boolean): void {
  const db = getDb()
  db.prepare('UPDATE folders SET is_favorite = ? WHERE id = ?').run(value ? 1 : 0, id)
}

/** Fuer Hintergrund-Poll (Stufe-1-Offline): favorisierte Ordner pro Konto, ohne Duplikate zur Reihenfolge. */
export function listFavoriteFolderIdsForAccount(accountId: string): number[] {
  const db = getDb()
  const rows = db
    .prepare<[string], { id: number }>(
      'SELECT id FROM folders WHERE account_id = ? AND is_favorite = 1 ORDER BY id ASC'
    )
    .all(accountId)
  return rows.map((r) => r.id)
}
