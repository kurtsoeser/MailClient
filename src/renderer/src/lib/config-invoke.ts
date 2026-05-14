import { IPC, type AppConfig, type AppConfigWeatherLocation } from '@shared/types'
type InvokeFn = (channel: string, ...payload: unknown[]) => Promise<unknown>

function getInvoke(): InvokeFn | undefined {
  const m = window.mailClient as typeof window.mailClient & { invoke?: InvokeFn }
  return typeof m.invoke === 'function' ? m.invoke : undefined
}

/**
 * Nach Preload-Aenderungen liefert HMR manchmal noch ein altes `window.mailClient`
 * ohne neue Config-Methoden. `mailClient.invoke` nutzen, falls im aktuellen Preload vorhanden.
 */
export async function safeSetGoogleClientId(
  clientId: string,
  clientSecret?: string | null
): Promise<AppConfig> {
  const fn = (
    window.mailClient?.config as
      | { setGoogleClientId?: (id: string, s?: string | null) => Promise<AppConfig> }
      | undefined
  )?.setGoogleClientId
  if (typeof fn === 'function') {
    return fn(clientId, clientSecret)
  }
  const inv = getInvoke()
  if (inv) {
    return inv(IPC.config.setGoogleClientId, clientId, clientSecret) as Promise<AppConfig>
  }
  throw new Error(
    'Google OAuth: Bitte MailClient vollstaendig beenden und neu starten (Preload fehlt `setGoogleClientId`). Ein Reload des Fensters reicht oft nicht.'
  )
}

/**
 * Nach Preload-Aenderungen liefert HMR manchmal noch ein altes `window.mailClient`
 * ohne neue Config-Methoden. Dann hilft nur ein vollstaendiger App-Neustart.
 */
export async function safeSetCalendarTimeZone(iana: string | null): Promise<AppConfig> {
  const fn = (
    window.mailClient?.config as { setCalendarTimeZone?: (z: string | null) => Promise<AppConfig> } | undefined
  )?.setCalendarTimeZone
  if (typeof fn === 'function') {
    return fn(iana)
  }
  const inv = getInvoke()
  if (inv) {
    return inv(IPC.config.setCalendarTimeZone, iana) as Promise<AppConfig>
  }
  throw new Error(
    'Kalender-Zeitzone: Bitte MailClient vollstaendig beenden und neu starten (Preload-Update). Ein Reload des Fensters reicht nicht.'
  )
}

export async function safeSetWeatherLocation(loc: AppConfigWeatherLocation | null): Promise<AppConfig> {
  const fn = (
    window.mailClient?.config as
      | { setWeatherLocation?: (l: AppConfigWeatherLocation | null) => Promise<AppConfig> }
      | undefined
  )?.setWeatherLocation
  if (typeof fn === 'function') {
    return fn(loc)
  }
  const inv = getInvoke()
  if (inv) {
    return inv(IPC.config.setWeatherLocation, loc) as Promise<AppConfig>
  }
  throw new Error(
    'Wetter-Ort: Bitte MailClient vollstaendig beenden und neu starten (Preload-Update). Ein Reload des Fensters reicht nicht.'
  )
}
