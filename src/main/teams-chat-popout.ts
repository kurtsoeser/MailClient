import { app, BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  TeamsChatPopoutKey,
  TeamsChatPopoutListItem,
  TeamsChatPopoutOpenInput
} from '@shared/types'
import { broadcastTeamsChatPopoutClosed } from './ipc/ipc-broadcasts'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const isDev = !app.isPackaged

const POPOUT_WIDTH = 440
const POPOUT_HEIGHT = 720
const CASCADE_OFFSET = 28

function popoutKey(accountId: string, chatId: string): TeamsChatPopoutKey {
  return `${accountId}::${chatId}`
}

function buildHashRoute(accountId: string, chatId: string): string {
  const params = new URLSearchParams({ accountId, chatId })
  return `teams-chat-popout?${params.toString()}`
}

function loadPopoutRenderer(win: BrowserWindow, accountId: string, chatId: string): void {
  const hash = buildHashRoute(accountId, chatId)
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (isDev && devUrl) {
    const base = devUrl.replace(/#.*$/, '')
    void win.loadURL(`${base}#${hash}`)
    return
  }
  void win.loadFile(join(__dirname, '../renderer/index.html'), { hash })
}

function nextCascadePosition(): { x: number; y: number } {
  const n = popoutWindows.size
  const display = screen.getPrimaryDisplay()
  const work = display.workArea
  const baseX = work.x + Math.max(0, work.width - POPOUT_WIDTH - 48)
  const baseY = work.y + Math.max(0, Math.floor((work.height - POPOUT_HEIGHT) / 2))
  return { x: baseX + n * CASCADE_OFFSET, y: baseY + n * CASCADE_OFFSET }
}

const popoutWindows = new Map<TeamsChatPopoutKey, BrowserWindow>()
const popoutMeta = new Map<TeamsChatPopoutKey, { title: string; alwaysOnTop: boolean }>()

function getMeta(key: TeamsChatPopoutKey, fallbackTitle: string): { title: string; alwaysOnTop: boolean } {
  return popoutMeta.get(key) ?? { title: fallbackTitle, alwaysOnTop: false }
}

export function isTeamsChatPopoutOpen(accountId: string, chatId: string): boolean {
  const win = popoutWindows.get(popoutKey(accountId, chatId))
  return win != null && !win.isDestroyed()
}

export function listOpenTeamsChatPopouts(): TeamsChatPopoutListItem[] {
  const open: TeamsChatPopoutListItem[] = []
  for (const [key, win] of popoutWindows) {
    if (win.isDestroyed()) {
      popoutWindows.delete(key)
      popoutMeta.delete(key)
      continue
    }
    const sep = key.indexOf('::')
    if (sep <= 0) continue
    const accountId = key.slice(0, sep)
    const chatId = key.slice(sep + 2)
    const meta = getMeta(key, 'Teams-Chat')
    open.push({
      accountId,
      chatId,
      title: meta.title,
      alwaysOnTop: win.isAlwaysOnTop()
    })
  }
  return open
}

export function focusTeamsChatPopout(accountId: string, chatId: string): boolean {
  const win = popoutWindows.get(popoutKey(accountId, chatId))
  if (!win || win.isDestroyed()) return false
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  return true
}

export function closeTeamsChatPopout(accountId: string, chatId: string): void {
  const key = popoutKey(accountId, chatId)
  const win = popoutWindows.get(key)
  if (!win || win.isDestroyed()) {
    popoutWindows.delete(key)
    popoutMeta.delete(key)
    return
  }
  win.close()
}

export function getTeamsChatPopoutAlwaysOnTop(accountId: string, chatId: string): boolean {
  const win = popoutWindows.get(popoutKey(accountId, chatId))
  if (!win || win.isDestroyed()) return false
  return win.isAlwaysOnTop()
}

export function setTeamsChatPopoutAlwaysOnTop(
  accountId: string,
  chatId: string,
  alwaysOnTop: boolean
): void {
  const key = popoutKey(accountId, chatId)
  const win = popoutWindows.get(key)
  if (!win || win.isDestroyed()) return
  win.setAlwaysOnTop(alwaysOnTop, 'floating')
  const meta = popoutMeta.get(key)
  if (meta) popoutMeta.set(key, { ...meta, alwaysOnTop })
}

export function openTeamsChatPopout(input: TeamsChatPopoutOpenInput): void {
  const accountId = input.accountId.trim()
  const chatId = input.chatId.trim()
  if (!accountId || !chatId) {
    throw new Error('Konto- und Chat-ID erforderlich.')
  }
  const key = popoutKey(accountId, chatId)
  const existing = popoutWindows.get(key)
  if (existing && !existing.isDestroyed()) {
    focusTeamsChatPopout(accountId, chatId)
    return
  }

  const title = input.title?.trim() || 'Teams-Chat'
  const alwaysOnTop = input.alwaysOnTop === true
  const { x, y } = nextCascadePosition()

  const win = new BrowserWindow({
    width: POPOUT_WIDTH,
    height: POPOUT_HEIGHT,
    minWidth: 360,
    minHeight: 480,
    x,
    y,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0e0e12',
    title,
    alwaysOnTop,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  })

  if (alwaysOnTop) {
    win.setAlwaysOnTop(true, 'floating')
  }

  popoutWindows.set(key, win)
  popoutMeta.set(key, { title, alwaysOnTop })

  win.on('ready-to-show', () => {
    if (!win.isDestroyed()) win.show()
  })

  win.on('closed', () => {
    popoutWindows.delete(key)
    popoutMeta.delete(key)
    broadcastTeamsChatPopoutClosed({ accountId, chatId })
  })

  loadPopoutRenderer(win, accountId, chatId)
}

export function closeAllTeamsChatPopouts(): void {
  for (const win of [...popoutWindows.values()]) {
    if (!win.isDestroyed()) win.close()
  }
  popoutWindows.clear()
  popoutMeta.clear()
}
