import { createGraphClient } from './client'
import { loadConfig } from '../config'
import type { AttachmentMeta } from '@shared/types'

async function getClientFor(accountId: string): Promise<ReturnType<typeof createGraphClient>> {
  const config = await loadConfig()
  if (!config.microsoftClientId) {
    throw new Error('Keine Azure Client-ID konfiguriert.')
  }
  const homeAccountId = accountId.replace(/^ms:/, '')
  return createGraphClient(config.microsoftClientId, homeAccountId)
}

interface GraphAttachment {
  '@odata.type': string
  id: string
  name?: string | null
  contentType?: string | null
  contentId?: string | null
  isInline?: boolean
  size?: number
  /** Bei FileAttachment-Typen: Base64-Inhalt. */
  contentBytes?: string
}

/**
 * Listet die Metadaten aller Anhaenge einer Mail (ohne Bytes).
 */
export async function listAttachmentsMeta(
  accountId: string,
  remoteMessageId: string
): Promise<AttachmentMeta[]> {
  const client = await getClientFor(accountId)
  // ACHTUNG: kein $select! `contentId` ist nur auf `fileAttachment` definiert,
  // nicht auf der Base-Klasse `attachment` – mit $select knallt Graph mit
  // HTTP 400 "Could not find a property named 'contentId'". Wir nehmen daher
  // alle Felder. `contentBytes` kommt nicht in der Liste mit, das laden wir
  // nur on demand pro Anhang.
  const res = (await client
    .api(`/me/messages/${remoteMessageId}/attachments`)
    .get()) as { value: GraphAttachment[] }

  return res.value.map((a) => ({
    id: a.id,
    name: a.name ?? 'attachment',
    contentType: a.contentType ?? null,
    size: a.size ?? null,
    isInline: Boolean(a.isInline),
    contentId: a.contentId ?? null
  }))
}

/**
 * Laedt einen einzelnen Attachment-Eintrag inkl. Bytes.
 */
export async function downloadAttachmentBytes(
  accountId: string,
  remoteMessageId: string,
  attachmentId: string
): Promise<{ name: string; contentType: string | null; bytes: Buffer }> {
  const client = await getClientFor(accountId)
  const full = (await client
    .api(`/me/messages/${remoteMessageId}/attachments/${attachmentId}`)
    .get()) as GraphAttachment

  if (!full.contentBytes) {
    throw new Error('Anhang enthaelt keine Daten (vermutlich kein FileAttachment).')
  }
  return {
    name: full.name ?? 'attachment',
    contentType: full.contentType ?? null,
    bytes: Buffer.from(full.contentBytes, 'base64')
  }
}

/**
 * Holt die Inline-Bild-Attachments einer Mail und liefert sie als
 * `Record<contentId, dataUri>`. Damit koennen `cid:`-Referenzen im HTML
 * vor dem Rendern durch Data-URIs ersetzt werden.
 */
export async function fetchInlineImages(
  accountId: string,
  remoteMessageId: string
): Promise<Record<string, string>> {
  const client = await getClientFor(accountId)

  // Siehe Hinweis in listAttachmentsMeta: kein $select wegen contentId.
  const res = (await client
    .api(`/me/messages/${remoteMessageId}/attachments`)
    .get()) as { value: GraphAttachment[] }

  const inlineCandidates = res.value.filter(
    (a) => a.isInline && a.contentId && (a.contentType?.startsWith('image/') ?? true)
  )
  if (inlineCandidates.length === 0) return {}

  const out: Record<string, string> = {}
  for (const candidate of inlineCandidates) {
    try {
      const full = (await client
        .api(`/me/messages/${remoteMessageId}/attachments/${candidate.id}`)
        .get()) as GraphAttachment
      if (!full.contentBytes) continue
      const mime = full.contentType ?? 'image/png'
      const dataUri = `data:${mime};base64,${full.contentBytes}`
      const cidRaw = (candidate.contentId ?? '').replace(/^<|>$/g, '')
      out[cidRaw] = dataUri
    } catch (e) {
      console.warn('[attachments] Inline-Attachment konnte nicht geladen werden:', e)
    }
  }
  return out
}
