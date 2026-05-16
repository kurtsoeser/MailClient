import type { CalendarEventView } from '@shared/types'
import { loadConfig } from '../config'
import { createGraphClient } from '../graph/client'
import { parseM365GroupIdFromCalendarRef } from '@shared/microsoft-m365-group-calendar'
import { getGoogleApis } from '../google/google-auth-client'

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
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function graphEventPath(graphEventId: string, graphCalendarId?: string | null): string {
  const gid = parseM365GroupIdFromCalendarRef(graphCalendarId?.trim() ?? '')
  if (gid) {
    return `/groups/${encodeURIComponent(gid)}/events/${encodeURIComponent(graphEventId)}`
  }
  return `/me/events/${encodeURIComponent(graphEventId)}`
}

async function fetchMicrosoftEventDescription(ev: CalendarEventView): Promise<string | null> {
  const eventId = ev.graphEventId?.trim()
  if (!eventId || ev.source !== 'microsoft') return null

  const config = await loadConfig()
  const clientId = config.microsoftClientId?.trim()
  if (!clientId) return null

  const homeAccountId = ev.accountId.replace(/^ms:/, '')
  const client = createGraphClient(clientId, homeAccountId)
  const path = graphEventPath(eventId, ev.graphCalendarId)
  const raw = (await client.api(`${path}?$select=body`).get()) as {
    body?: { content?: string; contentType?: string }
  }
  const content = raw.body?.content?.trim()
  if (!content) return null
  if (raw.body?.contentType === 'html' || content.includes('<')) {
    return htmlToPlainText(content)
  }
  return content
}

async function fetchGoogleEventDescription(ev: CalendarEventView): Promise<string | null> {
  const eventId = ev.graphEventId?.trim()
  if (!eventId || ev.source !== 'google') return null

  const calId = ev.graphCalendarId?.trim() || 'primary'
  const { calendar } = await getGoogleApis(ev.accountId)
  const res = await calendar.events.get({
    calendarId: calId,
    eventId,
    fields: 'description'
  })
  const raw = res.data.description?.trim()
  if (!raw) return null
  if (raw.includes('<')) return htmlToPlainText(raw)
  return raw
}

/** Terminbeschreibung aus Graph/Gmail (best effort). */
export async function fetchCalendarEventDescription(
  ev: CalendarEventView
): Promise<string | null> {
  try {
    if (ev.source === 'google') {
      return await fetchGoogleEventDescription(ev)
    }
    return await fetchMicrosoftEventDescription(ev)
  } catch {
    return null
  }
}
