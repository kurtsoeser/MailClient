import type { ConnectedAccount, MailFull, MailListItem } from '@shared/types'
import { getFreshGoogleAccessToken } from '../google/google-auth-client'
import { getGoogleCredentials } from '../google/google-credentials-store'
import {
  fetchGoogleProfilePictureFromUrl,
  fetchGoogleUserinfoPictureUrl,
  fetchMicrosoftProfilePhoto,
  saveAccountProfilePhoto
} from '../account-photo'
import { loadConfig } from '../config'
import { listAccounts, upsertAccount } from '../accounts'
import {
  attachCategoriesToMailItems,
  attachCategoriesToFull
} from '../db/message-tags-repo'
import { attachVipFlagsToMailItems, attachVipFlagToFull } from '../db/vip-repo'
import { broadcastAccountsChanged } from './ipc-broadcasts'

export function parseGoogleIdToken(idToken: string): {
  sub: string
  email?: string
  name?: string
  picture?: string
} {
  const parts = idToken.split('.')
  if (parts.length < 2) {
    throw new Error('Google id_token ungueltig.')
  }
  const json = JSON.parse(
    Buffer.from(parts[1]!.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
  ) as { sub?: string; email?: string; name?: string; picture?: string }
  const sub = json.sub?.trim()
  if (!sub) {
    throw new Error('Google id_token ohne sub.')
  }
  return {
    sub,
    email: json.email?.trim(),
    name: json.name?.trim(),
    picture: json.picture?.trim()
  }
}

export async function tryAttachGoogleProfilePhoto(
  accountId: string,
  idToken: string,
  account: ConnectedAccount,
  accessToken?: string | null
): Promise<ConnectedAccount> {
  try {
    let picture = parseGoogleIdToken(idToken).picture?.trim()
    if (!picture && accessToken) {
      picture = (await fetchGoogleUserinfoPictureUrl(accessToken)) ?? undefined
    }
    if (!picture) return account
    const buf = await fetchGoogleProfilePictureFromUrl(picture)
    if (!buf) return account
    const fileName = await saveAccountProfilePhoto(accountId, buf)
    return { ...account, profilePhotoFile: fileName }
  } catch (e) {
    console.warn('[ipc] Google-Profilfoto:', e)
    return account
  }
}

async function ensureMicrosoftProfilePhotosForMissing(): Promise<void> {
  const config = await loadConfig()
  if (!config.microsoftClientId) return
  const accounts = await listAccounts()
  let changed = false
  for (const a of accounts) {
    if (a.provider !== 'microsoft' || a.profilePhotoFile) continue
    try {
      const homeId = a.id.replace(/^ms:/, '')
      const buf = await fetchMicrosoftProfilePhoto(config.microsoftClientId, homeId)
      if (!buf) continue
      const fileName = await saveAccountProfilePhoto(a.id, buf)
      await upsertAccount({ ...a, profilePhotoFile: fileName })
      changed = true
    } catch (e) {
      console.warn('[account-photo] Profilbild fehlt oder nicht erlaubt:', a.email, e)
    }
  }
  if (changed) {
    broadcastAccountsChanged(await listAccounts())
  }
}

async function ensureGoogleProfilePhotosForMissing(): Promise<void> {
  const accounts = await listAccounts()
  let changed = false
  for (const a of accounts) {
    if (a.provider !== 'google' || a.profilePhotoFile) continue
    const creds = await getGoogleCredentials(a.id)
    if (!creds) continue
    const idt = creds.id_token?.trim()
    if (!idt) continue
    let accessTok =
      typeof creds.access_token === 'string' && creds.access_token.trim() !== ''
        ? creds.access_token.trim()
        : null
    if (!accessTok) {
      accessTok = await getFreshGoogleAccessToken(a.id)
    }
    try {
      const updated = await tryAttachGoogleProfilePhoto(a.id, idt, a, accessTok)
      if (updated.profilePhotoFile) {
        await upsertAccount(updated)
        changed = true
      }
    } catch (e) {
      console.warn('[account-photo] Google-Profilbild:', a.email, e)
    }
  }
  if (changed) {
    broadcastAccountsChanged(await listAccounts())
  }
}

export async function ensureAccountProfilePhotosForMissing(): Promise<void> {
  await ensureMicrosoftProfilePhotosForMissing()
  await ensureGoogleProfilePhotosForMissing()
}

export function decorateMailListLike<T extends MailListItem>(items: T[]): T[] {
  return attachCategoriesToMailItems(attachVipFlagsToMailItems(items))
}

export function decorateMailList(items: MailListItem[]): MailListItem[] {
  return decorateMailListLike(items)
}

export function decorateMailFull(msg: MailFull | null): MailFull | null {
  return attachCategoriesToFull(attachVipFlagToFull(msg))
}

export function sanitizeFileName(name: string): string {
  return (
    name
      .replace(/[\\/:*?"<>|\r\n]/g, '_')
      .replace(/^\.+/, '_')
      .slice(0, 200) || 'attachment'
  )
}

export function defaultUndoLabel(type: string): string {
  switch (type) {
    case 'set-read':
      return 'Lesestatus geaendert'
    case 'set-flagged':
      return 'Stern geaendert'
    case 'archive':
      return 'Mail archiviert'
    case 'move-to-trash':
      return 'Mail geloescht'
    case 'snooze':
      return 'Snooze'
    case 'unsnooze':
      return 'Snooze aufgehoben'
    case 'add-todo':
      return 'ToDo hinzugefuegt'
    case 'change-todo':
      return 'ToDo geaendert'
    case 'remove-todo':
      return 'ToDo erledigt'
    case 'add-waiting-for':
      return 'Warten auf Antwort'
    case 'change-waiting-for':
      return 'Warten-Frist geaendert'
    case 'remove-waiting-for':
      return 'Warten aufgehoben'
    case 'move-message':
      return 'Mail verschoben'
    case 'add-tag':
      return 'Tag gesetzt'
    default:
      return type
  }
}
