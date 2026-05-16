import { readJsonSecure, writeJsonSecure } from '../secure-store'

const STORE_KEY = 'google_sync_meta'

export interface GoogleSyncMeta {
  /** Gmail users.history.startHistoryId (string). */
  gmailHistoryIdByAccount: Record<string, string>
  /** Pro Konto: Kalender-ID -> events.list syncToken. */
  calendarEventSyncTokenByAccount: Record<string, Record<string, string>>
}

export async function loadGoogleSyncMeta(): Promise<GoogleSyncMeta> {
  const raw = await readJsonSecure<Partial<GoogleSyncMeta>>(STORE_KEY, {})
  return {
    gmailHistoryIdByAccount: raw.gmailHistoryIdByAccount ?? {},
    calendarEventSyncTokenByAccount: raw.calendarEventSyncTokenByAccount ?? {}
  }
}

export async function saveGoogleSyncMeta(meta: GoogleSyncMeta): Promise<void> {
  await writeJsonSecure(STORE_KEY, meta)
}

export async function updateGmailHistoryId(accountId: string, historyId: string): Promise<void> {
  const meta = await loadGoogleSyncMeta()
  meta.gmailHistoryIdByAccount[accountId] = historyId
  await saveGoogleSyncMeta(meta)
}

export async function getGmailHistoryId(accountId: string): Promise<string | null> {
  const meta = await loadGoogleSyncMeta()
  return meta.gmailHistoryIdByAccount[accountId] ?? null
}

export async function setCalendarEventsSyncToken(
  accountId: string,
  calendarId: string,
  syncToken: string | null
): Promise<void> {
  const meta = await loadGoogleSyncMeta()
  if (!meta.calendarEventSyncTokenByAccount[accountId]) {
    meta.calendarEventSyncTokenByAccount[accountId] = {}
  }
  if (syncToken == null || syncToken === '') {
    delete meta.calendarEventSyncTokenByAccount[accountId]![calendarId]
  } else {
    meta.calendarEventSyncTokenByAccount[accountId]![calendarId] = syncToken
  }
  await saveGoogleSyncMeta(meta)
}

export async function getCalendarEventsSyncToken(
  accountId: string,
  calendarId: string
): Promise<string | null> {
  const meta = await loadGoogleSyncMeta()
  return meta.calendarEventSyncTokenByAccount[accountId]?.[calendarId] ?? null
}

export async function clearGoogleSyncMetaForAccount(accountId: string): Promise<void> {
  const meta = await loadGoogleSyncMeta()
  delete meta.gmailHistoryIdByAccount[accountId]
  delete meta.calendarEventSyncTokenByAccount[accountId]
  await saveGoogleSyncMeta(meta)
}

/** Nur Gmail-Mail-History-Cursor — Kalender-SyncToken bleiben erhalten. */
export async function clearGmailMailHistoryCursorForAccount(accountId: string): Promise<void> {
  const meta = await loadGoogleSyncMeta()
  delete meta.gmailHistoryIdByAccount[accountId]
  await saveGoogleSyncMeta(meta)
}
