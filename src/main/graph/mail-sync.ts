import { createGraphClient } from './client'
import { loadConfig } from '../config'
import {
  upsertFolders,
  findFolderByRemoteId,
  findFolderByWellKnown,
  setFolderMailboxCountsLocal,
  type UpsertFolderInput
} from '../db/folders-repo'
import {
  clearWaitingForReplyOnThreads,
  listMessageIdsByRemoteIds,
  deleteMessagesByAccountRemoteIds,
  deleteAllMessagesInFolderLocal,
  type UpsertMessageInput
} from '../db/messages-repo'
import { listAccounts } from '../accounts'
import { replaceMessageTags } from '../db/message-tags-repo'
import { upsertMailMessagesReconcilingTodos } from '../mail-upsert-with-todo-reconcile'
import {
  getFolderSyncState,
  upsertFolderSyncState
} from '../db/sync-state-repo'

interface GraphFolder {
  id: string
  displayName: string
  parentFolderId: string | null
  unreadItemCount: number
  totalItemCount: number
  childFolderCount: number
}

const WELL_KNOWN_ALIASES = [
  'inbox',
  'sentitems',
  'drafts',
  'deleteditems',
  'archive',
  'junkemail',
  'outbox',
  /** Legacy / optional; GET kann 404 liefern. */
  'clutter',
  'conflicts',
  /** Skype-Unterhaltungen o. a. */
  'conversationhistory',
  'localfailures',
  /** Wurzel der sichtbaren Postfach-Hierarchie — nicht loeschen. */
  'msgfolderroot',
  'scheduled',
  'searchfolders',
  'serverfailures',
  'syncissues',
  'recoverableitemsdeletions'
] as const

interface GraphFolderMinimal {
  id: string
}

interface GraphRecipient {
  emailAddress: { name?: string | null; address?: string | null }
}

interface GraphMessage {
  id: string
  conversationId: string | null
  subject: string | null
  bodyPreview: string | null
  body: { contentType: 'html' | 'text'; content: string } | null
  from: GraphRecipient | null
  sender: GraphRecipient | null
  toRecipients: GraphRecipient[]
  ccRecipients: GraphRecipient[]
  bccRecipients: GraphRecipient[]
  sentDateTime: string | null
  receivedDateTime: string | null
  lastModifiedDateTime: string | null
  isRead: boolean
  flag: { flagStatus: 'notFlagged' | 'flagged' | 'complete' } | null
  hasAttachments: boolean
  importance: 'low' | 'normal' | 'high' | null
  changeKey: string | null
  parentFolderId: string | null
  internetMessageHeaders?: { name?: string | null; value?: string | null }[] | null
  categories?: string[] | null
}

interface GraphCollection<T> {
  value: T[]
  '@odata.nextLink'?: string
}

/**
 * Graph v1.0 expose KEINE wellKnownName-Property im $select. Wir muessen
 * die Well-Known-Folder per Alias-Endpoint einzeln abrufen, um die echte
 * Folder-ID herauszufinden, und damit anschliessend in unserem
 * Folder-Sync die well_known-Spalte fuellen.
 */
async function fetchWellKnownIdMap(
  client: ReturnType<typeof createGraphClient>
): Promise<Record<string, string>> {
  const entries = await Promise.all(
    WELL_KNOWN_ALIASES.map(async (alias) => {
      try {
        const f = (await client.api(`/me/mailFolders/${alias}`).select(['id']).get()) as GraphFolderMinimal
        return [f.id, alias] as const
      } catch {
        return null
      }
    })
  )
  const map: Record<string, string> = {}
  for (const e of entries) {
    if (e) map[e[0]] = e[1]
  }
  return map
}

function rec(r: GraphRecipient | null | undefined): { email: string | null; name: string | null } {
  if (!r || !r.emailAddress) return { email: null, name: null }
  return {
    email: r.emailAddress.address ?? null,
    name: r.emailAddress.name ?? null
  }
}

function joinRecipients(rs: GraphRecipient[] | null | undefined): string | null {
  if (!rs || rs.length === 0) return null
  return rs
    .map((r) => {
      const { email, name } = rec(r)
      if (name && email) return `${name} <${email}>`
      return email ?? name ?? ''
    })
    .filter(Boolean)
    .join(', ')
}

