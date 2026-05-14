import type { ComposeReferenceAttachment, MailImportance } from '@shared/types'
import { createGraphClient } from './client'
import { loadConfig } from '../config'

async function getClientFor(accountId: string): Promise<ReturnType<typeof createGraphClient>> {
  const config = await loadConfig()
  if (!config.microsoftClientId) {
    throw new Error('Keine Azure Client-ID konfiguriert.')
  }
  const homeAccountId = accountId.replace(/^ms:/, '')
  return createGraphClient(config.microsoftClientId, homeAccountId)
}

export interface RecipientInput {
  address: string
  name?: string
}

export interface AttachmentInput {
  name: string
  contentType: string
  /** Base64 (ohne Daten-URL-Prefix). */
  dataBase64: string
  isInline?: boolean
  contentId?: string
}

export interface ComposeMessageInput {
  accountId: string
  subject: string
  bodyHtml: string
  to: RecipientInput[]
  cc?: RecipientInput[]
  bcc?: RecipientInput[]
  attachments?: AttachmentInput[]
  /**
   * Optional: Wenn diese ID gesetzt ist, wird der Send-Call auf
   * /me/messages/{id}/reply bzw. /forward gemappt. Dann setzt Graph
   * automatisch In-Reply-To/References und ordnet die Mail dem Thread zu.
   */
  replyToRemoteId?: string
  replyMode?: 'reply' | 'replyAll' | 'forward'
  importance?: MailImportance
  isDeliveryReceiptRequested?: boolean
  isReadReceiptRequested?: boolean
  referenceAttachments?: ComposeReferenceAttachment[]
}

function toGraphRecipients(recipients: RecipientInput[]): Array<{
  emailAddress: { address: string; name?: string }
}> {
  return recipients
    .filter((r) => r.address)
    .map((r) => ({
      emailAddress: { address: r.address, ...(r.name ? { name: r.name } : {}) }
    }))
}

interface GraphFileAttachment {
  '@odata.type': '#microsoft.graph.fileAttachment'
  name: string
  contentType: string
  contentBytes: string
  isInline?: boolean
  contentId?: string
}

interface GraphReferenceAttachment {
  '@odata.type': '#microsoft.graph.referenceAttachment'
  name: string
  sourceUrl: string
  providerType: string
}

function toGraphAttachments(atts: AttachmentInput[] | undefined): GraphFileAttachment[] {
  if (!atts || atts.length === 0) return []
  return atts.map((a) => ({
    '@odata.type': '#microsoft.graph.fileAttachment',
    name: a.name,
    contentType: a.contentType,
    contentBytes: a.dataBase64,
    ...(a.isInline ? { isInline: true } : {}),
    ...(a.contentId ? { contentId: a.contentId } : {})
  }))
}

function toGraphReferenceAttachments(
  refs: ComposeReferenceAttachment[] | undefined
): GraphReferenceAttachment[] {
  if (!refs || refs.length === 0) return []
  return refs.map((r) => ({
    '@odata.type': '#microsoft.graph.referenceAttachment',
    name: r.name,
    sourceUrl: r.sourceUrl,
    providerType: r.providerType ?? 'oneDriveBusiness'
  }))
}

function messageFlagPatch(input: ComposeMessageInput): Record<string, unknown> {
  const o: Record<string, unknown> = {}
  if (input.importance && input.importance !== 'normal') {
    o.importance = input.importance
  }
  if (input.isDeliveryReceiptRequested) {
    o.isDeliveryReceiptRequested = true
  }
  if (input.isReadReceiptRequested) {
    o.isReadReceiptRequested = true
  }
  return o
}

// Graph hat ein hartes Limit von 4 MB pro Request bei sendMail/create.
// Groessere Anhaenge muessen ueber eine Upload-Session am Draft hochgeladen
// werden. Wir uebernehmen alles unter dieser Schwelle inline und laden
// groessere Files separat hoch.
const INLINE_ATTACHMENT_LIMIT = 3 * 1024 * 1024 // 3 MB Sicherheitspuffer

