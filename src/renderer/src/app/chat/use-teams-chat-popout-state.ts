import { useCallback, useEffect, useState } from 'react'
import type { TeamsChatPopoutListItem } from '@shared/types'
import { teamsChatPopoutRefKey } from './teams-chat-helpers'
import { loadTeamsChatPopoutAlwaysOnTopDefault } from './teams-chat-popout-prefs'

export function useTeamsChatPopoutState(): {
  poppedOutKeys: Set<string>
  openPopouts: TeamsChatPopoutListItem[]
  isPoppedOut: (accountId: string | null, chatId: string | null) => boolean
  openPopout: (accountId: string, chatId: string, title: string) => Promise<void>
  closePopout: (accountId: string, chatId: string) => Promise<void>
  closeAllPopouts: () => Promise<void>
  focusPopout: (accountId: string, chatId: string) => Promise<boolean>
  refreshOpenPopouts: () => Promise<void>
} {
  const [poppedOutKeys, setPoppedOutKeys] = useState<Set<string>>(() => new Set())
  const [openPopouts, setOpenPopouts] = useState<TeamsChatPopoutListItem[]>([])

  const refreshOpenPopouts = useCallback(async (): Promise<void> => {
    const list = await window.mailClient.teamsChatPopout.listOpen()
    setOpenPopouts(list)
    setPoppedOutKeys(new Set(list.map((r) => teamsChatPopoutRefKey(r.accountId, r.chatId))))
  }, [])

  useEffect(() => {
    void refreshOpenPopouts()
  }, [refreshOpenPopouts])

  useEffect(() => {
    return window.mailClient.events.onTeamsChatPopoutClosed(() => {
      void refreshOpenPopouts()
    })
  }, [refreshOpenPopouts])

  const isPoppedOut = useCallback(
    (accountId: string | null, chatId: string | null): boolean => {
      if (!accountId || !chatId) return false
      return poppedOutKeys.has(teamsChatPopoutRefKey(accountId, chatId))
    },
    [poppedOutKeys]
  )

  const openPopout = useCallback(
    async (accountId: string, chatId: string, title: string): Promise<void> => {
      await window.mailClient.teamsChatPopout.open({
        accountId,
        chatId,
        title,
        alwaysOnTop: loadTeamsChatPopoutAlwaysOnTopDefault()
      })
      await refreshOpenPopouts()
    },
    [refreshOpenPopouts]
  )

  const closePopout = useCallback(
    async (accountId: string, chatId: string): Promise<void> => {
      await window.mailClient.teamsChatPopout.close({ accountId, chatId })
      await refreshOpenPopouts()
    },
    [refreshOpenPopouts]
  )

  const closeAllPopouts = useCallback(async (): Promise<void> => {
    await window.mailClient.teamsChatPopout.closeAll()
    await refreshOpenPopouts()
  }, [refreshOpenPopouts])

  const focusPopout = useCallback(
    (accountId: string, chatId: string): Promise<boolean> =>
      window.mailClient.teamsChatPopout.focus({ accountId, chatId }),
    []
  )

  return {
    poppedOutKeys,
    openPopouts,
    isPoppedOut,
    openPopout,
    closePopout,
    closeAllPopouts,
    focusPopout,
    refreshOpenPopouts
  }
}
