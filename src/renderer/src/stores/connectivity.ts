import { create } from 'zustand'
import { isMailClientRuntimeComplete, warnMailClientMissingOnce } from '@/lib/mail-client-runtime'

interface ConnectivityState {
  online: boolean
  setOnline: (online: boolean) => void
}

export const useConnectivityStore = create<ConnectivityState>((set) => ({
  online: true,
  setOnline: (online): void => set({ online })
}))

/** IPC-Zustand aus Main (`net.isOnline`) — einmal lesen, dann Events. */
export function subscribeConnectivityFromMain(): () => void {
  if (!isMailClientRuntimeComplete()) {
    warnMailClientMissingOnce(
      'connectivity-sub',
      '[connectivity] `window.mailClient` unvollständig: Online-Status per IPC nicht verbunden.'
    )
    return (): void => undefined
  }
  void window.mailClient.app.getConnectivity().then((r) => {
    useConnectivityStore.getState().setOnline(r.online)
  })
  return window.mailClient.events.onConnectivityChange((payload) => {
    useConnectivityStore.getState().setOnline(payload.online)
  })
}
