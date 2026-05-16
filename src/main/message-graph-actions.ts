import { BrowserWindow } from 'electron'
import {
  getMessageById,
  deleteMessageLocal,
  deleteAllMessagesInFolderLocal,
  setMessageReadLocal,
  setMessageFlaggedLocal
} from './db/messages-repo'
import {
  findFolderByWellKnown,
  findFolderById,
  adjustFolderUnread
} from './db/folders-repo'
import { recordAction } from './db/message-actions-repo'
import {
  setMessageRead as graphSetRead,
  setMessageFlagged as graphSetFlagged,
  moveMessage as graphMoveMessage,
  setMessageCategories as graphSetMessageCategories,
  deleteMessageRemote as graphDeleteMessageRemote,
  deleteAllRemoteMessagesInWellKnownFolder
} from './graph/mail-actions'
import {
  gmailSetMessageRead,
  gmailSetMessageFlagged,
  gmailTrashMessage,
  gmailArchiveMessage,
  gmailDeleteMessageForever,
  gmailEmptyTrash,
  gmailMoveMessageForFolderMove
} from './google/gmail-actions'
import { isGraphItemNotFound } from './graph/graph-request-errors'
import { runFolderSync } from './sync-runner'
import { listAccounts } from './accounts'
import { listTagsForMessage, replaceMessageTags } from './db/message-tags-repo'

function broadcastMailChanged(accountId: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('mail:changed', { accountId })
  }
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max - 1) + '...'
}

export async function applySetReadForMessage(
  messageId: number,
  isRead: boolean,
  opts?: { source?: string; ruleId?: number | null }
): Promise<void> {
  const msg = getMessageById(messageId)
  if (!msg) throw new Error('Mail nicht gefunden.')
  if (msg.isRead === isRead) return

  setMessageReadLocal(messageId, isRead)
  if (msg.folderId != null) {
    adjustFolderUnread(msg.folderId, isRead ? -1 : 1)
  }
  broadcastMailChanged(msg.accountId)

  const source = opts?.source ?? 'ui'
  const accounts = await listAccounts()
  const acc = accounts.find((a) => a.id === msg.accountId)

  try {
    if (acc?.provider === 'google') {
      await gmailSetMessageRead(msg.accountId, msg.remoteId, isRead)
    } else {
      await graphSetRead(msg.accountId, msg.remoteId, isRead)
    }
    recordAction({
      messageId,
      accountId: msg.accountId,
      actionType: 'set-read',
      source,
      ruleId: opts?.ruleId,
      payload: {
        previousIsRead: msg.isRead,
        label: isRead ? 'Als gelesen markiert' : 'Als ungelesen markiert'
      }
    })
  } catch (e) {
    if (isGraphItemNotFound(e)) {
      console.warn(
        `[message-graph-actions] setRead: Nachricht ${messageId} (remote ${msg.remoteId}) existiert auf dem Server nicht mehr — lokaler Lesestatus bleibt.`
      )
      recordAction({
        messageId,
        accountId: msg.accountId,
        actionType: 'set-read',
        source,
        ruleId: opts?.ruleId,
        payload: {
          previousIsRead: msg.isRead,
          label: isRead ? 'Als gelesen (nur lokal, Server 404)' : 'Als ungelesen (nur lokal, Server 404)'
        }
      })
      return
    }
    setMessageReadLocal(messageId, msg.isRead)
    if (msg.folderId != null) {
      adjustFolderUnread(msg.folderId, isRead ? 1 : -1)
    }
    broadcastMailChanged(msg.accountId)
    throw e
  }
}

