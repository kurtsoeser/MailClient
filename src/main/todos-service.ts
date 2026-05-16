import { BrowserWindow } from 'electron'
import type { TodoDueKindOpen, TodoDueKindList, TodoCountsAll } from '@shared/types'
import { loadConfigSync } from './config'
import { computeTodoDisplayBounds, resolveCalendarTimeZone, classifyTodoDueKindFromDueAtIso } from './todo-due-buckets'
import { getMessageById, countWaitingMessagesGlobal } from './db/messages-repo'
import { recordAction } from './db/message-actions-repo'
import {
  getOpenTodoByMessageId,
  insertOpenTodo,
  updateOpenTodoDue,
  updateOpenTodoCalendarWindow,
  restoreOpenTodoState,
  markTodoDone,
  deleteTodoById,
  reopenTodo,
  getTodoById,
  listTodoMessagesWithMeta,
  listOpenTodoMessagesWithDueAtInRange,
  countOpenTodosGlobal,
  countDoneTodosGlobal,
  deleteTodosByMessageId
} from './db/todos-repo'
import { graphTryDeleteFlaggedEmailTasksForMessage } from './graph/tasks-graph'

function broadcastMailChanged(accountId: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('mail:changed', { accountId })
  }
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max - 1) + '...'
}

function dueKindLabel(kind: string): string {
  switch (kind) {
    case 'today':
      return 'Heute'
    case 'tomorrow':
      return 'Morgen'
    case 'this_week':
      return 'Diese Woche'
    case 'later':
      return 'Spaeter'
    default:
      return kind
  }
}

/**
 * Gleiche Tagesgrenzen wie `listTodoMessagesWithMeta` / Kanban-SQL (`computeTodoDisplayBounds`),
 * damit `due_at` nicht zwischen Kalender-Zeitzone und lokalem Datum verrutscht.
 */
function computeDueAt(kind: TodoDueKindOpen): string | null {
  if (kind === 'later') return null
  const cfg = loadConfigSync()
  const tz = resolveCalendarTimeZone(cfg.calendarTimeZone)
  const b = computeTodoDisplayBounds(Date.now(), tz)
  if (kind === 'today') return b.endTodayIso
  if (kind === 'tomorrow') return b.endTomorrowIso
  if (kind === 'this_week') return b.endWeekIso
  return null
}

export function listTodoMessagesMerged(
  accountId: string | null,
  dueKind: TodoDueKindList,
  timeZone: string,
  limit = 200
): import('@shared/types').MailListItem[] {
  return listTodoMessagesWithMeta(accountId, dueKind, timeZone, limit)
}

/** Offene Mail-ToDos mit `due_at` im sichtbaren Kalenderbereich (ISO-Strings, `end` exklusiv). */
export function listTodoMessagesInRange(
  accountId: string | null,
  rangeStartIso: string,
  rangeEndIso: string,
  limit = 500
): import('@shared/types').MailListItem[] {
  return listOpenTodoMessagesWithDueAtInRange(accountId, rangeStartIso, rangeEndIso, limit)
}

export function getTodoCountsAll(timeZone: string): TodoCountsAll {
  const open = countOpenTodosGlobal(timeZone)
  return {
    ...open,
    done: countDoneTodosGlobal(),
    waiting: countWaitingMessagesGlobal()
  }
}

