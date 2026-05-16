import type { TaskItemRow, TaskListRow } from '@shared/types'
import { listAccounts } from './accounts'
import {
  deleteCloudTask,
  getTaskListSyncState,
  invalidateTaskListSyncState,
  invalidateTaskListsSyncState,
  isTaskListSyncFresh,
  isTaskListsSyncFresh,
  listCloudTasksFromCache,
  listTaskListsFromCache,
  pruneCloudTasksInList,
  replaceTaskListsForAccount,
  touchTaskListSyncState,
  touchTaskListsSyncState,
  upsertCloudTasks
} from './db/cloud-tasks-repo'
import { broadcastTasksChanged } from './ipc/ipc-broadcasts'
import { isAppOnline } from './network-status'
import { listTaskListsForAccount, listTasksForAccount } from './tasks-service'

export const TASKS_CACHE_STALE_MS = 120_000

const inflightLists = new Map<string, Promise<void>>()
const inflightTasks = new Map<string, Promise<void>>()

/** Verhindert parallele Graph-Aufrufe während `IPC.auth.remove` dieses Konto löscht. */
const tasksRemovalBlocked = new Set<string>()

function listsKey(accountId: string): string {
  return accountId
}

function tasksKey(accountId: string, listId: string, showCompleted: boolean): string {
  return `${accountId}\u001f${listId}\u001f${showCompleted ? '1' : '0'}`
}

function cloudTasksCacheSignature(rows: TaskItemRow[]): string {
  return rows
    .map((t) => `${t.id}\t${t.completed ? 1 : 0}\t${t.dueIso ?? ''}\t${t.title}`)
    .sort()
    .join('\n')
}

function taskListsCacheSignature(rows: TaskListRow[]): string {
  return rows
    .map((l) => `${l.id}\t${l.name}`)
    .sort()
    .join('\n')
}

export async function drainTasksInflightForAccount(accountId: string): Promise<void> {
  const pending: Promise<void>[] = []
  const lk = listsKey(accountId)
  const lp = inflightLists.get(lk)
  if (lp) pending.push(lp)
  for (const [k, p] of inflightTasks) {
    if (k.startsWith(`${accountId}\u001f`)) pending.push(p)
  }
  if (pending.length === 0) return
  await Promise.allSettled(pending)
}

/** Sperre setzen und laufende Listen-/Task-Syncs fürs Konto abwarten (vor DB-/MSAL-Löschung). */
export async function beginTasksAccountRemoval(accountId: string): Promise<void> {
  tasksRemovalBlocked.add(accountId)
  try {
    await drainTasksInflightForAccount(accountId)
  } catch (e) {
    tasksRemovalBlocked.delete(accountId)
    throw e
  }
}

export function endTasksAccountRemoval(accountId: string): void {
  tasksRemovalBlocked.delete(accountId)
}

function isTasksRemovalBlocked(accountId: string): boolean {
  return tasksRemovalBlocked.has(accountId)
}

async function fetchListsFromCloudAndPersist(accountId: string): Promise<TaskListRow[]> {
  const lists = await listTaskListsForAccount(accountId)
  replaceTaskListsForAccount(accountId, lists)
  touchTaskListsSyncState(accountId)
  return lists
}

async function fetchTasksFromCloudAndPersist(
  accountId: string,
  listId: string,
  opts?: { showCompleted?: boolean; showHidden?: boolean }
): Promise<TaskItemRow[]> {
  const showCompleted = opts?.showCompleted !== false
  const tasks = await listTasksForAccount(accountId, listId, {
    showCompleted,
    showHidden: opts?.showHidden
  })
  upsertCloudTasks(accountId, tasks)
  pruneCloudTasksInList(accountId, listId, new Set(tasks.map((t) => t.id)))
  touchTaskListSyncState(accountId, listId)
  return tasks
}

async function refreshListsInBackground(accountId: string): Promise<void> {
  const key = listsKey(accountId)
  const existing = inflightLists.get(key)
  if (existing) {
    await existing
    return
  }
  const run = (async (): Promise<void> => {
    try {
      if (!isAppOnline() || isTasksRemovalBlocked(accountId)) return
      const before = taskListsCacheSignature(listTaskListsFromCache(accountId))
      await fetchListsFromCloudAndPersist(accountId)
      const after = taskListsCacheSignature(listTaskListsFromCache(accountId))
      if (before !== after) broadcastTasksChanged(accountId)
    } catch (e) {
      console.warn('[tasks-cache] Hintergrund-Sync der Aufgabenlisten fehlgeschlagen:', accountId, e)
    }
  })().finally(() => {
    if (inflightLists.get(key) === run) inflightLists.delete(key)
  })
  inflightLists.set(key, run)
  await run
}

