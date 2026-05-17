import type { gmail_v1 } from 'googleapis'
import { loadConfig } from '../config'
import {
  upsertFolders,
  findFolderByRemoteId,
  findFolderByWellKnown,
  setFolderMailboxCountsLocal,
  type UpsertFolderInput
} from '../db/folders-repo'
import {
  deleteAllMessagesInFolderLocal,
  type UpsertMessageInput
} from '../db/messages-repo'
import { upsertMailMessagesReconcilingTodos } from '../mail-upsert-with-todo-reconcile'
import { getFolderSyncState, upsertFolderSyncState } from '../db/sync-state-repo'
import { getGoogleApis } from './google-auth-client'
import { getGmailHistoryId, updateGmailHistoryId } from './google-sync-meta-store'

const LABEL_TO_WELL_KNOWN: Record<string, string> = {
  INBOX: 'inbox',
  SENT: 'sentitems',
  DRAFT: 'drafts',
  TRASH: 'deleteditems',
  SPAM: 'junkemail'
}

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

function decodeB64Url(data: string): string {
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(b64, 'base64').toString('utf8')
}

function collectHeaders(
  part: gmail_v1.Schema$MessagePart | null | undefined,
  into: Map<string, string>
): void {
  if (!part) return
  for (const h of part.headers ?? []) {
    const name = (h.name ?? '').toLowerCase().trim()
    const value = h.value?.trim()
    if (name && value) into.set(name, value)
  }
  for (const child of part.parts ?? []) {
    collectHeaders(child, into)
  }
}

function collectBodies(
  part: gmail_v1.Schema$MessagePart | null | undefined,
  out: { html: string | null; text: string | null }
): void {
  if (!part) return
  const mime = (part.mimeType ?? '').toLowerCase()
  if (part.body?.data) {
    if (mime === 'text/html' && !out.html) {
      try {
        out.html = decodeB64Url(part.body.data)
      } catch {
        /* ignore */
      }
    }
    if (mime === 'text/plain' && !out.text) {
      try {
        out.text = decodeB64Url(part.body.data)
      } catch {
        /* ignore */
      }
    }
  }
  for (const child of part.parts ?? []) {
    collectBodies(child, out)
  }
}

function hasRealAttachments(part: gmail_v1.Schema$MessagePart | null | undefined): boolean {
  if (!part) return false
  if (part.filename && part.filename.trim().length > 0 && part.body?.attachmentId) {
    return true
  }
  for (const child of part.parts ?? []) {
    if (hasRealAttachments(child)) return true
  }
  return false
}

function parseRfcDate(s: string | undefined): string | null {
  if (!s?.trim()) return null
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

const GMAIL_MESSAGE_GET_CONCURRENCY = 6

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return []
  const results = new Array<R>(items.length)
  let index = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const i = index++
      results[i] = await fn(items[i]!)
    }
  })
  await Promise.all(workers)
  return results
}

async function fetchGmailMessagesMetadata(
  gmail: gmail_v1.Gmail,
  messageIds: string[]
): Promise<gmail_v1.Schema$Message[]> {
  const fetched = await mapWithConcurrency(messageIds, GMAIL_MESSAGE_GET_CONCURRENCY, async (id) => {
    const full = await gmail.users.messages.get({
      userId: 'me',
      id,
      format: 'metadata',
      metadataHeaders: [
        'From',
        'To',
        'Cc',
        'Bcc',
        'Subject',
        'Date',
        'List-Unsubscribe',
        'List-Unsubscribe-Post',
        'List-Id'
      ]
    })
    return full.data ?? null
  })
  return fetched.filter((m): m is gmail_v1.Schema$Message => m != null && Boolean(m.id))
}

function gmailQueryFromSyncWindow(days: number | null | undefined): string | null {
  if (days == null || !Number.isFinite(days) || days <= 0) return null
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const y = since.getUTCFullYear()
  const m = String(since.getUTCMonth() + 1).padStart(2, '0')
  const da = String(since.getUTCDate()).padStart(2, '0')
  return `after:${y}/${m}/${da}`
}

export async function syncGoogleFolders(accountId: string): Promise<number> {
  const { gmail } = await getGoogleApis(accountId)
  const res = await gmail.users.labels.list({ userId: 'me' })
  const labels = res.data.labels ?? []
  const batch: UpsertFolderInput[] = []
  for (const lab of labels) {
    const id = lab.id
    if (!id) continue
    const name = lab.name ?? id
    const type = lab.type
    if (type === 'user') {
      batch.push({
        accountId,
        remoteId: id,
        name,
        parentRemoteId: null,
        wellKnown: null,
        unreadCount: lab.messagesUnread ?? 0,
        totalCount: lab.messagesTotal ?? 0
      })
      continue
    }
    if (type === 'system' && LABEL_TO_WELL_KNOWN[id]) {
      batch.push({
        accountId,
        remoteId: id,
        name,
        parentRemoteId: null,
        wellKnown: LABEL_TO_WELL_KNOWN[id] ?? null,
        unreadCount: lab.messagesUnread ?? 0,
        totalCount: lab.messagesTotal ?? 0
      })
    }
  }
  upsertFolders(batch)
  return batch.length
}

