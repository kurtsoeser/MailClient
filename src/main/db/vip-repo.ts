import { getDb } from './index'
import type { MailFull, MailListItem } from '@shared/types'

export function normalizeEmailForVip(addr: string): string {
  let s = addr.trim().toLowerCase()
  const m = s.match(/<([^>]+)>/)
  if (m) s = m[1]!.trim().toLowerCase()
  return s
}

export function listVipEmailsForAccount(accountId: string): string[] {
  const db = getDb()
  const rows = db
    .prepare<[string], { email_lower: string }>(
      'SELECT email_lower FROM vip_senders WHERE account_id = ? ORDER BY email_lower ASC'
    )
    .all(accountId)
  return rows.map((r) => r.email_lower)
}

export function listAllVipRows(): { accountId: string; emailLower: string }[] {
  const db = getDb()
  return db
    .prepare<[], { account_id: string; email_lower: string }>(
      'SELECT account_id, email_lower FROM vip_senders ORDER BY account_id, email_lower'
    )
    .all()
    .map((r) => ({ accountId: r.account_id, emailLower: r.email_lower }))
}

export function addVipSender(accountId: string, email: string): void {
  const norm = normalizeEmailForVip(email)
  if (!norm.includes('@')) return
  const db = getDb()
  db.prepare(
    `INSERT OR IGNORE INTO vip_senders (account_id, email_lower) VALUES (?, ?)`
  ).run(accountId, norm)
}

export function removeVipSender(accountId: string, email: string): void {
  const norm = normalizeEmailForVip(email)
  const db = getDb()
  db.prepare(`DELETE FROM vip_senders WHERE account_id = ? AND email_lower = ?`).run(
    accountId,
    norm
  )
}

/** Ersetzt die VIP-Liste vollstaendig (z. B. Einstellungen-Import). */
export function replaceAllVipSenders(rows: { accountId: string; emailLower: string }[]): void {
  const db = getDb()
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM vip_senders').run()
    const ins = db.prepare(
      'INSERT OR IGNORE INTO vip_senders (account_id, email_lower) VALUES (?, ?)'
    )
    for (const r of rows) {
      const e = r.emailLower.trim().toLowerCase()
      if (!e.includes('@')) continue
      ins.run(r.accountId.trim(), e)
    }
  })
  tx()
}

function vipKeySet(): Set<string> {
  const rows = listAllVipRows()
  return new Set(rows.map((r) => `${r.accountId}\t${r.emailLower}`))
}

export function attachVipFlagsToMailItems<T extends MailListItem>(items: T[]): T[] {
  const set = vipKeySet()
  return items.map((m) => {
    const norm = m.fromAddr ? normalizeEmailForVip(m.fromAddr) : ''
    const isVip = norm.includes('@') && set.has(`${m.accountId}\t${norm}`)
    return { ...m, isVipSender: isVip }
  })
}

export function attachVipFlagToFull(msg: MailFull | null): MailFull | null {
  if (!msg) return null
  const set = vipKeySet()
  const norm = msg.fromAddr ? normalizeEmailForVip(msg.fromAddr) : ''
  const isVip = norm.includes('@') && set.has(`${msg.accountId}\t${norm}`)
  return { ...msg, isVipSender: isVip }
}

export function isVipSender(accountId: string, fromAddr: string | null): boolean {
  if (!fromAddr) return false
  const norm = normalizeEmailForVip(fromAddr)
  const db = getDb()
  const row = db
    .prepare<[string, string], { c: number }>(
      'SELECT COUNT(*) as c FROM vip_senders WHERE account_id = ? AND email_lower = ?'
    )
    .get(accountId, norm)
  return (row?.c ?? 0) > 0
}
