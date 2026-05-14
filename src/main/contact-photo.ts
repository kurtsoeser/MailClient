import { app } from 'electron'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join, normalize, resolve } from 'node:path'

const CONTACT_PHOTO_MAX_BYTES = 4 * 1024 * 1024

function contactPhotosRoot(): string {
  return join(app.getPath('userData'), 'contact-photos')
}

/**
 * Nur Zeichen, die in Windows/macOS/Linux in einem Verzeichnisnamen sicher sind.
 * Konto-IDs wie `ms:…` / `google:…` enthalten `:` — unter Windows in Ordnernamen verboten (mkdir ENOENT).
 */
function safeAccountSegment(accountId: string): string {
  const s = accountId
    .replace(/[/\\:*?"<>|]+/g, '_')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 120)
  return s || 'acct'
}

/** Relativer Pfad ab `userData` (z. B. `contact-photos/ms_xxx/abc123.img`). */
export function contactPhotoRelativePath(accountId: string, remoteId: string): string {
  const h = createHash('sha256').update(remoteId, 'utf8').digest('hex').slice(0, 24)
  const rel = join('contact-photos', safeAccountSegment(accountId), `${h}.img`).replace(/\\/g, '/')
  /** Relativ zu userData — niemals `:` (auch nicht aus Join-/Alt-Bundles). */
  return rel.replace(/:/g, '_')
}

/** Alte Bundles: `contact-photos/ms:…` — unter Windows ungueltig; beim Lesen auf gueltigen Ordner abbilden. */
function normalizeLegacyContactPhotoRel(rel: string): string {
  return rel
    .replace(/contact-photos\/ms:/g, 'contact-photos/ms_')
    .replace(/contact-photos\/google:/g, 'contact-photos/google_')
    .replace(/contact-photos\\ms:/g, 'contact-photos\\ms_')
    .replace(/contact-photos\\google:/g, 'contact-photos\\google_')
    .replace(/:/g, '_')
}

function resolveUnderUserData(relativePath: string): string | null {
  const base = normalize(app.getPath('userData'))
  const rel = normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '')
  const full = resolve(base, rel)
  if (!full.startsWith(base)) return null
  return full
}

export async function saveContactPhotoBytes(
  accountId: string,
  remoteId: string,
  imageBytes: Buffer
): Promise<string> {
  if (imageBytes.length === 0 || imageBytes.length > CONTACT_PHOTO_MAX_BYTES) {
    throw new Error('Kontaktfoto: ungueltige Groesse.')
  }
  const rel = contactPhotoRelativePath(accountId, remoteId)
  const full = resolveUnderUserData(rel)
  if (!full) throw new Error('Kontaktfoto: ungueltiger Pfad.')
  await mkdir(join(full, '..'), { recursive: true })
  await writeFile(full, imageBytes)
  return rel
}

/** Lokale Kontaktfoto-Datei loeschen (Fehler werden ignoriert). */
export async function deleteContactPhotoFileIfExists(relativePath: string | null | undefined): Promise<void> {
  if (!relativePath?.trim()) return
  const rel = normalizeLegacyContactPhotoRel(relativePath.trim())
  const full = resolveUnderUserData(rel)
  if (!full) return
  try {
    await unlink(full)
  } catch {
    // ENOENT etc.
  }
}

export async function readContactPhotoDataUrl(relativePath: string | null | undefined): Promise<string | null> {
  if (!relativePath?.trim()) return null
  const rel = normalizeLegacyContactPhotoRel(relativePath.trim())
  const full = resolveUnderUserData(rel)
  if (!full) return null
  try {
    const buf = await readFile(full)
    if (buf.length === 0) return null
    let mime = 'image/jpeg'
    if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      mime = 'image/png'
    } else if (
      buf.length >= 12 &&
      buf.toString('ascii', 0, 4) === 'RIFF' &&
      buf.toString('ascii', 8, 12) === 'WEBP'
    ) {
      mime = 'image/webp'
    }
    return `data:${mime};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}
