import { createGraphClient } from './client'
import { loadConfig } from '../config'
import type { ComposeDriveItemRow, ComposeRecipientSuggestion } from '@shared/types'

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
  webUrl: string
  size?: number
  file?: { mimeType?: string }
  folder?: { childCount?: number }
}

interface GraphPerson {
  displayName?: string | null
  scoredEmailAddresses?: Array<{ address?: string | null; relevanceScore?: number }> | null
}

/** Zuletzt verwendete bzw. Stamm-Dateien aus OneDrive (Picker fuer Compose). */
export async function graphListComposeDriveItems(
  accountId: string,
  mode: 'recent' | 'root'
): Promise<ComposeDriveItemRow[]> {
  const client = await getClientFor(accountId)
  const path = mode === 'recent' ? '/me/drive/recent' : '/me/drive/root/children'
  const res = (await client.api(path).get()) as { value: GraphDriveItem[] }
  const values = Array.isArray(res.value) ? res.value : []
  const out: ComposeDriveItemRow[] = []
  for (const v of values) {
    if (!v?.id || !v.name || !v.webUrl) continue
    if (v.folder) continue
    out.push({
      id: v.id,
      name: v.name,
      webUrl: v.webUrl,
      size: typeof v.size === 'number' ? v.size : null,
      mimeType: v.file?.mimeType ?? null
    })
    if (out.length >= 40) break
  }
  return out
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
