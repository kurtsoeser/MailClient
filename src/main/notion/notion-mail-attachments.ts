import type { AttachmentMeta, MailFull } from '@shared/types'
import { listAccounts } from '../accounts'
import { downloadAttachmentBytes, listAttachmentsMeta } from '../graph/attachments'
import { gmailDownloadAttachmentBytes, gmailListAttachmentsMeta } from '../google/gmail-attachments'
import { buildNotionFileBlocks, type NotionBlock } from './notion-blocks'
import { uploadBufferToNotion } from './notion-file-upload'

const MAX_ATTACHMENTS = 12
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024

export interface NotionUploadedAttachment {
  name: string
  fileUploadId: string
  contentType: string | null
}

async function listMailAttachments(mail: MailFull): Promise<AttachmentMeta[]> {
  try {
    const accounts = await listAccounts()
    const acc = accounts.find((a) => a.id === mail.accountId)
    if (acc?.provider === 'google') {
      return await gmailListAttachmentsMeta(mail.accountId, mail.remoteId)
    }
    return await listAttachmentsMeta(mail.accountId, mail.remoteId)
  } catch {
    return []
  }
}

async function downloadMailAttachment(
  mail: MailFull,
  attachmentId: string
): Promise<{ name: string; contentType: string | null; bytes: Buffer }> {
  const accounts = await listAccounts()
  const acc = accounts.find((a) => a.id === mail.accountId)
  if (acc?.provider === 'google') {
    return gmailDownloadAttachmentBytes(mail.accountId, mail.remoteId, attachmentId)
  }
  return downloadAttachmentBytes(mail.accountId, mail.remoteId, attachmentId)
}

function isEligibleAttachment(meta: AttachmentMeta): boolean {
  if (meta.isInline) return false
  if (meta.size != null && meta.size > MAX_ATTACHMENT_BYTES) return false
  return true
}

export async function uploadMailAttachmentsToNotion(
  mail: MailFull
): Promise<{ uploads: NotionUploadedAttachment[]; skipped: string[] }> {
  if (!mail.hasAttachments) {
    return { uploads: [], skipped: [] }
  }

  const all = await listMailAttachments(mail)
  const eligible = all.filter(isEligibleAttachment).slice(0, MAX_ATTACHMENTS)
  const uploads: NotionUploadedAttachment[] = []
  const skipped: string[] = []

  for (const meta of eligible) {
    try {
      const file = await downloadMailAttachment(mail, meta.id)
      if (file.bytes.length > MAX_ATTACHMENT_BYTES) {
        skipped.push(`${meta.name} (zu gross)`)
        continue
      }
      const fileUploadId = await uploadBufferToNotion(
        file.bytes,
        file.name || meta.name,
        file.contentType ?? meta.contentType
      )
      uploads.push({
        name: file.name || meta.name,
        fileUploadId,
        contentType: file.contentType ?? meta.contentType
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      skipped.push(`${meta.name}: ${msg}`)
    }
  }

  const skippedInline = all.filter((a) => a.isInline).length
  if (skippedInline > 0) {
    skipped.push(`${skippedInline} eingebettete Bild(er) uebersprungen`)
  }

  return { uploads, skipped }
}

export function buildNotionAttachmentSectionBlocks(
  uploads: NotionUploadedAttachment[],
  skipped: string[]
): NotionBlock[] {
  const blocks: NotionBlock[] = []
  if (uploads.length === 0 && skipped.length === 0) return blocks

  blocks.push({
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: [{ type: 'text', text: { content: 'Anhänge' } }]
    }
  })

  for (const u of uploads) {
    blocks.push(...buildNotionFileBlocks(u.fileUploadId, u.name, u.contentType))
  }

  if (skipped.length > 0) {
    const note = skipped.slice(0, 5).join('; ')
    blocks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [
          {
            type: 'text',
            text: {
              content: `Nicht hochgeladen: ${note}`.slice(0, 1900)
            }
          }
        ]
      }
    })
  }

  return blocks
}
