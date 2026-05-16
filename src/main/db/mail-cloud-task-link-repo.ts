import { getDb } from './index'

export interface MailCloudTaskLinkRow {
  messageId: number
  accountId: string
  listId: string
  taskId: string
  createdAt: string
}

function rowFromDb(r: {
  message_id: number
  account_id: string
  list_id: string
  task_id: string
  created_at: string
}): MailCloudTaskLinkRow {
  return {
    messageId: r.message_id,
    accountId: r.account_id,
    listId: r.list_id,
    taskId: r.task_id,
    createdAt: r.created_at
  }
}

export function listAllMailCloudTaskLinks(): MailCloudTaskLinkRow[] {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT message_id, account_id, list_id, task_id, created_at
       FROM mail_cloud_task_link ORDER BY created_at ASC`
    )
    .all() as Array<{
    message_id: number
    account_id: string
    list_id: string
    task_id: string
    created_at: string
  }>
  return rows.map(rowFromDb)
}

export function listMailCloudTaskLinksForMessage(messageId: number): MailCloudTaskLinkRow[] {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT message_id, account_id, list_id, task_id, created_at
       FROM mail_cloud_task_link WHERE message_id = ? ORDER BY created_at ASC`
    )
    .all(messageId) as Array<{
    message_id: number
    account_id: string
    list_id: string
    task_id: string
    created_at: string
  }>
  return rows.map(rowFromDb)
}

export function insertMailCloudTaskLink(row: Omit<MailCloudTaskLinkRow, 'createdAt'>): void {
  const db = getDb()
  db.prepare(
    `INSERT INTO mail_cloud_task_link (message_id, account_id, list_id, task_id)
     VALUES (@message_id, @account_id, @list_id, @task_id)
     ON CONFLICT(message_id, account_id, list_id, task_id) DO NOTHING`
  ).run({
    message_id: row.messageId,
    account_id: row.accountId.trim(),
    list_id: row.listId.trim(),
    task_id: row.taskId.trim()
  })
}

export function deleteMailCloudTaskLinksForTask(
  accountId: string,
  listId: string,
  taskId: string
): void {
  const db = getDb()
  db.prepare(
    `DELETE FROM mail_cloud_task_link
     WHERE account_id = ? AND list_id = ? AND task_id = ?`
  ).run(accountId.trim(), listId.trim(), taskId.trim())
}

export function deleteMailCloudTaskLinksForMessage(messageId: number): void {
  const db = getDb()
  db.prepare(`DELETE FROM mail_cloud_task_link WHERE message_id = ?`).run(messageId)
}
