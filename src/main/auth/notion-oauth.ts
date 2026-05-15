import { BrowserWindow } from 'electron'
import { randomBytes } from 'node:crypto'
import {
  NOTION_API_BASE,
  NOTION_OAUTH_REDIRECT_URI,
  NOTION_OAUTH_REDIRECT_URI_LEGACY_HTTP,
  NOTION_OAUTH_TIMEOUT_MS
} from '../notion/notion-constants'
import type { NotionOAuthTokens } from '../notion/notion-token-store'

export function buildNotionAuthorizeUrl(clientId: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId.trim(),
    redirect_uri: NOTION_OAUTH_REDIRECT_URI,
    response_type: 'code',
    owner: 'user',
    state
  })
  return `${NOTION_API_BASE}/oauth/authorize?${params.toString()}`
}

function basicAuthHeader(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString('base64')}`
}

interface NotionTokenResponse {
  access_token: string
  refresh_token: string
  bot_id: string
  workspace_id: string
  workspace_name?: string | null
  workspace_icon?: string | null
  owner: NotionOAuthTokens['owner']
}

async function exchangeCodeForTokens(
  clientId: string,
  clientSecret: string,
  code: string
): Promise<NotionOAuthTokens> {
  const res = await fetch(`${NOTION_API_BASE}/oauth/token`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: basicAuthHeader(clientId, clientSecret)
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: NOTION_OAUTH_REDIRECT_URI
    })
  })

  const body = (await res.json()) as Record<string, unknown>
  if (!res.ok) {
    const err = typeof body.error === 'string' ? body.error : res.statusText
    const desc = typeof body.error_description === 'string' ? body.error_description : ''
    throw new Error(desc ? `${err}: ${desc}` : err || `Notion Token (${res.status})`)
  }

  const data = body as unknown as NotionTokenResponse
  if (!data.access_token?.trim() || !data.refresh_token?.trim() || !data.bot_id?.trim()) {
    throw new Error('Notion hat keine gueltigen Tokens zurueckgegeben.')
  }

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    bot_id: data.bot_id,
    workspace_id: data.workspace_id,
    workspace_name: data.workspace_name ?? null,
    workspace_icon: data.workspace_icon ?? null,
    owner: data.owner ?? { type: 'user' },
    obtainedAt: new Date().toISOString()
  }
}

export async function refreshNotionAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<NotionOAuthTokens> {
  const res = await fetch(`${NOTION_API_BASE}/oauth/token`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: basicAuthHeader(clientId, clientSecret)
    },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    })
  })

  const body = (await res.json()) as Record<string, unknown>
  if (!res.ok) {
    const err = typeof body.error === 'string' ? body.error : res.statusText
    throw new Error(err || `Notion Token-Refresh (${res.status})`)
  }

  const data = body as unknown as NotionTokenResponse
  if (!data.access_token?.trim() || !data.refresh_token?.trim() || !data.bot_id?.trim()) {
    throw new Error('Notion Refresh: ungueltige Antwort.')
  }

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    bot_id: data.bot_id,
    workspace_id: data.workspace_id,
    workspace_name: data.workspace_name ?? null,
    workspace_icon: data.workspace_icon ?? null,
    owner: data.owner ?? { type: 'user' },
    obtainedAt: new Date().toISOString()
  }
}

/**
 * OAuth im eingebetteten Browser-Fenster; Redirect wird abgefangen (kein mailclient:// noetig).
 */
async function waitForOAuthCallbackInWindow(
  authUrl: string,
  expectedState: string
): Promise<string> {
  const redirectPrefixes = [
    NOTION_OAUTH_REDIRECT_URI,
    NOTION_OAUTH_REDIRECT_URI_LEGACY_HTTP
  ].map((uri) => uri.replace(/\/$/, ''))

  return new Promise((resolve, reject) => {
    const authWindow = new BrowserWindow({
      width: 520,
      height: 720,
      autoHideMenuBar: true,
      title: 'Notion verbinden',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    })

    let settled = false
    const finish = (fn: () => void): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (!authWindow.isDestroyed()) authWindow.close()
      fn()
    }

    const timeout = setTimeout(() => {
      finish(() => reject(new Error('Notion-Anmeldung: Zeitueberschreitung.')))
    }, NOTION_OAUTH_TIMEOUT_MS)

    authWindow.on('closed', () => {
      finish(() => reject(new Error('Notion-Anmeldung abgebrochen.')))
    })

    const filter = { urls: redirectPrefixes.map((prefix) => `${prefix}*`) }
    authWindow.webContents.session.webRequest.onBeforeRequest(filter, (details, callback) => {
      try {
        const url = new URL(details.url)
        const error = url.searchParams.get('error')
        const errorDescription = url.searchParams.get('error_description')
        if (error) {
          finish(() => reject(new Error(errorDescription ?? error)))
          callback({ cancel: true })
          return
        }

        const code = url.searchParams.get('code')
        const state = url.searchParams.get('state')
        if (!code || state !== expectedState) {
          finish(() => reject(new Error('Ungueltige Notion-OAuth-Antwort.')))
          callback({ cancel: true })
          return
        }

        finish(() => resolve(code))
        callback({ cancel: true })
      } catch (e) {
        finish(() => reject(e instanceof Error ? e : new Error(String(e))))
        callback({ cancel: true })
      }
    })

    void authWindow.loadURL(authUrl)
  })
}

export async function loginNotion(clientId: string, clientSecret: string): Promise<NotionOAuthTokens> {
  const id = clientId.trim()
  const secret = clientSecret.trim()
  if (!id) throw new Error('Keine Notion Client-ID konfiguriert.')
  if (!secret) throw new Error('Kein Notion Client-Secret konfiguriert (Public Integration).')

  const state = randomBytes(24).toString('hex')
  const authUrl = buildNotionAuthorizeUrl(id, state)
  const code = await waitForOAuthCallbackInWindow(authUrl, state)
  return await exchangeCodeForTokens(id, secret, code)
}
