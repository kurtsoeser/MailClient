import { getDb } from './index'
import type { MailFull, MailListItem } from '@shared/types'

export function addMessageTag(messageId: number, accountId: string, tag: string): boolean {
  const t = tag.trim()
  if (!t) return false
  const db = getDb()
  const r = db
    .prepare(
      `INSERT OR IGNORE INTO message_tags (message_id, account_id, tag) VALUES (?, ?, ?)`
    )
    .run(messageId, accountId, t)
  return r.changes > 0
}

export function removeMessageTag(messageId: number, tag: string): void {
  const db = getDb()
  db.prepare('DELETE FROM message_tags WHERE message_id = ? AND tag = ?').run(messageId, tag.trim())
}

/** Ersetzt alle Kategorie-Tags einer Mail (Reihenfolge wie uebergeben). */
export function replaceMessageTags(messageId: number, accountId: string, tags: string[]): void {
  const normalized = Array.from(
    new Set(tags.map((t) => t.trim()).filter((t) => t.length > 0))
  )
  const db = getDb()
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM message_tags WHERE message_id = ?').run(messageId)
    const ins = db.prepare(
      'INSERT OR IGNORE INTO message_tags (message_id, account_id, tag) VALUES (?, ?, ?)'
    )
    for (const t of normalized) {
      ins.run(messageId, accountId, t)
    }
  })
  tx()
}

export function listTagsForMessage(messageId: number): string[] {
  const db = getDb()
  const rows = db.prepare<[number], { tag: string }>('SELECT tag FROM message_tags WHERE message_id = ? ORDER BY tag').all(messageId)
  return rows.map((r) => r.tag)
}

export function listTagsGroupedByMessageIds(messageIds: number[]): Map<number, string[]> {
  const out = new Map<number, string[]>()
  if (messageIds.length === 0) return out
  const uniq = Array.from(new Set(messageIds))
  const db = getDb()
  const ph = uniq.map(() => '?').join(',')
  const rows = db
    .prepare<unknown[], { message_id: number; tag: string }>(
      `SELECT message_id, tag FROM message_tags WHERE message_id IN (${ph}) ORDER BY message_id, tag`
    )
    .all(...uniq)
  for (const r of rows) {
    const arr = out.get(r.message_id) ?? []
    arr.push(r.tag)
    out.set(r.message_id, arr)
  }
  return out
}

/** Bereits verwendete Tag-Namen eines Kontos (z. B. Vorschlaege ohne Outlook-Masterliste). */
export function listDistinctTagsForAccount(accountId: string, limit = 80): string[] {
  const db = getDb()
  const lim = Math.min(Math.max(1, limit), 200)
  const rows = db
    .prepare<[string, number], { tag: string }>(
      `SELECT DISTINCT t.tag AS tag
       FROM message_tags t
       INNER JOIN messages m ON m.id = t.message_id
       WHERE m.account_id = ?
       ORDER BY t.tag
       LIMIT ?`
    )
    .all(accountId, lim)
  return rows.map((r) => r.tag)
}

export function attachCategoriesToMailItems<T extends MailListItem>(items: T[]): T[] {
  if (items.length === 0) return items
  const map = listTagsGroupedByMessageIds(items.map((i) => i.id))
  return items.map((m) => ({
    ...m,
    categories: map.get(m.id) ?? []
  }))
}

export function attachCategoriesToFull(msg: MailFull | null): MailFull | null {
  if (!msg) return null
  return { ...msg, categories: listTagsForMessage(msg.id) }
}

export function messageHasTag(messageId: number, tag: string): boolean {
  const db = getDb()
  const row = db
    .prepare<[number, string], { c: number }>(
      'SELECT 1 as c FROM message_tags WHERE message_id = ? AND tag = ? LIMIT 1'
    )
    .get(messageId, tag.trim())
  return !!row
}
