import { BrowserWindow } from 'electron'
import { getDb } from './db/index'
import {
  clearMessageSnooze,
  getMessageById,
  listDueSnoozes,
  setMessageSnooze,
  updateMessageFolderLocal
} from './db/messages-repo'
import {
  adjustFolderUnread,
  findFolderById,
  findFolderByWellKnown,
  insertFolderLocal,
  setFolderWellKnownLocal
} from './db/folders-repo'
import { createFolder as graphCreateFolder } from './graph/folder-actions'
import { moveMessage as graphMoveMessage } from './graph/mail-actions'
import { recordAction } from './db/message-actions-repo'

/**
 * Name unseres eigenen Snoozed-Ordners im Mailprovider. Erscheint
 * auch im normalen Outlook-Web in der Ordnerliste.
 */
const SNOOZED_FOLDER_NAME = 'MailClient – Snoozed'

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max - 1) + '...'
}

function broadcastMailChanged(accountId: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('mail:changed', { accountId })
  }
}

/**
 * Stellt sicher, dass es fuer das Konto einen Snoozed-Folder gibt.
 * Wenn nicht in unserer DB markiert, wird er per Graph angelegt und
 * mit `well_known='snoozed'` markiert. Idempotent.
 */
export async function ensureSnoozedFolder(accountId: string): Promise<number> {
  const existing = findFolderByWellKnown(accountId, 'snoozed')
  if (existing) return existing.id

  const created = await graphCreateFolder(accountId, SNOOZED_FOLDER_NAME, null)
  const localId = insertFolderLocal({
    accountId,
    remoteId: created.id,
    name: created.displayName,
    parentRemoteId: created.parentFolderId ?? null,
    wellKnown: 'snoozed',
    unreadCount: created.unreadItemCount ?? 0,
    totalCount: created.totalItemCount ?? 0
  })
  setFolderWellKnownLocal(localId, 'snoozed')
  return localId
}

export interface SnoozeInput {
  messageId: number
  wakeAt: string
  preset?: string
  source?: string
  ruleId?: number | null
}

/**
 * Snoozt eine Mail: verschiebt sie per Graph in den Snoozed-Ordner und
 * speichert lokal `snoozed_until` + `snoozed_from_folder_id`, damit der
 * Background-Ticker sie spaeter zurueckschieben kann.
 *
 * Audit-Log + Undo: Aktion wird mit allen Daten gespeichert, die fuer
 * ein manuelles Zuruecknehmen noetig sind.
 */
export async function snoozeMessage(input: SnoozeInput): Promise<void> {
  const msg = getMessageById(input.messageId)
  if (!msg) throw new Error('Mail nicht gefunden.')
  if (msg.folderId == null) {
    throw new Error('Mail hat keinen Ordner und kann nicht gesnoozt werden.')
  }
  const sourceFolder = findFolderById(msg.folderId)
  if (!sourceFolder) {
    throw new Error('Quell-Ordner der Mail nicht gefunden.')
  }
  if (sourceFolder.wellKnown === 'snoozed') {
    // Bereits gesnoozt: nur das Wake-Datum updaten.
    setMessageSnooze(msg.id, input.wakeAt, sourceFolder.id)
    broadcastMailChanged(msg.accountId)
    return
  }

  const snoozedFolderId = await ensureSnoozedFolder(msg.accountId)
  const snoozedFolder = findFolderById(snoozedFolderId)
  if (!snoozedFolder) throw new Error('Snoozed-Ordner konnte nicht angelegt werden.')

  const newRemoteId = await graphMoveMessage(
    msg.accountId,
    msg.remoteId,
    snoozedFolder.remoteId
  )

  updateMessageFolderLocal(msg.id, snoozedFolderId, newRemoteId)
  setMessageSnooze(msg.id, input.wakeAt, sourceFolder.id)
  if (!msg.isRead) {
    adjustFolderUnread(sourceFolder.id, -1)
  }

  recordAction({
    messageId: msg.id,
    accountId: msg.accountId,
    actionType: 'snooze',
    source: input.source ?? 'manual',
    ruleId: input.ruleId,
    payload: {
      previousFolderId: sourceFolder.id,
      previousFolderRemoteId: sourceFolder.remoteId,
      newRemoteId,
      snoozedUntil: input.wakeAt,
      snoozePreset: input.preset,
      label: `Gesnoozt: ${truncate(msg.subject ?? '(Kein Betreff)', 50)}`
    }
  })

  broadcastMailChanged(msg.accountId)
}

