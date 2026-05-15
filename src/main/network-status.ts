import { net, BrowserWindow } from 'electron'
import { OFFLINE_APP_ERROR, type AppConnectivityState } from '@shared/types'
import { runInitialSync } from './sync-runner'
import { listAccounts } from './accounts'

const POLL_MS = 3000

let lastOnline: boolean | undefined
let monitorTimer: NodeJS.Timeout | null = null

function runCatchUpSyncAfterReconnect(): void {
  void (async (): Promise<void> => {
    try {
      const accounts = await listAccounts()
      for (const a of accounts) {
        void runInitialSync(a.id).catch((e) =>
          console.warn('[connectivity] Catch-up-Sync fehlgeschlagen:', a.id, e)
        )
      }
    } catch (e) {
      console.warn('[connectivity] Catch-up-Sync:', e)
    }
  })()
}

export function getAppConnectivity(): AppConnectivityState {
  return { online: net.isOnline() }
}

export function isAppOnline(): boolean {
  return net.isOnline()
}

export function assertAppOnline(): void {
  if (!net.isOnline()) {
    throw new Error(OFFLINE_APP_ERROR)
  }
}

function broadcastIfChanged(online: boolean): void {
  const prev = lastOnline
  if (prev === online) return
  lastOnline = online
  if (online && prev === false) {
    runCatchUpSyncAfterReconnect()
  }
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    win.webContents.send('app:connectivity', { online } satisfies AppConnectivityState)
  }
}

/**
 * Periodisch `net.isOnline()` pruefen und Aenderungen an alle Fenster senden.
 * Renderer holt beim Mount zusaetzlich den Ist-Zustand per IPC.
 */
export function startConnectivityMonitoring(): void {
  lastOnline = undefined
  const tick = (): void => {
    broadcastIfChanged(net.isOnline())
  }
  tick()
  if (monitorTimer) clearInterval(monitorTimer)
  monitorTimer = setInterval(tick, POLL_MS)
}

export function stopConnectivityMonitoring(): void {
  if (monitorTimer) {
    clearInterval(monitorTimer)
    monitorTimer = null
  }
}
