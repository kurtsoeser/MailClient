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

interface GraphFolder {
  id: string
  displayName: string
  parentFolderId: string | null
  unreadItemCount: number
  totalItemCount: number
  childFolderCount: number
}

export async function createFolder(
  accountId: string,
  displayName: string,
  parentRemoteId: string | null
): Promise<GraphFolder> {
  const client = await getClientFor(accountId)
  const path = parentRemoteId
    ? `/me/mailFolders/${parentRemoteId}/childFolders`
    : '/me/mailFolders'
  const created = (await client.api(path).post({ displayName })) as GraphFolder
  return created
}

export async function renameFolder(
  accountId: string,
  remoteId: string,
  displayName: string
): Promise<GraphFolder> {
  const client = await getClientFor(accountId)
  const updated = (await client
    .api(`/me/mailFolders/${remoteId}`)
    .patch({ displayName })) as GraphFolder
  return updated
}

function graphDeleteFolderErrorMessage(e: unknown): string {
  const o = e as {
    statusCode?: number
    code?: string
    message?: string
    body?: string | { error?: { code?: string; message?: string } }
  }
  const status = o.statusCode
  const code = o.code ?? (typeof o.body === 'object' && o.body?.error?.code ? o.body.error.code : '')
  if (status === 403 || code === 'ErrorAccessDenied') {
    return 'Microsoft hat das Loeschen verweigert (keine Berechtigung oder feste Postfach-Struktur).'
  }
  if (status === 405 || code === 'ErrorFolderCannotBeDeleted') {
    return 'Dieser Ordner ist von Microsoft/Exchange fest vorgesehen und kann per API nicht entfernt werden (in Outlook oft ebenfalls nicht loeschbar).'
  }
  if (status === 404 || code === 'ErrorItemNotFound') {
    return 'Der Ordner existiert auf dem Server nicht mehr (bereits entfernt oder andere Sitzung).'
  }
  if (typeof o.message === 'string' && o.message.trim()) return o.message.trim()
  return 'Unbekannter Fehler beim Loeschen des Ordners auf dem Server.'
}

export async function deleteFolder(accountId: string, remoteId: string): Promise<void> {
  const client = await getClientFor(accountId)
  try {
    await client.api(`/me/mailFolders/${remoteId}`).delete()
  } catch (e) {
    throw new Error(graphDeleteFolderErrorMessage(e))
  }
}

/**
 * Verschiebt einen Ordner unter einen neuen Eltern-Ordner.
 * destination = remote folder id des neuen Parents.
 */
export async function moveFolder(
  accountId: string,
  remoteId: string,
  destinationRemoteId: string
): Promise<GraphFolder> {
  const client = await getClientFor(accountId)
  const moved = (await client
    .api(`/me/mailFolders/${remoteId}/move`)
    .post({ destinationId: destinationRemoteId })) as GraphFolder
  return moved
}
