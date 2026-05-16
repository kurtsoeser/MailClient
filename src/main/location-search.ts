import { net } from 'electron'
import {
  formatPhotonLocation,
  type LocationSearchLanguage,
  type LocationSuggestion,
  type PhotonProperties
} from '@shared/location-search'

const PHOTON_BASE = 'https://photon.komoot.io'
const REQUEST_TIMEOUT_MS = 12_000
const USER_AGENT = 'MailClient/0.0.1 (Electron; location-autocomplete)'
const MIN_QUERY_LEN = 2
const MAX_RESULTS = 8
const MIN_INTERVAL_MS = 350

/** Photon v1: @see https://github.com/komoot/photon/blob/master/docs/api-v1.md */
export const PHOTON_SEARCH_LAYERS = [
  'house',
  'street',
  'locality',
  'district',
  'city',
  'county'
] as const

export function buildPhotonSearchUrl(
  query: string,
  language: LocationSearchLanguage,
  limit = MAX_RESULTS
): string {
  const params = new URLSearchParams()
  params.set('q', query.trim())
  params.set('limit', String(limit))
  params.set('lang', language === 'de' ? 'de' : 'en')
  for (const layer of PHOTON_SEARCH_LAYERS) {
    params.append('layer', layer)
  }
  return `${PHOTON_BASE}/api/?${params.toString()}`
}

let lastRequestAt = 0

async function throttlePhoton(): Promise<void> {
  const now = Date.now()
  const wait = MIN_INTERVAL_MS - (now - lastRequestAt)
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastRequestAt = Date.now()
}

async function fetchPhotonJson<T>(url: string): Promise<T> {
  const ac = new AbortController()
  const timeout = setTimeout(() => ac.abort(), REQUEST_TIMEOUT_MS)
  try {
    await throttlePhoton()
    const res = await net.fetch(url, {
      signal: ac.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': USER_AGENT
      }
    })
    if (!res.ok) {
      throw new Error(`Photon antwortet mit HTTP ${res.status}.`)
    }
    return (await res.json()) as T
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('Adresssuche hat nicht rechtzeitig geantwortet.')
    }
    if (e instanceof Error) {
      throw new Error(`Adresssuche nicht erreichbar: ${e.message}`)
    }
    throw new Error('Adresssuche nicht erreichbar.')
  } finally {
    clearTimeout(timeout)
  }
}

function featureToSuggestion(
  properties: PhotonProperties,
  coordinates: [number, number] | undefined
): LocationSuggestion | null {
  const base = formatPhotonLocation(properties)
  if (!base || !coordinates || coordinates.length < 2) return null
  const [lon, lat] = coordinates
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  return { ...base, latitude: lat, longitude: lon }
}

type PhotonFeatureCollection = {
  features?: Array<{
    properties?: PhotonProperties
    geometry?: { coordinates?: [number, number] }
  }>
}

export async function searchLocationsMain(
  query: string,
  language: LocationSearchLanguage
): Promise<LocationSuggestion[]> {
  const q = query.trim()
  if (q.length < MIN_QUERY_LEN) return []

  const url = buildPhotonSearchUrl(q, language, MAX_RESULTS)
  const data = await fetchPhotonJson<PhotonFeatureCollection>(url)
  const out: LocationSuggestion[] = []
  const seen = new Set<string>()

  for (const f of data.features ?? []) {
    const suggestion = featureToSuggestion(f.properties ?? {}, f.geometry?.coordinates)
    if (!suggestion) continue
    const key = suggestion.label.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(suggestion)
  }
  return out
}

export async function reverseLocationMain(
  latitude: number,
  longitude: number,
  language: LocationSearchLanguage
): Promise<LocationSuggestion | null> {
  const lat = Number(latitude)
  const lon = Number(longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null

  const lang = language === 'de' ? 'de' : 'en'
  const url =
    `${PHOTON_BASE}/reverse?` +
    new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      lang
    }).toString()

  const data = await fetchPhotonJson<PhotonFeatureCollection>(url)
  const f = data.features?.[0]
  if (!f) return null
  return featureToSuggestion(f.properties ?? {}, f.geometry?.coordinates)
}