async function getClientFor(accountId: string): Promise<ReturnType<typeof createGraphClient>> {
  const config = await loadConfig()
  if (!config.microsoftClientId) {
    throw new Error('Keine Azure Client-ID konfiguriert.')
  }
  const homeAccountId = accountId.replace(/^ms:/, '')
  return createGraphClient(config.microsoftClientId, homeAccountId)
}

const FOLDER_SELECT =
  'id,displayName,parentFolderId,unreadItemCount,totalItemCount,childFolderCount'

async function fetchPaged(
  client: ReturnType<typeof createGraphClient>,
  initialUrl: string
): Promise<GraphFolder[]> {
  const out: GraphFolder[] = []
  let url: string | null = initialUrl
  while (url) {
    const page = (await client.api(url).get()) as GraphCollection<GraphFolder>
    out.push(...page.value)
    url = page['@odata.nextLink'] ?? null
    if (url) url = url.replace(/^https?:\/\/[^/]+\/v[0-9.]+/, '')
  }
  return out
}

export async function syncFolders(accountId: string): Promise<number> {
  const client = await getClientFor(accountId)
  const wellKnownByRemoteId = await fetchWellKnownIdMap(client)

  const collected: GraphFolder[] = []

  const topLevel = await fetchPaged(
    client,
    `/me/mailFolders?$top=100&$select=${FOLDER_SELECT}`
  )
  collected.push(...topLevel)

  const queue: GraphFolder[] = topLevel.filter((f) => f.childFolderCount > 0)
  while (queue.length > 0) {
    const parent = queue.shift()!
    const children = await fetchPaged(
      client,
      `/me/mailFolders/${parent.id}/childFolders?$top=100&$select=${FOLDER_SELECT}`
    )
    collected.push(...children)
    for (const c of children) {
      if (c.childFolderCount > 0) queue.push(c)
    }
  }

  const batch: UpsertFolderInput[] = collected.map((g) => ({
    accountId,
    remoteId: g.id,
    name: g.displayName,
    parentRemoteId: g.parentFolderId,
    wellKnown: wellKnownByRemoteId[g.id] ?? null,
    unreadCount: g.unreadItemCount ?? 0,
    totalCount: g.totalItemCount ?? 0
  }))
  upsertFolders(batch)

  return batch.length
}

function syncWindowFilter(days: number | null | undefined): string | null {
  if (days == null || !Number.isFinite(days) || days <= 0) return null
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  return `receivedDateTime ge ${since}`
}

const MESSAGE_SELECT = [
  'id',
  'conversationId',
  'subject',
  'bodyPreview',
  'body',
  'from',
  'sender',
  'toRecipients',
  'ccRecipients',
  'bccRecipients',
  'sentDateTime',
  'receivedDateTime',
  'lastModifiedDateTime',
  'isRead',
  'flag',
  'hasAttachments',
  'importance',
  'changeKey',
  'parentFolderId',
  'internetMessageHeaders',
  'categories'
].join(',')

function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function extractListUnsubscribeHeaders(
  headers: GraphMessage['internetMessageHeaders'] | undefined
): { list: string | null; post: string | null; listId: string | null } {
  if (!headers || !Array.isArray(headers)) return { list: null, post: null, listId: null }
  let list: string | null = null
  let post: string | null = null
  let listId: string | null = null
  for (const h of headers) {
    const n = (h.name ?? '').toLowerCase()
    if (n === 'list-unsubscribe') list = h.value ?? null
    if (n === 'list-unsubscribe-post') post = h.value ?? null
    if (n === 'list-id') listId = h.value ?? null
  }
  return { list, post, listId }
}

function mirrorGraphCategoriesToLocal(accountId: string, graphMessages: GraphMessage[]): void {
  const remoteIds = graphMessages.map((m) => m.id).filter((id): id is string => Boolean(id))
  if (remoteIds.length === 0) return
  const idMap = listMessageIdsByRemoteIds(accountId, remoteIds)
  for (const m of graphMessages) {
    const localId = idMap.get(m.id)
    if (localId == null) continue
    const cats = Array.isArray(m.categories)
      ? m.categories.filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
      : []
    replaceMessageTags(localId, accountId, cats)
  }
}

function normalizeGraphFollowUpFlagStatus(m: GraphMessage): 'notFlagged' | 'flagged' | 'complete' {
  const s = m.flag?.flagStatus
  if (s === 'flagged' || s === 'complete' || s === 'notFlagged') return s
  return 'notFlagged'
}

