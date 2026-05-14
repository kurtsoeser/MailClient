import type { gmail_v1 } from 'googleapis'
import { loadConfig } from '../config'
import {
  upsertFolders,
  findFolderByRemoteId,
  findFolderByWellKnown,
  type UpsertFolderInput
} from '../db/folders-repo'
import { upsertMessages, type UpsertMessageInput } from '../db/messages-repo'
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
    isFlagged: labelIds.includes('STARRED') ? 1 : 0,
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
  const q = gmailQueryFromSyncWindow(config.syncWindowDays)

  const listRes = await gmail.users.messages.list({
    userId: 'me',
    labelIds: [folderRemoteId],
    maxResults: topCount,
    ...(q ? { q } : {})
  })

  const refs = listRes.data.messages ?? []
  const inputs: UpsertMessageInput[] = []
  let maxInternal = ''
  for (const ref of refs) {
    const id = ref.id
    if (!id) continue
    const full = await gmail.users.messages.get({
      userId: 'me',
      id,
      format: 'full'
    })
    if (full.data) {
      inputs.push(gmailMessageToUpsert(full.data, accountId, folder.id))
      const ms = full.data.internalDate ? Number(full.data.internalDate) : NaN
      if (Number.isFinite(ms)) {
        const iso = new Date(ms).toISOString()
        if (!maxInternal || iso > maxInternal) maxInternal = iso
      }
    }
  }
  upsertMessages(inputs)

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
  await refreshGmailHistoryId(accountId)
  return { folders, inboxMessages, sentMessages }
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
      for (const h of history) {
        const added = h.messagesAdded ?? []
        for (const m of added) {
          const id = m.message?.id
          if (!id) continue
          const full = await gmail.users.messages.get({ userId: 'me', id, format: 'full' })
          if (!full.data?.id) continue
          const labelIds = full.data.labelIds ?? []
          const primaryFolder =
            labelIds.find((l) => l === 'INBOX') ??
            labelIds.find((l) => l === 'SENT') ??
            labelIds.find((l) => l === 'DRAFT') ??
            labelIds[0]
          if (!primaryFolder) continue
          const f = findFolderByRemoteId(accountId, primaryFolder)
          if (!f) continue
          upsertMessages([gmailMessageToUpsert(full.data, accountId, f.id)])
          remoteIds.push(id)
          totalFetched += 1
        }
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
