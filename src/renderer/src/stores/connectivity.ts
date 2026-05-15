import { create } from 'zustand'

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
  void window.mailClient.app.getConnectivity().then((r) => {
    useConnectivityStore.getState().setOnline(r.online)
  })
  return window.mailClient.events.onConnectivityChange((payload) => {
    useConnectivityStore.getState().setOnline(payload.online)
  })
}
