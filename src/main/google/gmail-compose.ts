import { getGoogleApis } from './google-auth-client'
import type { AttachmentInput, RecipientInput } from '../graph/compose'

export interface GmailComposeInput {
  accountId: string
  subject: string
  bodyHtml: string
  to: RecipientInput[]
  cc?: RecipientInput[]
  bcc?: RecipientInput[]
  attachments?: AttachmentInput[]
  replyToRemoteId?: string
  replyMode?: 'reply' | 'replyAll' | 'forward'
}

function formatAddress(r: RecipientInput): string {
  const a = r.address.trim()
  if (!a) return ''
  if (r.name?.trim()) {
    return `${r.name.trim().replace(/"/g, '')} <${a}>`
  }
  return a
}

function encodeSubject(s: string): string {
  if (/^[\x20-\x7e]*$/.test(s)) return s.replace(/\r|\n/g, ' ')
  return `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`
}

function encodeFilenameRfc2047(name: string): string {
  if (/^[\x20-\x7e]*$/.test(name)) return name
  return `=?UTF-8?B?${Buffer.from(name, 'utf8').toString('base64')}?=`
}

function wrapBase64(input: string): string {
  return input.replace(/.{1,76}/g, (m) => m + '\r\n').trimEnd()
}

function randomBoundary(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`
}

interface MimePart {
  headers: string[]
  body: string
}

function buildHtmlBodyPart(bodyHtml: string): MimePart {
  const b64 = Buffer.from(bodyHtml, 'utf8').toString('base64')
  return {
    headers: [
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64'
    ],
    body: wrapBase64(b64)
  }
}

function buildAttachmentPart(att: AttachmentInput): MimePart {
  const fileName = encodeFilenameRfc2047(att.name)
  const disposition = att.isInline ? 'inline' : 'attachment'
  const headers = [
    `Content-Type: ${att.contentType || 'application/octet-stream'}; name="${fileName}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: ${disposition}; filename="${fileName}"`
  ]
  if (att.isInline && att.contentId) {
    headers.push(`Content-ID: <${att.contentId}>`)
  }
  return {
    headers,
    body: wrapBase64(att.dataBase64)
  }
}

function serializePart(part: MimePart): string {
  return [...part.headers, '', part.body].join('\r\n')
}

function buildMultipart(
  parts: MimePart[],
  subtype: 'mixed' | 'related' | 'alternative'
): MimePart {
  const boundary = randomBoundary(subtype.slice(0, 3))
  const body =
    parts.map((p) => `--${boundary}\r\n${serializePart(p)}`).join('\r\n') +
    `\r\n--${boundary}--`
  return {
    headers: [`Content-Type: multipart/${subtype}; boundary="${boundary}"`],
    body
  }
}

function buildMime(
  input: GmailComposeInput,
  fromLine: string,
  replyHeaders: string[]
): string {
  const to = input.to.map(formatAddress).filter(Boolean).join(', ')
  const cc = (input.cc ?? []).map(formatAddress).filter(Boolean).join(', ')
  const bcc = (input.bcc ?? []).map(formatAddress).filter(Boolean).join(', ')

  const inline = (input.attachments ?? []).filter((a) => a.isInline)
  const regular = (input.attachments ?? []).filter((a) => !a.isInline)

  const htmlPart = buildHtmlBodyPart(input.bodyHtml)

  // Bauen den Body baumweise zusammen.
  let rootPart: MimePart
  if (inline.length === 0 && regular.length === 0) {
    rootPart = htmlPart
  } else if (inline.length > 0 && regular.length === 0) {
    rootPart = buildMultipart(
      [htmlPart, ...inline.map(buildAttachmentPart)],
      'related'
    )
  } else if (inline.length === 0 && regular.length > 0) {
    rootPart = buildMultipart(
      [htmlPart, ...regular.map(buildAttachmentPart)],
      'mixed'
    )
  } else {
    const related = buildMultipart(
      [htmlPart, ...inline.map(buildAttachmentPart)],
      'related'
    )
    rootPart = buildMultipart([related, ...regular.map(buildAttachmentPart)], 'mixed')
  }

  const topHeaders: string[] = []
  topHeaders.push(`From: ${fromLine}`)
  topHeaders.push(`To: ${to}`)
  if (cc) topHeaders.push(`Cc: ${cc}`)
  if (bcc) topHeaders.push(`Bcc: ${bcc}`)
  topHeaders.push(`Subject: ${encodeSubject(input.subject)}`)
  for (const h of replyHeaders) {
    if (h.trim()) topHeaders.push(h)
  }
  topHeaders.push('MIME-Version: 1.0')
  // Header des Root-Parts (Content-Type usw.) hochziehen.
  topHeaders.push(...rootPart.headers)

  return [...topHeaders, '', rootPart.body].join('\r\n')
}

function toRawBase64Url(raw: string): string {
  return Buffer.from(raw, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export async function gmailSendMail(
  input: GmailComposeInput,
  fromEmail: string,
  fromName: string
): Promise<void> {
  const { gmail } = await getGoogleApis(input.accountId)
  const fromLine = fromName.trim()
    ? `${fromName.replace(/"/g, '')} <${fromEmail}>`
    : fromEmail

  const replyHeaders: string[] = []
  let threadId: string | undefined

  if (input.replyToRemoteId && input.replyMode) {
    const orig = await gmail.users.messages.get({
      userId: 'me',
      id: input.replyToRemoteId,
      format: 'metadata',
      metadataHeaders: ['Message-ID', 'References', 'Subject']
    })
    threadId = orig.data.threadId ?? undefined
    const hmap = new Map<string, string>()
    for (const h of orig.data.payload?.headers ?? []) {
      const n = (h.name ?? '').toLowerCase()
      if (h.value) hmap.set(n, h.value)
    }
    const mid = hmap.get('message-id')
    const refs = hmap.get('references')
    if (mid) {
      replyHeaders.push(`In-Reply-To: ${mid}`)
      replyHeaders.push(`References: ${refs ? `${refs} ${mid}` : mid}`)
    }
  }

  const raw = buildMime(input, fromLine, replyHeaders)
  await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: toRawBase64Url(raw),
      ...(threadId && input.replyMode !== 'forward' ? { threadId } : {})
    }
  })
}
