import { ipcMain } from 'electron'
import { IPC } from '@shared/types'
import type { LocationSearchLanguage, LocationSuggestion } from '@shared/location-search'
import { reverseLocationMain, searchLocationsMain } from '../location-search'
import { assertAppOnline } from '../network-status'

export function registerLocationIpc(): void {
  ipcMain.removeHandler(IPC.location.search)
  ipcMain.removeHandler(IPC.location.reverse)

  ipcMain.handle(
    IPC.location.search,
    async (
      _event,
      payload: { query?: unknown; language?: unknown }
    ): Promise<LocationSuggestion[]> => {
      assertAppOnline()
      const query = typeof payload?.query === 'string' ? payload.query : ''
      const language: LocationSearchLanguage = payload?.language === 'de' ? 'de' : 'en'
      return searchLocationsMain(query, language)
    }
  )

  ipcMain.handle(
    IPC.location.reverse,
    async (
      _event,
      payload: { latitude?: unknown; longitude?: unknown; language?: unknown }
    ): Promise<LocationSuggestion | null> => {
      assertAppOnline()
      const language: LocationSearchLanguage = payload?.language === 'de' ? 'de' : 'en'
      return reverseLocationMain(Number(payload?.latitude), Number(payload?.longitude), language)
    }
  )
}
