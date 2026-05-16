import { create } from 'zustand'

export type AppShellMode =
  | 'home'
  | 'mail'
  | 'calendar'
  | 'tasks'
  | 'work'
  | 'people'
  | 'notes'
  | 'chat'

const STORAGE_KEY = 'mailclient.appShellMode'

/** Nach Öffnen der App: Mail-Einstellungen → Regeln (Migration vom Top-Level-Modul). */
export const PENDING_MAIL_RULES_SETTINGS_KEY = 'mailclient.pendingMailRulesSettings'

/** Entferntes Workflow-Modul: gespeicherte Ansicht auf „Alle Arbeit“ umleiten. */
function migrateLegacyWorkflowMode(): void {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY)
    if (v === 'workflow') {
      window.localStorage.setItem(STORAGE_KEY, 'work')
    }
  } catch {
    // ignore
  }
}

/** Zeitliste ist Teil des Kalender-Moduls (rechte Spalte „Zeitliste“). */
function migrateLegacyMegaMode(): void {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY)
    if (v === 'mega') {
      window.localStorage.setItem(STORAGE_KEY, 'calendar')
    }
  } catch {
    // ignore
  }
}

function readStored(): AppShellMode {
  try {
    migrateLegacyWorkflowMode()
    migrateLegacyMegaMode()
    const v = window.localStorage.getItem(STORAGE_KEY)
    if (v === 'focus' || v === 'rules') {
      persist('mail')
      if (v === 'rules') {
        try {
          window.localStorage.setItem(PENDING_MAIL_RULES_SETTINGS_KEY, '1')
        } catch {
          // ignore
        }
      }
      return 'mail'
    }
    if (
      v === 'home' ||
      v === 'mail' ||
      v === 'calendar' ||
      v === 'tasks' ||
      v === 'work' ||
      v === 'people' ||
      v === 'notes' ||
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
