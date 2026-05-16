/** Aufgaben-Sidebar: Konten auf-/zugeklappt (localStorage). */

const TASKS_SIDEBAR_TREE_KEY = 'mailclient.tasks.sidebarTree.v1'

export interface TasksSidebarTreeStateV1 {
  accountOpen: Record<string, boolean>
}

function emptyTree(): TasksSidebarTreeStateV1 {
  return { accountOpen: {} }
}

export function readTasksSidebarTreeState(): TasksSidebarTreeStateV1 {
  try {
    const raw = window.localStorage.getItem(TASKS_SIDEBAR_TREE_KEY)
    if (!raw) return emptyTree()
    const o = JSON.parse(raw) as unknown
    if (!o || typeof o !== 'object' || Array.isArray(o)) return emptyTree()
    const rec = o as Record<string, unknown>
    const accountOpen: Record<string, boolean> = {}
    if (rec.accountOpen && typeof rec.accountOpen === 'object' && !Array.isArray(rec.accountOpen)) {
      for (const [k, v] of Object.entries(rec.accountOpen as Record<string, unknown>)) {
        if (typeof k === 'string' && k.length > 0 && typeof v === 'boolean') accountOpen[k] = v
      }
    }
    return { accountOpen }
  } catch {
    return emptyTree()
  }
}

export function writeTasksSidebarTreeState(next: TasksSidebarTreeStateV1): void {
  try {
    window.localStorage.setItem(TASKS_SIDEBAR_TREE_KEY, JSON.stringify(next))
  } catch {
    // ignore
  }
}

/** `true` = Konto aufgeklappt (Standard, wenn kein Eintrag). */
export function readTasksSidebarAccountExpanded(accountId: string): boolean {
  const { accountOpen } = readTasksSidebarTreeState()
  return accountOpen[accountId] !== false
}

export function persistTasksSidebarAccountExpanded(accountId: string, expanded: boolean): void {
  const cur = readTasksSidebarTreeState()
  writeTasksSidebarTreeState({
    accountOpen: { ...cur.accountOpen, [accountId]: expanded }
  })
}
