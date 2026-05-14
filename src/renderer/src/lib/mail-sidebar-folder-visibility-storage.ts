import type { MailFolder } from '@shared/types'

/** localStorage: `accountId|folderRemoteId` — Ordner, die in der Mail-Seitenleiste nicht erscheinen sollen. */
export const SIDEBAR_HIDDEN_MAIL_FOLDER_KEYS_STORAGE_KEY = 'mailclient.mail.sidebarHiddenFolderKeys'

export const MAIL_SIDEBAR_FOLDER_VISIBILITY_CHANGED_EVENT = 'mailclient:mail-sidebar-folder-visibility-changed'

export function mailFolderSidebarVisibilityKey(accountId: string, folderRemoteId: string): string {
  return `${accountId}|${folderRemoteId}`
}

export function readSidebarHiddenMailFolderKeysFromStorage(): Set<string> {
  try {
    const raw = window.localStorage.getItem(SIDEBAR_HIDDEN_MAIL_FOLDER_KEYS_STORAGE_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return new Set()
    return new Set(arr.filter((x): x is string => typeof x === 'string' && x.length > 0))
  } catch {
    return new Set()
  }
}

export function writeSidebarHiddenMailFolderKeysAndNotify(keys: Set<string>): void {
  try {
    window.localStorage.setItem(
      SIDEBAR_HIDDEN_MAIL_FOLDER_KEYS_STORAGE_KEY,
      JSON.stringify(Array.from(keys))
    )
  } catch {
    // ignore
  }
  window.dispatchEvent(new CustomEvent(MAIL_SIDEBAR_FOLDER_VISIBILITY_CHANGED_EVENT))
}

/**
 * Entfernt Ordner, die aus der Seitenleiste entfernt wurden, sowie alle Nachfahren versteckter Ordner.
 */
export function filterFoldersForMailSidebar(
  accountId: string,
  folders: MailFolder[],
  hidden: Set<string>
): MailFolder[] {
  const key = (rid: string): string => mailFolderSidebarVisibilityKey(accountId, rid)
  const byRemote = new Map(folders.map((f) => [f.remoteId, f]))
  function isUnderHidden(remoteId: string): boolean {
    const seen = new Set<string>()
    let cur: MailFolder | undefined = byRemote.get(remoteId)
    while (cur) {
      if (hidden.has(key(cur.remoteId))) return true
      if (!cur.parentRemoteId) break
      if (seen.has(cur.remoteId)) break
      seen.add(cur.remoteId)
      cur = byRemote.get(cur.parentRemoteId)
    }
    return false
  }
  return folders.filter((f) => !isUnderHidden(f.remoteId))
}
