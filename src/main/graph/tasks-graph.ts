import { DateTime } from 'luxon'
import type { TaskItemRow, TaskListRow } from '@shared/types'
import { createGraphClient } from './client'
import { loadConfig } from '../config'

async function getClientFor(accountId: string): Promise<ReturnType<typeof createGraphClient>> {
  const config = await loadConfig()
  if (!config.microsoftClientId) {
    throw new Error('Keine Azure Client-ID konfiguriert.')
  }
  const homeAccountId = accountId.replace(/^ms:/, '')
  return createGraphClient(config.microsoftClientId, homeAccountId)
}

interface GraphDateTimeTimeZone {
  dateTime: string
  timeZone: string
}

interface GraphItemBody {
  content?: string | null
  contentType?: string | null
}

interface GraphTodoTaskList {
  id: string
  displayName?: string | null
  wellKnownListName?: string | null
}

interface GraphTodoTask {
  id: string
  title?: string | null
  body?: GraphItemBody | null
  status?: string | null
  dueDateTime?: GraphDateTimeTimeZone | null
}

interface ODataCollection<T> {
  value: T[]
  '@odata.nextLink'?: string
}

function graphDueToIso(d: GraphDateTimeTimeZone | null | undefined): string | null {
  if (!d?.dateTime) return null
  const raw = d.dateTime.trim()
  if (raw.startsWith('0001-01-01')) return null
  const tz = d.timeZone?.trim() || 'UTC'
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw)) {
    const x = DateTime.fromISO(raw, { setZone: true })
    return x.isValid ? x.toUTC().toISO() : null
  }
  const x = DateTime.fromISO(raw, { zone: tz })
  return x.isValid ? x.toUTC().toISO() : null
}

function bodyNotes(body: GraphItemBody | null | undefined): string | null {
  const c = body?.content
  if (typeof c !== 'string' || c.trim() === '') return null
  return c.trim()
}

function rowFromGraphTask(listId: string, t: GraphTodoTask): TaskItemRow | null {
  if (!t.id) return null
  const completed = t.status === 'completed'
  return {
    id: t.id,
    listId,
    title: (t.title ?? '').trim() || '(Ohne Titel)',
    completed,
    dueIso: graphDueToIso(t.dueDateTime),
    notes: bodyNotes(t.body ?? undefined)
  }
}

function dueIsoToGraphPayload(dueIso: string): GraphDateTimeTimeZone | undefined {
  const s = dueIso.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return { dateTime: `${s}T00:00:00.0000000`, timeZone: 'UTC' }
  }
  const dt = DateTime.fromISO(s, { setZone: true })
  if (!dt.isValid) return undefined
  const iso = dt.toUTC().toISO()
  if (!iso) return undefined
  return { dateTime: iso, timeZone: 'UTC' }
}

async function paginateODataPath<T>(accountId: string, initialPath: string): Promise<T[]> {
  const client = await getClientFor(accountId)
  const out: T[] = []
  let url: string | null = initialPath
  while (url) {
    const page = (await client.api(url).get()) as ODataCollection<T>
    for (const v of page.value) {
      out.push(v)
    }
    const next = page['@odata.nextLink']
    url = next ? next.replace(/^https?:\/\/[^/]+\/v[0-9.]+/, '') : null
  }
  return out
}

export async function graphListTodoLists(accountId: string): Promise<TaskListRow[]> {
  const lists = await paginateODataPath<GraphTodoTaskList>(
    accountId,
    '/me/todo/lists?$select=id,displayName,wellKnownListName&$top=200'
  )
  return lists.map((L) => ({
    id: L.id,
    name: (L.displayName ?? '').trim() || L.id,
    isDefault: L.wellKnownListName === 'defaultList',
    provider: 'microsoft' as const
  }))
}

