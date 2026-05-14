import { readFile, writeFile } from 'node:fs/promises'
import { ipcMain, dialog, BrowserWindow, type OpenDialogOptions, type SaveDialogOptions } from 'electron'
import { IPC, type SettingsBackupExportResult, type SettingsBackupPickResult } from '@shared/types'
import type { SettingsBackupPayload } from '@shared/types'
import {
  applySettingsBackupPayload,
  buildSettingsBackupPayload,
  parseSettingsBackupJson
} from '../settings-backup-service'

export function registerSettingsBackupIpc(): void {
  ipcMain.removeHandler(IPC.settingsBackup.exportToFile)
  ipcMain.removeHandler(IPC.settingsBackup.pickAndRead)
  ipcMain.removeHandler(IPC.settingsBackup.applyFull)

  ipcMain.handle(
    IPC.settingsBackup.exportToFile,
    async (event, localStorage: unknown): Promise<SettingsBackupExportResult> => {
      if (!localStorage || typeof localStorage !== 'object' || Array.isArray(localStorage)) {
        throw new Error('Ungueltiger localStorage-Export.')
      }
      const flat: Record<string, string> = {}
      for (const [k, v] of Object.entries(localStorage as Record<string, unknown>)) {
        if (typeof v === 'string') flat[k] = v
      }
      const win = BrowserWindow.fromWebContents(event.sender)
      const options: SaveDialogOptions = {
        title: 'Einstellungen exportieren',
        defaultPath: `mailclient-einstellungen-${new Date().toISOString().slice(0, 10)}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }]
      }
      const { canceled, filePath } = await (win
        ? dialog.showSaveDialog(win, options)
        : dialog.showSaveDialog(options))
      if (canceled || !filePath) {
        return { ok: false, cancelled: true }
      }
      const payload = await buildSettingsBackupPayload(flat)
      await writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8')
      return { ok: true, path: filePath }
    }
  )

  ipcMain.handle(IPC.settingsBackup.pickAndRead, async (event): Promise<SettingsBackupPickResult> => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options: OpenDialogOptions = {
      title: 'Einstellungen importieren',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile']
    }
    const { canceled, filePaths } = await (win
      ? dialog.showOpenDialog(win, options)
      : dialog.showOpenDialog(options))
    if (canceled || !filePaths?.[0]) {
      return { ok: false, cancelled: true }
    }
    try {
      const raw = await readFile(filePaths[0], 'utf8')
      const backup = parseSettingsBackupJson(raw)
      return { ok: true, backup }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return { ok: false, error: message }
    }
  })

  ipcMain.handle(
    IPC.settingsBackup.applyFull,
    async (_event, backup: unknown): Promise<void> => {
      if (!backup || typeof backup !== 'object') {
        throw new Error('Ungueltige Sicherung.')
      }
      const raw = JSON.stringify(backup)
      const parsed = parseSettingsBackupJson(raw) as SettingsBackupPayload
      await applySettingsBackupPayload(parsed)
    }
  )
}