import { createGraphClient } from './client'
import { loadConfig } from '../config'
import type { ComposeDriveExplorerEntry, ComposeRecipientSuggestion } from '@shared/types'

async function getClientFor(accountId: string): Promise<ReturnType<typeof createGraphClient>> {
  const config = await loadConfig()
  if (!config.microsoftClientId) {
    throw new Error('Keine Azure Client-ID konfiguriert.')
  }
  const homeAccountId = accountId.replace(/^ms:/, '')
  return createGraphClient(config.microsoftClientId, homeAccountId)
}

interface GraphDriveItem {
  id: string
  name: string
  webUrl?: string
  size?: number
  file?: { mimeType?: string }
  folder?: { childCount?: number }
}

interface GraphSharedWrapper {
  id?: string
  remoteItem?: GraphDriveItem & {
    parentReference?: { driveId?: string; id?: string }
  }
}

function mapDriveItemToEntry(
  v: GraphDriveItem,
  driveIdHint?: string | null
): ComposeDriveExplorerEntry | null {
  if (!v?.id || !v.name) return null
  const isFolder = Boolean(v.folder)
  const webUrl = typeof v.webUrl === 'string' && v.webUrl.length > 0 ? v.webUrl : null
  return {
    id: v.id,
    name: v.name,
    webUrl,
    size: typeof v.size === 'number' ? v.size : null,
    mimeType: v.file?.mimeType ?? null,
    isFolder,
    driveId: driveIdHint ?? undefined
  }
}

function sortExplorerEntries(a: ComposeDriveExplorerEntry, b: ComposeDriveExplorerEntry): number {
  if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1
  return a.name.localeCompare(b.name, 'de', { sensitivity: 'base' })
}

/** OneDrive/SharePoint: Zuletzt, eigene Ordnerhierarchie, Mit mir geteilt (Graph). */
export async function graphListDriveExplorer(
  accountId: string,
  scope: 'recent' | 'myfiles' | 'shared',
  folderId: string | null | undefined,
  folderDriveId: string | null | undefined
): Promise<ComposeDriveExplorerEntry[]> {
  const client = await getClientFor(accountId)

  if (scope === 'recent') {
    const res = (await client.api('/me/drive/recent').top(80).get()) as { value?: GraphDriveItem[] }
    const values = Array.isArray(res.value) ? res.value : []
    const out: ComposeDriveExplorerEntry[] = []
    for (const v of values) {
      const e = mapDriveItemToEntry(v, null)
      if (!e) continue
      if (e.isFolder) continue
      if (!e.webUrl) continue
      out.push(e)
      if (out.length >= 60) break
    }
    return out
  }

  if (scope === 'myfiles') {
    const fid = folderId?.trim()
    const path = fid
      ? `/me/drive/items/${encodeURIComponent(fid)}/children`
      : '/me/drive/root/children'
    const res = (await client.api(path).top(120).get()) as { value?: GraphDriveItem[] }
    const values = Array.isArray(res.value) ? res.value : []
    const out: ComposeDriveExplorerEntry[] = []
    for (const v of values) {
      const e = mapDriveItemToEntry(v, null)
      if (e) out.push(e)
    }
    out.sort(sortExplorerEntries)
    return out
  }

  if (scope === 'shared') {
    const fid = folderId?.trim()
    const did = folderDriveId?.trim()
    if (!fid && !did) {
      const res = (await client.api('/me/drive/sharedWithMe').top(80).get()) as { value?: GraphSharedWrapper[] }
      const values = Array.isArray(res.value) ? res.value : []
      const out: ComposeDriveExplorerEntry[] = []
      for (const wrap of values) {
        const ri = wrap.remoteItem
        if (!ri?.id || !ri.name) continue
        const driveId = ri.parentReference?.driveId?.trim()
        if (!driveId) continue
        const isFolder = Boolean(ri.folder)
        const webUrl = typeof ri.webUrl === 'string' && ri.webUrl.length > 0 ? ri.webUrl : null
        out.push({
          id: ri.id,
          name: ri.name,
          webUrl,
          size: typeof ri.size === 'number' ? ri.size : null,
          mimeType: ri.file?.mimeType ?? null,
          isFolder,
          driveId
        })
      }
      out.sort(sortExplorerEntries)
      return out
    }

    if (!fid || !did) {
      return []
    }

    const res = (await client
      .api(`/drives/${encodeURIComponent(did)}/items/${encodeURIComponent(fid)}/children`)
      .top(120)
      .get()) as { value?: GraphDriveItem[] }
    const values = Array.isArray(res.value) ? res.value : []
    const out: ComposeDriveExplorerEntry[] = []
    for (const v of values) {
      const e = mapDriveItemToEntry(v, did)
      if (e) out.push(e)
    }
    out.sort(sortExplorerEntries)
    return out
  }

  return []
}

