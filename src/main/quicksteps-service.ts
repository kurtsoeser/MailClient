import { getMessageById } from './db/messages-repo'
import { getQuickStepById } from './db/quicksteps-repo'
import {
  applySetReadForMessage,
  applyMoveMessageToWellKnownAlias
} from './message-graph-actions'
import { setTodoForMessage } from './todos-service'
import { routeToWipAfterTodoIfConfigured } from './workflow-mail-folder-routing'
import type { TodoDueKindOpen } from '@shared/types'

const OPEN_TODO_KINDS = new Set<TodoDueKindOpen>(['today', 'tomorrow', 'this_week', 'later'])

function parseTodoDueKind(v: unknown): TodoDueKindOpen | null {
  if (typeof v !== 'string') return null
  if (OPEN_TODO_KINDS.has(v as TodoDueKindOpen)) return v as TodoDueKindOpen
  return null
}

/**
 * Fuehrt einen gespeicherten QuickStep fuer eine Mail aus.
 * Unterstuetzte JSON-Aktionen: `markRead`, `archive`, `moveToTrash`, `addTodo`.
 */
export async function runQuickStep(quickstepId: number, messageId: number): Promise<void> {
  const row = getQuickStepById(quickstepId)
  if (!row || !row.enabled) throw new Error('QuickStep nicht gefunden.')

  let actions: unknown
  try {
    actions = JSON.parse(row.actionsJson)
  } catch {
    throw new Error('QuickStep enthaelt ungueltiges JSON.')
  }
  if (!Array.isArray(actions) || actions.length === 0) {
    throw new Error('QuickStep hat keine gueltigen Aktionen.')
  }

  const source = 'quickstep'

  for (const raw of actions) {
    if (!getMessageById(messageId)) {
      console.warn('[quicksteps] Mail existiert nicht mehr, Rest der Sequenz abgebrochen.')
      return
    }
    if (!raw || typeof raw !== 'object') continue
    const type = (raw as { type?: unknown }).type
    if (typeof type !== 'string') continue

    if (type === 'markRead') {
      await applySetReadForMessage(messageId, true, { source })
    } else if (type === 'archive') {
      await applyMoveMessageToWellKnownAlias(messageId, 'archive', { source })
    } else if (type === 'moveToTrash') {
      await applyMoveMessageToWellKnownAlias(messageId, 'deleteditems', { source })
    } else if (type === 'addTodo') {
      const dueKind = parseTodoDueKind((raw as { dueKind?: unknown }).dueKind)
      if (dueKind) {
        setTodoForMessage(messageId, dueKind)
        await routeToWipAfterTodoIfConfigured(messageId)
      }
    } else {
      console.warn('[quicksteps] Unbekannte Aktion:', type)
    }
  }
}
