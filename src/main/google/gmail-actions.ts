import type { MailFolder } from '@shared/types'
import { listFoldersByAccount } from '../db/folders-repo'
import { getGoogleApis } from './google-auth-client'
import { syncGoogleFolders } from './gmail-sync'
import { gmailCreateMailLabel } from './gmail-label-folders'

export async function gmailSetMessageRead(
  accountId: string,
  remoteId: string,
  isRead: boolean
): Promise<void> {
  const { gmail } = await getGoogleApis(accountId)
  if (isRead) {
    await gmail.users.messages.modify({
      userId: 'me',
      id: remoteId,
      requestBody: { removeLabelIds: ['UNREAD'] }
    })
  } else {
    await gmail.users.messages.modify({
      userId: 'me',
      id: remoteId,
      requestBody: { addLabelIds: ['UNREAD'] }
    })
  }
}

export async function gmailSetMessageFlagged(
  accountId: string,
  remoteId: string,
  flagged: boolean
): Promise<void> {
  const { gmail } = await getGoogleApis(accountId)
  if (flagged) {
    await gmail.users.messages.modify({
      userId: 'me',
      id: remoteId,
      requestBody: { addLabelIds: ['STARRED'] }
    })
  } else {
    await gmail.users.messages.modify({
      userId: 'me',
      id: remoteId,
      requestBody: { removeLabelIds: ['STARRED'] }
    })
  }
}

/** Gmail: Archiv (INBOX-Label entfernen). */
export async function gmailArchiveMessage(accountId: string, remoteId: string): Promise<string> {
  const { gmail } = await getGoogleApis(accountId)
  await gmail.users.messages.modify({
    userId: 'me',
    id: remoteId,
    requestBody: { removeLabelIds: ['INBOX'] }
  })
  return remoteId
}

/** Gmail: in Papierkorb (TRASH). Liefert dieselbe Message-ID (Gmail behaelt id). */
export async function gmailTrashMessage(accountId: string, remoteId: string): Promise<string> {
  const { gmail } = await getGoogleApis(accountId)
  const res = await gmail.users.messages.trash({ userId: 'me', id: remoteId })
  return res.data.id ?? remoteId
}

/** Gmail: endgueltig loeschen (nicht nur Papierkorb). */
export async function gmailDeleteMessageForever(accountId: string, remoteId: string): Promise<void> {
  const { gmail } = await getGoogleApis(accountId)
  await gmail.users.messages.delete({ userId: 'me', id: remoteId })
}

/** Gmail: Papierkorb auf dem Server leeren. */
export async function gmailEmptyTrash(accountId: string): Promise<number> {
  const { gmail } = await getGoogleApis(accountId)
  let deleted = 0
  let pageToken: string | undefined
  for (let round = 0; round < 200; round++) {
    const res = await gmail.users.messages.list({
      userId: 'me',
      labelIds: ['TRASH'],
      maxResults: 100,
      pageToken
    })
    const msgs = res.data.messages ?? []
    if (msgs.length === 0) break
    for (const m of msgs) {
      if (!m.id) continue
      await gmail.users.messages.delete({ userId: 'me', id: m.id })
      deleted += 1
    }
    pageToken = res.data.nextPageToken ?? undefined
    if (!pageToken) break
  }
  return deleted
}

/**
 * Sucht ein Nutzer-Label nach exaktem Namen oder legt es per Gmail API an.
 * Danach ist die Ordnerliste lokal aktualisiert.
 */
export async function findOrCreateGmailUserLabelByDisplayName(
  accountId: string,
  displayName: string
): Promise<string> {
  await syncGoogleFolders(accountId)
  const folders = listFoldersByAccount(accountId)
  const existing = folders.find((f) => f.name === displayName && f.wellKnown == null)
  if (existing) return existing.remoteId

  return gmailCreateMailLabel(accountId, displayName)
}

/**
 * Ordnerwechsel wie bei Graph: Ziel-Label setzen, Quell-„Ordner“-Label entfernen
 * (Posteingang = INBOX; Nutzer-Labels = deren Label-ID).
 */
export async function gmailMoveMessageForFolderMove(
  accountId: string,
  messageRemoteId: string,
  previousFolder: MailFolder | null,
  targetFolder: MailFolder
): Promise<void> {
  const { gmail } = await getGoogleApis(accountId)
  const minimal = await gmail.users.messages.get({
    userId: 'me',
    id: messageRemoteId,
    format: 'minimal'
  })
  const current = new Set(minimal.data.labelIds ?? [])

  const removeRaw: string[] = []
  if (previousFolder) {
    if (previousFolder.wellKnown === 'inbox') {
      removeRaw.push('INBOX')
    } else {
      removeRaw.push(previousFolder.remoteId)
    }
  }
  const removeLabelIds = [...new Set(removeRaw.filter((id) => current.has(id)))]

  const targetId = targetFolder.remoteId
  const addLabelIds =
    targetId && !current.has(targetId) ? [targetId] : ([] as string[])

  if (removeLabelIds.length === 0 && addLabelIds.length === 0) return

  await gmail.users.messages.modify({
    userId: 'me',
    id: messageRemoteId,
    requestBody: {
      ...(addLabelIds.length > 0 ? { addLabelIds } : {}),
      ...(removeLabelIds.length > 0 ? { removeLabelIds } : {})
    }
  })
}