export function setTodoForMessage(
  messageId: number,
  dueKind: TodoDueKindOpen,
  opts?: { source?: string; ruleId?: number | null }
): void {
  const msg = getMessageById(messageId)
  if (!msg) throw new Error('Mail nicht gefunden.')

  const existing = getOpenTodoByMessageId(messageId)
  const dueAt = computeDueAt(dueKind)
  const subj = truncate(msg.subject ?? '(Kein Betreff)', 50)
  const source = opts?.source ?? 'manual'
  const ruleId = opts?.ruleId

  if (!existing) {
    const todoId = insertOpenTodo({
      messageId,
      accountId: msg.accountId,
      dueKind,
      dueAt
    })
    recordAction({
      messageId,
      accountId: msg.accountId,
      actionType: 'add-todo',
      source,
      ruleId,
      payload: {
        todoRowId: todoId,
        todoDueKind: dueKind,
        todoDueAt: dueAt,
        label: `ToDo (${dueKindLabel(dueKind)}): ${subj}`
      }
    })
  } else if (existing.dueKind !== dueKind) {
    const prevK = existing.dueKind
    const prevA = existing.dueAt
    const prevS = existing.todoStartAt
    const prevE = existing.todoEndAt
    updateOpenTodoDue(existing.id, dueKind, dueAt)
    recordAction({
      messageId,
      accountId: msg.accountId,
      actionType: 'change-todo',
      source,
      ruleId,
      payload: {
        todoRowId: existing.id,
        previousTodoDueKind: prevK,
        previousTodoDueAt: prevA,
        previousTodoStartAt: prevS,
        previousTodoEndAt: prevE,
        todoDueKind: dueKind,
        todoDueAt: dueAt,
        label: `ToDo (${dueKindLabel(dueKind)}): ${subj}`
      }
    })
  } else {
    const hadSchedule = existing.todoStartAt != null || existing.todoEndAt != null
    updateOpenTodoDue(existing.id, dueKind, dueAt)
    if (hadSchedule) {
      recordAction({
        messageId,
        accountId: msg.accountId,
        actionType: 'change-todo',
        source,
        ruleId,
        payload: {
          todoRowId: existing.id,
          previousTodoDueKind: dueKind,
          previousTodoDueAt: existing.dueAt,
          previousTodoStartAt: existing.todoStartAt,
          previousTodoEndAt: existing.todoEndAt,
          todoDueKind: dueKind,
          todoDueAt: dueAt,
          label: `ToDo (${dueKindLabel(dueKind)}): ${subj}`
        }
      })
    }
  }

  broadcastMailChanged(msg.accountId)
}

export function setTodoScheduleForMessage(
  messageId: number,
  startIso: string,
  endIso: string,
  opts?: { source?: string; ruleId?: number | null }
): void {
  const msg = getMessageById(messageId)
  if (!msg) throw new Error('Mail nicht gefunden.')
  const t0 = new Date(startIso).getTime()
  const t1 = new Date(endIso).getTime()
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) {
    throw new Error('Ungueltiger Termin: Ende muss nach Beginn liegen.')
  }

  const existing = getOpenTodoByMessageId(messageId)
  const subj = truncate(msg.subject ?? '(Kein Betreff)', 50)
  const source = opts?.source ?? 'manual'
  const ruleId = opts?.ruleId
  const dueAt = endIso
  const cfg = loadConfigSync()
  const tz = resolveCalendarTimeZone(cfg.calendarTimeZone)
  const dueKindNext = classifyTodoDueKindFromDueAtIso(dueAt, tz)

  if (!existing) {
    const todoId = insertOpenTodo({
      messageId,
      accountId: msg.accountId,
      dueKind: dueKindNext,
      dueAt,
      todoStartAt: startIso,
      todoEndAt: endIso
    })
    recordAction({
      messageId,
      accountId: msg.accountId,
      actionType: 'add-todo',
      source,
      ruleId,
      payload: {
        todoRowId: todoId,
        todoDueKind: dueKindNext,
        todoDueAt: dueAt,
        label: `ToDo (Termin): ${subj}`
      }
    })
  } else {
    const prevK = existing.dueKind
    const prevA = existing.dueAt
    const prevS = existing.todoStartAt
    const prevE = existing.todoEndAt
    updateOpenTodoCalendarWindow(existing.id, startIso, endIso, dueAt, dueKindNext)
    recordAction({
      messageId,
      accountId: msg.accountId,
      actionType: 'change-todo',
      source,
      ruleId,
      payload: {
        todoRowId: existing.id,
        previousTodoDueKind: prevK,
        previousTodoDueAt: prevA,
        previousTodoStartAt: prevS,
        previousTodoEndAt: prevE,
        todoDueKind: dueKindNext,
        todoDueAt: dueAt,
        label: `ToDo (Termin): ${subj}`
      }
    })
  }

  broadcastMailChanged(msg.accountId)
}

/**
 * Wenn Microsoft Graph den Follow-up-Status auf `complete` setzt, offenes lokales
 * Mail-ToDo abschliessen (OWA „Erledigt“ ohne Klick in dieser App).
 */
