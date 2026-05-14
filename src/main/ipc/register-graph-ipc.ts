import { ipcMain } from 'electron'
import { IPC, type TeamsChatSummary, type TeamsChatMessageView } from '@shared/types'
import { loadConfig } from '../config'
import { getMe } from '../graph/client'
import { listTeamsChatMessages, listTeamsChats, sendTeamsChatMessage } from '../graph/teams-chat'

export function registerGraphIpc(): void {
  ipcMain.handle(IPC.graph.getMe, async (_event, id: string) => {
    if (id.startsWith('google:')) {
      throw new Error('getMe gilt nur fuer Microsoft-Konten (Graph).')
    }
    const config = await loadConfig()
    if (!config.microsoftClientId) {
      throw new Error('Keine Azure Client-ID konfiguriert.')
    }
    const homeAccountId = id.replace(/^ms:/, '')
    return getMe(config.microsoftClientId, homeAccountId)
  })

  ipcMain.handle(IPC.graph.listTeamsChats, async (_event, accountId: string): Promise<TeamsChatSummary[]> => {
    if (typeof accountId !== 'string' || !accountId.startsWith('ms:')) {
      throw new Error('Teams-Chats sind nur fuer Microsoft-Konten verfuegbar.')
    }
    const config = await loadConfig()
    if (!config.microsoftClientId) {
      throw new Error('Keine Azure Client-ID konfiguriert.')
    }
    const homeAccountId = accountId.replace(/^ms:/, '')
    return listTeamsChats(config.microsoftClientId, homeAccountId)
  })

  ipcMain.handle(
    IPC.graph.listTeamsChatMessages,
    async (
      _event,
      args: { accountId: string; chatId: string; limit?: number }
    ): Promise<TeamsChatMessageView[]> => {
      const accountId = typeof args?.accountId === 'string' ? args.accountId : ''
      const chatId = typeof args?.chatId === 'string' ? args.chatId : ''
      if (!accountId.startsWith('ms:')) {
        throw new Error('Teams-Chats sind nur fuer Microsoft-Konten verfuegbar.')
      }
      if (!chatId.trim()) {
        throw new Error('Keine Chat-ID.')
      }
      const config = await loadConfig()
      if (!config.microsoftClientId) {
        throw new Error('Keine Azure Client-ID konfiguriert.')
      }
      const homeAccountId = accountId.replace(/^ms:/, '')
      const limit =
        typeof args.limit === 'number' && Number.isFinite(args.limit) && args.limit > 0
          ? Math.min(Math.floor(args.limit), 50)
          : 40
      return listTeamsChatMessages(
        config.microsoftClientId,
        homeAccountId,
        chatId.trim(),
        limit
      )
    }
  )

  ipcMain.handle(
    IPC.graph.sendTeamsChatMessage,
    async (
      _event,
      args: { accountId: string; chatId: string; text: string }
    ): Promise<void> => {
      const accountId = typeof args?.accountId === 'string' ? args.accountId : ''
      const chatId = typeof args?.chatId === 'string' ? args.chatId : ''
      const text = typeof args?.text === 'string' ? args.text : ''
      if (!accountId.startsWith('ms:')) {
        throw new Error('Teams-Chats sind nur fuer Microsoft-Konten verfuegbar.')
      }
      if (!chatId.trim()) {
        throw new Error('Keine Chat-ID.')
      }
      const config = await loadConfig()
      if (!config.microsoftClientId) {
        throw new Error('Keine Azure Client-ID konfiguriert.')
      }
      const homeAccountId = accountId.replace(/^ms:/, '')
      await sendTeamsChatMessage(config.microsoftClientId, homeAccountId, chatId.trim(), text)
    }
  )
}
