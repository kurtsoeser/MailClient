import { GraphError } from '@microsoft/microsoft-graph-client'
import { createGraphClient } from './client'
import { loadConfig } from '../config'
import type { ComposeDriveExplorerEntry, ComposeRecipientSuggestion } from '@shared/types'

function readGraphStatusCode(e: unknown): number | undefined {
  if (e instanceof GraphError) return e.statusCode
  if (e && typeof e === 'object' && 'statusCode' in e) {
    const c = (e as { statusCode?: unknown }).statusCode
    return typeof c === 'number' ? c : undefined
  }
  return undefined
}

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

function normalizeExplorerFolderId(folderId: string | null | undefined): string | undefined {
  if (folderId == null) return undefined
  const t = typeof folderId === 'string' ? folderId.trim() : ''
  if (!t || t === 'null' || t === 'undefined') return undefined
  return t
}

function formatDriveExplorerGraphError(e: unknown): string {
  const c = readGraphStatusCode(e)
  const m =
    e instanceof GraphError
      ? (e.message ?? '').trim() || 'Unbekannter Graph-Fehler'
      : e instanceof Error
        ? (e.message ?? '').trim() || 'Unbekannter Graph-Fehler'
        : String(e)
  if (c != null) {
    if (c === 404) {
      return `OneDrive nicht gefunden oder nicht bereitgestellt (${m}). Pruefen Sie, ob fuer dieses Konto OneDrive aktiviert ist.`
    }
    if (c === 403 || c === 401) {
      return `Kein Zugriff auf OneDrive (${m}). Melden Sie sich unter Konten erneut bei Microsoft an (Berechtigung «Files.Read.All» / Dateien).`
    }
    if (c === 400) {
      return `Graph-Anfrage ungueltig (${m}). Oft hilft: Favoriten-Ordner erneut oeffnen oder App neu starten.`
    }
    return m
  }
  return e instanceof Error ? e.message : String(e)
}

/** Graph: Root-Kinder eines Drives — `/root/children` ist zuverlaessiger als `/items/root/children`. */
function driveItemChildrenPathVariants(resourcePath: string): string[] {
  const p = resourcePath.trim()
  const out: string[] = [p]
  if (p.endsWith('/items/root/children')) {
    out.push(p.replace(/\/items\/root\/children$/, '/root/children'))
  }
  return [...new Set(out)]
}

