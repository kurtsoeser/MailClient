import { app } from 'electron'
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Anhaenge aus «Im Standardprogramm oeffnen» — aelter als diese Frist werden entfernt. */
export const ATTACHMENT_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export function attachmentCacheDirectory(): string {
  return join(app.getPath('userData'), 'attachment-cache')
}

export async function pruneStaleAttachmentCache(
  maxAgeMs: number = ATTACHMENT_CACHE_MAX_AGE_MS
): Promise<{ freedBytes: number; removedFiles: number }> {
  const dir = attachmentCacheDirectory()
  const cutoff = Date.now() - maxAgeMs
  let freedBytes = 0
  let removedFiles = 0
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return { freedBytes: 0, removedFiles: 0 }
  }
  for (const ent of entries) {
    if (!ent.isFile()) continue
    const full = join(dir, ent.name)
    try {
      const st = await stat(full)
      if (st.mtimeMs >= cutoff) continue
      freedBytes += st.size
      await rm(full, { force: true })
      removedFiles += 1
    } catch {
      /* ENOENT */
    }
  }
  return { freedBytes, removedFiles }
}

/** Schreibt Anhang in den Cache, raeumt alte Dateien auf, gibt absoluten Pfad zurueck. */
export async function writeAttachmentCacheFile(
  attachmentId: string,
  safeFileName: string,
  bytes: Buffer
): Promise<string> {
  const dir = attachmentCacheDirectory()
  await mkdir(dir, { recursive: true })
  await pruneStaleAttachmentCache()
  const target = join(dir, `${attachmentId}-${safeFileName}`)
  await writeFile(target, bytes)
  return target
}
