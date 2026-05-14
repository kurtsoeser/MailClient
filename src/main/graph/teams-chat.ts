import type { TeamsChatMessageView, TeamsChatSummary } from '@shared/types'
import { createGraphClient } from './client'
import { isTeamsSystemEventPlaceholderBody, summarizeTeamsSystemEvent } from './teams-chat-system-summary'

interface ODataList<T> {
  value?: T[]
}

interface GraphChat {
  id: string
  topic?: string | null
  chatType?: string | null
  lastUpdatedDateTime?: string | null
}

interface GraphChatMember {
  '@odata.type'?: string
  displayName?: string | null
  /** `aadUserConversationMember` u. a. */
  userId?: string | null
}

interface GraphItemBody {
  content?: string | null
  contentType?: string | null
}

interface GraphChatMessage {
  id: string
  createdDateTime?: string
  messageType?: string
  summary?: string | null
  subject?: string | null
  /** Graph liefert `body` (itemBody); Systemnachrichten oft nur `<systemEventMessage/>`. */
  body?: GraphItemBody | null
  from?: {
    user?: { displayName?: string; id?: string }
    application?: { displayName?: string; id?: string }
    device?: { displayName?: string; id?: string }
  } | null
  eventDetail?: Record<string, unknown> | null
}

const PREVIEW_MAX = 480

function decodeBasicHtmlEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#160;/gi, ' ')
    .replace(/&#x0*A0;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function previewFromChatBody(body: GraphItemBody | null | undefined): string | null {
  const raw = body?.content?.trim()
  if (!raw) return null
  const ct = (body?.contentType ?? '').toLowerCase()
  const looksHtml = ct === 'html' || /^<\s*[!?]?[a-z]/i.test(raw)
  let text = looksHtml ? raw.replace(/<[^>]+>/g, ' ') : raw
  text = decodeBasicHtmlEntities(text)
  text = text.replace(/\s+/g, ' ').trim()
  if (!text) return null
  return text.length > PREVIEW_MAX ? `${text.slice(0, PREVIEW_MAX)}…` : text
}

function mapFromDisplayName(from: GraphChatMessage['from']): string | null {
  if (!from) return null
  if (from.user?.displayName) return from.user.displayName
  if (from.application?.displayName) return from.application.displayName
  if (from.device?.displayName) return from.device.displayName
  return null
}

function mapChat(c: GraphChat): TeamsChatSummary {
  return {
    id: c.id,
    topic: c.topic ?? null,
    chatType: c.chatType ?? null,
    lastUpdatedDateTime: c.lastUpdatedDateTime ?? null,
    peerDisplayName: null
  }
}

/** Parallele Ausfuehrung mit begrenzter gleichzeitiger Tiefe. */
async function poolMap<T, R>(items: T[], poolSize: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const n = items.length
  const size = Math.max(1, Math.min(poolSize, n || 1))
  const runners = Array.from({ length: n ? size : 0 }, async () => {
    while (true) {
      const i = next++
      if (i >= n) break
      results[i] = await worker(items[i]!, i)
    }
  })
  await Promise.all(runners)
  return results
}

async function fetchOneOnOnePeerDisplayName(
  client: ReturnType<typeof createGraphClient>,
  chatId: string,
  myUserId: string
): Promise<string | null> {
  try {
    const res = (await client.api(`/chats/${encodeURIComponent(chatId)}/members`).get()) as ODataList<GraphChatMember>
    const members = res.value ?? []
    const others = members.filter((m) => {
      const uid = m.userId?.trim()
      return uid && uid !== myUserId
    })
    const names = others
      .map((m) => m.displayName?.trim())
      .filter((x): x is string => Boolean(x))
    if (names.length === 1) return names[0]!
    if (names.length > 1) return names.join(', ')
    if (members.length === 2) {
      const mine = members.find((m) => m.userId?.trim() === myUserId)
      const other = members.find((m) => m !== mine)
      return other?.displayName?.trim() || null
    }
    return null
  } catch {
    return null
  }
}

