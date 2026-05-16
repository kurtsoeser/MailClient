import { app, BrowserWindow, session } from 'electron'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { existsSync } from 'node:fs'
import { readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { promisify } from 'node:util'
import type {
  LocalDataArchiveExportMode,
  LocalDataOptimizeResult,
  LocalDataUsageCategory,
  LocalDataUsageReport
} from '@shared/types'
import { LOCAL_DATA_ARCHIVE_FORMAT_VERSION } from '@shared/types'
import {
  ATTACHMENT_CACHE_MAX_AGE_MS,
  pruneStaleAttachmentCache
} from './attachment-cache'
import { listAccounts } from './accounts'
import { closeDb, getDb } from './db/index'

const execFileAsync = promisify(execFile)

/** Chromium-/Electron-Caches — bei Optimierung komplett geleert. */
export const CHROMIUM_CACHE_DIR_NAMES = [
  'Cache',
  'Code Cache',
  'GPUCache',
  'DawnGraphiteCache',
  'DawnWebGPUCache',
  'blob_storage'
] as const

export const ATTACHMENT_CACHE_DIR_NAME = 'attachment-cache' as const

/** Fuer ZIP-Export ohne Cache und Optimierung (inkl. Anhang-Cache). */
export const REGENERABLE_DIR_NAMES = [
  ...CHROMIUM_CACHE_DIR_NAMES,
  ATTACHMENT_CACHE_DIR_NAME
] as const

const MANIFEST_FILE = '.mailclient-archive-manifest.json'
/** Gesetzt wenn Chromium-Ordner beim Laufenden Prozess nicht vollstaendig geloescht werden konnten. */
const PENDING_CHROMIUM_CACHE_PURGE_FILE = '.pending-chromium-cache-purge'

async function removeDirectoryBestEffort(
  dirPath: string
): Promise<{ freedBytes: number; fullyRemoved: boolean }> {
  const before = await dirSizeAndCount(dirPath).catch(() => ({ bytes: 0, files: 0 }))
  if (before.bytes === 0) return { freedBytes: 0, fullyRemoved: true }
  try {
    await rm(dirPath, { recursive: true, force: true, maxRetries: 1, retryDelay: 100 })
    return { freedBytes: before.bytes, fullyRemoved: true }
  } catch {
    const after = await dirSizeAndCount(dirPath).catch(() => ({ bytes: before.bytes, files: 0 }))
    return {
      freedBytes: Math.max(0, before.bytes - after.bytes),
      fullyRemoved: after.bytes === 0
    }
  }
}

async function chromiumCacheBytesOnDisk(userDataPath: string): Promise<number> {
  let total = 0
  for (const name of CHROMIUM_CACHE_DIR_NAMES) {
    const { bytes } = await dirSizeAndCount(join(userDataPath, name)).catch(() => ({
      bytes: 0,
      files: 0
    }))
    total += bytes
  }
  return total
}

export function getUserDataPath(): string {
  return app.getPath('userData')
}

export function isRegenerableTopLevelDir(name: string): boolean {
  return (CHROMIUM_CACHE_DIR_NAMES as readonly string[]).includes(name)
}

export function isCacheTopLevelDir(name: string): boolean {
  return (
    isRegenerableTopLevelDir(name) ||
    name === ATTACHMENT_CACHE_DIR_NAME
  )
}

async function attachmentCacheStaleBytes(): Promise<number> {
  const dir = join(getUserDataPath(), ATTACHMENT_CACHE_DIR_NAME)
  const cutoff = Date.now() - ATTACHMENT_CACHE_MAX_AGE_MS
  let stale = 0
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return 0
  }
  for (const ent of entries) {
    if (!ent.isFile()) continue
    try {
      const st = await stat(join(dir, ent.name))
      if (st.mtimeMs < cutoff) stale += st.size
    } catch {
      /* ENOENT */
    }
  }
  return stale
}

