import type { MailFolder, TodoDueKindList } from '@shared/types'

const MAIL_LIST_KINDS = [
  'folder',
  'todo',
  'snoozed',
  'waiting',
  'unified_inbox',
  'meta_folder'
] as const

export type StoredMailListKind = (typeof MAIL_LIST_KINDS)[number]

const STORAGE_KEY = 'mailclient.lastMailNav.v1'

export interface LastMailNavV1 {
  v: 1
  listKind: StoredMailListKind
  todoDueKind: TodoDueKindList | null
  folderAccountId: string | null
  folderId: number | null
  /** Gesetzt wenn `listKind === 'meta_folder'`. */
  metaFolderId: number | null
  selectedMessageId: number | null
}

export type SelectMailNavOptions = {
  /** Beim Wiederherstellen: diese Mail waehlen, falls sie in der geladenen Liste vorkommt. */
  preferredMessageId?: number | null
}

export function readLastMailNav(): LastMailNavV1 | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as Partial<LastMailNavV1>
    if (o.v !== 1 || typeof o.listKind !== 'string') return null
    const kinds: StoredMailListKind[] = [...MAIL_LIST_KINDS]
    if (!kinds.includes(o.listKind as StoredMailListKind)) return null
    return {
      v: 1,
      listKind: o.listKind as StoredMailListKind,
      todoDueKind:
        o.todoDueKind === undefined || o.todoDueKind === null
          ? null
          : (o.todoDueKind as TodoDueKindList),
      folderAccountId:
        o.folderAccountId === undefined || o.folderAccountId === null
          ? null
          : String(o.folderAccountId),
      folderId:
        o.folderId === undefined || o.folderId === null ? null : Number(o.folderId),
      metaFolderId:
        o.metaFolderId === undefined || o.metaFolderId === null
          ? null
          : Number(o.metaFolderId),
      selectedMessageId:
        o.selectedMessageId === undefined || o.selectedMessageId === null
          ? null
          : Number(o.selectedMessageId)
    }
  } catch {
    return null
  }
}

export function writeLastMailNav(entry: LastMailNavV1): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entry))
  } catch {
    // ignore
  }
}

export function lastMailNavIsRestorable(
  nav: LastMailNavV1,
  foldersByAccount: Record<string, MailFolder[]>,
  knownAccountIds: Set<string>,
  knownMetaFolderIds: Set<number>
): boolean {
  switch (nav.listKind) {
    case 'folder': {
      if (!nav.folderAccountId || nav.folderId == null || Number.isNaN(nav.folderId)) {
        return false
      }
      if (!knownAccountIds.has(nav.folderAccountId)) return false
      const folders = foldersByAccount[nav.folderAccountId]
      return Boolean(folders?.some((f) => f.id === nav.folderId))
    }
    case 'todo':
      // Unified-ToDo-Ansicht (todoDueKind === null) ist ebenfalls wiederherstellbar.
      return true
    case 'snoozed':
    case 'waiting':
    case 'unified_inbox':
      return true
    case 'meta_folder': {
      if (nav.metaFolderId == null || Number.isNaN(nav.metaFolderId)) return false
      return knownMetaFolderIds.has(nav.metaFolderId)
    }
    default:
      return false
  }
}
