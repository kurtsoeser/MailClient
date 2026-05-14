import {
  PublicClientApplication,
  type Configuration,
  type AuthenticationResult,
  InteractionRequiredAuthError,
  type AccountInfo
} from '@azure/msal-node'
import { shell } from 'electron'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomBytes, createHash } from 'node:crypto'
import { msalCachePlugin } from './msal-cache'

export const MICROSOFT_SCOPES = [
  'offline_access',
  'User.Read',
  'Mail.ReadWrite',
  'Mail.Send',
  /** Outlook-Masterkategorien (Kategorien verwalten / mit Desktop-Outlook abgleichen). */
  'MailboxSettings.ReadWrite',
  'Calendars.ReadWrite',
  /** Termine aus fuer den Benutzer freigegebenen Kalendern (Graph `/me/calendars/{id}/calendarView`). */
  'Calendars.Read.Shared',
  /** Microsoft To Do / Planner-Aufgabenlisten (`/me/todo/lists`, Aufgaben lesen/schreiben). */
  'Tasks.ReadWrite',
  /** Microsoft-365-Gruppenmitgliedschaften (`GET /me/transitiveMemberOf`). */
  'GroupMember.Read.All',
  /** Microsoft-365-Gruppenkalender lesen/schreiben (`/groups/{id}/calendar`, `/groups/{id}/events`). */
  'Group.ReadWrite.All',
  'OnlineMeetings.ReadWrite',
  /** Microsoft Teams: Chats lesen/schreiben; neue Chats anlegen (Graph `/me/chats`, `POST /chats`). */
  'Chat.ReadWrite',
  'Chat.Create',
/** Outlook-Kontakte lesen und schreiben (Graph `/me/contacts`). */
  'Contacts.ReadWrite',
  /** Graph `/me/people` fuer Empfaenger-Vorschlaege im Compose. */
  'People.Read',
  /** OneDrive: Dateien als Cloud-Anhang auswaehlen (`/me/drive/...`). */
  'Files.Read.All'
] as const

const LOOPBACK_PORT_RANGE = { start: 47813, end: 47830 } as const

/** Max. Wartezeit auf den OAuth-Redirect; sonst haengt der Renderer-Spinner (IPC) ohne Ende. */
const OAUTH_LOOPBACK_TIMEOUT_MS = 15 * 60 * 1000

let pcaCache: { clientId: string; pca: PublicClientApplication } | null = null

function getPca(clientId: string): PublicClientApplication {
  if (pcaCache && pcaCache.clientId === clientId) {
    return pcaCache.pca
  }
  const config: Configuration = {
    auth: {
      clientId,
      authority: 'https://login.microsoftonline.com/common'
    },
    cache: {
      cachePlugin: msalCachePlugin
    },
    system: {
      loggerOptions: {
        loggerCallback: (): void => {},
        piiLoggingEnabled: false
      }
    }
  }
  const pca = new PublicClientApplication(config)
  pcaCache = { clientId, pca }
  return pca
}

function base64UrlEncode(input: Buffer): string {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function generatePkce(): { verifier: string; challenge: string } {
  const verifier = base64UrlEncode(randomBytes(32))
  const challenge = base64UrlEncode(createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

interface LoopbackResult {
  code: string
  state: string
}

interface LoopbackServerHandle {
  redirectUri: string
  done: Promise<LoopbackResult>
  cancel: () => void
}

async function startLoopbackServer(expectedState: string): Promise<LoopbackServerHandle> {
  for (let port = LOOPBACK_PORT_RANGE.start; port <= LOOPBACK_PORT_RANGE.end; port++) {
    try {
      const handle = await tryStartOnPort(port, expectedState)
      return handle
    } catch {
      continue
    }
  }
  throw new Error('Konnte keinen freien Loopback-Port fuer den OAuth-Redirect finden.')
}

function tryStartOnPort(port: number, expectedState: string): Promise<LoopbackServerHandle> {
  return new Promise((resolve, reject) => {
    let resolveResult!: (value: LoopbackResult) => void
    let rejectResult!: (reason: Error) => void
    const done = new Promise<LoopbackResult>((res, rej) => {
      resolveResult = res
      rejectResult = rej
    })

    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      try {
        const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`)
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
          res.end(renderClosingPage('Ungueltige Antwort vom Identitaetsanbieter.'))
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

    server.listen(port, '127.0.0.1', () => {
      resolve({
        redirectUri: `http://localhost:${port}`,
        done,
        cancel: (): void => {
          rejectResult(new Error('cancelled'))
          server.close()
        }
      })
    })
  })
}

