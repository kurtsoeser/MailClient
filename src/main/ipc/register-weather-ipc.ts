import { ipcMain } from 'electron'
import { IPC, type OpenMeteoForecast, type OpenMeteoGeocodeHit } from '@shared/types'
import { fetchOpenMeteoForecastMain, geocodeOpenMeteoPlaceMain } from '../open-meteo-weather'

export function registerWeatherIpc(): void {
  ipcMain.removeHandler(IPC.weather.geocode)
  ipcMain.removeHandler(IPC.weather.forecast)

  ipcMain.handle(
    IPC.weather.geocode,
    async (_event, payload: { query?: unknown; language?: unknown }): Promise<OpenMeteoGeocodeHit | null> => {
      const query = typeof payload?.query === 'string' ? payload.query : ''
      const language = payload?.language === 'de' ? 'de' : 'en'
      return geocodeOpenMeteoPlaceMain(query, language)
    }
  )

  ipcMain.handle(
    IPC.weather.forecast,
    async (
      _event,
      payload: { latitude?: unknown; longitude?: unknown; timeZone?: unknown }
    ): Promise<OpenMeteoForecast | null> => {
      const timeZone = typeof payload?.timeZone === 'string' ? payload.timeZone : null
      return fetchOpenMeteoForecastMain(Number(payload?.latitude), Number(payload?.longitude), timeZone)
    }
  )
}
