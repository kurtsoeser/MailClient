import { getGoogleApis } from './google-auth-client'
import { syncGoogleFolders } from './gmail-sync'

/**
 * Legt ein Gmail-Nutzer-Label an und synchronisiert die lokale Ordnerliste.
 * @returns Gmail-Label-ID (remote_id)
 */
export async function gmailCreateMailLabel(accountId: string, displayName: string): Promise<string> {
  const trimmed = displayName.trim()
  if (!trimmed) throw new Error('Labelname darf nicht leer sein.')

  const { gmail } = await getGoogleApis(accountId)
  const res = await gmail.users.labels.create({
    userId: 'me',
    requestBody: {
      name: trimmed,
      labelListVisibility: 'labelShow',
      messageListVisibility: 'show'
    }
  })
  const id = res.data.id
  if (!id) throw new Error('Gmail: Label ohne ID (Anlage fehlgeschlagen).')
  await syncGoogleFolders(accountId)
  return id
}

export async function gmailRenameMailLabel(
  accountId: string,
  labelId: string,
  newDisplayName: string
): Promise<void> {
  const trimmed = newDisplayName.trim()
  if (!trimmed) throw new Error('Labelname darf nicht leer sein.')

  const { gmail } = await getGoogleApis(accountId)
  await gmail.users.labels.patch({
    userId: 'me',
    id: labelId,
    requestBody: { name: trimmed }
  })
  await syncGoogleFolders(accountId)
}

export async function gmailDeleteMailLabel(accountId: string, labelId: string): Promise<void> {
  const { gmail } = await getGoogleApis(accountId)
  await gmail.users.labels.delete({ userId: 'me', id: labelId })
  await syncGoogleFolders(accountId)
}
