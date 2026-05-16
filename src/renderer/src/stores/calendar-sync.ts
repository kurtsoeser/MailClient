import { create } from 'zustand'
import type { SyncStatus } from '@shared/types'
import { OFFLINE_APP_ERROR } from '@shared/types'
import { useConnectivityStore } from '@/stores/connectivity'

interface CalendarSyncStore {
  syncByAccount: Record<string, SyncStatus>
  initialized: boolean
  initialize: () => void
  triggerSync: (accountId: string) => Promise<void>
}

let unsubscribers: Array<() => void> = []

export const useCalendarSyncStore = create<CalendarSyncStore>((set, get) => ({
  syncByAccount: {},
  initialized: false,

  initialize(): void {
    if (get().initialized) return
    if (!window.mailClient?.events?.onCalendarSyncStatus) return
    set({ initialized: true })

    unsubscribers.push(
      window.mailClient.events.onCalendarSyncStatus((status) => {
        set((s) => ({
          syncByAccount: { ...s.syncByAccount, [status.accountId]: status }
        }))
      })
    )

    void window.mailClient.calendar.getAccountSyncStates().then((rows) => {
      set((s) => {
        const next = { ...s.syncByAccount }
        for (const row of rows) {
          if (row.hasSynced && !next[row.accountId]) {
            next[row.accountId] = { accountId: row.accountId, state: 'idle' }
          }
        }
        return { syncByAccount: next }
      })
    })
  },

  async triggerSync(accountId: string): Promise<void> {
    if (!useConnectivityStore.getState().online) {
      set((s) => ({
        syncByAccount: {
          ...s.syncByAccount,
          [accountId]: { accountId, state: 'error', message: OFFLINE_APP_ERROR }
        }
      }))
      return
    }
    try {
      await window.mailClient.calendar.syncAccount(accountId)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      set((s) => ({
        syncByAccount: {
          ...s.syncByAccount,
          [accountId]: { accountId, state: 'error', message }
        }
      }))
    }
  }
}))

export function disposeCalendarSyncStore(): void {
  for (const off of unsubscribers) off()
  unsubscribers = []
}
