import type { gmail_v1 } from 'googleapis'
import type { AttachmentMeta } from '@shared/types'
import { getGoogleApis } from './google-auth-client'

function collectAttachmentParts(
  part: gmail_v1.Schema$MessagePart | null | undefined,
  out: gmail_v1.Schema$MessagePart[]
): void {
  if (!part) return
  if (part.body?.attachmentId && part.filename) {
    out.push(part)
  }
  for (const child of part.parts ?? []) {
    collectAttachmentParts(child, out)
  }
}

function headerMap(part: gmail_v1.Schema$MessagePart): Map<string, string> {
  const m = new Map<string, string>()
  for (const h of part.headers ?? []) {
    const n = (h.name ?? '').toLowerCase().trim()
    if (h.value) m.set(n, h.value)
  }
  return m
}

export async function gmailListAttachmentsMeta(
  accountId: string,
  remoteMessageId: string
): Promise<AttachmentMeta[]> {
  const { gmail } = await getGoogleApis(accountId)
  const full = await gmail.users.messages.get({
    userId: 'me',
    id: remoteMessageId,
    format: 'full'
  })
  const parts: gmail_v1.Schema$MessagePart[] = []
  collectAttachmentParts(full.data.payload, parts)
  return parts.map((p) => {
    const hm = headerMap(p)
    const cid = (hm.get('content-id') ?? '').replace(/^<|>$/g, '')
    const disp = (hm.get('content-disposition') ?? '').toLowerCase()
    const inline = disp.includes('inline') || Boolean(cid)
    return {
      id: p.body!.attachmentId!,
      name: p.filename ?? 'attachment',
      contentType: p.mimeType ?? null,
      size: p.body?.size ?? null,
      isInline: inline,
      contentId: cid || null
    }
  })
}

export async function gmailDownloadAttachmentBytes(
  accountId: string,
  remoteMessageId: string,
  attachmentId: string
): Promise<{ name: string; contentType: string | null; bytes: Buffer }> {
  const { gmail } = await getGoogleApis(accountId)
  const full = await gmail.users.messages.get({
    userId: 'me',
    id: remoteMessageId,
    format: 'full'
  })
  const parts: gmail_v1.Schema$MessagePart[] = []
  collectAttachmentParts(full.data.payload, parts)
  const match = parts.find((p) => p.body?.attachmentId === attachmentId)
  if (!match?.body?.attachmentId) {
    throw new Error('Anhang nicht gefunden.')
  }
  const att = await gmail.users.messages.attachments.get({
    userId: 'me',
    messageId: remoteMessageId,
    id: attachmentId
  })
  const data = att.data.data
  if (!data) {
    throw new Error('Anhang enthaelt keine Daten.')
  }
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/')
  return {
    name: match.filename ?? 'attachment',
    contentType: match.mimeType ?? null,
    bytes: Buffer.from(b64, 'base64')
  }
}

export async function gmailFetchInlineImages(
  accountId: string,
  remoteMessageId: string
): Promise<Record<string, string>> {
  const metas = await gmailListAttachmentsMeta(accountId, remoteMessageId)
  const out: Record<string, string> = {}
  for (const m of metas) {
    if (!m.isInline || !m.contentId) continue
    if (m.contentType && !m.contentType.startsWith('image/')) continue
    try {
      const { bytes, contentType } = await gmailDownloadAttachmentBytes(
        accountId,
        remoteMessageId,
        m.id
      )
      const mime = contentType ?? 'image/png'
      out[m.contentId] = `data:${mime};base64,${bytes.toString('base64')}`
    } catch (e) {
      console.warn('[gmail-attachments] Inline konnte nicht geladen werden:', e)
    }
  }
  return out
}