export function completeOpenTodoFromGraphFlagIfNeeded(messageId: number): boolean {
  const msg = getMessageById(messageId)
  if (!msg) return false
  const open = getOpenTodoByMessageId(messageId)
  if (!open) return false

  const prevK = open.dueKind
  const prevA = open.dueAt
  markTodoDone(open.id)
  const subj = truncate(msg.subject ?? '(Kein Betreff)', 50)
  recordAction({
    messageId,
    accountId: msg.accountId,
    actionType: 'remove-todo',
    source: 'graph-flag',
    payload: {
      todoRowId: open.id,
      previousTodoDueKind: prevK,
      previousTodoDueAt: prevA,
      previousTodoStartAt: open.todoStartAt ?? null,
      previousTodoEndAt: open.todoEndAt ?? null,
      label: `ToDo erledigt (Mail follow-up complete): ${subj}`
    }
  })
  broadcastMailChanged(msg.accountId)
  return true
}

export function completeTodoForMessage(messageId: number): void {
  const msg = getMessageById(messageId)
  if (!msg) throw new Error('Mail nicht gefunden.')
  const open = getOpenTodoByMessageId(messageId)
  if (!open) return

  const prevK = open.dueKind
  const prevA = open.dueAt
  markTodoDone(open.id)
  const subj = truncate(msg.subject ?? '(Kein Betreff)', 50)
  recordAction({
    messageId,
    accountId: msg.accountId,
    actionType: 'remove-todo',
    source: 'manual',
    payload: {
      todoRowId: open.id,
      previousTodoDueKind: prevK,
      previousTodoDueAt: prevA,
      previousTodoStartAt: open.todoStartAt ?? null,
      previousTodoEndAt: open.todoEndAt ?? null,
      label: `ToDo erledigt: ${subj}`
    }
  })
  broadcastMailChanged(msg.accountId)
}

/**
 * Entfernt alle lokalen Mail-ToDo-Zeilen zu einer Nachricht (offen und erledigt),
 * ohne die Mail zu loeschen oder zu verschieben.
 * Microsoft 365: zusaetzlich Aufgaben in „Gekennzeichnete E-Mail“ loeschen, falls per Graph auffindbar.
 */
export async function removeMailTodoRecordsForMessage(messageId: number): Promise<{ removed: number }> {
  const msg = getMessageById(messageId)
  if (!msg) throw new Error('Mail nicht gefunden.')

  const n = deleteTodosByMessageId(messageId)
  if (n > 0) {
    broadcastMailChanged(msg.accountId)
  }

  if (n > 0 && msg.accountId.startsWith('ms:') && msg.remoteId) {
    try {
      await graphTryDeleteFlaggedEmailTasksForMessage(msg.accountId, msg.remoteId)
    } catch {
      // optional: Graph-Filter nicht unterstuetzt oder offline
    }
  }

  return { removed: n }
}

export function undoAddTodo(todoRowId: number): string {
  const row = getTodoById(todoRowId)
  if (!row) throw new Error('ToDo nicht gefunden.')
  const accountId = row.accountId
  deleteTodoById(todoRowId)
  return accountId
}

export function undoChangeTodo(
  todoRowId: number,
  previousDueKind: string,
  previousDueAt: string | null,
  previousStartAt: string | null = null,
  previousEndAt: string | null = null
): string {
  const row = getTodoById(todoRowId)
  if (!row) throw new Error('ToDo nicht gefunden.')
  if (row.status !== 'open') {
    throw new Error('ToDo ist nicht offen; Zuruecksetzen nicht moeglich.')
  }
  restoreOpenTodoState(todoRowId, previousDueKind, previousDueAt, previousStartAt, previousEndAt)
  return row.accountId
}

export function undoCompleteTodo(
  todoRowId: number,
  previousDueKind: string,
  previousDueAt: string | null,
  previousStartAt: string | null = null,
  previousEndAt: string | null = null
): string {
  const row = getTodoById(todoRowId)
  if (!row) throw new Error('ToDo nicht gefunden.')
  reopenTodo(todoRowId, previousDueKind, previousDueAt, previousStartAt, previousEndAt)
  return row.accountId
}
