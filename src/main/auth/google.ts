import { OAuth2Client, CodeChallengeMethod, ClientAuthentication } from 'google-auth-library'
import { shell } from 'electron'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomBytes, createHash } from 'node:crypto'
import { GOOGLE_OAUTH_REDIRECT_URI, GOOGLE_OAUTH_SCOPES } from './google-scopes'

const OAUTH_TIMEOUT_MS = 15 * 60 * 1000

function base64UrlEncode(input: Buffer): string {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function generatePkce(): { verifier: string; challenge: string } {
  const verifier = base64UrlEncode(randomBytes(32))
  const challenge = base64UrlEncode(createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

function renderClosingPage(message: string): string {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>MailClient</title>
<style>body{font-family:system-ui,Segoe UI,sans-serif;background:#0e0e12;color:#e6e6e8;
display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.card{background:#16161c;border:1px solid #26262e;padding:32px 40px;border-radius:12px;max-width:480px;text-align:center}
h1{font-size:18px;margin:0 0 8px}p{font-size:14px;color:#9a9aa3;margin:0}
</style></head><body><div class="card"><h1>MailClient</h1><p>${message}</p></div></body></html>`
}

interface LoopbackResult {
  code: string
  state: string
}

interface LoopbackServerHandle {
  done: Promise<LoopbackResult>
  cancel: () => void
}

function parseRedirectUri(): { host: string; port: number; pathname: string } {
  const u = new URL(GOOGLE_OAUTH_REDIRECT_URI)
  const port = u.port ? Number(u.port) : u.protocol === 'https:' ? 443 : 80
  if (!Number.isFinite(port)) {
    throw new Error('Ungueltige Google Redirect-URI (Port).')
  }
  return { host: u.hostname, port, pathname: u.pathname || '/' }
}

async function startLoopbackServer(expectedState: string): Promise<LoopbackServerHandle> {
  const { host, port, pathname } = parseRedirectUri()

  return new Promise((resolve, reject) => {
    let resolveResult!: (value: LoopbackResult) => void
    let rejectResult!: (reason: Error) => void
    const done = new Promise<LoopbackResult>((res, rej) => {
      resolveResult = res
      rejectResult = rej
    })

    const listenHost = host === 'localhost' ? '127.0.0.1' : host

    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      try {
        const reqUrl = req.url ?? '/'
        const url = new URL(reqUrl, `http://${listenHost}:${port}`)
        if (url.pathname !== pathname) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
          res.end('Not found')
          return
        }

        const code = url.searchParams.get('code')
        const state = url.searchParams.get('state')
        const error = url.searchParams.get('error')
        const errorDescription = url.searchParams.get('error_description')

        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(renderClosingPage(`Anmeldung fehlgeschlagen: ${errorDescription ?? error}`))
          rejectResult(new Error(errorDescription ?? error))
          server.close()
          return
        }

        if (!code || state !== expectedState) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(renderClosingPage('Ungueltige Antwort von Google.'))
          rejectResult(new Error('invalid_state_or_code'))
          server.close()
          return
        }

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(renderClosingPage('Anmeldung erfolgreich. Du kannst dieses Fenster schliessen.'))
        resolveResult({ code, state })
        server.close()
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('Unerwarteter Fehler: ' + message)
        rejectResult(new Error(message))
        server.close()
      }
    })

    server.once('error', (err: NodeJS.ErrnoException) => {
      reject(err)
    })

    server.listen(port, listenHost, () => {
      resolve({
        done,
        cancel: (): void => {
          rejectResult(new Error('cancelled'))
          server.close()
        }
      })
    })
  })
}

export interface GoogleLoginResult {
  tokens: {
    access_token?: string | null
    refresh_token?: string | null
    expiry_date?: number | null
    scope?: string | null
    token_type?: string | null
    id_token?: string | null
  }
}

export type GoogleLoginOptions = {
  loginHint?: string
  /** OAuth prompt; fuer Refresh-Token-Erneuerung typischerweise `consent`. */
  prompt?: 'none' | 'consent' | 'select_account'
  /**
   * Clientschlüssel (Desktop-JSON). Leer = PKCE mit oeffentlichem Client laut Google Native-App-Flow
   * ({@link ClientAuthentication.None}).
   */
  clientSecret?: string | null
}

/**
 * Interaktiver OAuth-Flow (Browser + Loopback). Speichert keine Tokens —
 * der Aufrufer persistiert sie pro Konto.
 */
export async function loginGoogle(
  clientId: string,
  options?: GoogleLoginOptions
): Promise<GoogleLoginResult> {
  const trimmed = clientId.trim()
  if (!trimmed) {
    throw new Error('Keine Google Client-ID konfiguriert.')
  }

  const { verifier, challenge } = generatePkce()
  const state = base64UrlEncode(randomBytes(16))

  const loopback = await startLoopbackServer(state)

  const clientSecret = (options?.clientSecret ?? '').trim()
  const oauth2Client =
    clientSecret.length > 0
      ? new OAuth2Client({
          clientId: trimmed,
          clientSecret,
          redirectUri: GOOGLE_OAUTH_REDIRECT_URI
        })
      : new OAuth2Client({
          clientId: trimmed,
          redirectUri: GOOGLE_OAUTH_REDIRECT_URI,
          clientAuthentication: ClientAuthentication.None
        })

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [...GOOGLE_OAUTH_SCOPES],
    prompt: options?.prompt ?? 'consent',
    include_granted_scopes: true,
    state,
    code_challenge: challenge,
    code_challenge_method: CodeChallengeMethod.S256,
    ...(options?.loginHint?.trim() ? { login_hint: options.loginHint.trim() } : {})
  })

  await shell.openExternal(authUrl)

  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      try {
        loopback.cancel()
      } catch {
        /* already closed */
      }
      reject(
        new Error(
          'Zeitueberschreitung: Die Google-Anmeldung wurde nicht abgeschlossen. Bitte erneut versuchen.'
        )
      )
    }, OAUTH_TIMEOUT_MS)
  })

  let result: LoopbackResult
  try {
    result = await Promise.race([loopback.done, timeoutPromise])
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg === 'cancelled') {
      throw new Error('Anmeldung abgebrochen.')
    }
    throw e instanceof Error ? e : new Error(msg)
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
  }

  const { tokens } = await oauth2Client.getToken({
    code: result.code,
    codeVerifier: verifier,
    redirect_uri: GOOGLE_OAUTH_REDIRECT_URI
  })

  if (!tokens.access_token) {
    throw new Error('Google hat keinen Access-Token zurueckgegeben.')
  }

  return { tokens }
}

export function createGoogleOAuth2Client(clientId: string, clientSecret?: string | null): OAuth2Client {
  const secret = (clientSecret ?? '').trim()
  if (secret.length > 0) {
    return new OAuth2Client({
      clientId: clientId.trim(),
      clientSecret: secret,
      redirectUri: GOOGLE_OAUTH_REDIRECT_URI
    })
  }
  return new OAuth2Client({
    clientId: clientId.trim(),
    redirectUri: GOOGLE_OAUTH_REDIRECT_URI,
    clientAuthentication: ClientAuthentication.None
  })
}