export async function applySetFlaggedForMessage(
  messageId: number,
  flagged: boolean,
  opts?: {
    source?: string
    ruleId?: number | null
    /** Kein `mail:changed` pro Mail (Batch-Ende sendet ein Event). */
    skipBroadcast?: boolean
    /** Kein Eintrag in `message_actions` (Massen-Entkennung). */
    skipActionRecord?: boolean
  }
): Promise<void> {
  const msg = getMessageById(messageId)
  if (!msg) throw new Error('Mail nicht gefunden.')
  if (msg.isFlagged === flagged) return

  setMessageFlaggedLocal(messageId, flagged)
  if (!opts?.skipBroadcast) broadcastMailChanged(msg.accountId)

  const source = opts?.source ?? 'ui'
  const accounts = await listAccounts()
  const acc = accounts.find((a) => a.id === msg.accountId)

  try {
    if (acc?.provider === 'google') {
      await gmailSetMessageFlagged(msg.accountId, msg.remoteId, flagged)
    } else {
      await graphSetFlagged(msg.accountId, msg.remoteId, flagged)
    }
    if (!opts?.skipActionRecord) {
      recordAction({
        messageId,
        accountId: msg.accountId,
        actionType: 'set-flagged',
        source,
        ruleId: opts?.ruleId,
        payload: {
          previousIsFlagged: msg.isFlagged,
          label: flagged ? 'Stern gesetzt' : 'Stern entfernt'
        }
      })
    }
  } catch (e) {
    setMessageFlaggedLocal(messageId, msg.isFlagged)
    if (!opts?.skipBroadcast) broadcastMailChanged(msg.accountId)
    throw e
  }
}

/**
 * Verschiebt eine Mail per Graph in Archiv bzw. Papierkorb und entfernt sie
 * lokal aus der Quell-Ordner-Ansicht (wie die IPC-Handler).
 */
export async function applyMoveMessageToWellKnownAlias(
  messageId: number,
  destinationAlias: 'archive' | 'deleteditems',
  opts?: { source?: string; ruleId?: number | null }
): Promise<void> {
  const msg = getMessageById(messageId)
  if (!msg) throw new Error('Mail nicht gefunden.')

  const targetFolder = findFolderByWellKnown(msg.accountId, destinationAlias)
  const previousFolder = msg.folderId != null ? findFolderById(msg.folderId) : null

  const source = opts?.source ?? 'ui'
  const accounts = await listAccounts()
  const acc = accounts.find((a) => a.id === msg.accountId)

  /** Zuerst Server: sonst ist lokal weg/Push erfolgt, Graph aber fehlgeschlagen → OWA und App auseinander. */
  let newRemoteId: string | undefined
  if (acc?.provider === 'google') {
    if (destinationAlias === 'deleteditems') {
      newRemoteId = await gmailTrashMessage(msg.accountId, msg.remoteId)
    } else {
      newRemoteId = await gmailArchiveMessage(msg.accountId, msg.remoteId)
    }
  } else {
    const destFolder = findFolderByWellKnown(msg.accountId, destinationAlias)
    const destId = destFolder?.remoteId ?? destinationAlias
    newRemoteId = await graphMoveMessage(msg.accountId, msg.remoteId, destId)
  }

  deleteMessageLocal(messageId)
  if (msg.folderId != null && !msg.isRead) {
    adjustFolderUnread(msg.folderId, -1)
  }
  broadcastMailChanged(msg.accountId)

  if (targetFolder) {
    void runFolderSync(targetFolder.id).catch((e) =>
      console.warn('[message-graph-actions] Sync Ziel-Ordner fehlgeschlagen:', e)
    )
  }
  recordAction({
    messageId: null,
    accountId: msg.accountId,
    actionType: destinationAlias === 'archive' ? 'archive' : 'move-to-trash',
    source,
    ruleId: opts?.ruleId,
    payload: {
      previousFolderId: previousFolder?.id ?? null,
      previousFolderRemoteId: previousFolder?.remoteId ?? null,
      newRemoteId,
      label:
        destinationAlias === 'archive'
          ? `Archiviert: ${truncate(msg.subject ?? '(Kein Betreff)', 60)}`
          : `Geloescht: ${truncate(msg.subject ?? '(Kein Betreff)', 60)}`
    }
  })
}

/**
 * Verschiebt eine Mail in einen beliebigen Ordner desselben Kontos (Graph move).
 */