interface GraphPerson {
  displayName?: string | null
  scoredEmailAddresses?: Array<{ address?: string | null; relevanceScore?: number }> | null
}

/** Microsoft Graph /me/people (benoetigt Scope `People.Read`). */
export async function graphSearchPeopleForCompose(
  accountId: string,
  query: string,
  limit: number
): Promise<ComposeRecipientSuggestion[]> {
  const q = query.trim()
  if (q.length < 1) return []
  const client = await getClientFor(accountId)
  const res = (await client
    .api('/me/people')
    .header('ConsistencyLevel', 'eventual')
    .query({
      $search: q,
      $top: Math.min(Math.max(limit, 1), 15),
      $select: 'displayName,scoredEmailAddresses'
    })
    .get()) as { value: GraphPerson[] }

  const people = Array.isArray(res.value) ? res.value : []
  const out: ComposeRecipientSuggestion[] = []
  for (const p of people) {
    const emails = p.scoredEmailAddresses ?? []
    const sorted = [...emails].sort(
      (a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0)
    )
    const addr = sorted.find((e) => typeof e.address === 'string' && e.address.includes('@'))?.address
    if (!addr) continue
    out.push({
      email: addr.trim(),
      displayName: p.displayName ?? null,
      source: 'graph-people'
    })
  }
  return out
}

function odataStringLiteral(s: string): string {
  return s.replace(/'/g, "''")
}

/** Verzeichnis `/users` (delegiert `User.ReadBasic.All`). */
export async function graphSearchDirectoryUsersForCompose(
  accountId: string,
  query: string,
  limit: number
): Promise<ComposeRecipientSuggestion[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const esc = odataStringLiteral(q)
  const client = await getClientFor(accountId)
  const filter = `startswith(displayName,'${esc}') or startswith(mail,'${esc}') or startswith(userPrincipalName,'${esc}')`
  let res: { value?: Array<{ displayName?: string | null; mail?: string | null; userPrincipalName?: string | null }> }
  try {
    res = (await client
      .api('/users')
      .filter(filter)
      .select('displayName,mail,userPrincipalName')
      .top(Math.min(Math.max(limit, 1), 15))
      .get()) as { value?: Array<{ displayName?: string | null; mail?: string | null; userPrincipalName?: string | null }> }
  } catch {
    return []
  }
  const values = Array.isArray(res.value) ? res.value : []
  const out: ComposeRecipientSuggestion[] = []
  for (const u of values) {
    const mail = (u.mail ?? '').trim()
    const upn = (u.userPrincipalName ?? '').trim()
    const email = mail.includes('@') ? mail : upn.includes('@') ? upn : ''
    if (!email) continue
    out.push({
      email,
      displayName: u.displayName ?? null,
      source: 'graph-directory'
    })
  }
  return out
}

/** Mailfaehige Gruppen, in denen der Benutzer (transitiv) Mitglied ist. */
export async function graphSearchMailEnabledGroupsForCompose(
  accountId: string,
  query: string,
  limit: number
): Promise<ComposeRecipientSuggestion[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const esc = odataStringLiteral(q)
  const client = await getClientFor(accountId)
  let res: { value?: Array<{ displayName?: string | null; mail?: string | null }> }
  try {
    res = (await client
      .api('/me/transitiveMemberOf/microsoft.graph.group')
      .filter(`mailEnabled eq true and startswith(displayName,'${esc}')`)
      .select('displayName,mail')
      .top(Math.min(Math.max(limit, 1), 12))
      .get()) as { value?: Array<{ displayName?: string | null; mail?: string | null }> }
  } catch {
    return []
  }
  const values = Array.isArray(res.value) ? res.value : []
  const out: ComposeRecipientSuggestion[] = []
  for (const g of values) {
    const email = (g.mail ?? '').trim()
    if (!email.includes('@')) continue
    out.push({
      email,
      displayName: g.displayName ?? null,
      source: 'graph-group'
    })
  }
  return out
}
