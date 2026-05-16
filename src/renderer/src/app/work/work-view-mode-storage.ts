export type WorkContentViewMode = 'list' | 'kanban'

const KEY = 'mailclient.work.contentViewMode.v1'

export function readWorkContentViewMode(): WorkContentViewMode {
  try {
    const raw = window.localStorage.getItem(KEY)
    return raw === 'kanban' ? 'kanban' : 'list'
  } catch {
    return 'list'
  }
}

export function persistWorkContentViewMode(mode: WorkContentViewMode): void {
  try {
    window.localStorage.setItem(KEY, mode)
  } catch {
    // ignore
  }
}
