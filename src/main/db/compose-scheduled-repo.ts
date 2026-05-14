import { getDb } from './index'
import type { ComposeSendInput } from '@shared/types'

export interface ComposeScheduledRow {
  id: number
  payloadJson: string
  sendAtIso: string
  createdAt: string
  status: 'pending' | 'sent' | 'failed'
  attempts: number
  lastError: string | null
}

function rowFromDb(r: {
  id: number
  payload_json: string
  send_at_iso: string
  created_at: string
  status: string
  attempts: number
  last_error: string | null
}): ComposeScheduledRow {
  return {
    id: r.id,
    payloadJson: r.payload_json,
    sendAtIso: r.send_at_iso,
    createdAt: r.created_at,
    status: r.status as ComposeScheduledRow['status'],
    attempts: r.attempts,
    lastError: r.last_error
  }
}

export function insertScheduledCompose(payload: ComposeSendInput, sendAtIso: string): number {
  const db = getDb()
  const json = JSON.stringify(payload)
  if (json.length > 12 * 1024 * 1024) {
    throw new Error('Nachricht zu gross fuer geplanten Versand (Anhaenge reduzieren).')
  }
  const res = db
    .prepare(
      `INSERT INTO compose_scheduled (payload_json, send_at_iso, status)
       VALUES (@payload_json, @send_at_iso, 'pending')`
    )
    .run({ payload_json: json, send_at_iso: sendAtIso })
  return Number(res.lastInsertRowid)
}

export function listDueScheduledCompose(limit = 8): ComposeScheduledRow[] {
  const db = getDb()
  const now = new Date().toISOString()
  const rows = db
    .prepare(
      `SELECT id, payload_json, send_at_iso, created_at, status, attempts, last_error
       FROM compose_scheduled
       WHERE status = 'pending' AND send_at_iso <= ?
       ORDER BY send_at_iso ASC
       LIMIT ?`
    )
    .all(now, limit) as Array<{
      id: number
      payload_json: string
      send_at_iso: string
      created_at: string
      status: string
      attempts: number
      last_error: string | null
    }>
  return rows.map(rowFromDb)
}

export function markScheduledComposeSent(id: number): void {
  const db = getDb()
  db.prepare(`UPDATE compose_scheduled SET status = 'sent', last_error = NULL WHERE id = ?`).run(id)
}

export function markScheduledComposeInvalidPayload(id: number, err: string): void {
  const db = getDb()
  db.prepare(
    `UPDATE compose_scheduled SET status = 'failed', last_error = @msg WHERE id = @id`
  ).run({ id, msg: err.slice(0, 2000) })
}

const MAX_SCHEDULED_SEND_ATTEMPTS = 5

/** Erhoeht `attempts`, setzt `last_error`, und bei zu vielen Versuchen `status=failed`. */
export function recordScheduledComposeSendFailure(id: number, err: string): void {
  const db = getDb()
  const msg = err.slice(0, 2000)
  db.prepare(
    `UPDATE compose_scheduled
     SET attempts = attempts + 1, last_error = @msg
     WHERE id = @id`
  ).run({ id, msg })
  const row = db.prepare(`SELECT attempts FROM compose_scheduled WHERE id = ?`).get(id) as
    | { attempts: number }
    | undefined
  if (row && row.attempts >= MAX_SCHEDULED_SEND_ATTEMPTS) {
    db.prepare(`UPDATE compose_scheduled SET status = 'failed' WHERE id = ?`).run(id)
  }
}
