import { getDb } from './index'
import type {
  CalendarGraphCalendarRow,
  CalendarM365GroupCalendarsPage,
  SettingsBackupCalendarColorOverrideSnapshot
} from '@shared/types'
import { normalizeGraphHexColor } from '@shared/graph-calendar-colors'

interface CalendarFolderDbRow {
  account_id: string
  calendar_id: string
  name: string
  is_default: number
  color: string | null
  hex_color: string | null
  display_color_override_hex: string | null
  can_edit: number | null
  provider: string
  access_role: string | null
  calendar_kind: string
  group_sort_index: number | null
}

function rowToCalendarFolder(r: CalendarFolderDbRow): CalendarGraphCalendarRow {
  return {
    id: r.calendar_id,
    name: r.name,
    isDefaultCalendar: r.is_default === 1,
    color: r.color,
    hexColor: r.hex_color,
    displayColorOverrideHex: r.display_color_override_hex,
    canEdit: r.can_edit == null ? undefined : r.can_edit === 1,
    provider: r.provider as 'microsoft' | 'google',
    accessRole: r.access_role,
    calendarKind: r.calendar_kind === 'm365Group' ? 'm365Group' : 'standard'
  }
}

const UPSERT_FOLDER = `
  INSERT INTO calendar_folders (
    account_id, calendar_id, name, is_default, color, hex_color, can_edit,
    provider, access_role, calendar_kind, group_sort_index, synced_at
  ) VALUES (
    @account_id, @calendar_id, @name, @is_default, @color, @hex_color, @can_edit,
    @provider, @access_role, @calendar_kind, @group_sort_index, datetime('now')
  )
  ON CONFLICT(account_id, calendar_id) DO UPDATE SET
    name = excluded.name,
    is_default = excluded.is_default,
    color = excluded.color,
    hex_color = excluded.hex_color,
    can_edit = excluded.can_edit,
    provider = excluded.provider,
    access_role = excluded.access_role,
    calendar_kind = excluded.calendar_kind,
    group_sort_index = excluded.group_sort_index,
    synced_at = datetime('now'),
    display_color_override_hex = calendar_folders.display_color_override_hex
`

export function upsertCalendarFolders(
  accountId: string,
  rows: CalendarGraphCalendarRow[],
  kind: 'standard' | 'm365Group',
  sortOffset = 0
): void {
  if (rows.length === 0) return
  const db = getDb()
  const stmt = db.prepare(UPSERT_FOLDER)
  const tx = db.transaction((list: CalendarGraphCalendarRow[]) => {
    list.forEach((cal, i) => {
      stmt.run({
        account_id: accountId,
        calendar_id: cal.id,
        name: cal.name,
        is_default: cal.isDefaultCalendar ? 1 : 0,
        color: cal.color ?? null,
        hex_color: cal.hexColor ?? null,
        can_edit: cal.canEdit === undefined ? null : cal.canEdit ? 1 : 0,
        provider: cal.provider ?? 'microsoft',
        access_role: cal.accessRole ?? null,
        calendar_kind: kind,
        group_sort_index: kind === 'm365Group' ? sortOffset + i : null
      })
    })
  })
  tx(rows)
}

export function replaceStandardCalendarFolders(
  accountId: string,
  rows: CalendarGraphCalendarRow[]
): void {
  const db = getDb()
  const tx = db.transaction(() => {
    const keepIds = new Set(rows.map((r) => r.id))
    const existing = db
      .prepare(
        `SELECT calendar_id FROM calendar_folders
         WHERE account_id = ? AND calendar_kind = 'standard'`
      )
      .all(accountId) as { calendar_id: string }[]
    for (const row of existing) {
      if (!keepIds.has(row.calendar_id)) {
        db.prepare(
          `DELETE FROM calendar_folders WHERE account_id = ? AND calendar_id = ?`
        ).run(accountId, row.calendar_id)
      }
    }
    upsertCalendarFolders(accountId, rows, 'standard')
  })
  tx()
}

export function replaceM365GroupCalendarFolders(accountId: string, rows: CalendarGraphCalendarRow[]): void {
  const db = getDb()
  const tx = db.transaction(() => {
    const keepIds = new Set(rows.map((r) => r.id))
    const existing = db
      .prepare(
        `SELECT calendar_id FROM calendar_folders
         WHERE account_id = ? AND calendar_kind = 'm365Group'`
      )
      .all(accountId) as { calendar_id: string }[]
    for (const row of existing) {
      if (!keepIds.has(row.calendar_id)) {
        db.prepare(
          `DELETE FROM calendar_folders WHERE account_id = ? AND calendar_id = ?`
        ).run(accountId, row.calendar_id)
      }
    }
    upsertCalendarFolders(accountId, rows, 'm365Group', 0)
  })
  tx()
}

