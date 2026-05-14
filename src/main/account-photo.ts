import { app } from 'electron'
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { acquireTokenSilent } from './auth/microsoft'

const PROFILE_FETCH_MAX_BYTES = 5 * 1024 * 1024

function isAllowedGoogleProfilePictureHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  return (
    h.endsWith('.googleusercontent.com') ||
    h.endsWith('.ggpht.com') ||
    h === 'ssl.gstatic.com' ||
    h === 'www.gstatic.com'
  )
}

function looksLikeImageBytes(buf: Buffer): boolean {
  if (buf.length < 3) return false
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true
  return (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  )
}

function imageMimeFromMagic(buf: Buffer): string {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg'
  }
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return 'image/png'
  }
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp'
  }
  return 'image/jpeg'
}

export function avatarFileNameForAccount(accountId: string): string {
  return `${accountId.replace(/[^a-zA-Z0-9]+/g, '_')}.jpg`
}

export function avatarsDirectory(): string {
  return join(app.getPath('userData'), 'avatars')
}

export async function saveAccountProfilePhoto(accountId: string, imageBytes: Buffer): Promise<string> {
  const dir = avatarsDirectory()
  await mkdir(dir, { recursive: true })
  const fileName = avatarFileNameForAccount(accountId)
  const fullPath = join(dir, fileName)
  await writeFile(fullPath, imageBytes)
  return fileName
}

export async function readAccountProfilePhotoDataUrl(
  accountId: string,
  profilePhotoFile: string
): Promise<string | null> {
  const expected = avatarFileNameForAccount(accountId)
  if (profilePhotoFile !== expected) return null
  const fullPath = join(avatarsDirectory(), profilePhotoFile)
  try {
    const buf = await readFile(fullPath)
    const mime = imageMimeFromMagic(buf)
    return `data:${mime};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

export async function deleteAccountProfilePhoto(
  profilePhotoFile: string | null | undefined,
  accountId: string
): Promise<void> {
  if (!profilePhotoFile) return
  const expected = avatarFileNameForAccount(accountId)
  if (profilePhotoFile !== expected) return
  try {
    await unlink(join(avatarsDirectory(), profilePhotoFile))
  } catch {
    // Datei existiert nicht mehr – ignorieren
  }
}

export async function fetchMicrosoftProfilePhoto(
  clientId: string,
  homeAccountId: string
): Promise<Buffer | null> {
  const token = await acquireTokenSilent(clientId, homeAccountId)
  const res = await fetch('https://graph.microsoft.com/v1.0/me/photo/$value', {
    headers: { Authorization: `Bearer ${token.accessToken}` }
  })
  if (!res.ok) return null
  const ab = await res.arrayBuffer()
  const buf = Buffer.from(ab)
  return buf.length > 0 ? buf : null
}

/**
 * Profilbild-URL aus Google id_token (`picture`). Nur https und bekannte Google-Hosts.
 */
export async function fetchGoogleProfilePictureFromUrl(url: string): Promise<Buffer | null> {
  const raw = url.trim()
  if (!raw.startsWith('https://')) return null
  let host: string
  try {
    host = new URL(raw).hostname
  } catch {
    return null
  }
  if (!isAllowedGoogleProfilePictureHost(host)) {
    return null
  }
  const res = await fetch(raw, {
    headers: { 'User-Agent': 'MailClient/1.0 (Electron)' },
    redirect: 'follow'
  })
  if (!res.ok) return null
  const len = res.headers.get('content-length')
  if (len && Number(len) > PROFILE_FETCH_MAX_BYTES) return null
  const ab = await res.arrayBuffer()
  if (ab.byteLength === 0 || ab.byteLength > PROFILE_FETCH_MAX_BYTES) return null
  const buf = Buffer.from(ab)
  if (buf.length === 0) return null
  const ct = (res.headers.get('content-type') ?? '').toLowerCase()
  if (!looksLikeImageBytes(buf) && !ct.startsWith('image/')) return null
  return buf
}

/**
 * Profilbild-URL laut Google Userinfo (wenn `picture` nicht im id_token steht).
 */
export async function fetchGoogleUserinfoPictureUrl(accessToken: string): Promise<string | null> {
  const tok = accessToken.trim()
  if (!tok) return null
  const endpoints = [
    'https://openidconnect.googleapis.com/v1/userinfo',
    'https://www.googleapis.com/oauth2/v3/userinfo'
  ]
  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${tok}`,
          'User-Agent': 'MailClient/1.0 (Electron)'
        }
      })
      if (!res.ok) continue
      const j = (await res.json()) as { picture?: string | null }
      const p = typeof j.picture === 'string' ? j.picture.trim() : ''
      if (p.startsWith('https://')) return p
    } catch {
      /* naechster Endpoint */
    }
  }
  return null
}