export async function applyMoveMessageToFolder(
  messageId: number,
  targetFolderId: number,
  opts?: { source?: string; ruleId?: number | null }
): Promise<void> {
  const msg = getMessageById(messageId)
  if (!msg) throw new Error('Mail nicht gefunden.')

  const targetFolder = findFolderById(targetFolderId)
  if (!targetFolder || targetFolder.accountId !== msg.accountId) {
    throw new Error('Zielordner ungueltig oder anderes Konto.')
  }
  if (msg.folderId != null && msg.folderId === targetFolderId) return

  const accounts = await listAccounts()
  const acc = accounts.find((a) => a.id === msg.accountId)
  const previousFolder = msg.folderId != null ? findFolderById(msg.folderId) : null

  if (acc?.provider === 'google') {
    deleteMessageLocal(messageId)
    if (msg.folderId != null && !msg.isRead) {
      adjustFolderUnread(msg.folderId, -1)
    }
    broadcastMailChanged(msg.accountId)

    const source = opts?.source ?? 'ui'

    try {
      await gmailMoveMessageForFolderMove(
        msg.accountId,
        msg.remoteId,
        previousFolder,
        targetFolder
      )
      void runFolderSync(targetFolder.id).catch((e) =>
        console.warn('[message-graph-actions] Sync Ziel-Ordner (Gmail) fehlgeschlagen:', e)
      )
      if (previousFolder) {
        void runFolderSync(previousFolder.id).catch((e) =>
          console.warn('[message-graph-actions] Sync Quell-Ordner (Gmail) fehlgeschlagen:', e)
        )
      }
      recordAction({
        messageId: null,
        accountId: msg.accountId,
        actionType: 'move-message',
        source,
        ruleId: opts?.ruleId ?? null,
        payload: {
          previousFolderId: previousFolder?.id ?? null,
          previousFolderRemoteId: previousFolder?.remoteId ?? null,
          newRemoteId: msg.remoteId,
          targetFolderId: targetFolder.id,
          label:
            source === 'workflow-mail-folders'
              ? `Triage: nach „${truncate(targetFolder.name, 40)}“ — ${truncate(msg.subject ?? '(Kein Betreff)', 50)}`
              : `Regel: verschoben nach „${truncate(targetFolder.name, 40)}“ — ${truncate(msg.subject ?? '(Kein Betreff)', 50)}`
        }
      })
    } catch (e) {
      if (msg.folderId != null) {
        void runFolderSync(msg.folderId).catch(() => undefined)
      }
      throw e
    }
    return
  }

  if (acc?.provider !== 'microsoft') {
    throw new Error('Verschieben in andere Ordner wird fuer dieses Konto nicht unterstuetzt.')
  }

  const source = opts?.source ?? 'ui'

  const newRemoteId = await graphMoveMessage(
    msg.accountId,
    msg.remoteId,
    targetFolder.remoteId
  )

  deleteMessageLocal(messageId)
  if (msg.folderId != null && !msg.isRead) {
    adjustFolderUnread(msg.folderId, -1)
  }
  broadcastMailChanged(msg.accountId)

  void runFolderSync(targetFolder.id).catch((e) =>
    console.warn('[message-graph-actions] Sync Ziel-Ordner fehlgeschlagen:', e)
  )
  recordAction({
    messageId: null,
    accountId: msg.accountId,
    actionType: 'move-message',
    source,
    ruleId: opts?.ruleId ?? null,
    payload: {
      previousFolderId: previousFolder?.id ?? null,
      previousFolderRemoteId: previousFolder?.remoteId ?? null,
      newRemoteId,
      targetFolderId: targetFolder.id,
      label:
        source === 'workflow-mail-folders'
          ? `Triage: nach „${truncate(targetFolder.name, 40)}“ — ${truncate(msg.subject ?? '(Kein Betreff)', 50)}`
          : `Regel: verschoben nach „${truncate(targetFolder.name, 40)}“ — ${truncate(msg.subject ?? '(Kein Betreff)', 50)}`
    }
  })
}

const MAX_MESSAGE_CATEGORIES = 25

