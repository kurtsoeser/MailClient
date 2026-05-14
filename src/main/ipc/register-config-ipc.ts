import { ipcMain } from 'electron'
import { DateTime } from 'luxon'
import { IPC, type AppConfig, type AppConfigWeatherLocation } from '@shared/types'
import { loadConfig, updateConfig } from '../config'

export function registerConfigIpc(): void {
  ipcMain.removeHandler(IPC.config.get)
  ipcMain.removeHandler(IPC.config.setMicrosoftClientId)
  ipcMain.removeHandler(IPC.config.setGoogleClientId)
  ipcMain.removeHandler(IPC.config.setSyncWindowDays)
  ipcMain.removeHandler(IPC.config.setAutoLoadImages)
  ipcMain.removeHandler(IPC.config.setCalendarTimeZone)
  ipcMain.removeHandler(IPC.config.setWeatherLocation)
  ipcMain.removeHandler(IPC.config.setWorkflowMailFoldersIntroDismissed)
  ipcMain.removeHandler(IPC.config.setFirstRunSetupCompleted)

  ipcMain.handle(IPC.config.get, async (): Promise<AppConfig> => {
    return loadConfig()
  })

  ipcMain.handle(
    IPC.config.setMicrosoftClientId,
    async (_event, clientId: string): Promise<AppConfig> => {
      const trimmed = typeof clientId === 'string' ? clientId.trim() : ''
      if (!trimmed) {
        return updateConfig({ microsoftClientId: null })
      }
      return updateConfig({ microsoftClientId: trimmed })
    }
  )

  ipcMain.handle(
    IPC.config.setGoogleClientId,
    async (_event, clientId: string, clientSecret?: string | null): Promise<AppConfig> => {
      const trimmed = typeof clientId === 'string' ? clientId.trim() : ''
      if (!trimmed) {
        return updateConfig({ googleClientId: null, googleClientSecret: null })
      }
      if (clientSecret === undefined) {
        return updateConfig({ googleClientId: trimmed })
      }
      const sec =
        typeof clientSecret === 'string' && clientSecret.trim() !== '' ? clientSecret.trim() : null
      return updateConfig({ googleClientId: trimmed, googleClientSecret: sec })
    }
  )

  ipcMain.handle(
    IPC.config.setSyncWindowDays,
    async (_event, days: number | null): Promise<AppConfig> => {
      if (days !== null && (!Number.isFinite(days) || days <= 0)) {
        throw new Error('Ungueltiger Wert fuer Sync-Zeitraum.')
      }
      return updateConfig({ syncWindowDays: days })
    }
  )

  ipcMain.handle(
    IPC.config.setAutoLoadImages,
    async (_event, value: boolean): Promise<AppConfig> => {
      return updateConfig({ autoLoadImages: Boolean(value) })
    }
  )

  ipcMain.handle(
    IPC.config.setCalendarTimeZone,
    async (_event, iana: string | null): Promise<AppConfig> => {
      if (iana == null || (typeof iana === 'string' && iana.trim() === '')) {
        return updateConfig({ calendarTimeZone: null })
      }
      const t = typeof iana === 'string' ? iana.trim() : ''
      if (!t) {
        return updateConfig({ calendarTimeZone: null })
      }
      const probe = DateTime.now().setZone(t)
      if (!probe.isValid) {
        throw new Error('Ungueltige Zeitzone (IANA-Name, z. B. Europe/Berlin).')
      }
      return updateConfig({ calendarTimeZone: t })
    }
  )

  ipcMain.handle(
    IPC.config.setWeatherLocation,
    async (_event, payload: AppConfigWeatherLocation | null): Promise<AppConfig> => {
      if (payload == null) {
        return updateConfig({
          weatherLatitude: null,
          weatherLongitude: null,
          weatherLocationName: null
        })
      }
      const lat = Number(payload.latitude)
      const lon = Number(payload.longitude)
      const name = typeof payload.name === 'string' ? payload.name.trim() : ''
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        throw new Error('Wetter: ungueltige Koordinaten.')
      }
      if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        throw new Error('Wetter: Koordinaten ausserhalb des gueltigen Bereichs.')
      }
      return updateConfig({
        weatherLatitude: lat,
        weatherLongitude: lon,
        weatherLocationName: name !== '' ? name : null
      })
    }
  )

  ipcMain.handle(
    IPC.config.setWorkflowMailFoldersIntroDismissed,
    async (_event, value: boolean): Promise<AppConfig> => {
      return updateConfig({ workflowMailFoldersIntroDismissed: Boolean(value) })
    }
  )

  ipcMain.handle(
    IPC.config.setFirstRunSetupCompleted,
    async (_event, value: boolean): Promise<AppConfig> => {
      return updateConfig({ firstRunSetupCompleted: Boolean(value) })
    }
  )
}