function partitionAttachments(atts: AttachmentInput[] | undefined): {
  inline: AttachmentInput[]
  large: AttachmentInput[]
} {
  const inline: AttachmentInput[] = []
  const large: AttachmentInput[] = []
  for (const a of atts ?? []) {
    const bytes = Math.ceil((a.dataBase64.length * 3) / 4)
    if (bytes > INLINE_ATTACHMENT_LIMIT) large.push(a)
    else inline.push(a)
  }
  return { inline, large }
}

async function uploadLargeAttachment(
  client: ReturnType<typeof createGraphClient>,
  draftId: string,
  att: AttachmentInput
): Promise<void> {
  const buffer = Buffer.from(att.dataBase64, 'base64')
  const session = (await client
    .api(`/me/messages/${draftId}/attachments/createUploadSession`)
    .post({
      AttachmentItem: {
        attachmentType: 'file',
        name: att.name,
        size: buffer.byteLength,
        contentType: att.contentType,
        ...(att.isInline ? { isInline: true } : {}),
        ...(att.contentId ? { contentId: att.contentId } : {})
      }
    })) as { uploadUrl: string }

  const chunkSize = 5 * 1024 * 1024 // 5 MB
  for (let start = 0; start < buffer.byteLength; start += chunkSize) {
    const end = Math.min(start + chunkSize, buffer.byteLength)
    const chunk = buffer.subarray(start, end)
    const res = await fetch(session.uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': String(chunk.byteLength),
        'Content-Range': `bytes ${start}-${end - 1}/${buffer.byteLength}`
      },
      body: chunk
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      throw new Error(`Upload des Anhangs fehlgeschlagen (${res.status}): ${txt.slice(0, 200)}`)
    }
  }
}

export async function sendMail(input: ComposeMessageInput): Promise<void> {
  const client = await getClientFor(input.accountId)

  const { inline, large } = partitionAttachments(input.attachments)
  const refAtts = toGraphReferenceAttachments(input.referenceAttachments)
  const hasRefs = refAtts.length > 0

  const baseMessage = {
    subject: input.subject,
    body: { contentType: 'HTML' as const, content: input.bodyHtml },
    toRecipients: toGraphRecipients(input.to),
    ccRecipients: toGraphRecipients(input.cc ?? []),
    bccRecipients: toGraphRecipients(input.bcc ?? []),
    ...messageFlagPatch(input)
  }

  // ReferenceAttachments und grosse Dateien erfordern Draft-Pfad.
  const needsDraftPath =
    large.length > 0 || (input.replyToRemoteId && input.replyMode) || hasRefs

  if (!needsDraftPath) {
    const fileAtts = toGraphAttachments(inline)
    const messagePayload = {
      ...baseMessage,
      ...(fileAtts.length ? { attachments: fileAtts } : {})
    }
    await client.api('/me/sendMail').post({
      message: messagePayload,
      saveToSentItems: true
    })
    return
  }

  let draftId: string
  if (input.replyToRemoteId && input.replyMode) {
    const endpoint =
      input.replyMode === 'forward'
        ? `/me/messages/${input.replyToRemoteId}/createForward`
        : input.replyMode === 'replyAll'
          ? `/me/messages/${input.replyToRemoteId}/createReplyAll`
          : `/me/messages/${input.replyToRemoteId}/createReply`
    const draft = (await client.api(endpoint).post({})) as { id: string }
    draftId = draft.id
    await client.api(`/me/messages/${draftId}`).patch(baseMessage)
  } else {
    const draft = (await client.api('/me/messages').post(baseMessage)) as { id: string }
    draftId = draft.id
  }

  for (const att of inline) {
    await client
      .api(`/me/messages/${draftId}/attachments`)
      .post(toGraphAttachments([att])[0])
  }
  for (const att of large) {
    await uploadLargeAttachment(client, draftId, att)
  }
  for (const ref of refAtts) {
    await client.api(`/me/messages/${draftId}/attachments`).post(ref)
  }

  await client.api(`/me/messages/${draftId}/send`).post({})
}