function mapMessage(m: GraphChatMessage): TeamsChatMessageView {
  const mt = m.messageType ?? 'message'
  const placeholder = isTeamsSystemEventPlaceholderBody(m.body)
  const isSystem = mt === 'systemEventMessage' || placeholder

  let bodyPreview = previewFromChatBody(m.body ?? undefined)
  if (isSystem && (!bodyPreview || placeholder)) {
    const extra = (m.summary ?? '').trim() || (m.subject ?? '').trim()
    bodyPreview =
      summarizeTeamsSystemEvent(m.eventDetail ?? undefined) ??
      (extra
        ? decodeBasicHtmlEntities(extra.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim() || null
        : null)
  }
  if (!bodyPreview?.trim() && isSystem) {
    bodyPreview = 'Systemereignis (Graph liefert keine Beschreibung).'
  }

  const from = m.from
  const fromUserId = from?.user?.id ?? null
  return {
    id: m.id,
    createdDateTime: m.createdDateTime ?? '',
    bodyPreview: bodyPreview?.trim() || null,
    fromDisplayName: mapFromDisplayName(from),
    fromUserId,
    messageKind: isSystem ? 'system' : 'user'
  }
}

/**
 * Persoenliche Teams-Chats des angemeldeten Benutzers (Graph `GET /me/chats`).
 */
export async function listTeamsChats(
  clientId: string,
  homeAccountId: string,
  limit = 40
): Promise<TeamsChatSummary[]> {
  const client = createGraphClient(clientId, homeAccountId)
  const res = (await client
    .api('/me/chats')
    .top(limit)
    .select(['id', 'topic', 'chatType', 'lastUpdatedDateTime'])
    .get()) as ODataList<GraphChat>
  const rows = (res.value ?? []).map(mapChat)
  rows.sort((a, b) => {
    const ta = a.lastUpdatedDateTime ? Date.parse(a.lastUpdatedDateTime) : 0
    const tb = b.lastUpdatedDateTime ? Date.parse(b.lastUpdatedDateTime) : 0
    return tb - ta
  })

  let myUserId: string | null = null
  try {
    const me = (await client.api('/me').select('id').get()) as { id?: string }
    myUserId = me.id?.trim() || null
  } catch {
    myUserId = null
  }

  const needsPeer = rows.filter((r) => r.chatType === 'oneOnOne' && !r.topic?.trim() && myUserId)
  if (needsPeer.length > 0 && myUserId) {
    const peers = await poolMap(needsPeer, 6, async (r) => ({
      id: r.id,
      peerDisplayName: await fetchOneOnOnePeerDisplayName(client, r.id, myUserId!)
    }))
    const peerByChat = new Map(peers.map((p) => [p.id, p.peerDisplayName]))
    for (const r of rows) {
      const p = peerByChat.get(r.id)
      if (p !== undefined) r.peerDisplayName = p
    }
  }

  return rows
}

/**
 * Nachrichten eines Chats (`GET /chats/{id}/messages`).
 * Rueckgabe chronologisch aufsteigend (aelteste zuerst) fuer Chat-UI.
 * Graph erlaubt hier maximal `$top=50` (`TEAMS_CHAT_MESSAGES_TOP_MAX`).
 */
const TEAMS_CHAT_MESSAGES_TOP_MAX = 50

export async function listTeamsChatMessages(
  clientId: string,
  homeAccountId: string,
  chatId: string,
  limit = 40
): Promise<TeamsChatMessageView[]> {
  const top = Math.min(Math.max(1, Math.floor(limit)), TEAMS_CHAT_MESSAGES_TOP_MAX)
  const client = createGraphClient(clientId, homeAccountId)
  const path = `/chats/${encodeURIComponent(chatId)}/messages`
  let res: ODataList<GraphChatMessage>
  try {
    res = (await client.api(path).top(top).orderby('createdDateTime desc').get()) as ODataList<GraphChatMessage>
  } catch {
    res = (await client.api(path).top(top).get()) as ODataList<GraphChatMessage>
  }
  const rows = (res.value ?? []).map(mapMessage)
  rows.sort((a, b) => Date.parse(a.createdDateTime) - Date.parse(b.createdDateTime))
  return rows
}

/**
 * Nachricht in einem Chat senden (`POST /chats/{id}/messages`).
 */
export async function sendTeamsChatMessage(
  clientId: string,
  homeAccountId: string,
  chatId: string,
  text: string
): Promise<void> {
  const trimmed = text.trim()
  if (!trimmed) {
    throw new Error('Leere Nachricht.')
  }
  const client = createGraphClient(clientId, homeAccountId)
  const path = `/chats/${encodeURIComponent(chatId)}/messages`
  await client.api(path).post({
    body: {
      contentType: 'text',
      content: trimmed
    }
  })
}
