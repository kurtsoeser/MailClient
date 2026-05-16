import type { CalendarEventView, MailFull } from '@shared/types'

const MAX_RICH_TEXT = 1900
const MAX_BODY_PARAGRAPHS = 24

type NotionRichText =
  | { type: 'text'; text: { content: string; link?: { url: string } | null } }
  | {
      type: 'mention'
      mention: {
        type: 'date'
        date: { start: string; end?: string | null; time_zone?: string | null }
      }
    }

type NotionBlock =
  | { object: 'block'; type: 'paragraph'; paragraph: { rich_text: NotionRichText[] } }
  | {
      object: 'block'
      type: 'callout'
      callout: {
        rich_text: NotionRichText[]
        icon?: { emoji: string }
        color?: string
        children?: NotionBlock[]
      }
    }
  | {
      object: 'block'
      type: 'table'
      table: {
        table_width: number
        has_column_header: boolean
        has_row_header: boolean
        children: NotionBlock[]
      }
    }
  | {
      object: 'block'
      type: 'table_row'
      table_row: { cells: NotionRichText[][] }
    }
  | {
      object: 'block'
      type: 'file'
      file: {
        type: 'file_upload'
        file_upload: { id: string }
        name?: string
        caption?: NotionRichText[]
      }
    }
  | {
      object: 'block'
      type: 'image'
      image: {
        type: 'file_upload'
        file_upload: { id: string }
        caption?: NotionRichText[]
      }
    }
  | {
      object: 'block'
      type: 'pdf'
      pdf: {
        type: 'file_upload'
        file_upload: { id: string }
        caption?: NotionRichText[]
      }
    }

function rt(content: string, linkUrl?: string | null): NotionRichText {
  const trimmed = content.slice(0, MAX_RICH_TEXT)
  const link = linkUrl?.trim() ? { url: linkUrl.trim() } : null
  return { type: 'text', text: { content: trimmed, link } }
}

function paragraph(text: string, linkUrl?: string | null): NotionBlock {
  return { object: 'block', type: 'paragraph', paragraph: { rich_text: [rt(text, linkUrl)] } }
}

function paragraphRich(richText: NotionRichText[]): NotionBlock {
  return { object: 'block', type: 'paragraph', paragraph: { rich_text: richText } }
}

function calendarDateMention(ev: CalendarEventView): NotionRichText | null {
  const start = ev.startIso?.trim()
  if (!start) return null

  if (ev.isAllDay) {
    const startDate = start.slice(0, 10)
    const endDate = ev.endIso?.trim().slice(0, 10) || null
    return {
      type: 'mention',
      mention: {
        type: 'date',
        date: {
          start: startDate,
          end: endDate
        }
      }
    }
  }

  const end = ev.endIso?.trim()
  return {
    type: 'mention',
    mention: {
      type: 'date',
      date: {
        start,
        end: end || null
      }
    }
  }
}

function tableRow(label: string, value: string, valueLink?: string | null): NotionBlock {
  return {
    object: 'block',
    type: 'table_row',
    table_row: {
      cells: [[rt(label)], [rt(value, valueLink)]]
    }
  }
}

function mailMetaTable(
  from: string,
  to: string,
  date: string,
  mailLink?: string | null
): NotionBlock {
  const rows: NotionBlock[] = [
    tableRow('Von:', from),
    tableRow('An:', to),
    tableRow('Datum:', date)
  ]
  if (mailLink?.trim()) {
    rows.push(tableRow('zur Mail', 'LINK', mailLink.trim()))
  } else {
    rows.push(tableRow('zur Mail', '—'))
  }
  return {
    object: 'block',
    type: 'table',
    table: {
      table_width: 2,
      has_column_header: false,
      has_row_header: true,
      children: rows
    }
  }
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function bodyPlain(mail: MailFull): string {
  if (mail.bodyText?.trim()) return mail.bodyText.trim()
  if (mail.bodyHtml?.trim()) return htmlToPlainText(mail.bodyHtml)
  return ''
}

function formatFromLine(mail: MailFull): string {
  const addr = mail.fromAddr?.trim()
  const name = mail.fromName?.trim()
  if (name && addr) return `${name} <${addr}>`
  return addr || name || '—'
}

function bodyParagraphBlocks(plain: string): NotionBlock[] {
  const text = plain.trim()
  if (!text) return []

  const blocks: NotionBlock[] = []
  const paragraphs = text.split(/\n{2,}/)

  for (const para of paragraphs) {
    let chunk = para.replace(/\n/g, ' ').trim()
    if (!chunk) continue
    while (chunk.length > 0 && blocks.length < MAX_BODY_PARAGRAPHS) {
      const slice = chunk.slice(0, MAX_RICH_TEXT)
      blocks.push(paragraph(slice))
      chunk = chunk.slice(MAX_RICH_TEXT)
    }
    if (blocks.length >= MAX_BODY_PARAGRAPHS) break
  }

  if (blocks.length >= MAX_BODY_PARAGRAPHS && text.length > MAX_RICH_TEXT * MAX_BODY_PARAGRAPHS) {
    const last = blocks[blocks.length - 1]
    if (last.type === 'paragraph') {
      const first = last.paragraph.rich_text[0]
      const prev = first?.type === 'text' ? first.text.content : ''
      last.paragraph.rich_text = [rt(`${prev}…`)]
    }
  }

  return blocks
}

function blockKindForMime(contentType: string | null, filename: string): 'image' | 'pdf' | 'file' {
  const mime = (contentType ?? '').toLowerCase()
  const ext = filename.toLowerCase().split('.').pop() ?? ''
  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext)) {
    return 'image'
  }
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf'
  return 'file'
}

