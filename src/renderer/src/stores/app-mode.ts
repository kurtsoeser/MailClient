import { create } from 'zustand'

export type AppShellMode =
  | 'home'
  | 'mail'
  | 'workflow'
  | 'calendar'
  | 'tasks'
  | 'people'
  | 'notes'
  | 'rules'
  | 'chat'

const STORAGE_KEY = 'mailclient.appShellMode'
const WORKFLOW_BOARD_LAYOUT_KEY = 'mailclient.workflow.boardLayout'

function migrateWorkflowCalendarLayoutsToCalendarMode(): void {
  try {
    const mode = window.localStorage.getItem(STORAGE_KEY)
    const layout = window.localStorage.getItem(WORKFLOW_BOARD_LAYOUT_KEY)
    if (
      mode === 'workflow' &&
      (layout === 'calendarMicrosoft' || layout === 'calendarMonth' || layout === 'calendarWeek')
    ) {
      window.localStorage.setItem(WORKFLOW_BOARD_LAYOUT_KEY, 'columns')
      window.localStorage.setItem(STORAGE_KEY, 'calendar')
    }
  } catch {
    // ignore
  }
}

function readStored(): AppShellMode {
  try {
    migrateWorkflowCalendarLayoutsToCalendarMode()
    const v = window.localStorage.getItem(STORAGE_KEY)
    if (v === 'focus') {
      persist('mail')
      return 'mail'
    }
    if (
      v === 'home' ||
      v === 'mail' ||
      v === 'workflow' ||
      v === 'calendar' ||
      v === 'tasks' ||
      v === 'people' ||
      v === 'notes' ||
      v === 'rules' ||
      v === 'chat'
    )
      return v
  } catch {
    // ignore
  }
  return 'home'
}

function persist(mode: AppShellMode): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // ignore
  }
}

interface AppModeState {
  mode: AppShellMode
  setMode: (mode: AppShellMode) => void
}

export const useAppModeStore = create<AppModeState>((set) => ({
  mode: readStored(),
  setMode(mode): void {
    persist(mode)
    set({ mode })
  }
}))
