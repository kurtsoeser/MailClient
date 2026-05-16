import { create } from 'zustand'
import type { AppShellMode } from '@/stores/app-mode'

/** Aktionen für die globale „Neu …“-Steuerung (Topbar). */
export type GlobalCreateKind =
  | 'mail'
  | 'task'
  | 'calendar_event'
  | 'note'
  | 'chat'
  | 'contact'
  | 'rule'

export const GLOBAL_CREATE_EVENT = 'mailclient:global-create'

export type GlobalCreateDetail = { kind: GlobalCreateKind }

/** SessionStorage: Regel anlegen nach Öffnen der Mail-Einstellungen → Regeln. */
export const RULE_CREATE_PENDING_SESSION_KEY = 'mailclient.pendingRuleCreateFromTopbar'

/** Event: Regeln-Shell soll pending SessionStorage prüfen und ggf. `createRule` ausführen. */
export const RULE_CREATE_FLUSH_EVENT = 'mailclient:rules-flush-pending-create'

interface NavigatePendingState {
  pendingAfterNavigate: GlobalCreateKind | null
  setPendingAfterNavigate: (kind: GlobalCreateKind | null) => void
  takePendingAfterNavigate: () => GlobalCreateKind | null
}

/**
 * Wenn die App in ein anderes Modul wechseln muss, bevor die Aktion ausgeführt wird,
 * wird die Art hier zwischengespeichert; die Ziel-Shell liest beim Mount per `takePendingAfterNavigate`.
 */
export const useGlobalCreateNavigateStore = create<NavigatePendingState>((set, get) => ({
  pendingAfterNavigate: null,
  setPendingAfterNavigate(kind): void {
    set({ pendingAfterNavigate: kind })
  },
  takePendingAfterNavigate(): GlobalCreateKind | null {
    const k = get().pendingAfterNavigate
    if (k != null) set({ pendingAfterNavigate: null })
    return k
  }
}))

export function defaultCreateKindForMode(mode: AppShellMode): GlobalCreateKind {
  switch (mode) {
    case 'mail':
      return 'mail'
    case 'calendar':
      return 'calendar_event'
    case 'tasks':
    case 'work':
      return 'task'
    case 'people':
      return 'contact'
    case 'notes':
      return 'note'
    case 'chat':
      return 'chat'
    case 'home':
    default:
      return 'mail'
  }
}

/** Ziel-Modul für eine Neu-Aktion; `null` = Einstellungen (Regeln). */
export function targetShellModeForCreateKind(kind: GlobalCreateKind): AppShellMode | null {
  switch (kind) {
    case 'mail':
      return 'mail'
    case 'task':
      return 'tasks'
    case 'calendar_event':
      return 'calendar'
    case 'note':
      return 'notes'
    case 'chat':
      return 'chat'
    case 'contact':
      return 'people'
    case 'rule':
      return null
    default:
      return 'mail'
  }
}

export function dispatchGlobalCreate(kind: GlobalCreateKind): void {
  window.dispatchEvent(
    new CustomEvent<GlobalCreateDetail>(GLOBAL_CREATE_EVENT, { detail: { kind } })
  )
}
