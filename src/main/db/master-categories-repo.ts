import { getDb } from './index'
import type { MailMasterCategory } from '@shared/types'

export function upsertMasterCategories(accountId: string, categories: MailMasterCategory[]): void {
  const db = getDb()
  const keepIds = new Set(categories.map((c) => c.id))
  const tx = db.transaction(() => {
    const existing = db
      .prepare(`SELECT category_id FROM master_categories WHERE account_id = ?`)
      .all(accountId) as Array<{ category_id: string }>
    const del = db.prepare(
      `DELETE FROM master_categories WHERE account_id = ? AND category_id = ?`
    )
    for (const row of existing) {
      if (!keepIds.has(row.category_id)) {
        del.run(accountId, row.category_id)
      }
    }
    const stmt = db.prepare(
      `INSERT INTO master_categories (account_id, category_id, display_name, color, synced_at)
       VALUES (@account_id, @category_id, @display_name, @color, datetime('now'))
       ON CONFLICT(account_id, category_id) DO UPDATE SET
         display_name = excluded.display_name,
         color = excluded.color,
         synced_at = datetime('now')`
    )
    for (const c of categories) {
      stmt.run({
        account_id: accountId,
        category_id: c.id,
        display_name: c.displayName,
        color: c.color
      })
    }
    db.prepare(
      `INSERT INTO master_categories_sync_state (account_id, last_synced_at)
       VALUES (?, datetime('now'))
       ON CONFLICT(account_id) DO UPDATE SET last_synced_at = datetime('now')`
    ).run(accountId)
  })
  tx()
}

export function listMasterCategoriesFromCache(accountId: string): MailMasterCategory[] {
  const rows = getDb()
    .prepare(
      `SELECT category_id, display_name, color FROM master_categories
       WHERE account_id = ?
       ORDER BY display_name COLLATE NOCASE ASC`
    )
    .all(accountId) as Array<{ category_id: string; display_name: string; color: string }>
  return rows.map((r) => ({
    id: r.category_id,
    displayName: r.display_name,
    color: r.color
  }))
}

export function getMasterCategoriesSyncState(accountId: string): string | null {
  const row = getDb()
    .prepare(`SELECT last_synced_at FROM master_categories_sync_state WHERE account_id = ?`)
    .get(accountId) as { last_synced_at: string } | undefined
  return row?.last_synced_at ?? null
}

export function isMasterCategoriesSyncFresh(accountId: string, staleMs: number): boolean {
  const at = getMasterCategoriesSyncState(accountId)
  if (!at) return false
  const t = Date.parse(at)
  if (Number.isNaN(t)) return false
  return Date.now() - t < staleMs
}

export function invalidateMasterCategoriesSyncState(accountId: string): void {
  getDb().prepare(`DELETE FROM master_categories_sync_state WHERE account_id = ?`).run(accountId)
}

export function deleteMasterCategoriesDataForAccount(accountId: string): void {
  const db = getDb()
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM master_categories WHERE account_id = ?').run(accountId)
    db.prepare('DELETE FROM master_categories_sync_state WHERE account_id = ?').run(accountId)
  })
  tx()
}
