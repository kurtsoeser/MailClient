/** Posteingang-Sidebar: Konten- und Ordnerbaum auf-/zugeklappt (localStorage). */

const MAIL_SIDEBAR_TREE_KEY = 'mailclient.mail.sidebarTree.v1'

export interface MailSidebarTreeStateV1 {
  /** `accountId` -> `false` = Konto-Zweig zugeklappt (wie Kalender-Shell). */
  accountOpen: Record<string, boolean>
  /** Pro Konto: `remoteId`-Liste der Ordner, deren Unterbaum eingeklappt ist. */
  collapsedFolderRemoteIdsByAccount: Record<string, string[]>
}

function emptyTree(): MailSidebarTreeStateV1 {
  return { accountOpen: {}, collapsedFolderRemoteIdsByAccount: {} }
}

export function readMailSidebarTreeState(): MailSidebarTreeStateV1 {
  try {
    const raw = window.localStorage.getItem(MAIL_SIDEBAR_TREE_KEY)
    if (!raw) return emptyTree()
    const o = JSON.parse(raw) as unknown
    if (!o || typeof o !== 'object' || Array.isArray(o)) return emptyTree()
    const rec = o as Record<string, unknown>
    const accountOpen: Record<string, boolean> = {}
    const collapsedFolderRemoteIdsByAccount: Record<string, string[]> = {}
    if (rec.accountOpen && typeof rec.accountOpen === 'object' && !Array.isArray(rec.accountOpen)) {
      for (const [k, v] of Object.entries(rec.accountOpen as Record<string, unknown>)) {
        if (typeof k === 'string' && k.length > 0 && typeof v === 'boolean') accountOpen[k] = v
      }
    }
    if (
      rec.collapsedFolderRemoteIdsByAccount &&
      typeof rec.collapsedFolderRemoteIdsByAccount === 'object' &&
      !Array.isArray(rec.collapsedFolderRemoteIdsByAccount)
    ) {
      for (const [k, v] of Object.entries(
        rec.collapsedFolderRemoteIdsByAccount as Record<string, unknown>
      )) {
        if (typeof k !== 'string' || k.length === 0) continue
        if (!Array.isArray(v)) continue
        const ids: string[] = []
        for (const x of v) {
          if (typeof x === 'string' && x.length > 0) ids.push(x)
        }
        collapsedFolderRemoteIdsByAccount[k] = ids
      }
    }
    return { accountOpen, collapsedFolderRemoteIdsByAccount }
  } catch {
    return emptyTree()
  }
}

export function writeMailSidebarTreeState(next: MailSidebarTreeStateV1): void {
  try {
    window.localStorage.setItem(MAIL_SIDEBAR_TREE_KEY, JSON.stringify(next))
  } catch {
    // ignore
  }
}

/** `true` = Konto aufgeklappt (Standard, wenn kein Eintrag). */
export function readMailSidebarAccountExpanded(accountId: string): boolean {
  const { accountOpen } = readMailSidebarTreeState()
  return accountOpen[accountId] !== false
}

export function persistMailSidebarAccountExpanded(accountId: string, expanded: boolean): void {
  const cur = readMailSidebarTreeState()
  const accountOpen = { ...cur.accountOpen, [accountId]: expanded }
  writeMailSidebarTreeState({ ...cur, accountOpen })
}

/** `null` = noch nie gespeichert → App-Standard (`sidebarInitialCollapsedRemoteIds`). */
export function readMailSidebarCollapsedFolderRemoteIds(accountId: string): string[] | null {
  const { collapsedFolderRemoteIdsByAccount } = readMailSidebarTreeState()
  if (!Object.prototype.hasOwnProperty.call(collapsedFolderRemoteIdsByAccount, accountId)) {
    return null
  }
  return collapsedFolderRemoteIdsByAccount[accountId] ?? []
}

export function persistMailSidebarCollapsedFolderRemoteIds(
  accountId: string,
  collapsedRemoteIds: Set<string>
): void {
  const cur = readMailSidebarTreeState()
  const collapsedFolderRemoteIdsByAccount = {
    ...cur.collapsedFolderRemoteIdsByAccount,
    [accountId]: [...collapsedRemoteIds]
  }
  writeMailSidebarTreeState({ ...cur, collapsedFolderRemoteIdsByAccount })
}