async function listDriveItemChildrenPage(
  client: ReturnType<typeof createGraphClient>,
  resourcePath: string
): Promise<GraphDriveItem[]> {
  const parse = (res: unknown): GraphDriveItem[] => {
    const v = (res as { value?: GraphDriveItem[] })?.value
    return Array.isArray(v) ? v : []
  }
  const paths = driveItemChildrenPathVariants(resourcePath)
  let lastErr: unknown
  for (const path of paths) {
    try {
      return parse(await client.api(path).get())
    } catch (e) {
      lastErr = e
      const sc = readGraphStatusCode(e)
      if (sc !== 400 && sc !== 404) throw e
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

interface GraphDriveSummary {
  id?: string
  name?: string
  driveType?: string
}

function normalizeExplorerSiteId(siteId: string | null | undefined): string | undefined {
  if (siteId == null) return undefined
  const t = typeof siteId === 'string' ? siteId.trim() : ''
  if (!t || t === 'null' || t === 'undefined') return undefined
  return t
}

/**
 * SharePoint-Site-IDs sind oft `host,guid,guid`. Aus JSON/Favoriten kann einmal `host%2Cguid%2Cguid` stehen —
 * `encodeURIComponent` darauf wuerde Graph mit «Invalid request» ablehnen.
 */
function normalizeSharePointSiteIdForGraphPath(raw: string): string {
  let t = raw.trim()
  if (!t) return t
  for (let i = 0; i < 3 && t.includes('%'); i++) {
    try {
      const next = decodeURIComponent(t)
      if (next === t) break
      t = next
    } catch {
      break
    }
  }
  return t
}

async function listSharePointRootSites(
  client: ReturnType<typeof createGraphClient>
): Promise<Array<{ id: string; displayName: string; webUrl: string | null }>> {
  const byId = new Map<string, { id: string; displayName: string; webUrl: string | null }>()
  let followedDenied = false

  try {
    const res = (await client.api('/me/followedSites').get()) as {
      value?: Array<{ id?: string; name?: string; displayName?: string; webUrl?: string }>
    }
    for (const s of res.value ?? []) {
      if (!s?.id) continue
      const label = (s.displayName ?? s.name ?? 'Website').trim() || 'Website'
      byId.set(s.id, { id: s.id, displayName: label, webUrl: typeof s.webUrl === 'string' ? s.webUrl : null })
    }
  } catch (e) {
    const sc = readGraphStatusCode(e)
    if (sc === 403 || sc === 401) {
      followedDenied = true
    } else if (sc === 400 || sc === 404) {
      /* followedSites liefert bei manchen Mandanten 400/404; Teams-Liste unten als Fallback */
    } else {
      throw e
    }
  }

  try {
    let teamsRes: { value?: Array<{ id?: string; displayName?: string | null }> }
    try {
      teamsRes = (await client.api('/me/joinedTeams').select('id,displayName').top(40).get()) as {
        value?: Array<{ id?: string; displayName?: string | null }>
      }
    } catch (e) {
      if (readGraphStatusCode(e) === 400) {
        teamsRes = (await client.api('/me/joinedTeams').select('id,displayName').get()) as {
          value?: Array<{ id?: string; displayName?: string | null }>
        }
      } else {
        throw e
      }
    }
    const teams = Array.isArray(teamsRes.value) ? teamsRes.value : []
    await Promise.all(
      teams.slice(0, 30).map(async (t) => {
        const gid = typeof t.id === 'string' ? t.id.trim() : ''
        if (!gid) return
        try {
          const site = (await client
            .api(`/groups/${encodeURIComponent(gid)}/sites/root`)
            .select('id,displayName,webUrl,name')
            .get()) as { id?: string; displayName?: string; webUrl?: string; name?: string }
          if (!site?.id) return
          if (byId.has(site.id)) return
          const label =
            (site.displayName ?? site.name ?? t.displayName ?? 'Teamwebsite').trim() || 'Teamwebsite'
          byId.set(site.id, { id: site.id, displayName: label, webUrl: typeof site.webUrl === 'string' ? site.webUrl : null })
        } catch {
          /* Team ohne SharePoint-Site oder fehlende Rechte */
        }
      })
    )
  } catch {
    /* Mandanten ohne Teams-Graph o.ae. */
  }

  if (byId.size === 0 && followedDenied) {
    throw new Error(
      'SharePoint-Sites nicht lesbar. Melden Sie sich unter Konten erneut bei Microsoft an (Berechtigung «Sites.Read.All» / Websites), damit verfolgte Sites geladen werden koennen.'
    )
  }

  return [...byId.values()].sort((a, b) =>
    a.displayName.localeCompare(b.displayName, 'de', { sensitivity: 'base' })
  )
}

/** OneDrive/SharePoint: Zuletzt, eigene Ordnerhierarchie, Mit mir geteilt, SharePoint-Bibliotheken (Graph). */
export async function graphListDriveExplorer(
  accountId: string,
  scope: 'recent' | 'myfiles' | 'shared' | 'sharepoint',
  folderId: string | null | undefined,
  folderDriveId: string | null | undefined,
  siteId: string | null | undefined
): Promise<ComposeDriveExplorerEntry[]> {
  try {
    const client = await getClientFor(accountId)

  if (scope === 'recent') {
    let values: GraphDriveItem[]
    try {
      const res = (await client.api('/me/drive/recent').top(80).get()) as { value?: GraphDriveItem[] }
      values = Array.isArray(res.value) ? res.value : []
    } catch (e) {
      if (readGraphStatusCode(e) === 400) {
        const res = (await client.api('/me/drive/recent').get()) as { value?: GraphDriveItem[] }
        values = Array.isArray(res.value) ? res.value : []
      } else {
        throw e
      }
    }
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
    const fid = normalizeExplorerFolderId(folderId)
    let values: GraphDriveItem[]
    if (fid) {
      values = await listDriveItemChildrenPage(client, `/me/drive/items/${fid}/children`)
    } else {
      try {
        values = await listDriveItemChildrenPage(client, '/me/drive/items/root/children')
      } catch (e) {
        if (readGraphStatusCode(e) === 404) {
          values = await listDriveItemChildrenPage(client, '/me/drive/root/children')
        } else {
          throw e
        }
      }
    }
    const out: ComposeDriveExplorerEntry[] = []
    for (const v of values) {
      const e = mapDriveItemToEntry(v, null)
      if (e) out.push(e)
    }
    out.sort(sortExplorerEntries)
    return out
  }

  if (scope === 'shared') {
    const fid = normalizeExplorerFolderId(folderId)
    const did = folderDriveId?.trim()
    if (!fid && !did) {
      let values: GraphSharedWrapper[]
      try {
        const res = (await client.api('/me/drive/sharedWithMe').top(80).get()) as {
          value?: GraphSharedWrapper[]
        }
        values = Array.isArray(res.value) ? res.value : []
      } catch (e) {
        if (readGraphStatusCode(e) === 400) {
          const res = (await client.api('/me/drive/sharedWithMe').get()) as { value?: GraphSharedWrapper[] }
          values = Array.isArray(res.value) ? res.value : []
        } else {
          throw e
        }
      }
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
      throw new Error('Navigation zu geteilten Ordnern: Drive-Information fehlt. Bitte erneut unter «Geteilt» oeffnen.')
    }

    const values = await listDriveItemChildrenPage(
      client,
      `/drives/${did}/items/${fid}/children`
    )
    const out: ComposeDriveExplorerEntry[] = []
    for (const v of values) {
      const e = mapDriveItemToEntry(v, did)
      if (e) out.push(e)
    }
    out.sort(sortExplorerEntries)
    return out
  }

  if (scope === 'sharepoint') {
    const sid = normalizeExplorerSiteId(siteId)
    const did = folderDriveId?.trim()
    const fidRaw = normalizeExplorerFolderId(folderId)
    const fid =
      did && fidRaw && fidRaw === did
        ? undefined
        : fidRaw

    if (!sid && !did) {
      const sites = await listSharePointRootSites(client)
      return sites.map((s) => ({
        id: s.id,
        name: s.displayName,
        webUrl: s.webUrl,
        size: null,
        mimeType: null,
        isFolder: true,
        driveId: undefined,
        siteId: s.id
      }))
    }

    if (sid && !did) {
      const norm = normalizeSharePointSiteIdForGraphPath(sid)
      const sitePaths = [`/sites/${norm}/drives`, `/sites/${encodeURIComponent(norm)}/drives`]
      let values: GraphDriveSummary[] = []
      let lastErr: unknown
      for (const sp of sitePaths) {
        try {
          const res = (await client.api(sp).get()) as { value?: GraphDriveSummary[] }
          values = Array.isArray(res.value) ? res.value : []
          lastErr = undefined
          break
        } catch (e) {
          lastErr = e
          if (readGraphStatusCode(e) !== 400 || sp === sitePaths[sitePaths.length - 1]) {
            throw e
          }
        }
      }
      const out: ComposeDriveExplorerEntry[] = []
      for (const d of values) {
        const id = typeof d.id === 'string' ? d.id.trim() : ''
        if (!id) continue
        const name = (d.name ?? 'Bibliothek').trim() || 'Bibliothek'
        if (d.driveType === 'personal') continue
        out.push({
          id,
          name,
          webUrl: null,
          size: null,
          mimeType: null,
          isFolder: true,
          driveId: id,
          siteId: undefined
        })
      }
      out.sort(sortExplorerEntries)
      return out
    }

    if (!did) {
      throw new Error('SharePoint: Drive-Information fehlt. Bitte erneut von der Website aus oeffnen.')
    }

    if (!fid) {
      const values = await listDriveItemChildrenPage(client, `/drives/${did}/root/children`)
      const out: ComposeDriveExplorerEntry[] = []
      for (const v of values) {
        const e = mapDriveItemToEntry(v, did)
        if (e) out.push(e)
      }
      out.sort(sortExplorerEntries)
      return out
    }

    const values = await listDriveItemChildrenPage(
      client,
      `/drives/${did}/items/${fid}/children`
    )
    const out: ComposeDriveExplorerEntry[] = []
    for (const v of values) {
      const e = mapDriveItemToEntry(v, did)
      if (e) out.push(e)
    }
    out.sort(sortExplorerEntries)
    return out
  }

  return []
  } catch (e) {
    if (readGraphStatusCode(e) != null || e instanceof GraphError) {
      throw new Error(formatDriveExplorerGraphError(e))
    }
    throw e instanceof Error ? e : new Error(String(e))
  }
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
