import type { MailFolder, MailListItem } from '@shared/types'
import type { ThreadGroup } from '@/lib/thread-group'

/** Ordner, deren Kennzeichnungen typischerweise nicht zur „Arbeits-Mail“-Sicht gehören (To-Do/Outlook-Nähe). */
const EXCLUDED_WELL_KNOWN_FOR_MAILBOX_FLAGGED = new Set(['deleteditems', 'junkemail'])

/**
 * Ordner-IDs, deren gekennzeichnete Mails bei „Gelöscht/Junk ignorieren“ nicht
 * mitzählen. Nutzt `wellKnown` und — falls das fehlt — Gmail-System-Label-IDs
 * (`TRASH` / `SPAM`), damit der Filter auch ohne gesetzte `well_known`-Spalte greift.
 */
export function buildMailboxFlagExcludedFolderIds(
  foldersByAccount: Record<string, MailFolder[] | undefined>
): Set<number> {
  const ids = new Set<number>()
  for (const folders of Object.values(foldersByAccount)) {
    if (!folders) continue
    for (const f of folders) {
      const wk = (f.wellKnown ?? '').toLowerCase()
      if (EXCLUDED_WELL_KNOWN_FOR_MAILBOX_FLAGGED.has(wk)) {
        ids.add(f.id)
        continue
      }
      const rid = (f.remoteId ?? '').trim().toUpperCase()
      if (rid === 'TRASH' || rid === 'SPAM') {
        ids.add(f.id)
      }
    }
  }
  return ids
}

export function messageFolderExcludedForMailboxFlagged(
  folderId: number | null,
  excludedFolderIds: Set<number>
): boolean {
  if (folderId == null) return false
  return excludedFolderIds.has(folderId)
}

/**
 * Soll ein Thread im Filter „Kennzeichnung (Postfach)“ erscheinen?
 * Wenn `excludeDeletedJunk`: nur wenn mindestens eine Mail im Thread aktiv
 * `isFlagged` hat und nicht nur in Gelöscht/Junk liegt.
 */
export function threadMatchesMailboxFlaggedFilter(
  thread: ThreadGroup,
  messagesByThread: Map<string, MailListItem[]>,
  excludedFolderIds: Set<number>,
  excludeDeletedJunk: boolean
): boolean {
  if (!thread.isFlagged) return false
  if (!excludeDeletedJunk) return true
  const msgs = messagesByThread.get(thread.threadKey)
  if (!msgs || msgs.length === 0) return thread.isFlagged
  for (const m of msgs) {
    if (!m.isFlagged) continue
    if (messageFolderExcludedForMailboxFlagged(m.folderId, excludedFolderIds)) continue
    return true
  }
  return false
}
