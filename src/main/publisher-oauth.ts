/**
 * OAuth-Defaults des Herausgebers (Build-Zeit via electron-vite `define` + .env,
 * optional Remote-JSON nur in {@link loadConfig}).
 */

export type PublisherRemoteOAuthPayload = {
  microsoftClientId?: string | null
  googleClientId?: string | null
  googleClientSecret?: string | null
}

function trimOrNull(v: string | undefined): string | null {
  const t = (v ?? '').trim()
  return t !== '' ? t : null
}

/** Werte aus MAILCLIENT_* Umgebungsvariablen (Build inject / .env). */
export function getPublisherEnvOAuthDefaults(): PublisherRemoteOAuthPayload {
  return {
    microsoftClientId: trimOrNull(process.env.MAILCLIENT_MICROSOFT_CLIENT_ID),
    googleClientId: trimOrNull(process.env.MAILCLIENT_GOOGLE_CLIENT_ID),
    googleClientSecret: trimOrNull(process.env.MAILCLIENT_GOOGLE_CLIENT_SECRET)
  }
}

export function getPublisherHelpUrls(): { privacyUrl: string | null; helpUrl: string | null } {
  return {
    privacyUrl: trimOrNull(process.env.MAILCLIENT_PRIVACY_URL),
    helpUrl: trimOrNull(process.env.MAILCLIENT_HELP_URL)
  }
}

function pickRemoteUrl(): string | null {
  return trimOrNull(process.env.MAILCLIENT_REMOTE_OAUTH_CONFIG_URL)
}

/**
 * Einmal pro App-Lebensdauer: HTTPS-JSON mit optionalen Client-Feldern.
 * Fehler → leeres Objekt (Fallback auf Umgebung).
 */
export async function fetchPublisherRemoteOAuthOnce(): Promise<PublisherRemoteOAuthPayload> {
  const url = pickRemoteUrl()
  if (!url || !url.startsWith('https://')) {
    return {}
  }
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), 8000)
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: ac.signal
    })
    if (!res.ok) {
      return {}
    }
    const data = (await res.json()) as unknown
    if (data == null || typeof data !== 'object' || Array.isArray(data)) {
      return {}
    }
    const o = data as Record<string, unknown>
    return {
      microsoftClientId:
        typeof o.microsoftClientId === 'string' ? trimOrNull(o.microsoftClientId) : null,
      googleClientId: typeof o.googleClientId === 'string' ? trimOrNull(o.googleClientId) : null,
      googleClientSecret:
        typeof o.googleClientSecret === 'string' ? trimOrNull(o.googleClientSecret) : null
    }
  } catch {
    return {}
  } finally {
    clearTimeout(t)
  }
}
