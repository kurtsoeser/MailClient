import { IPC, type OpenMeteoForecast, type OpenMeteoForecastDay, type OpenMeteoGeocodeHit } from '@shared/types'

export type { OpenMeteoForecastDay }

type WeatherApi = {
  geocode?: (query: string, language: 'de' | 'en') => Promise<OpenMeteoGeocodeHit | null>
  forecast?: (latitude: number, longitude: number, timeZone: string | null) => Promise<OpenMeteoForecast | null>
}

type InvokeApi = {
  weather?: WeatherApi
  invoke?: (channel: string, payload?: unknown) => Promise<unknown>
}

function getWeatherApi(): InvokeApi {
  return window.mailClient as typeof window.mailClient & InvokeApi
}

/** Geocoding (Open-Meteo, kein API-Key) laeuft ueber Main-IPC, weil die Renderer-CSP externe fetches blockiert. */
export async function geocodeOpenMeteoPlace(
  query: string,
  language: 'de' | 'en'
): Promise<OpenMeteoGeocodeHit | null> {
  const api = getWeatherApi()
  if (api.weather?.geocode) return api.weather.geocode(query, language)
  if (api.invoke) {
    return (await api.invoke(IPC.weather.geocode, { query, language })) as OpenMeteoGeocodeHit | null
  }
  throw new Error('Wetterdienst ist nicht verfuegbar.')
}

export async function fetchOpenMeteoForecast(
  latitude: number,
  longitude: number,
  timeZone: string | null
): Promise<OpenMeteoForecast | null> {
  const api = getWeatherApi()
  if (api.weather?.forecast) return api.weather.forecast(latitude, longitude, timeZone)
  if (api.invoke) {
    return (await api.invoke(IPC.weather.forecast, { latitude, longitude, timeZone })) as OpenMeteoForecast | null
  }
  throw new Error('Wetterdienst ist nicht verfuegbar.')
}
