import { app } from 'electron'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import type { AppConfig } from '@shared/types'
import {
  fetchPublisherRemoteOAuthOnce,
  getPublisherEnvOAuthDefaults,
  getPublisherHelpUrls,
  type PublisherRemoteOAuthPayload
} from './publisher-oauth'

/** Persistierte Konfiguration (config.json); ohne abgeleitete Anzeige-Felder. */
const PERSISTED_CONFIG_KEYS: (keyof AppConfig)[] = [
  'microsoftClientId',
  'googleClientId',
  'googleClientSecret',
  'syncWindowDays',
  'autoLoadImages',
  'launchOnLogin',
  'calendarTimeZone',
  'weatherLatitude',
  'weatherLongitude',
  'weatherLocationName',
  'workflowMailFoldersIntroDismissed',
  'firstRunSetupCompleted',
  'configSchemaVersion'
]

export const DEFAULT_APP_CONFIG: AppConfig = {
  microsoftClientId: null,
  googleClientId: null,
  googleClientSecret: null,
  syncWindowDays: 90,
  autoLoadImages: true,
  launchOnLogin: false,
  calendarTimeZone: null,
  weatherLatitude: null,
  weatherLongitude: null,
  weatherLocationName: null,
  firstRunSetupCompleted: false,
  configSchemaVersion: 2
}

let remoteOAuthCache: PublisherRemoteOAuthPayload | null | undefined = undefined

function configPath(): string {
  return join(app.getPath('userData'), 'config.json')
}

function extractPersistedKeys(partial: Partial<AppConfig>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of PERSISTED_CONFIG_KEYS) {
    if (key in partial && partial[key] !== undefined) {
      out[key] = partial[key]
    }
  }
  return out
}

function pickEffectiveOAuthField(
  persisted: string | null | undefined,
  remote: string | null | undefined,
  env: string | null | undefined
): string | null {
  const p = typeof persisted === 'string' ? persisted.trim() : ''
  if (p !== '') return p
  const r = typeof remote === 'string' ? remote.trim() : ''
  if (r !== '') return r
  const e = typeof env === 'string' ? env.trim() : ''
  return e !== '' ? e : null
}

function resolveFirstRunCompleted(persisted: Partial<AppConfig>): boolean {
  if (typeof persisted.firstRunSetupCompleted === 'boolean') {
    return persisted.firstRunSetupCompleted
  }
  const schema = persisted.configSchemaVersion
  if (typeof schema === 'number' && schema >= 2) {
    return false
  }
  return Object.keys(extractPersistedKeys(persisted)).length > 0
}

function mergePublisherIntoOAuth(
  persisted: Partial<AppConfig>,
  remote: PublisherRemoteOAuthPayload,
  env: PublisherRemoteOAuthPayload
): Pick<AppConfig, 'microsoftClientId' | 'googleClientId' | 'googleClientSecret'> {
  return {
    microsoftClientId: pickEffectiveOAuthField(
      persisted.microsoftClientId,
      remote.microsoftClientId,
      env.microsoftClientId ?? undefined
    ),
    googleClientId: pickEffectiveOAuthField(
      persisted.googleClientId,
      remote.googleClientId,
      env.googleClientId ?? undefined
    ),
    googleClientSecret: pickEffectiveOAuthField(
      persisted.googleClientSecret,
      remote.googleClientSecret,
      env.googleClientSecret ?? undefined
    )
  }
}

function buildResolvedConfig(
  persisted: Partial<AppConfig>,
  remote: PublisherRemoteOAuthPayload | null,
  env: PublisherRemoteOAuthPayload
): AppConfig {
  const oauth = mergePublisherIntoOAuth(persisted, remote ?? {}, env)
  const links = getPublisherHelpUrls()
  const base: AppConfig = {
    ...DEFAULT_APP_CONFIG,
    ...persisted,
    ...oauth,
    firstRunSetupCompleted: resolveFirstRunCompleted(persisted),
    publisherPrivacyUrl: links.privacyUrl,
    publisherHelpUrl: links.helpUrl
  }
  return base
}

export async function readPersistedPartial(): Promise<Partial<AppConfig>> {
  const path = configPath()
  if (!existsSync(path)) {
    return {}
  }
  try {
    const raw = await readFile(path, 'utf8')
    const parsed = JSON.parse(raw) as Partial<AppConfig>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function readPersistedPartialSync(): Partial<AppConfig> {
  const path = configPath()
  if (!existsSync(path)) {
    return {}
  }
  try {
    const raw = readFileSync(path, 'utf8')
    const parsed = JSON.parse(raw) as Partial<AppConfig>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

async function resolveAppConfigAsync(persisted: Partial<AppConfig>): Promise<AppConfig> {
  if (remoteOAuthCache === undefined) {
    remoteOAuthCache = await fetchPublisherRemoteOAuthOnce()
  }
  const env = getPublisherEnvOAuthDefaults()
  return buildResolvedConfig(persisted, remoteOAuthCache, env)
}

function resolveAppConfigSync(persisted: Partial<AppConfig>): AppConfig {
  const env = getPublisherEnvOAuthDefaults()
  return buildResolvedConfig(persisted, {}, env)
}

export async function loadConfig(): Promise<AppConfig> {
  const persisted = await readPersistedPartial()
  return resolveAppConfigAsync(persisted)
}

/** Gleiche Daten wie {@link loadConfig}, synchron (ohne Remote-OAuth-URL; nur Umgebung). */
export function loadConfigSync(): AppConfig {
  const persisted = readPersistedPartialSync()
  return resolveAppConfigSync(persisted)
}

export async function savePersistedPartial(persisted: Partial<AppConfig>): Promise<void> {
  const path = configPath()
  await mkdir(dirname(path), { recursive: true })
  const toWrite = extractPersistedKeys({
    ...persisted,
    configSchemaVersion: 2
  })
  await writeFile(path, JSON.stringify(toWrite, null, 2), 'utf8')
}

/**
 * Schreibt nur persistierbare Schluessel (keine abgeleiteten Publisher-URLs).
 * @deprecated zugunsten {@link savePersistedPartial} — behalten fuer Einstellungs-Import.
 */
export async function saveConfig(config: AppConfig): Promise<void> {
  await savePersistedPartial(config)
}

export async function updateConfig(patch: Partial<AppConfig>): Promise<AppConfig> {
  const persisted = await readPersistedPartial()
  const mergedPersist: Partial<AppConfig> = { ...persisted }
  for (const key of PERSISTED_CONFIG_KEYS) {
    if (key in patch) {
      ;(mergedPersist as Record<string, unknown>)[key] = patch[key]
    }
  }
  await savePersistedPartial(mergedPersist)
  remoteOAuthCache = undefined
  return resolveAppConfigAsync(mergedPersist)
}
