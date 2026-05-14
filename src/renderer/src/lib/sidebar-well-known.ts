import type { FolderNode } from '@/lib/folder-tree'

export const SIDEBAR_WELL_KNOWN_FOLDER_LABELS: Record<string, string> = {
  inbox: 'Posteingang',
  sentitems: 'Gesendet',
  drafts: 'Entwuerfe',
  archive: 'Archiv',
  deleteditems: 'Papierkorb',
  junkemail: 'Junk',
  outbox: 'Postausgang',
  snoozed: 'Snoozed',
  mailclient_wip: 'In Bearbeitung (MailClient)',
  mailclient_done: 'Erledigt (MailClient)',
  clutter: 'Clutter',
  conflicts: 'Konflikte',
  conversationhistory: 'Aufgezeichnete Unterhaltungen',
  localfailures: 'Lokale Fehler',
  msgfolderroot: 'Informationsspeicher',
  scheduled: 'Geplant',
  searchfolders: 'Suchordner',
  serverfailures: 'Serverfehler',
  syncissues: 'Synchronisierungsprobleme',
  recoverableitemsdeletions: 'Wiederherstellbare Elemente'
}

export const SIDEBAR_PROTECTED_WELL_KNOWN_FOLDER_KEYS = new Set([
  'inbox',
  'sentitems',
  'drafts',
  'deleteditems',
  'archive',
  'junkemail',
  'outbox',
  'snoozed',
  'mailclient_wip',
  'mailclient_done',
  'msgfolderroot',
  'recoverableitemsdeletions',
  'searchfolders'
])

export function sidebarWellKnownFolderDisplayName(
  wellKnown: string | undefined,
  folderName: string
): string {
  return (wellKnown && SIDEBAR_WELL_KNOWN_FOLDER_LABELS[wellKnown]) || folderName
}

export function sidebarIsProtectedWellKnownFolder(
  wellKnown: string | undefined | null
): boolean {
  return !!wellKnown && SIDEBAR_PROTECTED_WELL_KNOWN_FOLDER_KEYS.has(wellKnown)
}

/** Ordner mit Tiefe >= 1 und Kindern starten eingeklappt (per remoteId). */
export function sidebarInitialCollapsedRemoteIds(tree: FolderNode[]): Set<string> {
  const collapsed = new Set<string>()
  const walk = (nodes: FolderNode[]): void => {
    for (const node of nodes) {
      if (node.depth >= 1 && node.children.length > 0) {
        collapsed.add(node.folder.remoteId)
      }
      walk(node.children)
    }
  }
  walk(tree)
  return collapsed
}
