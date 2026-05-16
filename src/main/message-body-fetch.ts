import { listAccounts } from './accounts'
import { getMessageById, updateMessageBodiesLocal } from './db/messages-repo'
import { createGraphClient } from './graph/client'
import { loadConfig } from './config'
import { getGoogleApis } from './google/google-auth-client'
import type { gmail_v1 } from 'googleapis'
import type { MailFull } from '@shared/types'

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

function messageNeedsBody(msg: MailFull): boolean {
  const hasHtml = Boolean(msg.bodyHtml?.trim())
  const hasText = Boolean(msg.bodyText?.trim())
  return !hasHtml && !hasText
}

async function fetchGraphMessageBody(
  accountId: string,
  remoteId: string
): Promise<{ bodyHtml: string | null; bodyText: string | null }> {
  const config = await loadConfig()
  if (!config.microsoftClientId) {
    throw new Error('Keine Azure Client-ID konfiguriert.')
  }
  const homeAccountId = accountId.replace(/^ms:/, '')
  const client = createGraphClient(config.microsoftClientId, homeAccountId)
  const m = (await client
    .api(`/me/messages/${remoteId}`)
    .select(['body'])
    .get()) as {
    body?: { contentType: 'html' | 'text'; content: string } | null
  }
  const html = m.body && m.body.contentType === 'html' ? m.body.content : null
  let text = m.body && m.body.contentType === 'text' ? m.body.content : null
  if (!text && html) text = htmlToPlainText(html)
  return { bodyHtml: html, bodyText: text }
}

async function fetchGmailMessageBody(
  accountId: string,
  remoteId: string
): Promise<{ bodyHtml: string | null; bodyText: string | null }> {
  const { gmail } = await getGoogleApis(accountId)
  const full = await gmail.users.messages.get({ userId: 'me', id: remoteId, format: 'full' })
  const bodies = { html: null as string | null, text: null as string | null }
  collectBodies(full.data?.payload, bodies)
  let bodyText = bodies.text
  if (!bodyText && bodies.html) bodyText = htmlToPlainText(bodies.html)
  return { bodyHtml: bodies.html, bodyText }
}

/** Laedt Mail-Body vom Provider nach, wenn lokal noch keiner gespeichert ist. */
export async function ensureMessageBodyLoaded(messageId: number): Promise<MailFull | null> {
  const msg = getMessageById(messageId)
  if (!msg || !messageNeedsBody(msg)) return msg

  const accounts = await listAccounts()
  const account = accounts.find((a) => a.id === msg.accountId)
  if (!account || !msg.remoteId) return msg

  try {
    const bodies =
      account.provider === 'google'
        ? await fetchGmailMessageBody(account.id, msg.remoteId)
        : await fetchGraphMessageBody(account.id, msg.remoteId)
    if (!bodies.bodyHtml && !bodies.bodyText) return msg
    updateMessageBodiesLocal(messageId, bodies.bodyHtml, bodies.bodyText)
    return getMessageById(messageId)
  } catch (e) {
    console.warn('[message-body-fetch] Body konnte nicht geladen werden:', messageId, e)
    return msg
  }
}
