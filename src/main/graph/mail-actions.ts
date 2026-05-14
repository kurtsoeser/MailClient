import { createGraphClient } from './client'
import { loadConfig } from '../config'

async function getClientFor(accountId: string): Promise<ReturnType<typeof createGraphClient>> {
  const config = await loadConfig()
  if (!config.microsoftClientId) {
    throw new Error('Keine Azure Client-ID konfiguriert.')
  }
  const homeAccountId = accountId.replace(/^ms:/, '')
  return createGraphClient(config.microsoftClientId, homeAccountId)
}

export async function setMessageRead(
  accountId: string,
  remoteId: string,
  isRead: boolean
): Promise<void> {
  const client = await getClientFor(accountId)
  await client.api(`/me/messages/${remoteId}`).patch({ isRead })
}

export async function setMessageFlagged(
  accountId: string,
  remoteId: string,
  flagged: boolean
): Promise<void> {
  const client = await getClientFor(accountId)
  await client.api(`/me/messages/${remoteId}`).patch({
    flag: { flagStatus: flagged ? 'flagged' : 'notFlagged' }
  })
}

/**
 * destination kann ein well-known alias sein ('archive', 'deleteditems', 'inbox', ...)
 * oder eine konkrete Graph-Folder-ID. Liefert die neue Remote-ID der verschobenen Mail.
 */
export async function moveMessage(
  accountId: string,
  remoteId: string,
  destination: string
): Promise<string> {
  const client = await getClientFor(accountId)
  const moved = (await client
    .api(`/me/messages/${remoteId}/move`)
    .post({ destinationId: destination })) as { id: string }
  return moved.id
}

/** Outlook-Kategorien (max. 25 Namen laut Microsoft). */
export async function setMessageCategories(
  accountId: string,
  remoteId: string,
  categories: string[]
): Promise<void> {
  const client = await getClientFor(accountId)
  const capped = categories.slice(0, 25)
  await client.api(`/me/messages/${remoteId}`).patch({ categories: capped })
}

/** Endgueltiges Loeschen auf dem Server (Graph DELETE). */
export async function deleteMessageRemote(accountId: string, remoteId: string): Promise<void> {
  const client = await getClientFor(accountId)
  await client.api(`/me/messages/${remoteId}`).delete()
}

interface GraphIdPage {
  value: { id?: string | null }[]
  '@odata.nextLink'?: string
}

/**
 * Loescht alle Nachrichten im Well-known-Ordner (z. B. deleteditems) auf dem Server.
 * Holt jeweils die erste Seite, bis keine Eintraege mehr zurueckkommen.
 */
export async function deleteAllRemoteMessagesInWellKnownFolder(
  accountId: string,
  wellKnown: 'deleteditems'
): Promise<number> {
  const client = await getClientFor(accountId)
  let deleted = 0
  const maxRounds = 5000
  for (let round = 0; round < maxRounds; round++) {
    const page = (await client
      .api(`/me/mailFolders/${wellKnown}/messages`)
      .top(200)
      .select('id')
      .get()) as GraphIdPage

    if (!page.value || page.value.length === 0) break

    for (const row of page.value) {
      const id = row.id
      if (!id) continue
      try {
        await client.api(`/me/messages/${id}`).delete()
        deleted++
      } catch (e: unknown) {
        const err = e as { statusCode?: number; code?: string }
        if (err.statusCode === 404 || err.code === 'ErrorItemNotFound') continue
        throw e
      }
    }
  }
  return deleted
}
