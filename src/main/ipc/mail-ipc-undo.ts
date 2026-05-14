import { getMessageById, setMessageReadLocal, setMessageFlaggedLocal } from '../db/messages-repo'
import { adjustFolderUnread, findFolderByWellKnown } from '../db/folders-repo'
import { removeMessageTag } from '../db/message-tags-repo'
import type { MailActionRecord } from '../db/message-actions-repo'
import {
  setMessageRead as graphSetRead,
  setMessageFlagged as graphSetFlagged,
  moveMessage as graphMoveMessage
} from '../graph/mail-actions'
import { runFolderSync } from '../sync-runner'
import { unsnoozeMessage } from '../snooze'
import { undoAddTodo, undoChangeTodo, undoCompleteTodo } from '../todos-service'
import { undoAddWaitingFor, undoRemoveWaitingFor, undoChangeWaitingFor } from '../waiting-service'
import { broadcastMailChanged } from './ipc-broadcasts'

export async function applyUndo(action: MailActionRecord): Promise<string> {
  switch (action.actionType) {
    case 'set-read': {
      if (action.messageId == null || action.payload.previousIsRead === undefined) {
        throw new Error('Aktion enthaelt keine Mail-Referenz.')
      }
      const msg = getMessageById(action.messageId)
      if (!msg) throw new Error('Mail nicht mehr vorhanden.')
      setMessageReadLocal(action.messageId, action.payload.previousIsRead)
      if (msg.folderId != null) {
        adjustFolderUnread(msg.folderId, action.payload.previousIsRead ? -1 : 1)
      }
      broadcastMailChanged(msg.accountId)
      await graphSetRead(msg.accountId, msg.remoteId, action.payload.previousIsRead)
      return action.payload.previousIsRead
        ? 'Als gelesen wiederhergestellt'
        : 'Als ungelesen wiederhergestellt'
    }
    case 'set-flagged': {
      if (action.messageId == null || action.payload.previousIsFlagged === undefined) {
        throw new Error('Aktion enthaelt keine Mail-Referenz.')
      }
      const msg = getMessageById(action.messageId)
      if (!msg) throw new Error('Mail nicht mehr vorhanden.')
      setMessageFlaggedLocal(action.messageId, action.payload.previousIsFlagged)
      broadcastMailChanged(msg.accountId)
      await graphSetFlagged(msg.accountId, msg.remoteId, action.payload.previousIsFlagged)
      return action.payload.previousIsFlagged ? 'Stern wiederhergestellt' : 'Stern entfernt'
    }
    case 'archive':
    case 'move-to-trash': {
      const accountId = action.accountId
      const remoteId = action.payload.newRemoteId
      const targetRemoteId = action.payload.previousFolderRemoteId
      if (!accountId || !remoteId || !targetRemoteId) {
        throw new Error('Aktion enthaelt keine Ziel-Ordner-Information.')
      }
      await graphMoveMessage(accountId, remoteId, targetRemoteId)
      if (action.payload.previousFolderId != null) {
        void runFolderSync(action.payload.previousFolderId).catch(() => undefined)
      }
      const sourceAlias = action.actionType === 'archive' ? 'archive' : 'deleteditems'
      const sourceFolder = findFolderByWellKnown(accountId, sourceAlias)
      if (sourceFolder) {
        void runFolderSync(sourceFolder.id).catch(() => undefined)
      }
      return action.actionType === 'archive' ? 'Aus Archiv zurueckgeholt' : 'Aus Papierkorb zurueckgeholt'
    }
    case 'snooze': {
      if (action.messageId == null) {
        throw new Error('Aktion enthaelt keine Mail-Referenz.')
      }
      await unsnoozeMessage(action.messageId)
      return 'Snooze rueckgaengig'
    }
    case 'unsnooze': {
      throw new Error('Aufwecken kann nicht zurueckgenommen werden.')
    }
    case 'add-todo': {
      const todoRowId = action.payload.todoRowId
      if (todoRowId == null) throw new Error('ToDo-Zeile fehlt in der Aktion.')
      const accountId = undoAddTodo(todoRowId)
      broadcastMailChanged(accountId)
      return 'ToDo entfernt'
    }
    case 'change-todo': {
      const todoRowId = action.payload.todoRowId
      const prevK = action.payload.previousTodoDueKind
      if (todoRowId == null || prevK == null) {
        throw new Error('ToDo-Zuruecksetzen unvollstaendig.')
      }
      const accountId = undoChangeTodo(
        todoRowId,
        prevK,
        action.payload.previousTodoDueAt ?? null,
        action.payload.previousTodoStartAt ?? null,
        action.payload.previousTodoEndAt ?? null
      )
      broadcastMailChanged(accountId)
      return 'ToDo-Bucket zurueckgesetzt'
    }
    case 'remove-todo': {
      const todoRowId = action.payload.todoRowId
      const prevK = action.payload.previousTodoDueKind
      if (todoRowId == null || prevK == null) {
        throw new Error('ToDo-Zuruecksetzen unvollstaendig.')
      }
      const accountId = undoCompleteTodo(
        todoRowId,
        prevK,
        action.payload.previousTodoDueAt ?? null,
        action.payload.previousTodoStartAt ?? null,
        action.payload.previousTodoEndAt ?? null
      )
      broadcastMailChanged(accountId)
      return 'ToDo wieder geoefnet'
    }
    case 'add-waiting-for': {
      if (action.messageId == null) throw new Error('Aktion enthaelt keine Mail-Referenz.')
      const accountId = undoAddWaitingFor(action.messageId)
      broadcastMailChanged(accountId)
      return 'Warten auf Antwort entfernt'
    }
    case 'change-waiting-for': {
      if (action.messageId == null || action.payload.previousWaitingUntil === undefined) {
        throw new Error('Warten-Zuruecksetzen unvollstaendig.')
      }
      const accountId = undoChangeWaitingFor(action.messageId, action.payload.previousWaitingUntil)
      broadcastMailChanged(accountId)
      return 'Warten-Frist zurueckgesetzt'
    }
    case 'remove-waiting-for': {
      const prev = action.payload.previousWaitingUntil
      if (action.messageId == null || prev == null) {
        throw new Error('Warten-Zuruecksetzen unvollstaendig.')
      }
      const accountId = undoRemoveWaitingFor(action.messageId, prev)
      broadcastMailChanged(accountId)
      return 'Warten auf Antwort wiederhergestellt'
    }
    case 'move-message': {
      const accountId = action.accountId
      const remoteId = action.payload.newRemoteId
      const targetRemoteId = action.payload.previousFolderRemoteId
      if (!accountId || !remoteId || !targetRemoteId) {
        throw new Error('Aktion enthaelt keine Ziel-Ordner-Information.')
      }
      await graphMoveMessage(accountId, remoteId, targetRemoteId)
      if (action.payload.previousFolderId != null) {
        void runFolderSync(action.payload.previousFolderId).catch(() => undefined)
      }
      const tf = action.payload.targetFolderId
      if (tf != null) {
        void runFolderSync(tf).catch(() => undefined)
      }
      return 'Verschiebung rueckgaengig'
    }
    case 'add-tag': {
      const tag = action.payload.tag
      if (action.messageId == null || !tag) {
        throw new Error('Tag-Aktion unvollstaendig.')
      }
      removeMessageTag(action.messageId, tag)
      const msg = getMessageById(action.messageId)
      if (msg) broadcastMailChanged(msg.accountId)
      return 'Tag entfernt'
    }
    default:
      throw new Error(`Unbekannte Aktion: ${action.actionType}`)
  }
}
