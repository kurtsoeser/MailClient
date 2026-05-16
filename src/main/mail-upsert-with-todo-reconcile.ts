import {
  upsertMessages,
  getMessageFlagSnapshotsByRemoteIds,
  type UpsertMessageInput,
  type MessageFollowUpSyncSnapshot
} from './db/messages-repo'
import { deleteTodosByMessageId } from './db/todos-repo'
import { broadcastMailChanged } from './ipc/ipc-broadcasts'
import { completeOpenTodoFromGraphFlagIfNeeded } from './todos-service'

function effectivePreviousFollowUp(snap: MessageFollowUpSyncSnapshot): 'flagged' | 'complete' | 'notFlagged' | null {
  const s = snap.followUpFlagStatus
  if (s === 'flagged' || s === 'complete' || s === 'notFlagged') return s
  if (snap.wasActivelyFlagged) return 'flagged'
  return null
}

/**
 * Schreibt Mails wie `upsertMessages` und gleicht Mail-To-Dos mit dem Graph-Follow-up ab:
 * - `flagged` → `complete`: offenes To-Do lokal als erledigt setzen
 * - → `notFlagged`: lokale To-Dos entfernen (auch „Erledigt“, Quelle der Wahrheit = Message)
 */
export function upsertMailMessagesReconcilingTodos(accountId: string, rows: UpsertMessageInput[]): void {
  if (rows.length === 0) return
  const remoteIds = rows.map((r) => r.remoteId)
  const prev = getMessageFlagSnapshotsByRemoteIds(accountId, remoteIds)
  upsertMessages(rows)
  let notify = false
  for (const row of rows) {
    const snap = prev.get(row.remoteId)
    if (!snap) continue
    const next = row.followUpFlagStatus
    const prevEff = effectivePreviousFollowUp(snap)

    if (next === 'complete' && prevEff === 'flagged') {
      if (completeOpenTodoFromGraphFlagIfNeeded(snap.localId)) notify = true
    }

    if (next === 'notFlagged' && (prevEff === 'flagged' || prevEff === 'complete')) {
      const n = deleteTodosByMessageId(snap.localId)
      if (n > 0) notify = true
    }
  }
  if (notify) {
    broadcastMailChanged(accountId)
  }
}
