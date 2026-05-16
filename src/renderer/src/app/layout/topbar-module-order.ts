import type { AppShellMode } from '@/stores/app-mode'

/** Standard-Reihenfolge der Modul-Tabs in der Top-Leiste. */
export const DEFAULT_TOPBAR_MODULE_ORDER: AppShellMode[] = [
  'home',
  'mail',
  'calendar',
  'tasks',
  'work',
  'people',
  'notes',
  'chat'
]

const STORAGE_KEY = 'mailclient.topbarModuleOrder'

const ALLOWED = new Set<string>(DEFAULT_TOPBAR_MODULE_ORDER)

/** Reihenfolge mit gültigen IDs behalten, unbekannte streichen, fehlende Modi anhängen. */
export function reconcileTopbarModuleOrder(
  candidate: readonly AppShellMode[],
  canonical: readonly AppShellMode[]
): AppShellMode[] {
  const allowed = new Set<string>(canonical)
  const seen = new Set<AppShellMode>()
  const out: AppShellMode[] = []
  for (const id of candidate) {
    if (!allowed.has(id)) continue
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  for (const id of canonical) {
    if (!seen.has(id)) out.push(id)
  }
  return out
}

function normalizeOrder(candidate: string[]): AppShellMode[] {
  const seen = new Set<AppShellMode>()
  const out: AppShellMode[] = []
  for (const raw of candidate) {
    if (!ALLOWED.has(raw)) continue
    const id = raw as AppShellMode
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  for (const id of DEFAULT_TOPBAR_MODULE_ORDER) {
    if (!seen.has(id)) out.push(id)
  }
  return out
}

export function readTopbarModuleOrder(): AppShellMode[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return [...DEFAULT_TOPBAR_MODULE_ORDER]
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return [...DEFAULT_TOPBAR_MODULE_ORDER]
    const ids = parsed.filter((x): x is string => typeof x === 'string')
    return normalizeOrder(ids)
  } catch {
    return [...DEFAULT_TOPBAR_MODULE_ORDER]
  }
}

export function persistTopbarModuleOrder(order: AppShellMode[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(order))
  } catch {
    // ignore
  }
}
