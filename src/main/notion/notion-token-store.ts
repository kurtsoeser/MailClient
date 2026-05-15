import { readJsonSecure, writeJsonSecure } from '../secure-store'

const STORE_KEY = 'notion-oauth'

export interface NotionOAuthOwnerUser {
  id: string
  name?: string | null
  avatar_url?: string | null
}

export interface NotionOAuthTokens {
  access_token: string
  refresh_token: string
  bot_id: string
  workspace_id: string
  workspace_name: string | null
  workspace_icon: string | null
  owner: {
    type: string
    user?: NotionOAuthOwnerUser
  }
  obtainedAt: string
}

export async function readNotionTokens(): Promise<NotionOAuthTokens | null> {
  const data = await readJsonSecure<NotionOAuthTokens | null>(STORE_KEY, null)
  if (!data?.access_token?.trim() || !data.refresh_token?.trim()) return null
  return data
}

export async function writeNotionTokens(tokens: NotionOAuthTokens): Promise<void> {
  await writeJsonSecure(STORE_KEY, tokens)
}

export async function clearNotionTokens(): Promise<void> {
  await writeJsonSecure(STORE_KEY, null)
}
