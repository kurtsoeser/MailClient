import { getDb } from './db/index'
import type { NoteLinkTargetCandidate } from '@shared/note-entity-links'

export function searchNoteLinkTargets(
  query: string,
  opts?: { excludeNoteId?: number; limit?: number }
): NoteLinkTargetCandidate[] {
  const q = query.trim().toLowerCase()
  const limit = Math.min(Math.max(opts?.limit ?? 30, 1), 80)
  const excludeNoteId = opts?.excludeNoteId
  const out: NoteLinkTargetCandidate[] = []

  const db = getDb()

  const noteSql = excludeNoteId
    ? `SELECT id, title, kind FROM user_notes WHERE id != ?
       ${q ? `AND (LOWER(COALESCE(title,'')) LIKE ? OR LOWER(body) LIKE ?)` : ''}
       ORDER BY updated_at DESC LIMIT ?`
    : `SELECT id, title, kind FROM user_notes
       ${q ? `WHERE LOWER(COALESCE(title,'')) LIKE ? OR LOWER(body) LIKE ?` : ''}
       ORDER BY updated_at DESC LIMIT ?`
  const noteParams = excludeNoteId
    ? q
      ? [excludeNoteId, `%${q}%`, `%${q}%`, limit]
      : [excludeNoteId, limit]
    : q
      ? [`%${q}%`, `%${q}%`, limit]
      : [limit]
  const notes = db.prepare(noteSql).all(...noteParams) as Array<{
    id: number
    title: string | null
    kind: string
  }>
  for (const n of notes) {
    out.push({
      target: { kind: 'note', noteId: n.id },
      title: n.title?.trim() || 'Ohne Titel',
      subtitle: n.kind
    })
  }

  if (q && out.length < limit) {
    const mailLimit = limit - out.length
    const mails = db
      .prepare(
        `SELECT id, subject, from_name, from_addr FROM messages
         WHERE LOWER(COALESCE(subject,'')) LIKE ?
            OR LOWER(COALESCE(from_name,'')) LIKE ?
            OR LOWER(COALESCE(from_addr,'')) LIKE ?
         ORDER BY received_at DESC LIMIT ?`
      )
      .all(`%${q}%`, `%${q}%`, `%${q}%`, mailLimit) as Array<{
      id: number
      subject: string | null
      from_name: string | null
      from_addr: string | null
    }>
    for (const m of mails) {
      out.push({
        target: { kind: 'mail', messageId: m.id },
        title: m.subject?.trim() || '(Kein Betreff)',
        subtitle: m.from_name?.trim() || m.from_addr?.trim() || null
      })
    }
  }

  if (out.length < limit) {
    const evLimit = limit - out.length
    const now = new Date()
    const start = new Date(now)
    start.setMonth(start.getMonth() - 3)
    const end = new Date(now)
    end.setMonth(end.getMonth() + 6)
    const startIso = start.toISOString()
    const endIso = end.toISOString()
    const events = db
      .prepare(
        `SELECT account_id, graph_event_id, title, start_iso FROM calendar_events
         WHERE start_iso < ? AND end_iso > ?
         ${q ? `AND LOWER(COALESCE(title,'')) LIKE ?` : ''}
         ORDER BY start_iso ASC LIMIT ?`
      )
      .all(
        ...(q
          ? [endIso, startIso, `%${q}%`, evLimit]
          : [endIso, startIso, evLimit])
      ) as Array<{
      account_id: string
      graph_event_id: string
      title: string | null
      start_iso: string | null
    }>
    for (const ev of events) {
      out.push({
        target: {
          kind: 'calendar_event',
          accountId: ev.account_id,
          graphEventId: ev.graph_event_id
        },
        title: ev.title?.trim() || 'Termin',
        subtitle: ev.start_iso?.slice(0, 16) ?? null
      })
    }
  }

  if (q && out.length < limit) {
    const taskLimit = limit - out.length
    const tasks = db
      .prepare(
        `SELECT account_id, list_id, task_id, title, due_iso FROM cloud_tasks
         WHERE LOWER(title) LIKE ?
         ORDER BY completed ASC, due_iso IS NULL, due_iso ASC LIMIT ?`
      )
      .all(`%${q}%`, taskLimit) as Array<{
      account_id: string
      list_id: string
      task_id: string
      title: string
      due_iso: string | null
    }>
    for (const t of tasks) {
      out.push({
        target: {
          kind: 'cloud_task',
          accountId: t.account_id,
          listId: t.list_id,
          taskId: t.task_id
        },
        title: t.title?.trim() || 'Aufgabe',
        subtitle: t.due_iso?.slice(0, 10) ?? null
      })
    }
  }

  return out.slice(0, limit)
}