export function listStandardCalendarFoldersFromCache(accountId: string): CalendarGraphCalendarRow[] {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT account_id, calendar_id, name, is_default, color, hex_color,
              display_color_override_hex, can_edit,
              provider, access_role, calendar_kind, group_sort_index
       FROM calendar_folders
       WHERE account_id = ? AND calendar_kind = 'standard'
       ORDER BY is_default DESC, name COLLATE NOCASE ASC`
    )
    .all(accountId) as CalendarFolderDbRow[]
  return rows.map(rowToCalendarFolder)
}

export function listM365GroupCalendarFoldersPageFromCache(
  accountId: string,
  offset: number,
  limit: number
): CalendarM365GroupCalendarsPage {
  const db = getDb()
  const st = getCalendarFoldersSyncState(accountId)
  const totalGroups = st?.m365GroupsTotal ?? 0
  const o = Math.max(0, offset)
  const lim = Math.max(1, limit)
  const rows = db
    .prepare(
      `SELECT account_id, calendar_id, name, is_default, color, hex_color,
              display_color_override_hex, can_edit,
              provider, access_role, calendar_kind, group_sort_index
       FROM calendar_folders
       WHERE account_id = ? AND calendar_kind = 'm365Group'
       ORDER BY group_sort_index ASC
       LIMIT ? OFFSET ?`
    )
    .all(accountId, lim, o) as CalendarFolderDbRow[]
  return {
    calendars: rows.map(rowToCalendarFolder),
    totalGroups,
    offset: o,
    limit: lim,
    hasMore: o + lim < totalGroups
  }
}

export function countM365GroupCalendarFolders(accountId: string): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) as c FROM calendar_folders
       WHERE account_id = ? AND calendar_kind = 'm365Group'`
    )
    .get(accountId) as { c: number }
  return row?.c ?? 0
}

export interface CalendarFoldersSyncStateRow {
  accountId: string
  lastSyncedAt: string
  m365GroupsTotal: number | null
}

export function getCalendarFoldersSyncState(accountId: string): CalendarFoldersSyncStateRow | null {
  const row = getDb()
    .prepare(
      `SELECT account_id, last_synced_at, m365_groups_total
       FROM calendar_folders_sync_state WHERE account_id = ?`
    )
    .get(accountId) as
    | { account_id: string; last_synced_at: string; m365_groups_total: number | null }
    | undefined
  if (!row) return null
  return {
    accountId: row.account_id,
    lastSyncedAt: row.last_synced_at,
    m365GroupsTotal: row.m365_groups_total
  }
}

export function touchCalendarFoldersSyncState(
  accountId: string,
  m365GroupsTotal?: number | null
): void {
  getDb()
    .prepare(
      `INSERT INTO calendar_folders_sync_state (account_id, last_synced_at, m365_groups_total)
       VALUES (@account_id, datetime('now'), @m365_groups_total)
       ON CONFLICT(account_id) DO UPDATE SET
         last_synced_at = datetime('now'),
         m365_groups_total = COALESCE(excluded.m365_groups_total, calendar_folders_sync_state.m365_groups_total)`
    )
    .run({
      account_id: accountId,
      m365_groups_total: m365GroupsTotal ?? null
    })
}

export function isCalendarFoldersSyncFresh(accountId: string, staleMs: number): boolean {
  const st = getCalendarFoldersSyncState(accountId)
  if (!st) return false
  const t = Date.parse(st.lastSyncedAt)
  if (Number.isNaN(t)) return false
  return Date.now() - t < staleMs
}

export function setCalendarFolderDisplayColorOverride(
  accountId: string,
  calendarId: string,
  hex: string | null
): void {
  const db = getDb()
  const normalized = hex == null || hex.trim() === '' ? null : normalizeGraphHexColor(hex)
  db.prepare(
    `UPDATE calendar_folders
     SET display_color_override_hex = @hex
     WHERE account_id = @account_id AND calendar_id = @calendar_id`
  ).run({
    account_id: accountId,
    calendar_id: calendarId,
    hex: normalized
  })
}

export function listCalendarColorOverridesForSettingsBackup(): SettingsBackupCalendarColorOverrideSnapshot[] {
  const rows = getDb()
    .prepare(
      `SELECT account_id, calendar_id, display_color_override_hex
       FROM calendar_folders
       WHERE display_color_override_hex IS NOT NULL AND TRIM(display_color_override_hex) != ''
       ORDER BY account_id, calendar_id`
    )
    .all() as Array<{
    account_id: string
    calendar_id: string
    display_color_override_hex: string
  }>
  return rows.map((r) => ({
    accountId: r.account_id,
    calendarId: r.calendar_id,
    displayColorOverrideHex: r.display_color_override_hex
  }))
}

export function applyCalendarColorOverridesFromBackup(
  rows: SettingsBackupCalendarColorOverrideSnapshot[]
): void {
  for (const row of rows) {
    const accountId = row.accountId?.trim()
    const calendarId = row.calendarId?.trim()
    if (!accountId || !calendarId) continue
    setCalendarFolderDisplayColorOverride(
      accountId,
      calendarId,
      row.displayColorOverrideHex
    )
  }
}

export function deleteCalendarFoldersDataForAccount(accountId: string): void {
  const db = getDb()
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM calendar_folders WHERE account_id = ?').run(accountId)
    db.prepare('DELETE FROM calendar_folders_sync_state WHERE account_id = ?').run(accountId)
  })
  tx()
}
