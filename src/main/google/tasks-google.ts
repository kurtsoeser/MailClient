import type { tasks_v1 } from 'googleapis'
import type { TaskItemRow, TaskListRow } from '@shared/types'
import { getGoogleApis } from './google-auth-client'
import { dueIsoToGoogleTasksDue } from './tasks-google-due'

interface GoogleTasksApiErrLike {
  message?: string
  errors?: Array<{ reason?: string; message?: string }>
}

function formatGoogleTasksError(err: unknown): Error {
  if (err && typeof err === 'object') {
    const e = err as GoogleTasksApiErrLike
    const sub = e.errors?.[0]
    if (sub?.reason === 'accessNotConfigured') {
      return new Error(
        'Google Tasks API ist im Google-Cloud-Projekt nicht aktiviert. ' +
          'In der Google Cloud Console unter «APIs & Dienste» die «Google Tasks API» aktivieren, ' +
          'einige Minuten warten und das Konto ggf. erneut verbinden.'
      )
    }
    if (typeof sub?.message === 'string' && sub.message.trim()) {
      return new Error(sub.message.trim())
    }
    if (typeof e.message === 'string' && e.message.trim()) {
      const m = e.message.trim()
      return new Error(m.length > 240 ? `${m.slice(0, 240)}…` : m)
    }
  }
  return err instanceof Error ? err : new Error(String(err))
}

async function withGoogleTasksApi<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    throw formatGoogleTasksError(e)
  }
}

function rowFromGoogleTask(listId: string, t: tasks_v1.Schema$Task): TaskItemRow | null {
  if (!t.id) return null
  const completed = t.status === 'completed'
  let dueIso: string | null = null
  if (t.due && /^\d{4}-\d{2}-\d{2}/.test(t.due)) {
    dueIso = t.due.slice(0, 10)
  }
  return {
    id: t.id,
    listId,
    title: (t.title ?? '').trim() || '(Ohne Titel)',
    completed,
    dueIso,
    notes: t.notes?.trim() ? t.notes.trim() : null
  }
}

export async function googleListTaskLists(accountId: string): Promise<TaskListRow[]> {
  return withGoogleTasksApi(async () => {
  const { tasks } = await getGoogleApis(accountId)
  const res = await tasks.tasklists.list({ maxResults: 100 })
  const items = res.data.items ?? []
  return items
    .filter((x) => x.id)
    .map((x) => ({
      id: x.id!,
      name: (x.title ?? '').trim() || x.id!,
      isDefault: Boolean(x.id === '@default'),
      provider: 'google' as const
    }))
  })
}

export async function googleListTasksInList(
  accountId: string,
  listId: string,
  opts?: { showCompleted?: boolean; showHidden?: boolean }
): Promise<TaskItemRow[]> {
  const { tasks } = await getGoogleApis(accountId)
  const showCompleted = opts?.showCompleted !== false
  const showHidden = opts?.showHidden === true
  const rows: TaskItemRow[] = []
  let pageToken: string | undefined
  do {
    const res = await tasks.tasks.list({
      tasklist: listId,
      showCompleted,
      showHidden,
      maxResults: 100,
      pageToken
    })
    for (const t of res.data.items ?? []) {
      const row = rowFromGoogleTask(listId, t)
      if (row) rows.push(row)
    }
    pageToken = res.data.nextPageToken ?? undefined
  } while (pageToken)
  return rows
}

export async function googleInsertTask(
  accountId: string,
  listId: string,
  input: { title: string; notes?: string | null; dueIso?: string | null; completed?: boolean }
): Promise<TaskItemRow> {
  const { tasks } = await getGoogleApis(accountId)
  const body: tasks_v1.Schema$Task = {
    title: input.title.trim() || '(Ohne Titel)',
    status: input.completed ? 'completed' : 'needsAction',
    notes: input.notes?.trim() ? input.notes : undefined
  }
  if (input.dueIso != null && String(input.dueIso).trim() !== '') {
    body.due = dueIsoToGoogleTasksDue(String(input.dueIso))
  }
  const res = await tasks.tasks.insert({
    tasklist: listId,
    requestBody: body
  })
  const t = res.data
  const row = rowFromGoogleTask(listId, t)
  if (!row) throw new Error('Google Tasks: Antwort ohne Aufgaben-ID.')
  return row
}

export async function googlePatchTask(
  accountId: string,
  listId: string,
  taskId: string,
  patch: {
    title?: string | null
    notes?: string | null
    dueIso?: string | null
    completed?: boolean
  }
): Promise<TaskItemRow> {
  const { tasks } = await getGoogleApis(accountId)
  const body: tasks_v1.Schema$Task = {}
  if (patch.title !== undefined) {
    body.title = patch.title === null ? '' : String(patch.title).trim() || '(Ohne Titel)'
  }
  if (patch.notes !== undefined) {
    body.notes = patch.notes === null ? '' : String(patch.notes)
  }
  if (patch.dueIso !== undefined) {
    if (patch.dueIso === null || String(patch.dueIso).trim() === '') {
      body.due = null
    } else {
      body.due = dueIsoToGoogleTasksDue(String(patch.dueIso))
    }
  }
  if (patch.completed !== undefined) {
    body.status = patch.completed ? 'completed' : 'needsAction'
  }
  const res = await tasks.tasks.patch({
    tasklist: listId,
    task: taskId,
    requestBody: body
  })
  const row = rowFromGoogleTask(listId, res.data)
  if (!row) throw new Error('Google Tasks: Patch-Antwort ungueltig.')
  return row
}

export async function googleUpdateTask(
  accountId: string,
  listId: string,
  taskId: string,
  input: { title: string; notes?: string | null; dueIso?: string | null; completed?: boolean }
): Promise<TaskItemRow> {
  const { tasks } = await getGoogleApis(accountId)
  const cur = await tasks.tasks.get({ tasklist: listId, task: taskId })
  const merged: tasks_v1.Schema$Task = {
    ...cur.data,
    title: input.title.trim() || '(Ohne Titel)',
    status: input.completed ? 'completed' : 'needsAction'
  }
  if (input.notes != null && String(input.notes).trim() !== '') {
    merged.notes = String(input.notes)
  } else {
    merged.notes = ''
  }
  if (input.dueIso != null && String(input.dueIso).trim() !== '') {
    merged.due = dueIsoToGoogleTasksDue(String(input.dueIso))
  } else {
    merged.due = null
  }
  const res = await tasks.tasks.update({
    tasklist: listId,
    task: taskId,
    requestBody: merged
  })
  const row = rowFromGoogleTask(listId, res.data)
  if (!row) throw new Error('Google Tasks: Update-Antwort ungueltig.')
  return row
}

export async function googleDeleteTask(accountId: string, listId: string, taskId: string): Promise<void> {
  const { tasks } = await getGoogleApis(accountId)
  await tasks.tasks.delete({ tasklist: listId, task: taskId })
}