function renderClosingPage(message: string): string {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>MailClient</title>
<style>body{font-family:system-ui,Segoe UI,sans-serif;background:#0e0e12;color:#e6e6e8;
display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.card{background:#16161c;border:1px solid #26262e;padding:32px 40px;border-radius:12px;max-width:480px;text-align:center}
h1{font-size:18px;margin:0 0 8px}p{font-size:14px;color:#9a9aa3;margin:0}
</style></head><body><div class="card"><h1>MailClient</h1><p>${message}</p></div></body></html>`
}

export type LoginMicrosoftOptions = {
  /** Vorauswahl / Hinweis fuer dasselbe Konto (erneute Anmeldung). */
  loginHint?: string
  /** Standard: Kontoauswahl; z. B. `consent` erzwingt Zustimmung zu neuen API-Berechtigungen. */
  prompt?: 'none' | 'login' | 'consent' | 'select_account'
}

export async function loginMicrosoft(
  clientId: string,
  options?: LoginMicrosoftOptions
): Promise<AuthenticationResult> {
  const pca = getPca(clientId)
  const { verifier, challenge } = generatePkce()
  const state = base64UrlEncode(randomBytes(16))

  const loopback = await startLoopbackServer(state)

  const authUrl = await pca.getAuthCodeUrl({
    scopes: [...MICROSOFT_SCOPES],
    redirectUri: loopback.redirectUri,
    codeChallenge: challenge,
    codeChallengeMethod: 'S256',
    state,
    prompt: options?.prompt ?? 'select_account',
    ...(options?.loginHint?.trim() ? { loginHint: options.loginHint.trim() } : {})
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
          'Zeitueberschreitung: Die Anmeldung im Browser wurde nicht abgeschlossen. Bitte erneut versuchen und das Fenster von Microsoft bis zur Bestaetigung durchlaufen lassen.'
        )
      )
    }, OAUTH_LOOPBACK_TIMEOUT_MS)
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

  const { code } = result

  const tokenResponse = await pca.acquireTokenByCode({
    code,
    scopes: [...MICROSOFT_SCOPES],
    redirectUri: loopback.redirectUri,
    codeVerifier: verifier
  })

  if (!tokenResponse) {
    throw new Error('Kein Token vom Identitaetsanbieter erhalten.')
  }
  return tokenResponse
}

/** Verhindert parallele Browser-Consent-Flows fuer dasselbe Konto (Sync/Kalender parallel). */
const interactiveConsentLocks = new Map<string, Promise<void>>()

function consentLockKey(clientId: string, homeAccountId: string): string {
  return `${clientId}\n${homeAccountId}`
}

async function ensureMicrosoftConsentInteractive(clientId: string, account: AccountInfo): Promise<void> {
  const key = consentLockKey(clientId, account.homeAccountId)
  const existing = interactiveConsentLocks.get(key)
  if (existing) {
    await existing
    return
  }
  const run = (async (): Promise<void> => {
    try {
      await loginMicrosoft(clientId, {
        prompt: 'consent',
        loginHint: account.username
      })
    } finally {
      interactiveConsentLocks.delete(key)
    }
  })()
  interactiveConsentLocks.set(key, run)
  await run
}

export async function listMsalAccounts(clientId: string): Promise<
  Array<{ homeAccountId: string; username: string; name?: string; tenantId: string }>
> {
  const pca = getPca(clientId)
  const cache = pca.getTokenCache()
  const accounts = await cache.getAllAccounts()
  return accounts.map((a) => ({
    homeAccountId: a.homeAccountId,
    username: a.username,
    name: a.name,
    tenantId: a.tenantId
  }))
}

export async function removeMsalAccount(clientId: string, homeAccountId: string): Promise<void> {
  const pca = getPca(clientId)
  const cache = pca.getTokenCache()
  const account = await cache.getAccountByHomeId(homeAccountId)
  if (account) {
    await cache.removeAccount(account)
  }
}

export async function acquireTokenSilent(
  clientId: string,
  homeAccountId: string
): Promise<AuthenticationResult> {
  const pca = getPca(clientId)
  const cache = pca.getTokenCache()
  const account = await cache.getAccountByHomeId(homeAccountId)
  if (!account) {
    throw new Error('Konto nicht im MSAL-Cache gefunden.')
  }
  try {
    const result = await pca.acquireTokenSilent({
      account,
      scopes: [...MICROSOFT_SCOPES]
    })
    if (!result) {
      throw new Error('Silent token acquisition gab kein Ergebnis zurueck.')
    }
    return result
  } catch (e) {
    if (!(e instanceof InteractionRequiredAuthError)) {
      throw e
    }
    console.warn(
      '[auth] Microsoft benoetigt erneute Zustimmung (z. B. neue API-Berechtigungen). Es wird ein Browserfenster geoeffnet.'
    )
    await ensureMicrosoftConsentInteractive(clientId, account)
    const accountAfter = await cache.getAccountByHomeId(homeAccountId)
    if (!accountAfter) {
      throw new Error('Konto nach Zustimmung nicht mehr im MSAL-Cache gefunden.')
    }
    const result = await pca.acquireTokenSilent({
      account: accountAfter,
      scopes: [...MICROSOFT_SCOPES]
    })
    if (!result) {
      throw new Error('Nach Zustimmung: Silent token acquisition gab kein Ergebnis zurueck.')
    }
    return result
  }
}
