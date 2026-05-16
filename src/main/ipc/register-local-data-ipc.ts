import { ipcMain, dialog, BrowserWindow, app, type SaveDialogOptions, type OpenDialogOptions } from 'electron'
import { IPC, type LocalDataArchiveExportMode, type LocalDataArchiveExportResult, type LocalDataArchiveImportResult } from '@shared/types'
import {
  exportLocalDataArchive,
  optimizeLocalData,
  restoreLocalDataArchive,
  scanLocalDataUsage
} from '../local-data-service'

export function registerLocalDataIpc(): void {
  ipcMain.removeHandler(IPC.localData.scanUsage)
  ipcMain.removeHandler(IPC.localData.optimize)
  ipcMain.removeHandler(IPC.localData.exportArchive)
  ipcMain.removeHandler(IPC.localData.pickAndRestoreArchive)

  ipcMain.handle(IPC.localData.scanUsage, async () => scanLocalDataUsage())

  ipcMain.handle(IPC.localData.optimize, async () => optimizeLocalData())

  ipcMain.handle(
    IPC.localData.exportArchive,
    async (event, mode: unknown): Promise<LocalDataArchiveExportResult> => {
      const exportMode: LocalDataArchiveExportMode = mode === 'full' ? 'full' : 'portable'
      const win = BrowserWindow.fromWebContents(event.sender)
      const suffix = exportMode === 'full' ? 'voll' : 'portabel'
      const options: SaveDialogOptions = {
        title: 'Lokalen Datenspeicher exportieren',
        defaultPath: `mailclient-lokal-${suffix}-${new Date().toISOString().slice(0, 10)}.zip`,
        filters: [{ name: 'ZIP-Archiv', extensions: ['zip'] }]
      }
      const { canceled, filePath } = await (win
        ? dialog.showSaveDialog(win, options)
        : dialog.showSaveDialog(options))
      if (canceled || !filePath) {
        return { ok: false, cancelled: true }
      }
      const result = await exportLocalDataArchive(filePath, exportMode)
      return { ok: true, path: result.path, mode: result.mode }
    }
  )

  ipcMain.handle(
    IPC.localData.pickAndRestoreArchive,
    async (event): Promise<LocalDataArchiveImportResult> => {
      const win = BrowserWindow.fromWebContents(event.sender)
      const options: OpenDialogOptions = {
        title: 'Lokalen Datenspeicher importieren',
        filters: [{ name: 'ZIP-Archiv', extensions: ['zip'] }],
        properties: ['openFile']
      }
      const { canceled, filePaths } = await (win
        ? dialog.showOpenDialog(win, options)
        : dialog.showOpenDialog(options))
      if (canceled || !filePaths?.[0]) {
        return { ok: false, cancelled: true }
      }
      try {
        await restoreLocalDataArchive(filePaths[0])
        app.relaunch()
        app.exit(0)
        return { ok: true }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        return { ok: false, error: message }
      }
    }
  )
}