export interface SaveMailDraftInput extends ComposeMessageInput {
  remoteDraftId?: string | null
}

async function graphDeleteDraftFileAndReferenceAttachments(
  client: ReturnType<typeof createGraphClient>,
  messageId: string
): Promise<void> {
  type AttRow = { id: string; ['@odata.type']: string }
  type Page = { value: AttRow[]; ['@odata.nextLink']?: string }
  let url: string | null = `/me/messages/${messageId}/attachments?$top=100`
  while (url) {
    const page = (await client.api(url).get()) as Page
    for (const a of page.value) {
      const t = a['@odata.type']
      if (
        t === '#microsoft.graph.fileAttachment' ||
        t === '#microsoft.graph.referenceAttachment'
      ) {
        await client.api(`/me/messages/${messageId}/attachments/${a.id}`).delete()
      }
    }
    const next = page['@odata.nextLink'] ?? null
    url = next ? next.replace(/^https?:\/\/[^/]+\/v[0-9.]+/, '') : null
  }
}

async function graphApplyDraftAttachments(
  client: ReturnType<typeof createGraphClient>,
  draftId: string,
  inline: AttachmentInput[],
  large: AttachmentInput[],
  refAtts: GraphReferenceAttachment[]
): Promise<void> {
  for (const att of inline) {
    await client.api(`/me/messages/${draftId}/attachments`).post(toGraphAttachments([att])[0])
  }
  for (const att of large) {
    await uploadLargeAttachment(client, draftId, att)
  }
  for (const ref of refAtts) {
    await client.api(`/me/messages/${draftId}/attachments`).post(ref)
  }
}

/**
 * Legt einen Entwurf in «Entwürfe» an oder aktualisiert ihn (PATCH + Anhänge neu setzen).
 * Kein Senden.
 */
export async function saveMailDraft(input: SaveMailDraftInput): Promise<{ remoteDraftId: string }> {
  const client = await getClientFor(input.accountId)
  const { inline, large } = partitionAttachments(input.attachments)
  const refAtts = toGraphReferenceAttachments(input.referenceAttachments)
  const baseMessage = {
    subject: input.subject,
    body: { contentType: 'HTML' as const, content: input.bodyHtml },
    toRecipients: toGraphRecipients(input.to),
    ccRecipients: toGraphRecipients(input.cc ?? []),
    bccRecipients: toGraphRecipients(input.bcc ?? []),
    ...messageFlagPatch(input)
  }

  const rem = input.remoteDraftId?.trim()
  if (rem) {
    await client.api(`/me/messages/${rem}`).patch(baseMessage)
    await graphDeleteDraftFileAndReferenceAttachments(client, rem)
    await graphApplyDraftAttachments(client, rem, inline, large, refAtts)
    return { remoteDraftId: rem }
  }

  let draftId: string
  if (input.replyToRemoteId && input.replyMode) {
    const endpoint =
      input.replyMode === 'forward'
        ? `/me/messages/${input.replyToRemoteId}/createForward`
        : input.replyMode === 'replyAll'
          ? `/me/messages/${input.replyToRemoteId}/createReplyAll`
          : `/me/messages/${input.replyToRemoteId}/createReply`
    const draft = (await client.api(endpoint).post({})) as { id: string }
    draftId = draft.id
    await client.api(`/me/messages/${draftId}`).patch(baseMessage)
  } else {
    const draft = (await client.api('/me/messages').post(baseMessage)) as { id: string }
    draftId = draft.id
  }

  await graphApplyDraftAttachments(client, draftId, inline, large, refAtts)
  return { remoteDraftId: draftId }
}
