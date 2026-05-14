import { google } from 'googleapis'
import { loadConfig } from '../config'
import { createGoogleOAuth2Client } from '../auth/google'
import { GOOGLE_CONTACTS_SCOPE_URL, storedGoogleScopeIncludesContacts } from '../auth/google-scopes'
import { getGoogleCredentials, saveGoogleCredentialsForAccount } from './google-credentials-store'

export type GetGoogleApisOptions = {
  /** People API / Kontakte: prüft gespeicherten Scope (falls vorhanden) vor dem Aufruf. */
  requireContactsScope?: boolean
}

export async function getGoogleApis(
  accountId: string,
  options?: GetGoogleApisOptions
): Promise<{
  gmail: ReturnType<typeof google.gmail>
  calendar: ReturnType<typeof google.calendar>
  tasks: ReturnType<typeof google.tasks>
  people: ReturnType<typeof google.people>
}> {
  const config = await loadConfig()
  const clientId = config.googleClientId?.trim()
  const clientSecret = config.googleClientSecret?.trim()
  if (!clientId) {
    throw new Error('Keine Google Client-ID konfiguriert.')
  }
  const stored = await getGoogleCredentials(accountId)
  if (!stored?.refresh_token) {
    throw new Error('Google-Konto ist nicht angemeldet (kein Refresh-Token). Bitte Konto erneut verbinden.')
  }
  if (
    options?.requireContactsScope &&
    stored.scope &&
    !storedGoogleScopeIncludesContacts(stored.scope)
  ) {
    throw new Error(
      `Google-Kontakte: Die gespeicherte Anmeldung enthält nicht den OAuth-Scope «${GOOGLE_CONTACTS_SCOPE_URL}». ` +
        'Bitte das Google-Konto in den Einstellungen entfernen und erneut verbinden, damit der Zugriff auf Kontakte erteilt wird.'
    )
  }

  const oauth2 = createGoogleOAuth2Client(clientId, clientSecret ?? undefined)
  oauth2.setCredentials({
    refresh_token: stored.refresh_token,
    access_token: stored.access_token ?? undefined,
    expiry_date: stored.expiry_date ?? undefined
  })

  oauth2.on('tokens', async (t) => {
    const cur = await getGoogleCredentials(accountId)
    const base = cur ?? {}
    await saveGoogleCredentialsForAccount(accountId, {
      ...base,
      access_token: t.access_token ?? base.access_token ?? null,
      expiry_date: t.expiry_date ?? base.expiry_date ?? null,
      refresh_token: t.refresh_token ?? base.refresh_token ?? null,
      scope: t.scope ?? base.scope ?? null,
      token_type: t.token_type ?? base.token_type ?? null,
      id_token: t.id_token ?? base.id_token ?? null
    })
  })

  return {
    gmail: google.gmail({ version: 'v1', auth: oauth2 }),
    calendar: google.calendar({ version: 'v3', auth: oauth2 }),
    tasks: google.tasks({ version: 'v1', auth: oauth2 }),
    people: google.people({ version: 'v1', auth: oauth2 })
  }
}

/** Gueltigen Access-Token holen (Refresh), z. B. fuer Userinfo ohne Gmail-Client. */
export async function getFreshGoogleAccessToken(accountId: string): Promise<string | null> {
  const config = await loadConfig()
  const clientId = config.googleClientId?.trim()
  const clientSecret = config.googleClientSecret?.trim()
  if (!clientId) return null
  const stored = await getGoogleCredentials(accountId)
  if (!stored?.refresh_token) return null

  const oauth2 = createGoogleOAuth2Client(clientId, clientSecret ?? undefined)
  oauth2.setCredentials({
    refresh_token: stored.refresh_token,
    access_token: stored.access_token ?? undefined,
    expiry_date: stored.expiry_date ?? undefined
  })

  oauth2.on('tokens', async (t) => {
    const cur = await getGoogleCredentials(accountId)
    const base = cur ?? {}
    await saveGoogleCredentialsForAccount(accountId, {
      ...base,
      access_token: t.access_token ?? base.access_token ?? null,
      expiry_date: t.expiry_date ?? base.expiry_date ?? null,
      refresh_token: t.refresh_token ?? base.refresh_token ?? null,
      scope: t.scope ?? base.scope ?? null,
      token_type: t.token_type ?? base.token_type ?? null,
      id_token: t.id_token ?? base.id_token ?? null
    })
  })

  try {
    const r = await oauth2.getAccessToken()
    const tok = r?.token
    return typeof tok === 'string' && tok.trim() !== '' ? tok.trim() : null
  } catch {
    return null
  }
}
