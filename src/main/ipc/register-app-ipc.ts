import { ipcMain, app, BrowserWindow, Notification } from 'electron'
import { IPC, type AppConnectivityState } from '@shared/types'
import { updateConfig } from '../config'
import { normalizeExternalOpenUrl, openExternalDeduped } from '../open-external'
import { getAppConnectivity } from '../network-status'

export function registerAppIpc(): void {
  ipcMain.handle(IPC.app.getVersion, () => app.getVersion())
  ipcMain.handle(IPC.app.getPlatform, () => process.platform)
  ipcMain.handle(IPC.app.getConnectivity, (): AppConnectivityState => getAppConnectivity())

  ipcMain.handle(IPC.app.setLaunchOnLogin, async (_event, enabled: boolean): Promise<void> => {
    await updateConfig({ launchOnLogin: enabled })
    app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath })
  })

  ipcMain.handle(IPC.app.showTestNotification, (): void => {
    if (!Notification.isSupported()) return
    new Notification({ title: 'MailClient', body: 'Benachrichtigungen sind aktiv.' }).show()
  })

  ipcMain.handle(IPC.app.openExternal, async (event, url: unknown): Promise<void> => {
    const raw = typeof url === 'string' ? url.trim() : ''
    if (!raw) throw new Error('Keine URL.')
    if (!normalizeExternalOpenUrl(raw)) {
      throw new Error('Diese URL darf nicht extern geoeffnet werden (nicht in der erlaubten Liste).')
    }
    await openExternalDeduped(raw)
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win && !win.isDestroyed()) {
      win.show()
      win.focus()
      if (process.platform === 'win32') {
        win.moveTop()
      }
    }
  })
}
