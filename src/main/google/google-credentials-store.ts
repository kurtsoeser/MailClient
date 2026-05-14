import { readJsonSecure, writeJsonSecure } from '../secure-store'

const STORE_KEY = 'google_oauth_tokens'

export type StoredGoogleCredentials = {
  refresh_token?: string | null
  access_token?: string | null
  expiry_date?: number | null
  scope?: string | null
  token_type?: string | null
  id_token?: string | null
}

type MapType = Record<string, StoredGoogleCredentials>

export async function loadGoogleCredentialsMap(): Promise<MapType> {
  return readJsonSecure<MapType>(STORE_KEY, {})
}

export async function getGoogleCredentials(accountId: string): Promise<StoredGoogleCredentials | null> {
  const m = await loadGoogleCredentialsMap()
  return m[accountId] ?? null
}

export async function saveGoogleCredentialsForAccount(
  accountId: string,
  creds: StoredGoogleCredentials
): Promise<void> {
  const m = await loadGoogleCredentialsMap()
  m[accountId] = creds
  await writeJsonSecure(STORE_KEY, m)
}

export async function removeGoogleCredentials(accountId: string): Promise<void> {
  const m = await loadGoogleCredentialsMap()
  if (!(accountId in m)) return
  delete m[accountId]
  await writeJsonSecure(STORE_KEY, m)
}
