import { createGraphClient } from './client'
import { loadConfig } from '../config'
import {
  upsertFolders,
  findFolderByRemoteId,
  findFolderByWellKnown,
  type UpsertFolderInput
} from '../db/folders-repo'
import {
  upsertMessages,
  clearWaitingForReplyOnThreads,
  listMessageIdsByRemoteIds,
  type UpsertMessageInput
} from '../db/messages-repo'
import { listAccounts } from '../accounts'
import { replaceMessageTags } from '../db/message-tags-repo'
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
    isFlagged: m.flag?.flagStatus === 'flagged' ? 1 : 0,
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

  let request = client
    .api(`/me/mailFolders/${folderRemoteId}/messages`)
    .top(topCount)
    .orderby('receivedDateTime DESC')
    .select(MESSAGE_SELECT)

  const filter = syncWindowFilter(config.syncWindowDays)
  if (filter) request = request.filter(filter)

  const page = (await request.get()) as GraphCollection<GraphMessage>

  const messages = page.value.map((m) => graphMessageToUpsert(m, accountId, folder.id))
  upsertMessages(messages)
  mirrorGraphCategoriesToLocal(accountId, page.value)

  // Watermark setzen: die juengste lastModifiedDateTime, damit das spaetere
  // Polling von dort weiterlaufen kann.
  let maxLastMod: string | null = null
  for (const m of page.value) {
    const t = m.lastModifiedDateTime
    if (t && (!maxLastMod || t > maxLastMod)) maxLastMod = t
  }
  if (maxLastMod) {
    upsertFolderSyncState({
      accountId,
      folderId: folder.id,
      deltaToken: null,
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
      upsertMessages(batch)
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
    upsertFolderSyncState({
      accountId,
      folderId: folder.id,
      deltaToken: null,
      lastSyncedAt: maxLastMod
    })
  }

  return { added: total, from: since, to: maxLastMod, remoteIds }
}

export async function syncAccountInitial(accountId: string): Promise<{
  folders: number
  inboxMessages: number
  sentMessages: number
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

  return { folders, inboxMessages, sentMessages }
}