async function refreshTasksInBackground(
  accountId: string,
  listId: string,
  opts?: { showCompleted?: boolean; showHidden?: boolean }
): Promise<void> {
  const showCompleted = opts?.showCompleted !== false
  const key = tasksKey(accountId, listId, showCompleted)
  const existing = inflightTasks.get(key)
  if (existing) {
    await existing
    return
  }
  const run = (async (): Promise<void> => {
    try {
      if (!isAppOnline() || isTasksRemovalBlocked(accountId)) return
      const before = cloudTasksCacheSignature(
        listCloudTasksFromCache(accountId, listId, { showCompleted })
      )
      await fetchTasksFromCloudAndPersist(accountId, listId, opts)
      const after = cloudTasksCacheSignature(
        listCloudTasksFromCache(accountId, listId, { showCompleted })
      )
      if (before !== after) broadcastTasksChanged(accountId)
    } catch (e) {
      console.warn('[tasks-cache] Hintergrund-Sync der Aufgaben fehlgeschlagen:', accountId, listId, e)
    }
  })().finally(() => {
    if (inflightTasks.get(key) === run) inflightTasks.delete(key)
  })
  inflightTasks.set(key, run)
  await run
}

export async function listTaskListsCached(
  accountId: string,
  opts?: { forceRefresh?: boolean; cacheOnly?: boolean }
): Promise<TaskListRow[]> {
  if (opts?.cacheOnly === true) {
    return listTaskListsFromCache(accountId)
  }
  if (isTasksRemovalBlocked(accountId)) {
    return listTaskListsFromCache(accountId)
  }
  const cached = listTaskListsFromCache(accountId)
  const force = opts?.forceRefresh === true
  const fresh = isTaskListsSyncFresh(accountId, TASKS_CACHE_STALE_MS)

  if (!force && cached.length > 0 && fresh) {
    return cached
  }

  if (!force && cached.length > 0 && !fresh && isAppOnline()) {
    void refreshListsInBackground(accountId)
    return cached
  }

  if (!isAppOnline()) {
    return cached
  }

  try {
    return await fetchListsFromCloudAndPersist(accountId)
  } catch (e) {
    console.warn('[tasks-cache] Aufgabenlisten konnten nicht aus der Cloud geladen werden:', accountId, e)
    return cached
  }
}

export async function listTasksCached(
  accountId: string,
  listId: string,
  opts?: {
    showCompleted?: boolean
    showHidden?: boolean
    forceRefresh?: boolean
    cacheOnly?: boolean
  }
): Promise<TaskItemRow[]> {
  if (opts?.cacheOnly === true) {
    const sc = opts?.showCompleted !== false
    return listCloudTasksFromCache(accountId, listId, { showCompleted: sc })
  }
  if (isTasksRemovalBlocked(accountId)) {
    const sc = opts?.showCompleted !== false
    return listCloudTasksFromCache(accountId, listId, { showCompleted: sc })
  }
  const showCompleted = opts?.showCompleted !== false
  const cached = listCloudTasksFromCache(accountId, listId, { showCompleted })
  const force = opts?.forceRefresh === true
  const fresh = isTaskListSyncFresh(accountId, listId, TASKS_CACHE_STALE_MS)

  if (!force && cached.length > 0 && fresh) {
    return cached
  }

  if (!force && cached.length > 0 && !fresh && isAppOnline()) {
    void refreshTasksInBackground(accountId, listId, opts)
    return cached
  }

  if (!force && cached.length > 0 && !getTaskListSyncState(accountId, listId) && isAppOnline()) {
    void refreshTasksInBackground(accountId, listId, opts)
    return cached
  }

  if (!isAppOnline()) {
    return cached
  }

  try {
    return await fetchTasksFromCloudAndPersist(accountId, listId, opts)
  } catch (e) {
    console.warn('[tasks-cache] Aufgaben konnten nicht aus der Cloud geladen werden:', accountId, listId, e)
    return cached
  }
}

export async function syncTasksForAccount(accountId: string): Promise<void> {
  if (!isAppOnline() || isTasksRemovalBlocked(accountId)) return
  const lists = await fetchListsFromCloudAndPersist(accountId)
  for (const list of lists) {
    try {
      await fetchTasksFromCloudAndPersist(accountId, list.id, {
        showCompleted: true,
        showHidden: false
      })
    } catch (e) {
      console.warn('[tasks-cache] Liste konnte nicht synchronisiert werden:', accountId, list.id, e)
    }
  }
  broadcastTasksChanged(accountId)
}

export async function syncAllTasksAccounts(): Promise<void> {
  if (!isAppOnline()) return
  const accounts = await listAccounts()
  for (const acc of accounts) {
    if (acc.provider !== 'microsoft' && acc.provider !== 'google') continue
    try {
      await syncTasksForAccount(acc.id)
    } catch (e) {
      console.warn('[tasks-cache] Sync fehlgeschlagen:', acc.id, e)
    }
  }
}

export {
  invalidateTaskListSyncState,
  invalidateTaskListsSyncState,
  upsertCloudTasks,
  deleteCloudTask
}