function gmailMessageToUpsert(
  msg: gmail_v1.Schema$Message,
  accountId: string,
  folderId: number
): UpsertMessageInput {
  const labelIds = msg.labelIds ?? []
  const headerMap = new Map<string, string>()
  collectHeaders(msg.payload, headerMap)
  const bodies = { html: null as string | null, text: null as string | null }
  collectBodies(msg.payload, bodies)
  let bodyText = bodies.text
  if (!bodyText && bodies.html) bodyText = htmlToPlainText(bodies.html)

  const from = headerMap.get('from') ?? null
  let fromAddr: string | null = null
  let fromName: string | null = null
  if (from) {
    const m = from.match(/^(?:"([^"]+)"|([^<]+?))\s*<([^>]+)>$/)
    if (m) {
      fromName = (m[1] ?? m[2] ?? '').trim() || null
      fromAddr = m[3]!.trim()
    } else if (from.includes('@')) {
      fromAddr = from.replace(/[<>]/g, '').trim()
    }
  }

  const internalMs = msg.internalDate ? Number(msg.internalDate) : NaN
  const internalIso = Number.isFinite(internalMs) ? new Date(internalMs).toISOString() : null
  const dateHdr = parseRfcDate(headerMap.get('date'))
  const receivedAt = internalIso ?? dateHdr
  const sentAt = parseRfcDate(headerMap.get('date')) ?? receivedAt

  const listUnsub = headerMap.get('list-unsubscribe') ?? null
  const listUnsubPost = headerMap.get('list-unsubscribe-post') ?? null
  const listId = headerMap.get('list-id') ?? null

  const starred = labelIds.includes('STARRED')
  return {
    accountId,
    folderId,
    threadId: null,
    remoteId: msg.id ?? '',
    remoteThreadId: msg.threadId ?? null,
    subject: headerMap.get('subject') ?? null,
    fromAddr,
    fromName,
    toAddrs: headerMap.get('to') ?? null,
    ccAddrs: headerMap.get('cc') ?? null,
    bccAddrs: headerMap.get('bcc') ?? null,
    snippet: msg.snippet ?? null,
    bodyHtml: bodies.html,
    bodyText,
    sentAt,
    receivedAt,
    isRead: labelIds.includes('UNREAD') ? 0 : 1,
    isFlagged: starred ? 1 : 0,
    followUpFlagStatus: starred ? 'flagged' : 'notFlagged',
    hasAttachments: hasRealAttachments(msg.payload) ? 1 : 0,
    importance: null,
    changeKey: msg.historyId ?? null,
    listUnsubscribe: listUnsub,
    listUnsubscribePost: listUnsubPost,
    listId
  }
}