/**
 * Setzt Kategorien/Tags fuer eine Mail: lokal in `message_tags` und bei
 * Microsoft-Konten zusaetzlich per Graph (Outlook-kompatibel).
 */
export async function applySetMessageCategories(
  messageId: number,
  categories: string[]
): Promise<void> {
  const msg = getMessageById(messageId)
  if (!msg) throw new Error('Mail nicht gefunden.')

  const uniq = Array.from(
    new Set(categories.map((c) => c.trim()).filter((c) => c.length > 0))
  ).slice(0, MAX_MESSAGE_CATEGORIES)

  const previous = listTagsForMessage(messageId)
  replaceMessageTags(messageId, msg.accountId, uniq)
  broadcastMailChanged(msg.accountId)

  const accounts = await listAccounts()
  const acc = accounts.find((a) => a.id === msg.accountId)
  if (acc?.provider !== 'microsoft') {
    return
  }

  try {
    await graphSetMessageCategories(msg.accountId, msg.remoteId, uniq)
  } catch (e) {
    replaceMessageTags(messageId, msg.accountId, previous)
    broadcastMailChanged(msg.accountId)
    throw e
  }
}

/**
 * Entfernt eine Mail endgueltig (Graph DELETE). Nur erlaubt, wenn die Mail
 * im Well-known-Ordner Papierkorb (`deleteditems`) liegt.
 */
export async function applyPermanentDeleteMessage(messageId: number): Promise<void> {
  const msg = getMessageById(messageId)
  if (!msg) throw new Error('Mail nicht gefunden.')

  const folder = msg.folderId != null ? findFolderById(msg.folderId) : null
  if (!folder || folder.wellKnown !== 'deleteditems') {
    throw new Error('Endgueltiges Loeschen ist nur fuer Mails im Papierkorb moeglich.')
  }

  const folderId = folder.id
  const wasUnread = !msg.isRead
  const accountId = msg.accountId
  const remoteId = msg.remoteId

  const accounts = await listAccounts()
  const acc = accounts.find((a) => a.id === accountId)

  try {
    if (acc?.provider === 'google') {
      await gmailDeleteMessageForever(accountId, remoteId)
    } else {
      await graphDeleteMessageRemote(accountId, remoteId)
    }
  } catch (e) {
    if (isGraphItemNotFound(e)) {
      deleteMessageLocal(messageId)
      if (wasUnread) {
        adjustFolderUnread(folderId, -1)
      }
      broadcastMailChanged(accountId)
      void runFolderSync(folderId).catch(() => undefined)
      return
    }
    throw e
  }

  deleteMessageLocal(messageId)
  if (wasUnread) {
    adjustFolderUnread(folderId, -1)
  }
  broadcastMailChanged(accountId)

  void runFolderSync(folderId).catch((err) =>
    console.warn('[message-graph-actions] Sync Papierkorb nach endgueltigem Loeschen:', err)
  )
}

/**
 * Leert den Papierkorb auf dem Server und entfernt alle lokalen Eintraege in diesem Ordner.
 */
export async function applyEmptyTrashFolder(folderId: number): Promise<{ deletedRemote: number }> {
  const folder = findFolderById(folderId)
  if (!folder) throw new Error('Ordner nicht gefunden.')
  if (folder.wellKnown !== 'deleteditems') {
    throw new Error('Nur der Papierkorb kann auf diese Weise geleert werden.')
  }

  const accountId = folder.accountId
  const accounts = await listAccounts()
  const acc = accounts.find((a) => a.id === accountId)
  let deletedRemote: number
  if (acc?.provider === 'google') {
    deletedRemote = await gmailEmptyTrash(accountId)
  } else {
    deletedRemote = await deleteAllRemoteMessagesInWellKnownFolder(accountId, 'deleteditems')
  }
  deleteAllMessagesInFolderLocal(folderId)
  broadcastMailChanged(accountId)

  void runFolderSync(folderId).catch((e) =>
    console.warn('[message-graph-actions] Sync nach Papierkorb leeren:', e)
  )

  return { deletedRemote }
}