export function buildNotionFileBlocks(
  fileUploadId: string,
  filename: string,
  contentType: string | null
): NotionBlock[] {
  const name = filename.trim() || 'Anhang'
  const kind = blockKindForMime(contentType, name)
  const caption = [{ type: 'text' as const, text: { content: name } }]

  if (kind === 'image') {
    return [
      {
        object: 'block',
        type: 'image',
        image: {
          type: 'file_upload',
          file_upload: { id: fileUploadId },
          caption
        }
      }
    ]
  }
  if (kind === 'pdf') {
    return [
      {
        object: 'block',
        type: 'pdf',
        pdf: {
          type: 'file_upload',
          file_upload: { id: fileUploadId },
          caption
        }
      }
    ]
  }
  return [
    {
      object: 'block',
      type: 'file',
      file: {
        type: 'file_upload',
        file_upload: { id: fileUploadId },
        name,
        caption
      }
    }
  ]
}

export function buildMailNotionBlocks(
  mail: MailFull,
  webLink?: string | null,
  attachmentSectionBlocks: NotionBlock[] = []
): NotionBlock[] {
  const subject = mail.subject?.trim() || '(Ohne Betreff)'
  const from = formatFromLine(mail)
  const to = mail.toAddrs?.trim() || '—'
  const date = mail.receivedAt
    ? new Date(mail.receivedAt).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
    : '—'

  const calloutChildren: NotionBlock[] = [
    mailMetaTable(from, to, date, webLink),
    ...bodyParagraphBlocks(bodyPlain(mail)),
    ...attachmentSectionBlocks
  ]

  return [
    {
      object: 'block',
      type: 'callout',
      callout: {
        rich_text: [rt(subject)],
        icon: { emoji: '📧' },
        color: 'gray_background',
        children: calloutChildren
      }
    }
  ]
}

export function buildCalendarEventNotionBlocks(
  ev: CalendarEventView,
  localeCode: 'de' | 'en' = 'de',
  description?: string | null
): NotionBlock[] {
  const isDe = localeCode === 'de'
  const title = ev.title?.trim() || (isDe ? 'Termin' : 'Event')
  const link = ev.joinUrl?.trim() || ev.webLink?.trim()

  const children: NotionBlock[] = []

  const dateMention = calendarDateMention(ev)
  if (dateMention) {
    children.push(paragraphRich([dateMention]))
  }

  const body = description?.trim()
  if (body) {
    children.push(...bodyParagraphBlocks(body))
  }

  const location = ev.location?.trim()
  if (location) {
    const label = isDe ? 'Ort: ' : 'Location: '
    children.push(paragraph(`${label}${location}`))
  }

  if (link) {
    const label = ev.joinUrl?.trim()
      ? isDe
        ? 'Teams-Besprechung'
        : 'Teams meeting'
      : isDe
        ? 'Kalenderlink'
        : 'Calendar link'
    children.push(paragraph(label, link))
  }

  return [
    {
      object: 'block',
      type: 'callout',
      callout: {
        rich_text: [rt(title)],
        icon: { emoji: '📅' },
        color: 'default',
        children
      }
    }
  ]
}

export type { NotionBlock }
