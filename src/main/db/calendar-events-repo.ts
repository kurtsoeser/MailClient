import { getDb } from './index'
import type {
  CalendarEventView,
  CalendarIncludeCalendarRef,
  ConnectedAccount
} from '@shared/types'

interface CalendarEventDbRow {
  id: string
  account_id: string
  source: string
  graph_event_id: string
  graph_calendar_id: string | null
  account_email: string
  account_color_class: string
  title: string
  start_iso: string
  end_iso: string
  is_all_day: number
  location: string | null
  web_link: string | null
  join_url: string | null
  organizer: string | null
  categories_json: string | null
  display_color_hex: string | null
  calendar_can_edit: number | null
  icon_id: string | null
}

export interface CalendarSyncStateRow {
  accountId: string
  windowStartIso: string
  windowEndIso: string
  lastSyncedAt: string
}

function parseCategoriesJson(raw: string | null): string[] | undefined {
  if (!raw?.trim()) return undefined
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return undefined
    const names = parsed.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    return names.length > 0 ? names : undefined
  } catch {
    return undefined
  }
}

function rowToView(r: CalendarEventDbRow): CalendarEventView {
  return {
    id: r.id,
    source: r.source as 'microsoft' | 'google',
    accountId: r.account_id,
    accountEmail: r.account_email,
    accountColorClass: r.account_color_class,
    displayColorHex: r.display_color_hex,
    graphCalendarId: r.graph_calendar_id,
    graphEventId: r.graph_event_id,
    title: r.title,
    startIso: r.start_iso,
    endIso: r.end_iso,
    isAllDay: r.is_all_day === 1,
    location: r.location,
    webLink: r.web_link,
    joinUrl: r.join_url,
    organizer: r.organizer,
    categories: parseCategoriesJson(r.categories_json),
    calendarCanEdit: r.calendar_can_edit == null ? undefined : r.calendar_can_edit === 1,
    icon: r.icon_id?.trim() ? r.icon_id.trim() : null
  }
}

export function patchCalendarEventIcon(
  accountId: string,
  graphEventId: string,
  iconId: string | null
): void {
  getDb()
    .prepare(
      `UPDATE calendar_events
       SET icon_id = ?, synced_at = datetime('now')
       WHERE account_id = ? AND graph_event_id = ?`
    )
    .run(iconId?.trim() || null, accountId, graphEventId.trim())
}

function categoriesToJson(categories: string[] | undefined): string | null {
  if (!categories?.length) return null
  return JSON.stringify(categories)
}

const UPSERT_EVENT = `
  INSERT INTO calendar_events (
    id, account_id, source, graph_event_id, graph_calendar_id,
    account_email, account_color_class, title, start_iso, end_iso, is_all_day,
    location, web_link, join_url, organizer, categories_json, display_color_hex,
    calendar_can_edit, synced_at
  ) VALUES (
    @id, @account_id, @source, @graph_event_id, @graph_calendar_id,
    @account_email, @account_color_class, @title, @start_iso, @end_iso, @is_all_day,
    @location, @web_link, @join_url, @organizer, @categories_json, @display_color_hex,
    @calendar_can_edit, datetime('now')
  )
  ON CONFLICT(id) DO UPDATE SET
    graph_calendar_id = excluded.graph_calendar_id,
    account_email = excluded.account_email,
    account_color_class = excluded.account_color_class,
    title = excluded.title,
    start_iso = excluded.start_iso,
    end_iso = excluded.end_iso,
    is_all_day = excluded.is_all_day,
    location = excluded.location,
    web_link = excluded.web_link,
    join_url = excluded.join_url,
    organizer = excluded.organizer,
    categories_json = excluded.categories_json,
    display_color_hex = excluded.display_color_hex,
    calendar_can_edit = excluded.calendar_can_edit,
    synced_at = datetime('now')
`

export function upsertCalendarEvents(events: CalendarEventView[]): void {
  if (events.length === 0) return
  const db = getDb()
  const stmt = db.prepare(UPSERT_EVENT)
  const tx = db.transaction((rows: CalendarEventView[]) => {
    for (const ev of rows) {
      const graphEventId = ev.graphEventId?.trim() || ev.id.split(':').slice(1).join(':')
      if (!graphEventId) continue
      stmt.run({
        id: ev.id,
        account_id: ev.accountId,
        source: ev.source,
        graph_event_id: graphEventId,
        graph_calendar_id: ev.graphCalendarId?.trim() || null,
        account_email: ev.accountEmail,
        account_color_class: ev.accountColorClass,
        title: ev.title,
        start_iso: ev.startIso,
        end_iso: ev.endIso,
        is_all_day: ev.isAllDay ? 1 : 0,
        location: ev.location,
        web_link: ev.webLink,
        join_url: ev.joinUrl,
        organizer: ev.organizer,
        categories_json: categoriesToJson(ev.categories),
        display_color_hex: ev.displayColorHex ?? null,
        calendar_can_edit:
          ev.calendarCanEdit === undefined ? null : ev.calendarCanEdit ? 1 : 0
      })
    }
  })
  tx(events)
}

export function deleteCalendarEvent(accountId: string, graphEventId: string): void {
  const db = getDb()
  db.prepare(
    `DELETE FROM calendar_events WHERE account_id = ? AND graph_event_id = ?`
  ).run(accountId, graphEventId.trim())
}