export async function graphListTodoTasks(
  accountId: string,
  listId: string,
  opts?: { showCompleted?: boolean; showHidden?: boolean }
): Promise<TaskItemRow[]> {
  const encList = encodeURIComponent(listId)
  const showCompleted = opts?.showCompleted !== false
  // `showHidden`: Google-spezifisch; Graph liefert keine versteckten To-Do-Listenpositionen analog.
  void opts?.showHidden
  const filter = showCompleted ? '' : "&$filter=status ne 'completed'"
  const tasks = await paginateODataPath<GraphTodoTask>(
    accountId,
    `/me/todo/lists/${encList}/tasks?$select=id,title,body,status,dueDateTime&$top=100${filter}`
  )
  const rows: TaskItemRow[] = []
  for (const t of tasks) {
    const row = rowFromGraphTask(listId, t)
    if (row) rows.push(row)
  }
  return rows
}

export async function graphCreateTodoTask(
  accountId: string,
  listId: string,
  input: { title: string; notes?: string | null; dueIso?: string | null; completed?: boolean }
): Promise<TaskItemRow> {
  const client = await getClientFor(accountId)
  const encList = encodeURIComponent(listId)
  const body: Record<string, unknown> = {
    title: input.title.trim() || '(Ohne Titel)',
    status: input.completed ? 'completed' : 'notStarted'
  }
  if (input.notes != null && String(input.notes).trim() !== '') {
    body.body = { contentType: 'text', content: String(input.notes) }
  }
  if (input.dueIso != null && String(input.dueIso).trim() !== '') {
    const due = dueIsoToGraphPayload(String(input.dueIso))
    if (due) body.dueDateTime = due
  }
  const created = (await client.api(`/me/todo/lists/${encList}/tasks`).post(body)) as GraphTodoTask
  const row = rowFromGraphTask(listId, created)
  if (!row) throw new Error('Graph: Aufgabe konnte nicht gelesen werden.')
  return row
}

export async function graphPatchTodoTask(
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
  const client = await getClientFor(accountId)
  const encList = encodeURIComponent(listId)
  const encTask = encodeURIComponent(taskId)
  const body: Record<string, unknown> = {}
  if (patch.title !== undefined) {
    body.title = patch.title === null ? '' : String(patch.title).trim() || '(Ohne Titel)'
  }
  if (patch.notes !== undefined) {
    if (patch.notes === null || String(patch.notes).trim() === '') {
      body.body = { contentType: 'text', content: '' }
    } else {
      body.body = { contentType: 'text', content: String(patch.notes) }
    }
  }
  if (patch.dueIso !== undefined) {
    if (patch.dueIso === null || String(patch.dueIso).trim() === '') {
      body.dueDateTime = null
    } else {
      const due = dueIsoToGraphPayload(String(patch.dueIso))
      if (due) body.dueDateTime = due
    }
  }
  if (patch.completed !== undefined) {
    body.status = patch.completed ? 'completed' : 'notStarted'
  }
  const updated = (await client
    .api(`/me/todo/lists/${encList}/tasks/${encTask}`)
    .patch(body)) as GraphTodoTask
  const row = rowFromGraphTask(listId, updated)
  if (!row) throw new Error('Graph: Aufgabe nach Patch nicht lesbar.')
  return row
}

export async function graphUpdateTodoTask(
  accountId: string,
  listId: string,
  taskId: string,
  input: { title: string; notes?: string | null; dueIso?: string | null; completed?: boolean }
): Promise<TaskItemRow> {
  return graphPatchTodoTask(accountId, listId, taskId, {
    title: input.title,
    notes: input.notes ?? null,
    dueIso: input.dueIso ?? null,
    completed: input.completed ?? false
  })
}

export async function graphDeleteTodoTask(accountId: string, listId: string, taskId: string): Promise<void> {
  const client = await getClientFor(accountId)
  const encList = encodeURIComponent(listId)
  const encTask = encodeURIComponent(taskId)
  await client.api(`/me/todo/lists/${encList}/tasks/${encTask}`).delete()
}