function computeUsageBreakdown(
  categories: LocalDataUsageCategory[],
  totalBytes: number,
  staleAttachmentBytes: number
): LocalDataUsageReport['breakdown'] {
  let databaseBytes = 0
  let cacheBytes = 0
  for (const c of categories) {
    if (c.id === 'data') databaseBytes += c.bytes
    else if (isCacheTopLevelDir(c.id)) cacheBytes += c.bytes
  }
  const essentialBytes = Math.max(0, totalBytes - databaseBytes - cacheBytes)
  return {
    databaseBytes,
    cacheBytes,
    essentialBytes,
    attachmentCacheStaleBytes: staleAttachmentBytes
  }
}

async function dirSizeAndCount(dirPath: string): Promise<{ bytes: number; files: number }> {
  let bytes = 0
  let files = 0
  const stack = [dirPath]
  while (stack.length > 0) {
    const cur = stack.pop()!
    let entries
    try {
      entries = await readdir(cur, { withFileTypes: true })
    } catch {
      continue
    }
    for (const ent of entries) {
      const full = join(cur, ent.name)
      if (ent.isDirectory()) {
        stack.push(full)
      } else if (ent.isFile()) {
        files += 1
        try {
          bytes += (await stat(full)).size
        } catch {
          /* ENOENT */
        }
      }
    }
  }
  return { bytes, files }
}

async function fileSizeSafe(filePath: string): Promise<number> {
  try {
    return (await stat(filePath)).size
  } catch {
    return 0
  }
}

function categoryLabelKey(name: string): string {
  if (name === ATTACHMENT_CACHE_DIR_NAME) {
    return 'settings.localData.category.attachmentCache'
  }
  if (isRegenerableTopLevelDir(name)) {
    return 'settings.localData.category.chromiumCache'
  }
  switch (name) {
    case 'data':
      return 'settings.localData.category.database'
    case 'secure':
      return 'settings.localData.category.secure'
    case 'avatars':
      return 'settings.localData.category.avatars'
    case 'contact-photos':
      return 'settings.localData.category.contactPhotos'
    case 'note-attachments':
      return 'settings.localData.category.noteAttachments'
    case 'Local Storage':
      return 'settings.localData.category.localStorage'
    default:
      return 'settings.localData.category.other'
  }
}

export async function scanLocalDataUsage(): Promise<LocalDataUsageReport> {
  const userDataPath = getUserDataPath()
  const entries = await readdir(userDataPath, { withFileTypes: true })
  const categories: LocalDataUsageCategory[] = []
  let totalBytes = 0
  let totalFiles = 0
  let reclaimableBytes = 0

  for (const ent of entries) {
    if (ent.name === MANIFEST_FILE) continue
    const full = join(userDataPath, ent.name)
    if (ent.isDirectory()) {
      const { bytes, files } = await dirSizeAndCount(full)
      const canOptimize = isCacheTopLevelDir(ent.name)
      categories.push({
        id: ent.name,
        labelKey: categoryLabelKey(ent.name),
        bytes,
        fileCount: files,
        canOptimize
      })
      totalBytes += bytes
      totalFiles += files
      if (isCacheTopLevelDir(ent.name)) {
        reclaimableBytes += bytes
      }
    } else if (ent.isFile()) {
      const bytes = await fileSizeSafe(full)
      categories.push({
        id: ent.name,
        labelKey: categoryLabelKey(ent.name),
        bytes,
        fileCount: 1,
        canOptimize: false
      })
      totalBytes += bytes
      totalFiles += 1
    }
  }

  categories.sort((a, b) => b.bytes - a.bytes)

  const staleAttachmentBytes = await attachmentCacheStaleBytes()

  const breakdown = computeUsageBreakdown(categories, totalBytes, staleAttachmentBytes)

  return {
    userDataPath,
    totalBytes,
    totalFileCount: totalFiles,
    reclaimableBytes,
    breakdown,
    categories
  }
}

function collectAppSessions(): Set<Electron.Session> {
  const sessions = new Set<Electron.Session>()
  sessions.add(session.defaultSession)
  for (const win of BrowserWindow.getAllWindows()) {
    sessions.add(win.webContents.session)
  }
  return sessions
}