export async function syncGoogleMessagesInFolder(
  accountId: string,
  folderRemoteId: string,
  topCount = 50
): Promise<number> {
  const { gmail } = await getGoogleApis(accountId)
  const folder = findFolderByRemoteId(accountId, folderRemoteId)
  if (!folder) {
    throw new Error(`Ordner ${folderRemoteId} nicht in DB gefunden.`)
  }
  const config = await loadConfig()

  const labelMeta = await gmail.users.labels.get({ userId: 'me', id: folderRemoteId })
  const msgTotal = labelMeta.data.messagesTotal ?? 0
  if (msgTotal === 0) {
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

  const q = gmailQueryFromSyncWindow(config.syncWindowDays)

  const listRes = await gmail.users.messages.list({
    userId: 'me',
    labelIds: [folderRemoteId],
    maxResults: topCount,
    ...(q ? { q } : {})
  })

  const refs = listRes.data.messages ?? []
  const messageIds = refs.map((r) => r.id).filter((id): id is string => Boolean(id))
  const fullMessages = await fetchGmailMessagesMetadata(gmail, messageIds)
  const inputs: UpsertMessageInput[] = []
  let maxInternal = ''
  for (const msg of fullMessages) {
    inputs.push(gmailMessageToUpsert(msg, accountId, folder.id))
    const ms = msg.internalDate ? Number(msg.internalDate) : NaN
    if (Number.isFinite(ms)) {
      const iso = new Date(ms).toISOString()
      if (!maxInternal || iso > maxInternal) maxInternal = iso
    }
  }
  upsertMailMessagesReconcilingTodos(accountId, inputs)

  setFolderMailboxCountsLocal(
    folder.id,
    labelMeta.data.messagesUnread ?? 0,
    msgTotal
  )

  if (maxInternal) {
    upsertFolderSyncState({
      accountId,
      folderId: folder.id,
      deltaToken: null,
      lastSyncedAt: maxInternal
    })
  }

  return inputs.length
}

async function refreshGmailHistoryId(accountId: string): Promise<void> {
  const { gmail } = await getGoogleApis(accountId)
  const prof = await gmail.users.getProfile({ userId: 'me' })
  const hid = prof.data.historyId
  if (hid) {
    await updateGmailHistoryId(accountId, String(hid))
  }
}

export async function syncGoogleAccountInitial(accountId: string): Promise<{
  folders: number
  inboxMessages: number
  sentMessages: number
  draftMessages: number
}> {
  const folders = await syncGoogleFolders(accountId)
  const inbox = findFolderByWellKnown(accountId, 'inbox')
  let inboxMessages = 0
  if (inbox) {
    inboxMessages = await syncGoogleMessagesInFolder(accountId, inbox.remoteId, 50)
  }
  const sent = findFolderByWellKnown(accountId, 'sentitems')
  let sentMessages = 0
  if (sent) {
    try {
      sentMessages = await syncGoogleMessagesInFolder(accountId, sent.remoteId, 50)
    } catch (e) {
      console.warn('[gmail-sync] Sent-Label konnte nicht synchronisiert werden:', e)
    }
  }
  const drafts = findFolderByWellKnown(accountId, 'drafts')
  let draftMessages = 0
  if (drafts) {
    try {
      draftMessages = await syncGoogleMessagesInFolder(accountId, drafts.remoteId, 50)
    } catch (e) {
      console.warn('[gmail-sync] Entwuerfe konnten nicht synchronisiert werden:', e)
    }
  }
  await refreshGmailHistoryId(accountId)
  return { folders, inboxMessages, sentMessages, draftMessages }
}

/**
 * Inkrementell: Gmail History API. Bei zu altem historyId: Full-Inbox-Resync + neue historyId.
 */
export async function pollGoogleInbox(accountId: string): Promise<{
  added: number
  remoteIds: string[]
}> {
  const inbox = findFolderByWellKnown(accountId, 'inbox')
  if (!inbox) return { added: 0, remoteIds: [] }

  const prevHistory = await getGmailHistoryId(accountId)
  if (!prevHistory) {
    const n = await syncGoogleMessagesInFolder(accountId, inbox.remoteId, 50)
    await refreshGmailHistoryId(accountId)
    return { added: n, remoteIds: [] }
  }

  const { gmail } = await getGoogleApis(accountId)
  let pageToken: string | undefined
  let totalFetched = 0
  const remoteIds: string[] = []

  try {
    while (true) {
      const hist = await gmail.users.history.list({
        userId: 'me',
        startHistoryId: prevHistory,
        historyTypes: ['messageAdded', 'labelAdded', 'labelRemoved'],
        pageToken
      })
      const history = hist.data.history ?? []
      const addedIds: string[] = []
      for (const h of history) {
        for (const m of h.messagesAdded ?? []) {
          const id = m.message?.id
          if (id) addedIds.push(id)
        }
      }
      const uniqueAddedIds = [...new Set(addedIds)]
      const fullMessages = await fetchGmailMessagesMetadata(gmail, uniqueAddedIds)
      for (const msg of fullMessages) {
        const id = msg.id
        if (!id) continue
        const labelIds = msg.labelIds ?? []
        const primaryFolder =
          labelIds.find((l) => l === 'INBOX') ??
          labelIds.find((l) => l === 'SENT') ??
          labelIds.find((l) => l === 'DRAFT') ??
          labelIds[0]
        if (!primaryFolder) continue
        const f = findFolderByRemoteId(accountId, primaryFolder)
        if (!f) continue
        upsertMailMessagesReconcilingTodos(accountId, [gmailMessageToUpsert(msg, accountId, f.id)])
        remoteIds.push(id)
        totalFetched += 1
      }
      pageToken = hist.data.nextPageToken ?? undefined
      if (!pageToken) break
    }
  } catch (e: unknown) {
    const err = e as { code?: number; message?: string }
    if (err.code === 404 || String(err.message ?? '').toLowerCase().includes('history')) {
      console.warn('[gmail-sync] History zu alt oder ungueltig — Inbox erneut synchronisieren.')
      const n = await syncGoogleMessagesInFolder(accountId, inbox.remoteId, 50)
      await refreshGmailHistoryId(accountId)
      return { added: n, remoteIds: [] }
    }
    throw e
  }

  await refreshGmailHistoryId(accountId)
  return { added: totalFetched, remoteIds }
}

export async function pollGoogleFolderIfNeeded(
  accountId: string,
  folderRemoteId: string
): Promise<number> {
  const inbox = findFolderByWellKnown(accountId, 'inbox')
  if (inbox && folderRemoteId === inbox.remoteId) {
    const r = await pollGoogleInbox(accountId)
    return r.added
  }
  const folder = findFolderByRemoteId(accountId, folderRemoteId)
  if (!folder) return 0
  const state = getFolderSyncState(accountId, folder.id)
  if (!state?.lastSyncedAt) {
    return syncGoogleMessagesInFolder(accountId, folderRemoteId, 50)
  }
  return syncGoogleMessagesInFolder(accountId, folderRemoteId, 50)
}
