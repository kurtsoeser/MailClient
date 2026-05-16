import { ipcMain } from 'electron'
import { IPC, type TeamsChatPopoutListItem, type TeamsChatPopoutOpenInput } from '@shared/types'
import {
  closeAllTeamsChatPopouts,
  closeTeamsChatPopout,
  focusTeamsChatPopout,
  getTeamsChatPopoutAlwaysOnTop,
  isTeamsChatPopoutOpen,
  listOpenTeamsChatPopouts,
  openTeamsChatPopout,
  setTeamsChatPopoutAlwaysOnTop
} from '../teams-chat-popout'

export function registerTeamsChatPopoutIpc(): void {
  ipcMain.handle(IPC.teamsChatPopout.open, (_event, input: TeamsChatPopoutOpenInput): void => {
    openTeamsChatPopout(input)
  })

  ipcMain.handle(
    IPC.teamsChatPopout.close,
    (_event, args: { accountId: string; chatId: string }): void => {
      const accountId = typeof args?.accountId === 'string' ? args.accountId : ''
      const chatId = typeof args?.chatId === 'string' ? args.chatId : ''
      if (!accountId || !chatId) return
      closeTeamsChatPopout(accountId, chatId)
    }
  )

  ipcMain.handle(IPC.teamsChatPopout.closeAll, (): void => {
    closeAllTeamsChatPopouts()
  })

  ipcMain.handle(
    IPC.teamsChatPopout.focus,
    (_event, args: { accountId: string; chatId: string }): boolean => {
      const accountId = typeof args?.accountId === 'string' ? args.accountId : ''
      const chatId = typeof args?.chatId === 'string' ? args.chatId : ''
      if (!accountId || !chatId) return false
      return focusTeamsChatPopout(accountId, chatId)
    }
  )

  ipcMain.handle(
    IPC.teamsChatPopout.isOpen,
    (_event, args: { accountId: string; chatId: string }): boolean => {
      const accountId = typeof args?.accountId === 'string' ? args.accountId : ''
      const chatId = typeof args?.chatId === 'string' ? args.chatId : ''
      if (!accountId || !chatId) return false
      return isTeamsChatPopoutOpen(accountId, chatId)
    }
  )

  ipcMain.handle(IPC.teamsChatPopout.listOpen, (): TeamsChatPopoutListItem[] =>
    listOpenTeamsChatPopouts()
  )

  ipcMain.handle(
    IPC.teamsChatPopout.getAlwaysOnTop,
    (_event, args: { accountId: string; chatId: string }): boolean => {
      const accountId = typeof args?.accountId === 'string' ? args.accountId : ''
      const chatId = typeof args?.chatId === 'string' ? args.chatId : ''
      if (!accountId || !chatId) return false
      return getTeamsChatPopoutAlwaysOnTop(accountId, chatId)
    }
  )

  ipcMain.handle(
    IPC.teamsChatPopout.setAlwaysOnTop,
    (_event, args: { accountId: string; chatId: string; alwaysOnTop: boolean }): void => {
      const accountId = typeof args?.accountId === 'string' ? args.accountId : ''
      const chatId = typeof args?.chatId === 'string' ? args.chatId : ''
      if (!accountId || !chatId) return
      setTeamsChatPopoutAlwaysOnTop(accountId, chatId, args.alwaysOnTop === true)
    }
  )
}
