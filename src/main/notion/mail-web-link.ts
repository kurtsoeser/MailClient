import type { MailFull } from '@shared/types'
import { listAccounts } from '../accounts'
import { loadConfig } from '../config'
import { createGraphClient } from '../graph/client'

/**
 * Link zum Oeffnen der Mail im Browser (Outlook Web / Gmail).
 * Bevorzugt Graph-`webLink`, sonst konstruierte Deep-Links.
 */
export async function resolveMailWebLink(
  mail: MailFull,
  explicit?: string | null
): Promise<string | null> {
  const passed = explicit?.trim()
  if (passed) return passed

  const remoteId = mail.remoteId?.trim()
  if (!remoteId) return null

  const accounts = await listAccounts()
  const acc = accounts.find((a) => a.id === mail.accountId)
  if (!acc) return null

  if (acc.provider === 'google') {
    return buildGmailWebLink(acc.email, remoteId, mail.remoteThreadId)
  }

  return fetchOutlookWebLink(mail.accountId, remoteId)
}

function buildGmailWebLink(
  accountEmail: string,
  messageId: string,
  threadId?: string | null
): string {
  const authUser = encodeURIComponent(accountEmail.trim())
  const msg = encodeURIComponent(messageId)
  const thread = threadId?.trim()
  if (thread) {
    return `https://mail.google.com/mail/u/0/?authuser=${authUser}#all/${encodeURIComponent(thread)}|${msg}`
  }
  return `https://mail.google.com/mail/u/0/?authuser=${authUser}#all/${msg}`
}

async function fetchOutlookWebLink(
  accountId: string,
  remoteMessageId: string
): Promise<string | null> {
  const config = await loadConfig()
  const clientId = config.microsoftClientId?.trim()
  if (!clientId) {
    return buildOutlookWebLinkFallback(remoteMessageId)
  }

  try {
    const homeAccountId = accountId.replace(/^ms:/, '')
    const client = createGraphClient(clientId, homeAccountId)
    const msg = (await client
      .api(`/me/messages/${remoteMessageId}`)
      .select('webLink')
      .get()) as { webLink?: string | null }
    const link = msg.webLink?.trim()
    if (link && /^https?:\/\//i.test(link)) {
      return link
    }
  } catch {
    // Fallback unten
  }

  return buildOutlookWebLinkFallback(remoteMessageId)
}

/** OWA-Deep-Link, wenn Graph kein webLink liefert. */
function buildOutlookWebLinkFallback(remoteMessageId: string): string {
  const itemId = encodeURIComponent(remoteMessageId)
  return `https://outlook.office365.com/owa/?ItemID=${itemId}&exvsurl=1`
}
