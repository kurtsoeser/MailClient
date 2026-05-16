import { app } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import { getDb } from './index'
import { sanitizeFileName } from '../ipc/ipc-helpers'
import type {
  UserNoteAttachment,
  UserNoteAttachmentAddCloudInput,
  UserNoteAttachmentAddLocalInput
} from '@shared/types'

interface AttachmentRow {
  id: number
  note_id: number
  kind: 'local' | 'cloud'
  name: string
  content_type: string | null
  size: number | null
  local_path: string | null
  source_url: string | null
  provider_type: string | null
  created_at: string
}

function assertNoteId(noteId: number): void {
  if (!Number.isFinite(noteId) || noteId <= 0) throw new Error('Notiz-ID fehlt.')
}

function noteExists(noteId: number): boolean {
  const row = getDb().prepare('SELECT id FROM user_notes WHERE id = ?').get(noteId) as
    | { id: number }
    | undefined
  return row != null
}

function rowToAttachment(row: AttachmentRow): UserNoteAttachment {
  return {
    id: row.id,
    noteId: row.note_id,
    kind: row.kind,
    name: row.name,
    contentType: row.content_type,
    size: row.size,
    localPath: row.local_path,
    sourceUrl: row.source_url,
    providerType:
      row.provider_type === 'oneDriveConsumer' ||
      row.provider_type === 'documentLibrary' ||
      row.provider_type === 'oneDriveBusiness'
        ? row.provider_type
        : null,
    createdAt: row.created_at
  }
}

function noteAttachmentsDir(noteId: number): string {
  return path.join(app.getPath('userData'), 'note-attachments', String(noteId))
}

export function listNoteAttachments(noteId: number): UserNoteAttachment[] {
  assertNoteId(noteId)
  const rows = getDb()
    .prepare(
      `SELECT id, note_id, kind, name, content_type, size, local_path, source_url, provider_type, created_at
       FROM user_note_attachments
       WHERE note_id = ?
       ORDER BY created_at ASC, id ASC`
    )
    .all(noteId) as AttachmentRow[]
  return rows.map(rowToAttachment)
}

export async function addLocalNoteAttachment(
  input: UserNoteAttachmentAddLocalInput
): Promise<UserNoteAttachment> {
  assertNoteId(input.noteId)
  if (!noteExists(input.noteId)) throw new Error('Notiz nicht gefunden.')
  const name = input.name?.trim()
  if (!name) throw new Error('Dateiname fehlt.')
  if (!input.dataBase64?.trim()) throw new Error('Dateiinhalt fehlt.')

  const createdAt = new Date().toISOString()
  const db = getDb()
  const insert = db.prepare(
    `INSERT INTO user_note_attachments
      (note_id, kind, name, content_type, size, local_path, source_url, provider_type, created_at)
     VALUES (?, 'local', ?, ?, ?, NULL, NULL, NULL, ?)`
  )
  const info = insert.run(
    input.noteId,
    name,
    input.contentType || null,
    input.size ?? null,
    createdAt
  ) as { lastInsertRowid: number | bigint }
  const id = Number(info.lastInsertRowid)
  const dir = noteAttachmentsDir(input.noteId)
  await fs.mkdir(dir, { recursive: true })
  const safeName = sanitizeFileName(name)
  const localPath = path.join(dir, `${id}-${safeName}`)
  const bytes = Buffer.from(input.dataBase64, 'base64')
  await fs.writeFile(localPath, bytes)
  db.prepare('UPDATE user_note_attachments SET local_path = ?, size = ? WHERE id = ?').run(
    localPath,
    bytes.length,
    id
  )
  const row = db
    .prepare(
      `SELECT id, note_id, kind, name, content_type, size, local_path, source_url, provider_type, created_at
       FROM user_note_attachments WHERE id = ?`
    )
    .get(id) as AttachmentRow
  return rowToAttachment(row)
}

export function addCloudNoteAttachment(
  input: UserNoteAttachmentAddCloudInput
): UserNoteAttachment {
  assertNoteId(input.noteId)
  if (!noteExists(input.noteId)) throw new Error('Notiz nicht gefunden.')
  const name = input.name?.trim()
  const sourceUrl = input.sourceUrl?.trim()
  if (!name) throw new Error('Dateiname fehlt.')
  if (!sourceUrl) throw new Error('Cloud-Link fehlt.')

  const createdAt = new Date().toISOString()
  const providerType = input.providerType ?? 'oneDriveBusiness'
  const info = getDb()
    .prepare(
      `INSERT INTO user_note_attachments
        (note_id, kind, name, content_type, size, local_path, source_url, provider_type, created_at)
       VALUES (?, 'cloud', ?, NULL, NULL, NULL, ?, ?, ?)`
    )
    .run(input.noteId, name, sourceUrl, providerType, createdAt) as { lastInsertRowid: number | bigint }

  const id = Number(info.lastInsertRowid)
  const row = getDb()
    .prepare(
      `SELECT id, note_id, kind, name, content_type, size, local_path, source_url, provider_type, created_at
       FROM user_note_attachments WHERE id = ?`
    )
    .get(id) as AttachmentRow
  return rowToAttachment(row)
}

export async function removeNoteAttachment(
  attachmentId: number,
  noteId: number
): Promise<void> {
  assertNoteId(noteId)
  const row = getDb()
    .prepare(
      `SELECT id, kind, local_path FROM user_note_attachments WHERE id = ? AND note_id = ?`
    )
    .get(attachmentId, noteId) as { id: number; kind: string; local_path: string | null } | undefined
  if (!row) return
  getDb().prepare('DELETE FROM user_note_attachments WHERE id = ?').run(attachmentId)
  if (row.kind === 'local' && row.local_path) {
    await fs.unlink(row.local_path).catch(() => undefined)
  }
}

export function getNoteAttachmentById(
  attachmentId: number,
  noteId: number
): UserNoteAttachment | null {
  const row = getDb()
    .prepare(
      `SELECT id, note_id, kind, name, content_type, size, local_path, source_url, provider_type, created_at
       FROM user_note_attachments WHERE id = ? AND note_id = ?`
    )
    .get(attachmentId, noteId) as AttachmentRow | undefined
  return row ? rowToAttachment(row) : null
}
