import { getDb } from './index'
import type { MailActionType } from '@shared/types'

/**
 * Eintraege in der Audit-/Undo-Tabelle `message_actions`.
 *
 * Das Schema (siehe `schema.ts`) speichert:
 *   id, message_id, account_id, action_type, payload_json, performed_at,
 *   performed_by_account_id, source, undone
 *
 * Wir nutzen die Tabelle aktuell vor allem fuer Undo. Spaeter koennen wir
 * dieselben Daten fuer einen Aktivitaeten-Verlauf / Audit-Log verwenden.
 */

export type { MailActionType }

export interface MailActionPayload {
  ruleId?: number
  ruleName?: string
  /** Vorheriger Wert von isRead (nur fuer set-read). */
  previousIsRead?: boolean
  /** Vorheriger Wert von isFlagged (nur fuer set-flagged). */
  previousIsFlagged?: boolean
  /** Lokale Folder-ID, in der die Mail urspruenglich lag (move/archive/delete/snooze). */
  previousFolderId?: number | null
  /** Remote-Folder-ID, damit wir per Graph-Move wieder zurueck koennen. */
  previousFolderRemoteId?: string | null
  /** Remote-ID der Mail nach dem Move (im Ziel-Ordner). */
  newRemoteId?: string
  /** Wake-Zeitpunkt einer Snooze-Aktion (ISO 8601). */
  snoozedUntil?: string
  /** Snooze-Preset, das gewaehlt wurde (z.B. "tomorrow-morning"). */
  snoozePreset?: string
  /** ToDo-Bucket (Heute / Morgen / Diese Woche / Spaeter / Erledigt). */
  todoDueKind?: string
  /** Faelligkeit fuer ToDo als ISO 8601. */
  todoDueAt?: string | null
  /** Zeilen-ID in `todos` fuer Undo. */
  todoRowId?: number
  /** Vorheriger Bucket vor `change-todo` bzw. vor `remove-todo` (wiederherstellen). */
  previousTodoDueKind?: string | null
  previousTodoDueAt?: string | null
  /** Vorheriger Kalender-Termin (Mail-ToDo). */
  previousTodoStartAt?: string | null
  previousTodoEndAt?: string | null
  /** Waiting-for: erwartete Antwort bis (ISO 8601). */
  waitingUntil?: string | null
  /** Waiting-for: vorheriger Wert vor Aenderung/Entfernen. */
  previousWaitingUntil?: string | null
  /** Tag-Zeile in message_tags (nur add-tag). */
  tag?: string
  /** Ziel-Ordner-ID bei move-message (lokal). */
  targetFolderId?: number
  /** Anzeige-Text fuer die Undo-Toast. */
  label?: string
}

export interface MailActionRecord {
  id: number
  messageId: number | null
  accountId: string | null
  actionType: MailActionType
  payload: MailActionPayload
  performedAt: string
  source: string
  undone: boolean
  ruleId: number | null
}

interface ActionRow {
  id: number
  message_id: number | null
  account_id: string | null
  action_type: string
  payload_json: string | null
  performed_at: string
  source: string
  undone: number
  rule_id: number | null
}

function rowToRecord(r: ActionRow): MailActionRecord {
  let payload: MailActionPayload = {}
  if (r.payload_json) {
    try {
      payload = JSON.parse(r.payload_json) as MailActionPayload
    } catch {
      payload = {}
    }
  }
  return {
    id: r.id,
    messageId: r.message_id,
    accountId: r.account_id,
    actionType: r.action_type as MailActionType,
    payload,
    performedAt: r.performed_at,
    source: r.source,
    undone: !!r.undone,
    ruleId: r.rule_id ?? null
  }
}

export interface RecordActionInput {
  messageId: number | null
  accountId: string | null
  actionType: MailActionType
  payload: MailActionPayload
  source?: string
  ruleId?: number | null
}

export function recordAction(input: RecordActionInput): number {
  const db = getDb()
  const res = db
    .prepare(
      `INSERT INTO message_actions
       (message_id, account_id, action_type, payload_json, performed_at, source, undone, rule_id)
       VALUES (@messageId, @accountId, @actionType, @payload, datetime('now'), @source, 0, @ruleId)`
    )
    .run({
      messageId: input.messageId,
      accountId: input.accountId,
      actionType: input.actionType,
      payload: JSON.stringify(input.payload ?? {}),
      source: input.source ?? 'ui',
      ruleId: input.ruleId ?? null
    })
  return Number(res.lastInsertRowid)
}

/**
 * Liefert die letzte ausgefuehrte Aktion, die noch nicht zurueckgenommen wurde.
 * Optional koennen Aktionstypen eingeschraenkt werden.
 */
export function peekLastUndoable(
  types?: MailActionType[]
): MailActionRecord | null {
  const db = getDb()
  if (types && types.length > 0) {
    const placeholders = types.map(() => '?').join(',')
    const row = db
      .prepare<unknown[], ActionRow>(
        `SELECT * FROM message_actions
         WHERE undone = 0 AND rule_id IS NULL AND action_type IN (${placeholders})
         ORDER BY id DESC LIMIT 1`
      )
      .get(...types)
    return row ? rowToRecord(row) : null
  }
  const row = db
    .prepare<[], ActionRow>(
      `SELECT * FROM message_actions
       WHERE undone = 0 AND rule_id IS NULL
       ORDER BY id DESC LIMIT 1`
    )
    .get()
  return row ? rowToRecord(row) : null
}

export function markUndone(actionId: number): void {
  const db = getDb()
  db.prepare('UPDATE message_actions SET undone = 1 WHERE id = ?').run(actionId)
}

/**
 * Loescht alte abgeschlossene Eintraege, damit die Tabelle nicht ewig waechst.
 * Wir behalten das letzte Eintrag pro Mail erhalten, der Rest wird nach
 * `retentionDays` weggeworfen.
 */
export function pruneOldActions(retentionDays = 30): void {
  const db = getDb()
  db.prepare(
    `DELETE FROM message_actions
     WHERE performed_at < datetime('now', ?)`
  ).run(`-${retentionDays} days`)
}

export function listRecentActions(limit = 50): MailActionRecord[] {
  const db = getDb()
  const rows = db
    .prepare<[number], ActionRow>(
      `SELECT * FROM message_actions ORDER BY id DESC LIMIT ?`
    )
    .all(limit)
  return rows.map(rowToRecord)
}

export function getActionById(id: number): MailActionRecord | null {
  const db = getDb()
  const row = db.prepare<[number], ActionRow>('SELECT * FROM message_actions WHERE id = ?').get(id)
  return row ? rowToRecord(row) : null
}

export function listAutomationInbox(limit = 100): MailActionRecord[] {
  const db = getDb()
  const rows = db
    .prepare<[number], ActionRow>(
      `SELECT * FROM message_actions
       WHERE rule_id IS NOT NULL AND undone = 0
       ORDER BY id DESC
       LIMIT ?`
    )
    .all(limit)
  return rows.map(rowToRecord)
}