function graphMessageToUpsert(
  m: GraphMessage,
  accountId: string,
  folderId: number
): UpsertMessageInput {
  const fromR = rec(m.from ?? m.sender)
  const html = m.body && m.body.contentType === 'html' ? m.body.content : null
  let text = m.body && m.body.contentType === 'text' ? m.body.content : null
  // Fuer die Volltextsuche: bei HTML-Only-Mails Plain-Text extrahieren.
  if (!text && html) text = htmlToPlainText(html)
  const { list, post, listId } = extractListUnsubscribeHeaders(m.internetMessageHeaders)
  const followUpFlagStatus = normalizeGraphFollowUpFlagStatus(m)
  return {
    accountId,
    folderId,
    threadId: null,
    remoteId: m.id,
    remoteThreadId: m.conversationId,
    subject: m.subject,
    fromAddr: fromR.email,
    fromName: fromR.name,
    toAddrs: joinRecipients(m.toRecipients),
    ccAddrs: joinRecipients(m.ccRecipients),
    bccAddrs: joinRecipients(m.bccRecipients),
    snippet: m.bodyPreview,
    bodyHtml: html,
    bodyText: text,
    sentAt: m.sentDateTime,
    receivedAt: m.receivedDateTime,
    isRead: m.isRead ? 1 : 0,
    // Nur aktiv gekennzeichnet; `complete` / `notFlagged` siehe followUpFlagStatus.
    isFlagged: followUpFlagStatus === 'flagged' ? 1 : 0,
    followUpFlagStatus,
    hasAttachments: m.hasAttachments ? 1 : 0,
    importance: m.importance,
    changeKey: m.changeKey,
    listUnsubscribe: list,
    listUnsubscribePost: post,
    listId
  }
}

/** Vergleichbare Mailbox fuer Waiting-Auto-Clear (Graph liefert oft "Name <mail>"). */
function normalizeMailbox(addr: string | null): string | null {
  if (!addr) return null
  let s = addr.trim().toLowerCase()
  const angle = s.match(/<([^>]+)>/)
  if (angle) s = angle[1]!.trim().toLowerCase()
  if (!s.includes('@')) return null
  return s
}