async function clearElectronSessionCaches(): Promise<void> {
  for (const s of collectAppSessions()) {
    try {
      await s.clearCache()
    } catch (e) {
      console.warn('[local-data] session.clearCache:', e)
    }
  }
}

/**
 * Chromium haelt Cache-Dateien auf Windows waehrend der Laufzeit gesperrt (EPERM).
 * Nur Session-Cache leeren; physische Ordner beim naechsten App-Start entfernen.
 */
async function prepareChromiumCacheCleanup(
  userDataPath: string
): Promise<{ needsRestartPurge: boolean }> {
  const onDisk = await chromiumCacheBytesOnDisk(userDataPath)
  if (onDisk > 0) {
    await markPendingChromiumCachePurge(userDataPath)
    return { needsRestartPurge: true }
  }
  await clearPendingChromiumCachePurgeFlag(userDataPath).catch(() => undefined)
  return { needsRestartPurge: false }
}

async function markPendingChromiumCachePurge(userDataPath: string): Promise<void> {
  await writeFile(join(userDataPath, PENDING_CHROMIUM_CACHE_PURGE_FILE), new Date().toISOString(), 'utf8')
}

async function clearPendingChromiumCachePurgeFlag(userDataPath: string): Promise<void> {
  await rm(join(userDataPath, PENDING_CHROMIUM_CACHE_PURGE_FILE), { force: true })
}

/** Beim naechsten Start: Chromium-Cache-Ordner loeschen, solange noch keine Locks bestehen. */
export async function applyPendingChromiumCachePurgeOnStartup(): Promise<void> {
  const userDataPath = getUserDataPath()
  const flagPath = join(userDataPath, PENDING_CHROMIUM_CACHE_PURGE_FILE)
  if (!existsSync(flagPath)) return
  for (const name of CHROMIUM_CACHE_DIR_NAMES) {
    await removeDirectoryBestEffort(join(userDataPath, name))
  }
  await clearPendingChromiumCachePurgeFlag(userDataPath).catch(() => undefined)
}

async function vacuumMailDatabase(): Promise<number> {
  try {
    const db = getDb()
    const dbPath = join(getUserDataPath(), 'data', 'mail.db')
    const before = await fileSizeSafe(dbPath)
    const walPath = `${dbPath}-wal`
    const beforeWal = await fileSizeSafe(walPath)
    db.pragma('wal_checkpoint(TRUNCATE)')
    db.exec('VACUUM')
    const after = await fileSizeSafe(dbPath)
    const afterWal = await fileSizeSafe(walPath)
    return Math.max(0, before + beforeWal - after - afterWal)
  } catch (e) {
    console.warn('[local-data] vacuumMailDatabase:', e)
    return 0
  }
}

async function pruneOrphanAvatars(userDataPath: string): Promise<number> {
  const avatarsDir = join(userDataPath, 'avatars')
  let freed = 0
  let entries
  try {
    entries = await readdir(avatarsDir, { withFileTypes: true })
  } catch {
    return 0
  }
  const accounts = await listAccounts()
  const keep = new Set(
    accounts
      .map((a) => a.profilePhotoFile?.trim())
      .filter((f): f is string => Boolean(f))
  )
  for (const ent of entries) {
    if (!ent.isFile()) continue
    if (keep.has(ent.name)) continue
    const full = join(avatarsDir, ent.name)
    const size = await fileSizeSafe(full)
    try {
      await rm(full, { force: true })
      freed += size
    } catch {
      /* gesperrt oder bereits entfernt */
    }
  }
  return freed
}

function dbHasTable(tableName: string): boolean {
  const row = getDb()
    .prepare(
      `SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`
    )
    .get(tableName) as { ok: number } | undefined
  return row?.ok === 1
}

