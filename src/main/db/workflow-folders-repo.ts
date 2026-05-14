import { getDb } from './index'

export interface AccountWorkflowMailFoldersRow {
  accountId: string
  wipFolderRemoteId: string | null
  doneFolderRemoteId: string | null
}

interface Row {
  account_id: string
  wip_folder_remote_id: string | null
  done_folder_remote_id: string | null
}

function mapRow(r: Row): AccountWorkflowMailFoldersRow {
  return {
    accountId: r.account_id,
    wipFolderRemoteId: r.wip_folder_remote_id,
    doneFolderRemoteId: r.done_folder_remote_id
  }
}

export function getAccountWorkflowMailFolders(accountId: string): AccountWorkflowMailFoldersRow | null {
  const db = getDb()
  const row = db
    .prepare<[string], Row>('SELECT * FROM account_workflow_mail_folders WHERE account_id = ?')
    .get(accountId)
  return row ? mapRow(row) : null
}

export function upsertAccountWorkflowMailFolders(
  accountId: string,
  wipFolderRemoteId: string | null,
  doneFolderRemoteId: string | null
): void {
  const db = getDb()
  db.prepare(
    `INSERT INTO account_workflow_mail_folders (account_id, wip_folder_remote_id, done_folder_remote_id)
     VALUES (@accountId, @wip, @done)
     ON CONFLICT(account_id) DO UPDATE SET
       wip_folder_remote_id = excluded.wip_folder_remote_id,
       done_folder_remote_id = excluded.done_folder_remote_id`
  ).run({ accountId, wip: wipFolderRemoteId, done: doneFolderRemoteId })
}

export function deleteAccountWorkflowMailFolders(accountId: string): void {
  const db = getDb()
  db.prepare('DELETE FROM account_workflow_mail_folders WHERE account_id = ?').run(accountId)
}

export function listAllAccountWorkflowMailFolders(): AccountWorkflowMailFoldersRow[] {
  const db = getDb()
  const rows = db.prepare<[], Row>('SELECT * FROM account_workflow_mail_folders').all()
  return rows.map(mapRow)
}

export function replaceAllAccountWorkflowMailFolders(rows: AccountWorkflowMailFoldersRow[]): void {
  const db = getDb()
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM account_workflow_mail_folders').run()
    const ins = db.prepare(
      `INSERT INTO account_workflow_mail_folders (account_id, wip_folder_remote_id, done_folder_remote_id)
       VALUES (@accountId, @wip, @done)`
    )
    for (const r of rows) {
      ins.run({
        accountId: r.accountId,
        wip: r.wipFolderRemoteId,
        done: r.doneFolderRemoteId
      })
    }
  })
  tx()
}

/**
 * Wenn ein Ordner geloescht wird, darf die Triage-Zuordnung nicht auf seine Remote-ID zeigen.
 */
export function clearWorkflowFolderPrefsIfRemoteFolderRemoved(accountId: string, remoteId: string): void {
  const row = getAccountWorkflowMailFolders(accountId)
  if (!row) return
  const hitWip = row.wipFolderRemoteId === remoteId
  const hitDone = row.doneFolderRemoteId === remoteId
  if (!hitWip && !hitDone) return
  const nextWip = hitWip ? null : row.wipFolderRemoteId
  const nextDone = hitDone ? null : row.doneFolderRemoteId
  if (nextWip == null && nextDone == null) {
    deleteAccountWorkflowMailFolders(accountId)
  } else {
    upsertAccountWorkflowMailFolders(accountId, nextWip, nextDone)
  }
}
