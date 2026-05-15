import { readSecure, writeSecure } from '../secure-store'

const STORE_KEY = 'notion-internal-token'

export async function readNotionInternalToken(): Promise<string | null> {
  const raw = await readSecure(STORE_KEY)
  const t = raw?.trim()
  return t ? t : null
}

export async function writeNotionInternalToken(token: string): Promise<void> {
  await writeSecure(STORE_KEY, token.trim())
}

export async function clearNotionInternalToken(): Promise<void> {
  await writeSecure(STORE_KEY, '')
}