async function pruneOrphanContactPhotos(userDataPath: string): Promise<number> {
  if (!dbHasTable('people_contacts')) return 0
  let rows: Array<{ p: string }>
  try {
    rows = getDb()
      .prepare(
        `SELECT DISTINCT photo_local_path AS p FROM people_contacts WHERE photo_local_path IS NOT NULL`
      )
      .all() as Array<{ p: string }>
  } catch (e) {
    console.warn('[local-data] pruneOrphanContactPhotos:', e)
    return 0
  }
  const keepRel = new Set(
    rows.map((r) => r.p.replace(/\\/g, '/').replace(/:/g, '_')).filter(Boolean)
  )
  const root = join(userDataPath, 'contact-photos')
  let freed = 0
  const stack = [root]
  while (stack.length > 0) {
    const cur = stack.pop()!
    let entries
    try {
      entries = await readdir(cur, { withFileTypes: true })
    } catch {
      continue
    }
    for (const ent of entries) {
      const full = join(cur, ent.name)
      if (ent.isDirectory()) {
        stack.push(full)
        continue
      }
      if (!ent.isFile() || !ent.name.endsWith('.img')) continue
      const rel = relative(getUserDataPath(), full).replace(/\\/g, '/')
      if (keepRel.has(rel)) continue
      const size = await fileSizeSafe(full)
      try {
        await rm(full, { force: true })
        freed += size
      } catch {
        /* gesperrt oder bereits entfernt */
      }
    }
  }
  return freed
}

async function runOptimizeStep(label: string, fn: () => Promise<number>): Promise<number> {
  try {
    return await fn()
  } catch (e) {
    console.warn(`[local-data] ${label}:`, e)
    return 0
  }
}

export async function optimizeLocalData(): Promise<LocalDataOptimizeResult> {
  const userDataPath = getUserDataPath()
  const before = await scanLocalDataUsage()

  try {
    await clearElectronSessionCaches()
  } catch (e) {
    console.warn('[local-data] clearElectronSessionCaches:', e)
  }

  const attachmentStaleFreed = await runOptimizeStep('pruneStaleAttachmentCache', async () => {
    const r = await pruneStaleAttachmentCache()
    return r.freedBytes
  })

  let chromium = { needsRestartPurge: false }
  try {
    chromium = await prepareChromiumCacheCleanup(userDataPath)
  } catch (e) {
    console.warn('[local-data] prepareChromiumCacheCleanup:', e)
  }

  const cacheFreedOnDisk = await runOptimizeStep('attachmentCache', async () => {
    const dir = await removeDirectoryBestEffort(join(userDataPath, ATTACHMENT_CACHE_DIR_NAME))
    return dir.freedBytes
  })

  const vacuumFreed = await runOptimizeStep('vacuumMailDatabase', vacuumMailDatabase)
  const avatarsFreed = await runOptimizeStep('pruneOrphanAvatars', () =>
    pruneOrphanAvatars(userDataPath)
  )
  const contactsFreed = await runOptimizeStep('pruneOrphanContactPhotos', () =>
    pruneOrphanContactPhotos(userDataPath)
  )

  const after = await scanLocalDataUsage()
  const measuredFreed = Math.max(0, before.totalBytes - after.totalBytes)
  const freedBytes = Math.max(
    measuredFreed,
    cacheFreedOnDisk + vacuumFreed + avatarsFreed + contactsFreed
  )

  return {
    freedBytes,
    beforeTotalBytes: before.totalBytes,
    afterTotalBytes: after.totalBytes,
    chromiumCacheNeedsRestart: chromium.needsRestartPurge,
    details: {
      cacheAndTempBytes: cacheFreedOnDisk,
      attachmentCacheStaleBytes: attachmentStaleFreed,
      databaseBytes: vacuumFreed,
      orphanAvatarsBytes: avatarsFreed,
      orphanContactPhotosBytes: contactsFreed
    }
  }
}

function tarExcludeArgs(mode: LocalDataArchiveExportMode): string[] {
  if (mode === 'full') return []
  const args: string[] = []
  for (const name of REGENERABLE_DIR_NAMES) {
    args.push(`--exclude=./${name}`)
    args.push(`--exclude=${name}`)
  }
  return args
}