function normalizeGraphRequestPath(fullOrRelative: string): string {
  let u = fullOrRelative.trim()
  if (u.startsWith('/')) return u
  u = u.replace(/^https?:\/\/graph\.microsoft\.com\/v1\.0/i, '')
  u = u.replace(/^https?:\/\/[^/]+\/v[\d.]+\//i, '/')
  return u.startsWith('/') ? u : `/${u}`
}

function isDeltaRemovedMessageEntry(v: unknown): v is { id: string } {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return typeof o.id === 'string' && '@removed' in o
}

function isGraphMessageShape(v: unknown): v is GraphMessage {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return typeof o.id === 'string'
}

function isGraphDeltaGoneError(e: unknown): boolean {
  const err = e as { statusCode?: number; body?: { error?: { code?: string } } }
  if (err?.statusCode === 410) return true
  const code = err?.body?.error?.code
  if (code === 'syncStateNotFound' || code === 'resyncRequired') return true
  const msg = e instanceof Error ? e.message : String(e)
  return /410|syncStateNotFound|resyncRequired/i.test(msg)
}

function ingestGraphDeltaPageValues(
  accountId: string,
  folderId: number,
  rawValues: unknown[],
  selfEmailNorm: string | null,
  folderWellKnown: string | null
): {
  rows: UpsertMessageInput[]
  graphMessages: GraphMessage[]
  removedRemoteIds: string[]
  remoteIds: string[]
  maxLastMod: string | null
  threadsToClear: string[]
} {
  const removedRemoteIds: string[] = []
  const rows: UpsertMessageInput[] = []
  const graphMessages: GraphMessage[] = []
  const remoteIds: string[] = []
  let maxLastMod: string | null = null
  const threadsToClear: string[] = []
  for (const v of rawValues) {
    if (isDeltaRemovedMessageEntry(v)) {
      removedRemoteIds.push(v.id)
      continue
    }
    if (!isGraphMessageShape(v)) continue
    const m = v as GraphMessage
    if (!m.id) continue
    remoteIds.push(m.id)
    const row = graphMessageToUpsert(m, accountId, folderId)
    rows.push(row)
    graphMessages.push(m)
    const t = m.lastModifiedDateTime
    if (t && (!maxLastMod || t > maxLastMod)) maxLastMod = t
    if (folderWellKnown === 'inbox' && selfEmailNorm && row.remoteThreadId) {
      const fromN = normalizeMailbox(row.fromAddr)
      if (fromN && fromN !== selfEmailNorm) {
        threadsToClear.push(row.remoteThreadId)
      }
    }
  }
  return { rows, graphMessages, removedRemoteIds, remoteIds, maxLastMod, threadsToClear }
}

async function runGraphDeltaPollCycle(
  client: ReturnType<typeof createGraphClient>,
  accountId: string,
  folder: { id: number; remoteId: string; wellKnown: string | null },
  folderRemoteId: string,
  startUrl: string,
  maxPages: number,
  baseLastSyncedAt: string | null
): Promise<{ added: number; from: string | null; to: string | null; remoteIds: string[] }> {
  void folderRemoteId
  let url: string | null = normalizeGraphRequestPath(startUrl)
  let pages = 0
  let total = 0
  const remoteIds: string[] = []
  let maxLastMod = baseLastSyncedAt
  let continuationToPersist: string | null = null

  let selfEmailNorm: string | null = null
  if (folder.wellKnown === 'inbox') {
    const accounts = await listAccounts()
    const email = accounts.find((a) => a.id === accountId)?.email
    selfEmailNorm = email ? normalizeMailbox(email) : null
  }

  while (url && pages < maxPages) {
    pages += 1
    const page = (await client.api(url).get()) as GraphCollection<GraphMessage> & {
      ['@odata.deltaLink']?: string
    }
    const raw = Array.isArray(page.value) ? (page.value as unknown[]) : []
    const ing = ingestGraphDeltaPageValues(
      accountId,
      folder.id,
      raw,
      selfEmailNorm,
      folder.wellKnown
    )
    if (ing.removedRemoteIds.length > 0) {
      deleteMessagesByAccountRemoteIds(accountId, ing.removedRemoteIds)
    }
    if (ing.rows.length > 0) {
      upsertMailMessagesReconcilingTodos(accountId, ing.rows)
      mirrorGraphCategoriesToLocal(accountId, ing.graphMessages)
      total += ing.rows.length
      remoteIds.push(...ing.remoteIds)
      if (ing.maxLastMod && (!maxLastMod || ing.maxLastMod > maxLastMod)) maxLastMod = ing.maxLastMod
      if (ing.threadsToClear.length > 0) {
        clearWaitingForReplyOnThreads(accountId, [...new Set(ing.threadsToClear)])
      }
    }

    const deltaLinkRaw = page['@odata.deltaLink']
    const next = page['@odata.nextLink']
    if (typeof deltaLinkRaw === 'string' && deltaLinkRaw.trim()) {
      continuationToPersist = normalizeGraphRequestPath(deltaLinkRaw.trim())
      url = null
    } else if (typeof next === 'string' && next.trim()) {
      const nextRel = next.replace(/^https?:\/\/[^/]+\/v[0-9.]+/, '')
      continuationToPersist = nextRel.startsWith('/') ? nextRel : normalizeGraphRequestPath(next)
      url = continuationToPersist
    } else {
      url = null
    }
  }

  const st = getFolderSyncState(accountId, folder.id)
  upsertFolderSyncState({
    accountId,
    folderId: folder.id,
    deltaToken: continuationToPersist ?? st?.deltaToken ?? null,
    lastSyncedAt: maxLastMod ?? st?.lastSyncedAt ?? null
  })

  return { added: total, from: baseLastSyncedAt, to: maxLastMod, remoteIds }
}

async function bootstrapGraphFolderDelta(accountId: string, folder: {
  id: number
  remoteId: string
  wellKnown: string | null
}): Promise<void> {
  const st = getFolderSyncState(accountId, folder.id)
  if (st?.deltaToken) return
  const config = await loadConfig()
  const sw = syncWindowFilter(config.syncWindowDays)
  const filterQ = sw ? `&$filter=${encodeURIComponent(sw)}` : ''
  const initial = `/me/mailFolders/${folder.remoteId}/messages/delta?$select=${encodeURIComponent(MESSAGE_SELECT)}${filterQ}`
  const client = await getClientFor(accountId)
  try {
    await runGraphDeltaPollCycle(
      client,
      accountId,
      folder,
      folder.remoteId,
      initial,
      35,
      st?.lastSyncedAt ?? null
    )
  } catch (e) {
    if (isGraphDeltaGoneError(e)) {
      upsertFolderSyncState({
        accountId,
        folderId: folder.id,
        deltaToken: null,
        lastSyncedAt: st?.lastSyncedAt ?? null
      })
    } else {
      console.warn('[mail-sync] delta-bootstrap', folder.wellKnown ?? folder.remoteId, e)
    }
  }
}

export async function syncMessagesInFolder(
  accountId: string,
  folderRemoteId: string,
  topCount = 50
): Promise<number> {
  const client = await getClientFor(accountId)
  const config = await loadConfig()
  const folder = findFolderByRemoteId(accountId, folderRemoteId)
  if (!folder) {
    throw new Error(`Ordner ${folderRemoteId} nicht in DB gefunden.`)
  }

  /** Leer auf dem Server: Graph liefert sonst keine Delta-Removals im Folder-Sync — lokalen Ordner leeren. */
  const folderStats = (await client
    .api(`/me/mailFolders/${folderRemoteId}`)
    .select('totalItemCount,unreadItemCount')
    .get()) as { totalItemCount?: number; unreadItemCount?: number }
  const remoteTotal = folderStats.totalItemCount ?? 0
  if (remoteTotal === 0) {
    deleteAllMessagesInFolderLocal(folder.id)
    setFolderMailboxCountsLocal(folder.id, 0, 0)
    upsertFolderSyncState({
      accountId,
      folderId: folder.id,
      deltaToken: null,
      lastSyncedAt: null
    })
    return 0
  }

  let request = client
    .api(`/me/mailFolders/${folderRemoteId}/messages`)
    .top(topCount)
    .orderby('receivedDateTime DESC')
    .select(MESSAGE_SELECT)

  const filter = syncWindowFilter(config.syncWindowDays)
  if (filter) request = request.filter(filter)

  const page = (await request.get()) as GraphCollection<GraphMessage>

  const messages = page.value.map((m) => graphMessageToUpsert(m, accountId, folder.id))
  upsertMailMessagesReconcilingTodos(accountId, messages)
  mirrorGraphCategoriesToLocal(accountId, page.value)

  setFolderMailboxCountsLocal(
    folder.id,
    folderStats.unreadItemCount ?? 0,
    remoteTotal
  )

  // Watermark setzen: die juengste lastModifiedDateTime, damit das spaetere
  // Polling von dort weiterlaufen kann.
  let maxLastMod: string | null = null
  for (const m of page.value) {
    const t = m.lastModifiedDateTime
    if (t && (!maxLastMod || t > maxLastMod)) maxLastMod = t
  }
  if (maxLastMod) {
    const prev = getFolderSyncState(accountId, folder.id)
    upsertFolderSyncState({
      accountId,
      folderId: folder.id,
      deltaToken: prev?.deltaToken ?? null,
      lastSyncedAt: maxLastMod
    })
  }

  return messages.length
}

/**
 * Inkrementelles Polling fuer einen Folder: holt alle Mails, deren
 * `lastModifiedDateTime` neuer ist als der gespeicherte Watermark. Das
 * deckt sowohl neu eingegangene Mails als auch Read-/Flag-Aenderungen ab.
 *
 * Falls noch kein Watermark gesetzt ist, faellt die Funktion auf einen
 * vollen Folder-Sync mit Sync-Window-Filter zurueck.
 */
export async function pollMessagesInFolder(
  accountId: string,
  folderRemoteId: string,
  maxPages = 4
): Promise<{ added: number; from: string | null; to: string | null; remoteIds: string[] }> {
  const folder = findFolderByRemoteId(accountId, folderRemoteId)
  if (!folder) throw new Error(`Ordner ${folderRemoteId} nicht in DB gefunden.`)

  const state = getFolderSyncState(accountId, folder.id)
  if (!state?.lastSyncedAt) {
    const count = await syncMessagesInFolder(accountId, folderRemoteId, 50)
    return { added: count, from: null, to: null, remoteIds: [] }
  }

  const client = await getClientFor(accountId)

  if (state.deltaToken?.trim()) {
    try {
      return await runGraphDeltaPollCycle(
        client,
        accountId,
        folder,
        folderRemoteId,
        state.deltaToken.trim(),
        Math.max(maxPages, 10),
        state.lastSyncedAt
      )
    } catch (e) {
      if (isGraphDeltaGoneError(e)) {
        upsertFolderSyncState({
          accountId,
          folderId: folder.id,
          deltaToken: null,
          lastSyncedAt: state.lastSyncedAt
        })
      } else {
        throw e
      }
    }
  }

  const since = state.lastSyncedAt
  const filter = `lastModifiedDateTime gt ${since}`

  let selfEmailNorm: string | null = null
  if (folder.wellKnown === 'inbox') {
    const accounts = await listAccounts()
    const email = accounts.find((a) => a.id === accountId)?.email
    selfEmailNorm = email ? normalizeMailbox(email) : null
  }

  let url: string | null =
    `/me/mailFolders/${folderRemoteId}/messages?$top=50&$select=${encodeURIComponent(MESSAGE_SELECT)}&$orderby=${encodeURIComponent('lastModifiedDateTime asc')}&$filter=${encodeURIComponent(filter)}`

  let pages = 0
  let total = 0
  let maxLastMod = since
  const remoteIds: string[] = []

  while (url && pages < maxPages) {
    const page = (await client.api(url).get()) as GraphCollection<GraphMessage>
    pages += 1

    if (page.value.length > 0) {
      for (const m of page.value) {
        if (m.id) remoteIds.push(m.id)
      }
      const batch = page.value.map((m) => graphMessageToUpsert(m, accountId, folder.id))
      upsertMailMessagesReconcilingTodos(accountId, batch)
      mirrorGraphCategoriesToLocal(accountId, page.value)
      total += batch.length

      if (folder.wellKnown === 'inbox' && selfEmailNorm) {
        const threadsToClear: string[] = []
        for (const row of batch) {
          if (!row.remoteThreadId) continue
          const fromN = normalizeMailbox(row.fromAddr)
          if (!fromN || fromN === selfEmailNorm) continue
          threadsToClear.push(row.remoteThreadId)
        }
        if (threadsToClear.length > 0) {
          clearWaitingForReplyOnThreads(accountId, threadsToClear)
        }
      }

      for (const m of page.value) {
        const t = m.lastModifiedDateTime
        if (t && t > maxLastMod) maxLastMod = t
      }
    }

    const next = page['@odata.nextLink']
    url = next ? next.replace(/^https?:\/\/[^/]+\/v[0-9.]+/, '') : null
  }

  if (maxLastMod !== since) {
    const st = getFolderSyncState(accountId, folder.id)
    upsertFolderSyncState({
      accountId,
      folderId: folder.id,
      deltaToken: st?.deltaToken ?? null,
      lastSyncedAt: maxLastMod
    })
  }

  return { added: total, from: since, to: maxLastMod, remoteIds }
}

export async function syncAccountInitial(accountId: string): Promise<{
  folders: number
  inboxMessages: number
  sentMessages: number
  draftMessages: number
}> {
  const folders = await syncFolders(accountId)

  const inbox = findFolderByWellKnown(accountId, 'inbox')
  let inboxMessages = 0
  if (inbox) {
    inboxMessages = await syncMessagesInFolder(accountId, inbox.remoteId, 50)
  }

  // Den Sent-Folder mitsynchronisieren, damit gesendete Antworten in der
  // Konversationsansicht des Posteingangs sofort auftauchen koennen.
  const sent = findFolderByWellKnown(accountId, 'sentitems')
  let sentMessages = 0
  if (sent) {
    try {
      sentMessages = await syncMessagesInFolder(accountId, sent.remoteId, 50)
    } catch (e) {
      console.warn('[mail-sync] Sent-Folder konnte nicht synchronisiert werden:', e)
    }
  }

  const drafts = findFolderByWellKnown(accountId, 'drafts')
  let draftMessages = 0
  if (drafts) {
    try {
      draftMessages = await syncMessagesInFolder(accountId, drafts.remoteId, 50)
    } catch (e) {
      console.warn('[mail-sync] Entwuerfe konnten nicht synchronisiert werden:', e)
    }
  }

  const hotFolders = [inbox, sent, drafts].filter(
    (f): f is NonNullable<typeof inbox> => f != null
  )
  for (const hf of hotFolders) {
    await bootstrapGraphFolderDelta(accountId, hf)
  }

  return { folders, inboxMessages, sentMessages, draftMessages }
}
