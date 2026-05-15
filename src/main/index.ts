import { app, BrowserWindow, session, type WebContents } from 'electron'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerIpcHandlers } from './ipc'
import { getDb, closeDb } from './db'
import { listAccounts } from './accounts'
import { runInitialSync } from './sync-runner'
import { startMailPolling, stopMailPolling } from './mail-poll-runner'
import { loadConfig } from './config'
import { isAppOnline, startConnectivityMonitoring, stopConnectivityMonitoring } from './network-status'
import {
  isAppInternalNavigationUrl,
  normalizeExternalOpenUrl,
  openExternalIfAllowedSync
} from './open-external'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const isDev = !app.isPackaged

let mailFrameRedirectRegistered = false

/**
 * Blockiert http(s)-Navigation in (Sub-)Frames **bevor** die Renderer-CSP greift
 * (sonst ERR_BLOCKED_BY_CSP im Mail-srcdoc-Iframe) und oeffnet stattdessen im OS-Browser.
 */
function registerMailFrameExternalRedirect(): void {
  if (mailFrameRedirectRegistered) return
  mailFrameRedirectRegistered = true
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const rt = details.resourceType
    if (rt !== 'mainFrame' && rt !== 'subFrame') {
      callback({})
      return
    }
    const url = details.url
    if (isAppInternalNavigationUrl(url)) {
      callback({})
      return
    }
    if (normalizeExternalOpenUrl(url)) {
      openExternalIfAllowedSync(url)
      callback({ cancel: true })
      return
    }
    if (rt === 'subFrame') {
      callback({ cancel: true })
      return
    }
    callback({})
  })
}

function attachExternalNavigationGuards(contents: WebContents): void {
  contents.setWindowOpenHandler((details) => {
    openExternalIfAllowedSync(details.url)
    return { action: 'deny' }
  })
  /**
   * Jede WebContents (auch Popups aus sandboxed Mail-Iframes) — nicht nur das
   * Hauptfenster. Sonst laedt ein Kindfenster https unter der Renderer-CSP und
   * scheitert mit ERR_BLOCKED_BY_CSP statt im Systembrowser zu oeffnen.
   */
  contents.on('will-frame-navigate', (event) => {
    const url = event.url
    if (isAppInternalNavigationUrl(url)) return

    if (normalizeExternalOpenUrl(url)) {
      event.preventDefault()
      openExternalIfAllowedSync(url)
      return
    }

    if (!event.isMainFrame) {
      event.preventDefault()
    }
  })
}

app.on('web-contents-created', (_event, contents) => {
  if (contents.getType() === 'webview') return
  attachExternalNavigationGuards(contents)
})

let mainWindow: BrowserWindow | null = null

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0e0e12',
    title: 'MailClient',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      /** Fuer das Chat-Modul (<webview> mit WhatsApp Web). */
      webviewTag: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  registerMailFrameExternalRedirect()
  getDb()
  registerIpcHandlers()
  createMainWindow()
  startConnectivityMonitoring()

  try {
    const cfg = await loadConfig()
    app.setLoginItemSettings({ openAtLogin: !!cfg.launchOnLogin, path: process.execPath })
  } catch (e) {
    console.warn('[startup] launchOnLogin:', e)
  }

  if (app.isPackaged && process.env.UPDATE_BASE_URL) {
    void import('electron-updater')
      .then(({ autoUpdater }) => {
        autoUpdater.setFeedURL({ provider: 'generic', url: process.env.UPDATE_BASE_URL! })
        void autoUpdater.checkForUpdatesAndNotify().catch(() => undefined)
      })
      .catch((e) => console.warn('[startup] autoUpdater:', e))
  }

  const accounts = await listAccounts()
  if (isAppOnline()) {
    for (const account of accounts) {
      void runInitialSync(account.id).catch((e) =>
        console.error('[startup] sync failed for', account.id, e)
      )
    }
  } else {
    console.warn('[startup] offline — Initial-Sync wird uebersprungen.')
  }

  startMailPolling()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('before-quit', () => {
  stopMailPolling()
  stopConnectivityMonitoring()
})

app.on('window-all-closed', () => {
  stopMailPolling()
  stopConnectivityMonitoring()
  closeDb()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
