import { getDb } from './index'

/**
 * Entfernt alle lokal synchronisierten Mail-Daten eines Kontos: Nachrichten
 * (inkl. Anhänge, ToDos, Tags, Notizen zu Mails, Cloud-Task-Links),
 * Konversationsthreads, Ordner und Delta-/Watermark-Zustand.
 *
 * Kontoeintrag, People, Kalender und Cloud-Tasks bleiben unberührt.
 * OAuth- und Profilfotos ebenfalls.
 */
export function clearLocalMailSyncDataForAccount(accountId: string): void {
  const db = getDb()
  const tx = db.transaction(() => {
    db.prepare(
      `DELETE FROM mail_rule_executions WHERE message_id IN (
         SELECT id FROM messages WHERE account_id = ?
       )`
    ).run(accountId)
    db.prepare('DELETE FROM message_actions WHERE account_id = ?').run(accountId)
    db.prepare('DELETE FROM messages WHERE account_id = ?').run(accountId)
    db.prepare('DELETE FROM threads WHERE account_id = ?').run(accountId)
    db.prepare('DELETE FROM sync_state WHERE account_id = ?').run(accountId)
    db.prepare('DELETE FROM folders WHERE account_id = ?').run(accountId)
  })
  tx()
}
