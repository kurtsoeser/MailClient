import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import { app } from 'electron'
import type {
  ComposeDriveExplorerEntry,
  ComposeDriveExplorerFavorite,
  ComposeDriveExplorerNavCrumb,
  ComposeDriveExplorerScope
} from '@shared/types'

const FILE_NAME = 'drive-explorer-favorites.json'

interface FavoritesFile {
  version: 1
  favorites: ComposeDriveExplorerFavorite[]
}

function storePath(): string {
  return join(app.getPath('userData'), FILE_NAME)
}

async function readAll(): Promise<ComposeDriveExplorerFavorite[]> {
  try {
    const raw = await readFile(storePath(), 'utf8')
    const p = JSON.parse(raw) as FavoritesFile
    if (!p || p.version !== 1 || !Array.isArray(p.favorites)) return []
    return p.favorites
  } catch {
    return []
  }
}

async function writeAll(favorites: ComposeDriveExplorerFavorite[]): Promise<void> {
  const data: FavoritesFile = { version: 1, favorites }
  await writeFile(storePath(), JSON.stringify(data), 'utf8')
}

function normalizeCrumbs(crumbs: ComposeDriveExplorerNavCrumb[]): ComposeDriveExplorerNavCrumb[] {
  return crumbs.map((c) => ({
    id: c.id,
    name: c.name,
    driveId: c.driveId ?? undefined,
    siteId: c.siteId ?? undefined
  }))
}

function pathKey(accountId: string, scope: ComposeDriveExplorerScope, crumbs: ComposeDriveExplorerNavCrumb[]): string {
  const norm = normalizeCrumbs(crumbs).map((c) => ({
    id: c.id,
    name: c.name,
    driveId: c.driveId ?? null,
    siteId: c.siteId ?? null
  }))
  return JSON.stringify({ accountId, scope, crumbs: norm })
}

function defaultLabel(scope: ComposeDriveExplorerScope, crumbs: ComposeDriveExplorerNavCrumb[]): string {
  if (crumbs.length === 0) {
    if (scope === 'recent') return 'Zuletzt'
    if (scope === 'myfiles') return 'Meine Dateien'
    if (scope === 'sharepoint') return 'SharePoint'
    if (scope === 'shared') return 'Geteilt'
    return 'Favorit'
  }
  return crumbs.map((c) => c.name).join(' · ')
}

function compareFavorites(a: ComposeDriveExplorerFavorite, b: ComposeDriveExplorerFavorite): number {
  const ao = typeof a.sortOrder === 'number' ? a.sortOrder : Date.parse(a.savedAt) || 0
  const bo = typeof b.sortOrder === 'number' ? b.sortOrder : Date.parse(b.savedAt) || 0
  if (ao !== bo) return ao - bo
  if (a.savedAt !== b.savedAt) return a.savedAt < b.savedAt ? 1 : -1
  return a.id.localeCompare(b.id)
}

function trimForAccount(
  all: ComposeDriveExplorerFavorite[],
  accountId: string,
  limit: number
): ComposeDriveExplorerFavorite[] {
  const rest = all.filter((f) => f.accountId !== accountId)
  const mine = all.filter((f) => f.accountId === accountId)
  const sorted = [...mine].sort(compareFavorites)
  const cut = sorted.slice(0, limit)
  return [...rest, ...cut]
}

export async function listDriveExplorerFavorites(accountId: string): Promise<ComposeDriveExplorerFavorite[]> {
  const acc = accountId.trim()
  if (!acc) return []
  const all = await readAll()
  return all
    .filter(
      (f) =>
        f.accountId === acc &&
        typeof f.id === 'string' &&
        typeof f.label === 'string' &&
        typeof f.savedAt === 'string' &&
        (f.scope === 'recent' || f.scope === 'myfiles' || f.scope === 'shared' || f.scope === 'sharepoint') &&
        Array.isArray(f.crumbs)
    )
    .sort(compareFavorites)
}

