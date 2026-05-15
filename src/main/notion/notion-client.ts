import { loadConfig } from '../config'
import { refreshNotionAccessToken } from '../auth/notion-oauth'
import { NOTION_API_BASE, NOTION_API_VERSION } from './notion-constants'
import { readNotionInternalToken } from './notion-internal-token-store'
import { readNotionTokens, writeNotionTokens, type NotionOAuthTokens } from './notion-token-store'

export class NotionApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown
  ) {
    super(message)
    this.name = 'NotionApiError'
  }
}

async function resolveNotionCredentials(): Promise<{ clientId: string; clientSecret: string }> {
  const config = await loadConfig()
  const clientId = config.notionClientId?.trim() ?? ''
  const clientSecret = config.notionClientSecret?.trim() ?? ''
  if (!clientId) {
    throw new Error('Keine Notion Client-ID konfiguriert (Einstellungen oder Build).')
  }
  if (!clientSecret) {
    throw new Error('Kein Notion Client-Secret konfiguriert (Public Integration).')
  }
  return { clientId, clientSecret }
}

export async function ensureNotionAccessToken(): Promise<string> {
  const internal = await readNotionInternalToken()
  if (internal) return internal

  const tokens = await readNotionTokens()
  if (!tokens) {
    throw new Error('Notion ist nicht verbunden. Bitte in den Einstellungen anmelden.')
  }
  return tokens.access_token
}

async function refreshAndPersist(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<NotionOAuthTokens> {
  const next = await refreshNotionAccessToken(clientId, clientSecret, refreshToken)
  await writeNotionTokens(next)
  return next
}

export async function notionFetch(path: string, init?: RequestInit): Promise<Response> {
  const internal = await readNotionInternalToken()
  const accessToken = await ensureNotionAccessToken()
  const url = path.startsWith('http') ? path : `${NOTION_API_BASE}${path}`

  const headers = new Headers(init?.headers)
  headers.set('Authorization', `Bearer ${accessToken}`)
  headers.set('Notion-Version', NOTION_API_VERSION)
  if (!headers.has('Content-Type') && init?.body) {
    headers.set('Content-Type', 'application/json')
  }

  const res = await fetch(url, { ...init, headers })

  if (res.status === 401 && !internal) {
    const stored = await readNotionTokens()
    if (!stored?.refresh_token) {
      throw new NotionApiError('Notion-Sitzung abgelaufen. Bitte erneut verbinden.', 401)
    }
    const { clientId, clientSecret } = await resolveNotionCredentials()
    const refreshed = await refreshAndPersist(clientId, clientSecret, stored.refresh_token)
    headers.set('Authorization', `Bearer ${refreshed.access_token}`)
    return fetch(url, { ...init, headers })
  }

  return res
}

export async function notionJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await notionFetch(path, init)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg =
      typeof (body as { message?: string }).message === 'string'
        ? (body as { message: string }).message
        : res.statusText
    throw new NotionApiError(msg || `Notion API (${res.status})`, res.status, body)
  }
  return body as T
}
