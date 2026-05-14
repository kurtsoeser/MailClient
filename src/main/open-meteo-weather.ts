import { net } from 'electron'
import type { OpenMeteoForecast, OpenMeteoGeocodeHit } from '@shared/types'

const OPEN_METEO_TIMEOUT_MS = 10000
const OPEN_METEO_USER_AGENT = 'MailClient/0.0.1 (Electron)'

async function fetchOpenMeteoJson<T>(url: string): Promise<T> {
  const ac = new AbortController()
  const timeout = setTimeout(() => ac.abort(), OPEN_METEO_TIMEOUT_MS)
  try {
    const res = await net.fetch(url, {
      signal: ac.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': OPEN_METEO_USER_AGENT
      }
    })
    if (!res.ok) {
      throw new Error(`Open-Meteo antwortet mit HTTP ${res.status}.`)
    }
    return (await res.json()) as T
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('Open-Meteo hat nicht rechtzeitig geantwortet.')
    }
    if (e instanceof Error) {
      throw new Error(`Open-Meteo konnte nicht erreicht werden: ${e.message}`)
    }
    throw new Error('Open-Meteo konnte nicht erreicht werden.')
  } finally {
    clearTimeout(timeout)
  }
}

export async function geocodeOpenMeteoPlaceMain(
  query: string,
  language: 'de' | 'en'
): Promise<OpenMeteoGeocodeHit | null> {
  const q = typeof query === 'string' ? query.trim() : ''
  if (!q) return null

  const lang = language === 'de' ? 'de' : 'en'
  const url =
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}` +
    `&count=5&language=${lang}&format=json`
  const data = await fetchOpenMeteoJson<{
    results?: Array<{
      latitude: number
      longitude: number
      name: string
      admin1?: string
      country?: string
    }>
  }>(url)

  const r = data.results?.[0]
  if (!r || !Number.isFinite(r.latitude) || !Number.isFinite(r.longitude)) return null
  const label = [r.name, r.admin1, r.country].filter(Boolean).join(', ')
  return { latitude: r.latitude, longitude: r.longitude, label: label || r.name }
}

export async function fetchOpenMeteoForecastMain(
  latitude: number,
  longitude: number,
  timeZone: string | null
): Promise<OpenMeteoForecast | null> {
  const lat = Number(latitude)
  const lon = Number(longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    throw new Error('Wetter: ungueltige Koordinaten.')
  }

  const tz = encodeURIComponent(timeZone?.trim() ? timeZone.trim() : 'auto')
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    '&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min' +
    '&forecast_days=8' +
    `&timezone=${tz}` +
    '&wind_speed_unit=kmh'
  const j = await fetchOpenMeteoJson<{
    current?: Record<string, number | string>
    daily?: {
      time?: string[]
      weather_code?: number[]
      temperature_2m_max?: number[]
      temperature_2m_min?: number[]
    }
  }>(url)

  const cur = j.current
  if (!cur || typeof cur.temperature_2m !== 'number') return null
  const current = {
    temperatureC: cur.temperature_2m,
    apparentTemperatureC: typeof cur.apparent_temperature === 'number' ? cur.apparent_temperature : cur.temperature_2m,
    humidityPct: typeof cur.relative_humidity_2m === 'number' ? cur.relative_humidity_2m : 0,
    windKmh: typeof cur.wind_speed_10m === 'number' ? cur.wind_speed_10m : 0,
    weatherCode: typeof cur.weather_code === 'number' ? cur.weather_code : 0
  }

  const d = j.daily
  const times = Array.isArray(d?.time) ? d!.time! : []
  const codes = Array.isArray(d?.weather_code) ? d!.weather_code! : []
  const tmax = Array.isArray(d?.temperature_2m_max) ? d!.temperature_2m_max! : []
  const tmin = Array.isArray(d?.temperature_2m_min) ? d!.temperature_2m_min! : []
  const daily = []
  for (let i = 0; i < times.length; i++) {
    const dateIso = times[i]
    if (typeof dateIso !== 'string') continue
    daily.push({
      dateIso,
      weatherCode: typeof codes[i] === 'number' ? codes[i]! : 0,
      tempMaxC: typeof tmax[i] === 'number' ? tmax[i]! : 0,
      tempMinC: typeof tmin[i] === 'number' ? tmin[i]! : 0
    })
  }
  return { current, daily }
}
