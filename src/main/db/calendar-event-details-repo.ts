import { getDb } from './index'
import type { CalendarGetEventResult } from '@shared/types'

export function upsertCalendarEventDetails(
  accountId: string,
  graphEventId: string,
  graphCalendarId: string | null | undefined,
  detail: CalendarGetEventResult
): void {
  getDb()
    .prepare(
      `INSERT INTO calendar_event_details (
        account_id, graph_event_id, graph_calendar_id, subject,
        attendee_emails_json, join_url, is_online_meeting, body_html, synced_at
      ) VALUES (
        @account_id, @graph_event_id, @graph_calendar_id, @subject,
        @attendee_emails_json, @join_url, @is_online_meeting, @body_html, datetime('now')
      )
      ON CONFLICT(account_id, graph_event_id) DO UPDATE SET
        graph_calendar_id = excluded.graph_calendar_id,
        subject = excluded.subject,
        attendee_emails_json = excluded.attendee_emails_json,
        join_url = excluded.join_url,
        is_online_meeting = excluded.is_online_meeting,
        body_html = excluded.body_html,
        synced_at = datetime('now')`
    )
    .run({
      account_id: accountId,
      graph_event_id: graphEventId.trim(),
      graph_calendar_id: graphCalendarId?.trim() || null,
      subject: detail.subject,
      attendee_emails_json: JSON.stringify(detail.attendeeEmails),
      join_url: detail.joinUrl,
      is_online_meeting: detail.isOnlineMeeting ? 1 : 0,
      body_html: detail.bodyHtml?.trim() ? detail.bodyHtml.trim() : null
    })
}

export function getCalendarEventDetailsFromCache(
  accountId: string,
  graphEventId: string
): CalendarGetEventResult | null {
  const row = getDb()
    .prepare(
      `SELECT subject, attendee_emails_json, join_url, is_online_meeting, body_html
       FROM calendar_event_details
       WHERE account_id = ? AND graph_event_id = ?`
    )
    .get(accountId, graphEventId.trim()) as
    | {
        subject: string | null
        attendee_emails_json: string
        join_url: string | null
        is_online_meeting: number
        body_html: string | null
      }
    | undefined
  if (!row) return null
  let attendeeEmails: string[] = []
  try {
    const parsed = JSON.parse(row.attendee_emails_json) as unknown
    if (Array.isArray(parsed)) {
      attendeeEmails = parsed.filter((x): x is string => typeof x === 'string')
    }
  } catch {
    attendeeEmails = []
  }
  return {
    subject: row.subject,
    attendeeEmails,
    joinUrl: row.join_url,
    isOnlineMeeting: row.is_online_meeting === 1,
    bodyHtml: row.body_html?.trim() ? row.body_html.trim() : null
  }
}

export function isCalendarEventDetailsFresh(
  accountId: string,
  graphEventId: string,
  staleMs: number
): boolean {
  const row = getDb()
    .prepare(
      `SELECT synced_at FROM calendar_event_details
       WHERE account_id = ? AND graph_event_id = ?`
    )
    .get(accountId, graphEventId.trim()) as { synced_at: string } | undefined
  if (!row) return false
  const t = Date.parse(row.synced_at)
  if (Number.isNaN(t)) return false
  return Date.now() - t < staleMs
}

export function deleteCalendarEventDetails(accountId: string, graphEventId: string): void {
  getDb()
    .prepare(`DELETE FROM calendar_event_details WHERE account_id = ? AND graph_event_id = ?`)
    .run(accountId, graphEventId.trim())
}

export function deleteCalendarEventDetailsForAccount(accountId: string): void {
  getDb().prepare(`DELETE FROM calendar_event_details WHERE account_id = ?`).run(accountId)
}