export async function addDriveExplorerFavorite(
  accountId: string,
  scope: ComposeDriveExplorerScope,
  crumbs: ComposeDriveExplorerNavCrumb[],
  labelInput: string | null | undefined,
  cachedEntries: ComposeDriveExplorerEntry[] | null | undefined
): Promise<ComposeDriveExplorerFavorite> {
  const acc = accountId.trim()
  if (!acc) throw new Error('Kein Konto.')
  const key = pathKey(acc, scope, normalizeCrumbs(crumbs))
  const all = await readAll()
  if (all.some((f) => pathKey(f.accountId, f.scope, f.crumbs) === key)) {
    throw new Error('Dieser Ort ist bereits als Favorit gespeichert.')
  }

  const label = (labelInput?.trim() || defaultLabel(scope, normalizeCrumbs(crumbs))).slice(0, 120) || 'Favorit'
  const hasCache = Boolean(cachedEntries && cachedEntries.length > 0)
  const now = new Date().toISOString()
  const mine = all.filter((f) => f.accountId === acc)
  const maxSo = mine.reduce((m, f) => Math.max(m, typeof f.sortOrder === 'number' ? f.sortOrder : -1), -1)
  const sortOrder = maxSo + 1

  const fav: ComposeDriveExplorerFavorite = {
    id: randomUUID(),
    accountId: acc,
    label,
    scope,
    crumbs: normalizeCrumbs(crumbs),
    savedAt: now,
    sortOrder,
    cachedEntries: hasCache ? cachedEntries! : null,
    cachedAt: hasCache ? now : null
  }

  const next = trimForAccount([...all, fav], acc, 40)
  await writeAll(next)
  return fav
}

export async function removeDriveExplorerFavorite(accountId: string, id: string): Promise<void> {
  const acc = accountId.trim()
  const fid = id.trim()
  if (!acc || !fid) return
  const all = await readAll()
  const next = all.filter((f) => !(f.accountId === acc && f.id === fid))
  await writeAll(next)
}

export async function updateDriveExplorerFavoriteCache(
  accountId: string,
  id: string,
  entries: ComposeDriveExplorerEntry[]
): Promise<void> {
  const acc = accountId.trim()
  const fid = id.trim()
  if (!acc || !fid) return
  const all = await readAll()
  const i = all.findIndex((f) => f.accountId === acc && f.id === fid)
  if (i === -1) return
  const now = new Date().toISOString()
  all[i] = {
    ...all[i]!,
    cachedEntries: entries.length > 0 ? entries : null,
    cachedAt: entries.length > 0 ? now : null
  }
  await writeAll(all)
}

export async function renameDriveExplorerFavorite(accountId: string, id: string, label: string): Promise<void> {
  const acc = accountId.trim()
  const fid = id.trim()
  const lab = label.trim().slice(0, 120)
  if (!acc || !fid) return
  if (!lab) {
    throw new Error('Der Name darf nicht leer sein.')
  }
  const all = await readAll()
  const i = all.findIndex((f) => f.accountId === acc && f.id === fid)
  if (i === -1) return
  all[i] = { ...all[i]!, label: lab }
  await writeAll(all)
}

export async function reorderDriveExplorerFavorites(accountId: string, orderedIds: string[]): Promise<void> {
  const acc = accountId.trim()
  if (!acc || !Array.isArray(orderedIds)) return
  const all = await readAll()
  const mine = all.filter((f) => f.accountId === acc)
  if (mine.length === 0) return
  if (orderedIds.length !== mine.length) {
    throw new Error('Reihenfolge: ungueltige ID-Liste.')
  }
  const idSet = new Set(mine.map((f) => f.id))
  for (const id of orderedIds) {
    if (typeof id !== 'string' || !id.trim() || !idSet.has(id.trim())) {
      throw new Error('Reihenfolge: unbekannte oder doppelte ID.')
    }
  }
  const seen = new Set<string>()
  for (const id of orderedIds) {
    const t = id.trim()
    if (seen.has(t)) {
      throw new Error('Reihenfolge: doppelte ID.')
    }
    seen.add(t)
  }
  const byId = new Map(mine.map((f) => [f.id, f]))
  const rest = all.filter((f) => f.accountId !== acc)
  const reordered = orderedIds.map((rawId, index) => {
    const id = rawId.trim()
    const base = byId.get(id)
    if (!base) throw new Error('Reihenfolge: Eintrag fehlt.')
    return { ...base, sortOrder: index }
  })
  await writeAll([...rest, ...reordered])
}