async function runTarCreateZip(
  sourceDir: string,
  zipPath: string,
  extraExclude: string[] = []
): Promise<void> {
  const args = ['-a', '-cf', zipPath, ...extraExclude, '-C', sourceDir, '.']
  await execFileAsync('tar', args, { windowsHide: true })
}

async function writeExportManifest(
  userDataPath: string,
  mode: LocalDataArchiveExportMode
): Promise<string> {
  const manifestPath = join(userDataPath, MANIFEST_FILE)
  const payload = {
    formatVersion: LOCAL_DATA_ARCHIVE_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: app.getVersion(),
    mode,
    productName: 'MailClient'
  }
  await writeFile(manifestPath, JSON.stringify(payload, null, 2), 'utf8')
  return manifestPath
}

export async function exportLocalDataArchive(
  zipPath: string,
  mode: LocalDataArchiveExportMode
): Promise<{ path: string; mode: LocalDataArchiveExportMode }> {
  const userDataPath = getUserDataPath()
  getDb().pragma('wal_checkpoint(TRUNCATE)')

  const manifestPath = await writeExportManifest(userDataPath, mode)
  try {
    await runTarCreateZip(userDataPath, zipPath, tarExcludeArgs(mode))
  } finally {
    await rm(manifestPath, { force: true })
  }
  return { path: zipPath, mode }
}

async function validateArchiveManifest(extractDir: string): Promise<void> {
  const manifestPath = join(extractDir, MANIFEST_FILE)
  let raw: string
  try {
    const { readFile } = await import('node:fs/promises')
    raw = await readFile(manifestPath, 'utf8')
  } catch {
    const dataDb = join(extractDir, 'data', 'mail.db')
    try {
      await stat(dataDb)
      return
    } catch {
      throw new Error('Archiv enthaelt weder Manifest noch data/mail.db.')
    }
  }
  const parsed = JSON.parse(raw) as { formatVersion?: number; productName?: string }
  if (parsed.formatVersion !== LOCAL_DATA_ARCHIVE_FORMAT_VERSION) {
    throw new Error(`Unbekannte Archiv-Version (erwartet ${LOCAL_DATA_ARCHIVE_FORMAT_VERSION}).`)
  }
}

async function copyFileWithStreams(src: string, dest: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const rs = createReadStream(src)
    const ws = createWriteStream(dest)
    rs.on('error', reject)
    ws.on('error', reject)
    ws.on('finish', resolve)
    rs.pipe(ws)
  })
}

async function mergeExtractedIntoUserData(extractDir: string, userDataPath: string): Promise<void> {
  const stack = [extractDir]
  while (stack.length > 0) {
    const cur = stack.pop()!
    const entries = await readdir(cur, { withFileTypes: true })
    for (const ent of entries) {
      const src = join(cur, ent.name)
      const rel = relative(extractDir, src)
      if (rel === MANIFEST_FILE) continue
      const dest = join(userDataPath, rel)
      if (ent.isDirectory()) {
        stack.push(src)
        const { mkdir } = await import('node:fs/promises')
        await mkdir(dest, { recursive: true })
      } else if (ent.isFile()) {
        const { mkdir } = await import('node:fs/promises')
        await mkdir(join(dest, '..'), { recursive: true })
        await copyFileWithStreams(src, dest)
      }
    }
  }
}

export async function restoreLocalDataArchive(zipPath: string): Promise<void> {
  const userDataPath = getUserDataPath()
  const extractDir = join(
    tmpdir(),
    `mailclient-restore-${createHash('sha256').update(zipPath).digest('hex').slice(0, 12)}`
  )
  await rm(extractDir, { recursive: true, force: true })
  const { mkdir } = await import('node:fs/promises')
  await mkdir(extractDir, { recursive: true })

  closeDb()

  try {
    await execFileAsync('tar', ['-xf', zipPath, '-C', extractDir], { windowsHide: true })
    await validateArchiveManifest(extractDir)
    await mergeExtractedIntoUserData(extractDir, userDataPath)
    await rm(join(userDataPath, MANIFEST_FILE), { force: true })
  } finally {
    await rm(extractDir, { recursive: true, force: true })
  }
}
