import { BrowserWindow } from 'electron'
import { yieldToMainThread } from './lib/yield-main-thread'
import {
  syncAccountInitial,
  syncMessagesInFolder,
  pollMessagesInFolder
} from './graph/mail-sync'
import {
  syncGoogleAccountInitial,
  syncGoogleMessagesInFolder,
  pollGoogleFolderIfNeeded
} from './google/gmail-sync'
import { findFolderById, findFolderByWellKnown, listFavoriteFolderIdsForAccount } from './db/folders-repo'
import { listMessageIdsByRemoteIds } from './db/messages-repo'
import { listAccounts } from './accounts'
import { runInboxRulesForNewMessages } from './rule-runner'
import { broadcastMailChanged } from './ipc/ipc-broadcasts'

export type SyncState = 'idle' | 'syncing-folders' | 'syncing-messages' | 'error'

export interface SyncStatus {
  accountId: string
  state: SyncState
  message?: string
}

function broadcast(status: SyncStatus): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('sync:status', status)
  }
}

export async function runInitialSync(
  accountId: string
): Promise<{ folders: number; inboxMessages: number }> {
  broadcast({ accountId, state: 'syncing-folders' })
  await yieldToMainThread()
  try {
    const accounts = await listAccounts()
    const acc = accounts.find((a) => a.id === accountId)
    let result: { folders: number; inboxMessages: number; sentMessages?: number }
    if (acc?.provider === 'google') {
      result = await syncGoogleAccountInitial(accountId)
    } else {
      result = await syncAccountInitial(accountId)
    }
    broadcast({ accountId, state: 'idle' })
    broadcastMailChanged(accountId)
    return { folders: result.folders, inboxMessages: result.inboxMessages }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[sync] initial sync failed:', e)
    broadcast({ accountId, state: 'error', message })
    throw e
  }
}

export async function runFolderSync(folderId: number, limit = 50): Promise<number> {
  const folder = findFolderById(folderId)
  if (!folder) throw new Error(`Folder ${folderId} not found in DB.`)

  broadcast({ accountId: folder.accountId, state: 'syncing-messages' })
  await yieldToMainThread()
  try {
    const accounts = await listAccounts()
    const acc = accounts.find((a) => a.id === folder.accountId)
    const count =
      acc?.provider === 'google'
        ? await syncGoogleMessagesInFolder(folder.accountId, folder.remoteId, limit)
        : await syncMessagesInFolder(folder.accountId, folder.remoteId, limit)
    broadcast({ accountId: folder.accountId, state: 'idle' })
    broadcastMailChanged(folder.accountId)
    return count
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error(`[sync] folder sync failed (id=${folderId}):`, e)
    broadcast({ accountId: folder.accountId, state: 'error', message })
    throw e
  }
}

/**
 * Inkrementelles Polling fuer einen Folder. Macht keinen vollen Sync,
 * sondern holt nur Aenderungen seit dem letzten Watermark.
 */
export async function runFolderPoll(folderId: number): Promise<number> {
  const folder = findFolderById(folderId)
  if (!folder) throw new Error(`Folder ${folderId} not found in DB.`)

  try {
    const accounts = await listAccounts()
    const acc = accounts.find((a) => a.id === folder.accountId)
    const result =
      acc?.provider === 'google'
        ? await pollGoogleFolderIfNeeded(folder.accountId, folder.remoteId)
        : await pollMessagesInFolder(folder.accountId, folder.remoteId)
    const added = typeof result === 'number' ? result : result.added
    const remoteIds = typeof result === 'number' ? [] : result.remoteIds
    if (added > 0) {
      broadcastMailChanged(folder.accountId, { kind: 'poll', folderIds: [folder.id] })
      if (folder.wellKnown === 'inbox' && remoteIds.length > 0) {
        const idMap = listMessageIdsByRemoteIds(folder.accountId, remoteIds)
        const ids = [...idMap.values()]
        if (ids.length > 0) {
          void runInboxRulesForNewMessages(folder.accountId, ids).catch((e) =>
            console.warn('[sync] inbox rules:', e)
          )
        }
      }
    }
    return added
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error(`[sync] folder poll failed (id=${folderId}):`, e)
    broadcast({ accountId: folder.accountId, state: 'error', message })
    throw e
  }
}

/**
 * Pollt fuer alle Konten: Posteingang, Gesendet, Entwuerfe, alle als Favorit markierten Ordner,
 * plus den aktuell ausgewaehlten Folder (extraFolderIds vom Renderer).
 */
async function runFolderPollsWithConcurrency(
  folderIds: number[],
  concurrency = 3
): Promise<void> {
  let index = 0
  const workers = Array.from({ length: Math.min(concurrency, folderIds.length) }, async () => {
    while (index < folderIds.length) {
      const fid = folderIds[index++]!
      try {
        await runFolderPoll(fid)
        await yieldToMainThread()
      } catch (e) {
        console.warn('[sync] poll folder failed', fid, e)
      }
    }
  })
  await Promise.all(workers)
}

export async function runBackgroundPoll(extraFolderIds: number[] = []): Promise<void> {
  const accounts = await listAccounts()
  const visited = new Set<number>()
  const toPoll: number[] = []

  for (const acc of accounts) {
    for (const alias of ['inbox', 'sentitems', 'drafts'] as const) {
      const folder = findFolderByWellKnown(acc.id, alias)
      if (!folder || visited.has(folder.id)) continue
      visited.add(folder.id)
      toPoll.push(folder.id)
    }
    for (const fid of listFavoriteFolderIdsForAccount(acc.id)) {
      if (visited.has(fid)) continue
      visited.add(fid)
      toPoll.push(fid)
    }
  }

  for (const fid of extraFolderIds) {
    if (visited.has(fid)) continue
    visited.add(fid)
    toPoll.push(fid)
  }

  await runFolderPollsWithConcurrency(toPoll, 3)
}