export function listCalendarEventsInRange(
  startIso: string,
  endIso: string,
  includeCalendars?: CalendarIncludeCalendarRef[] | null
): CalendarEventView[] {
  const db = getDb()
  const params: Record<string, string> = { startIso, endIso }
  let calFilter = ''
  if (Array.isArray(includeCalendars)) {
    if (includeCalendars.length === 0) return []
    const tuples: string[] = []
    includeCalendars.forEach((ref, i) => {
      const cid = ref.graphCalendarId?.trim()
      if (!cid) return
      const ak = `a${i}`
      const ck = `c${i}`
      params[ak] = ref.accountId
      params[ck] = cid
      tuples.push(`(account_id = @${ak} AND graph_calendar_id = @${ck})`)
    })
    if (tuples.length === 0) return []
    calFilter = ` AND (${tuples.join(' OR ')})`
  }

  const rows = db
    .prepare(
      `SELECT id, account_id, source, graph_event_id, graph_calendar_id,
              account_email, account_color_class, title, start_iso, end_iso, is_all_day,
              location, web_link, join_url, organizer, categories_json, display_color_hex,
              calendar_can_edit, icon_id
       FROM calendar_events
       WHERE start_iso < @endIso AND end_iso > @startIso${calFilter}
       ORDER BY start_iso ASC`
    )
    .all(params) as CalendarEventDbRow[]
  return rows.map(rowToView)
}

/** Entfernt Termine im Fenster, die beim letzten Abruf nicht mehr geliefert wurden. */
export function pruneCalendarEventsInRange(
  accountId: string,
  startIso: string,
  endIso: string,
  calendarIds: string[],
  keepGraphEventIds: Set<string>
): void {
  if (calendarIds.length === 0) return
  const db = getDb()
  const calPlaceholders = calendarIds.map(() => '?').join(', ')
  const rows = db
    .prepare(
      `SELECT graph_event_id FROM calendar_events
       WHERE account_id = ?
         AND graph_calendar_id IN (${calPlaceholders})
         AND start_iso < ? AND end_iso > ?`
    )
    .all(accountId, ...calendarIds, endIso, startIso) as Array<{ graph_event_id: string }>

  const del = db.prepare(
    `DELETE FROM calendar_events WHERE account_id = ? AND graph_event_id = ?`
  )
  const tx = db.transaction(() => {
    for (const r of rows) {
      if (!keepGraphEventIds.has(r.graph_event_id)) {
        del.run(accountId, r.graph_event_id)
      }
    }
  })
  tx()
}

export function getCalendarSyncState(accountId: string): CalendarSyncStateRow | null {
  const db = getDb()
  const row = db
    .prepare(
      `SELECT account_id, window_start_iso, window_end_iso, last_synced_at
       FROM calendar_sync_state WHERE account_id = ?`
    )
    .get(accountId) as
    | {
        account_id: string
        window_start_iso: string
        window_end_iso: string
        last_synced_at: string
      }
    | undefined
  if (!row) return null
  return {
    accountId: row.account_id,
    windowStartIso: row.window_start_iso,
    windowEndIso: row.window_end_iso,
    lastSyncedAt: row.last_synced_at
  }
}

export function mergeCalendarSyncWindow(
  accountId: string,
  startIso: string,
  endIso: string
): void {
  const db = getDb()
  const existing = getCalendarSyncState(accountId)
  const start = existing
    ? startIso < existing.windowStartIso
      ? startIso
      : existing.windowStartIso
    : startIso
  const end = existing
    ? endIso > existing.windowEndIso
      ? endIso
      : existing.windowEndIso
    : endIso
  db.prepare(
    `INSERT INTO calendar_sync_state (account_id, window_start_iso, window_end_iso, last_synced_at)
     VALUES (@account_id, @window_start_iso, @window_end_iso, datetime('now'))
     ON CONFLICT(account_id) DO UPDATE SET
       window_start_iso = @window_start_iso,
       window_end_iso = @window_end_iso,
       last_synced_at = datetime('now')`
  ).run({
    account_id: accountId,
    window_start_iso: start,
    window_end_iso: end
  })
}

export function isCalendarRangeCoveredBySync(
  accountIds: string[],
  startIso: string,
  endIso: string
): boolean {
  if (accountIds.length === 0) return true
  for (const accountId of accountIds) {
    const st = getCalendarSyncState(accountId)
    if (!st) return false
    if (startIso < st.windowStartIso || endIso > st.windowEndIso) return false
  }
  return true
}

export function getCalendarSyncStalestMs(accountIds: string[]): number | null {
  if (accountIds.length === 0) return null
  let oldest: number | null = null
  const now = Date.now()
  for (const accountId of accountIds) {
    const st = getCalendarSyncState(accountId)
    if (!st) return null
    const t = Date.parse(st.lastSyncedAt)
    if (Number.isNaN(t)) return null
    const age = now - t
    if (oldest == null || age > oldest) oldest = age
  }
  return oldest
}

export function deleteCalendarDataForAccount(accountId: string): void {
  const db = getDb()
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM calendar_events WHERE account_id = ?').run(accountId)
    db.prepare('DELETE FROM calendar_sync_state WHERE account_id = ?').run(accountId)
  })
  tx()
}

export function listLinkedCalendarAccountIds(accounts: ConnectedAccount[]): string[] {
  return accounts
    .filter((a) => a.provider === 'microsoft' || a.provider === 'google')
    .map((a) => a.id)
}