/**
 * Manuelles Aufwecken (User klickt "jetzt wieder anzeigen" in der
 * Snoozed-View). Source = 'manual', sonst identisch zum Auto-Wake.
 */
export async function unsnoozeMessage(messageId: number): Promise<void> {
  await wakeMessageInternal(messageId, 'manual')
}

/**
 * Background-Tick: weckt alle Mails auf, deren snoozed_until <= now ist.
 */
export async function wakeDueSnoozes(): Promise<number> {
  const due = listDueSnoozes()
  let count = 0
  for (const row of due) {
    try {
      await wakeMessageInternal(row.id, 'snooze')
      count += 1
    } catch (e) {
      console.warn('[snooze] wake failed for message', row.id, e)
    }
  }
  return count
}

async function wakeMessageInternal(
  messageId: number,
  source: 'manual' | 'snooze'
): Promise<void> {
  const msg = getMessageById(messageId)
  if (!msg) throw new Error('Mail nicht gefunden.')

  // snoozedFromFolderId steckt in der messages-Tabelle, aber MailFull liefert
  // das aktuell nicht. Wir lesen direkt aus der DB-Zeile via getMessageById,
  // das aber nur die "kanonischen" Felder mappt. Daher hier ueber listDueSnoozes
  // bzw. die Spalten direkt geladen.
  const fromInfo = readSnoozeMeta(messageId)
  if (!fromInfo || fromInfo.snoozedFromFolderId == null) {
    // Mail ist gar nicht gesnoozt – nichts zu tun.
    clearMessageSnooze(messageId)
    return
  }
  const targetFolder = findFolderById(fromInfo.snoozedFromFolderId)
  if (!targetFolder) {
    // Ziel-Ordner existiert nicht mehr (z.B. geloescht). Mail bleibt im
    // Snoozed-Ordner; nur Snooze-Felder werden zurueckgesetzt.
    clearMessageSnooze(messageId)
    broadcastMailChanged(msg.accountId)
    return
  }

  const newRemoteId = await graphMoveMessage(msg.accountId, msg.remoteId, targetFolder.remoteId)

  const prevFolderId = msg.folderId
  updateMessageFolderLocal(msg.id, targetFolder.id, newRemoteId)
  clearMessageSnooze(msg.id)
  if (!msg.isRead) {
    adjustFolderUnread(targetFolder.id, 1)
  }

  recordAction({
    messageId: msg.id,
    accountId: msg.accountId,
    actionType: 'unsnooze',
    source,
    payload: {
      previousFolderId: prevFolderId,
      previousFolderRemoteId: null,
      newRemoteId,
      label:
        source === 'manual'
          ? `Aus Snooze geholt: ${truncate(msg.subject ?? '(Kein Betreff)', 50)}`
          : `Geweckt: ${truncate(msg.subject ?? '(Kein Betreff)', 50)}`
    }
  })

  broadcastMailChanged(msg.accountId)
}

interface SnoozeMeta {
  snoozedFromFolderId: number | null
  snoozedUntil: string | null
}

/**
 * Liest Snooze-Felder direkt aus der DB-Zeile - faellige UND noch nicht
 * faellige Snoozes. Dafuer gibt es keinen passenden Helper im messages-repo,
 * darum hier ad-hoc.
 */
function readSnoozeMeta(messageId: number): SnoozeMeta | null {
  const db = getDb()
  const row = db
    .prepare<
      [number],
      { snoozed_from_folder_id: number | null; snoozed_until: string | null }
    >(
      'SELECT snoozed_from_folder_id, snoozed_until FROM messages WHERE id = ?'
    )
    .get(messageId)
  if (!row) return null
  return {
    snoozedFromFolderId: row.snoozed_from_folder_id,
    snoozedUntil: row.snoozed_until
  }
}
