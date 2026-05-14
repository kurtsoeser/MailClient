import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckSquare,
  Loader2,
  Plus,
  RefreshCw,
  Square,
  Trash2
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ConnectedAccount, TaskItemRow, TaskListRow } from '@shared/types'
import { useAccountsStore } from '@/stores/accounts'
import { cn } from '@/lib/utils'
import { resolvedAccountColorCss } from '@/lib/avatar-color'
import {
  ModuleColumnHeaderIconButton,
  moduleColumnHeaderIconGlyphClass,
  moduleColumnHeaderOutlineSmClass,
  moduleColumnHeaderShellBarClass,
  moduleColumnHeaderSubToolbarClass,
  moduleColumnHeaderTitleClass,
  moduleColumnHeaderPrimarySmClass
} from '@/components/ModuleColumnHeader'

function dueDateInputValue(dueIso: string | null): string {
  if (!dueIso) return ''
  if (/^\d{4}-\d{2}-\d{2}/.test(dueIso)) return dueIso.slice(0, 10)
  try {
    const d = new Date(dueIso)
    if (Number.isNaN(d.getTime())) return ''
    return d.toISOString().slice(0, 10)
  } catch {
    return ''
  }
}

export function TasksShell(): JSX.Element {
  const { t } = useTranslation()
  const accounts = useAccountsStore((s) => s.accounts)
  const taskAccounts = useMemo(
    () => accounts.filter((a) => a.provider === 'microsoft' || a.provider === 'google'),
    [accounts]
  )

  const [accountId, setAccountId] = useState<string | null>(null)
  const [lists, setLists] = useState<TaskListRow[]>([])
  const [listsLoading, setListsLoading] = useState(false)
  const [listsError, setListsError] = useState<string | null>(null)

  const [listId, setListId] = useState<string | null>(null)
  const [tasks, setTasks] = useState<TaskItemRow[]>([])
  const [tasksLoading, setTasksLoading] = useState(false)
  const [tasksError, setTasksError] = useState<string | null>(null)
  const [showCompleted, setShowCompleted] = useState(true)

  const [selected, setSelected] = useState<TaskItemRow | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editDue, setEditDue] = useState('')
  const [saving, setSaving] = useState(false)

  const [newTitle, setNewTitle] = useState('')

  useEffect(() => {
    if (!accountId && taskAccounts.length > 0) {
      setAccountId(taskAccounts[0]!.id)
    }
    if (accountId && !taskAccounts.some((a) => a.id === accountId)) {
      setAccountId(taskAccounts[0]?.id ?? null)
    }
  }, [accountId, taskAccounts])

  const loadLists = useCallback(async (): Promise<void> => {
    if (!accountId) {
      setLists([])
      setListId(null)
      return
    }
    setListsLoading(true)
    setListsError(null)
    try {
      const rows = await window.mailClient.tasks.listLists({ accountId })
      setLists(rows)
      setListId((cur) => {
        if (cur && rows.some((r) => r.id === cur)) return cur
        const def = rows.find((r) => r.isDefault)
        return def?.id ?? rows[0]?.id ?? null
      })
    } catch (e) {
      setListsError(e instanceof Error ? e.message : String(e))
      setLists([])
      setListId(null)
    } finally {
      setListsLoading(false)
    }
  }, [accountId])

  const loadTasks = useCallback(async (): Promise<void> => {
    if (!accountId || !listId) {
      setTasks([])
      return
    }
    setTasksLoading(true)
    setTasksError(null)
    try {
      const rows = await window.mailClient.tasks.listTasks({
        accountId,
        listId,
        showCompleted,
        showHidden: false
      })
      setTasks(rows)
    } catch (e) {
      setTasksError(e instanceof Error ? e.message : String(e))
      setTasks([])
    } finally {
      setTasksLoading(false)
    }
  }, [accountId, listId, showCompleted])

  useEffect(() => {
    void loadLists()
  }, [loadLists])

  useEffect(() => {
    void loadTasks()
  }, [loadTasks])

  useEffect(() => {
    if (!selected) {
      setEditTitle('')
      setEditNotes('')
      setEditDue('')
      return
    }
    setEditTitle(selected.title)
    setEditNotes(selected.notes ?? '')
    setEditDue(dueDateInputValue(selected.dueIso))
  }, [selected])

  const accountLabel = useCallback(
    (a: ConnectedAccount) => a.displayName?.trim() || a.email,
    []
  )

  async function toggleCompleted(task: TaskItemRow): Promise<void> {
    if (!accountId || !listId) return
    try {
      const next = await window.mailClient.tasks.patchTask({
        accountId,
        listId,
        taskId: task.id,
        completed: !task.completed
      })
      setTasks((prev) => prev.map((x) => (x.id === next.id ? next : x)))
      setSelected((s) => (s?.id === next.id ? next : s))
    } catch {
      void loadTasks()
    }
  }

  async function saveSelected(): Promise<void> {
    if (!accountId || !listId || !selected) return
    setSaving(true)
    try {
      const dueIso = editDue.trim() === '' ? null : editDue.trim()
      const next = await window.mailClient.tasks.updateTask({
        accountId,
        listId,
        taskId: selected.id,
        title: editTitle.trim() || t('tasks.shell.untitled'),
        notes: editNotes.trim() || null,
        dueIso,
        completed: selected.completed
      })
      setTasks((prev) => prev.map((x) => (x.id === next.id ? next : x)))
      setSelected(next)
    } catch (e) {
      setTasksError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  async function deleteSelected(): Promise<void> {
    if (!accountId || !listId || !selected) return
    const ok = window.confirm(t('tasks.shell.deleteConfirm'))
    if (!ok) return
    setSaving(true)
    try {
      await window.mailClient.tasks.deleteTask({
        accountId,
        listId,
        taskId: selected.id
      })
      setSelected(null)
      await loadTasks()
    } catch (e) {
      setTasksError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  async function createTask(): Promise<void> {
    const title = newTitle.trim()
    if (!accountId || !listId || !title) return
    setSaving(true)
    try {
      const row = await window.mailClient.tasks.createTask({
        accountId,
        listId,
        title,
        completed: false
      })
      setNewTitle('')
      await loadTasks()
      setSelected(row)
    } catch (e) {
      setTasksError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="flex min-h-0 flex-1 bg-background">
      <aside className="flex w-[260px] shrink-0 flex-col border-r border-border bg-card">
        <header className={cn(moduleColumnHeaderShellBarClass, 'justify-start')}>
          <span className={moduleColumnHeaderTitleClass}>{t('tasks.shell.title')}</span>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {taskAccounts.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">{t('tasks.shell.noAccounts')}</p>
          ) : (
            <ul className="space-y-1">
              {taskAccounts.map((a) => {
                const active = a.id === accountId
                const ring = resolvedAccountColorCss(a.color)
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={(): void => {
                        setAccountId(a.id)
                        setListId(null)
                        setSelected(null)
                      }}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs transition-colors',
                        active ? 'bg-secondary text-foreground' : 'hover:bg-secondary/60 text-muted-foreground'
                      )}
                    >
                      <span
                        className="h-8 w-1 shrink-0 rounded-full"
                        style={{ backgroundColor: ring }}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate font-medium">{accountLabel(a)}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </aside>

      <aside className="flex w-[280px] shrink-0 flex-col border-r border-border bg-card">
        <header className={moduleColumnHeaderShellBarClass}>
          <span className={moduleColumnHeaderTitleClass}>{t('tasks.shell.listsHeading')}</span>
          <ModuleColumnHeaderIconButton
            type="button"
            title={t('tasks.shell.refresh')}
            onClick={(): void => void loadLists()}
          >
            <RefreshCw className={cn(moduleColumnHeaderIconGlyphClass, listsLoading && 'animate-spin')} />
          </ModuleColumnHeaderIconButton>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {listsError ? (
            <p className="px-2 py-2 text-xs text-destructive">{listsError}</p>
          ) : listsLoading && lists.length === 0 ? (
            <div className="flex items-center gap-2 px-2 py-4 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('common.loading')}
            </div>
          ) : (
            <ul className="space-y-0.5">
              {lists.map((L) => (
                <li key={L.id}>
                  <button
                    type="button"
                    onClick={(): void => {
                      setListId(L.id)
                      setSelected(null)
                    }}
                    className={cn(
                      'w-full rounded-md px-2 py-2 text-left text-xs transition-colors',
                      L.id === listId
                        ? 'bg-primary/15 font-medium text-foreground'
                        : 'text-muted-foreground hover:bg-secondary/60'
                    )}
                  >
                    <span className="line-clamp-2">{L.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className={cn(moduleColumnHeaderShellBarClass, 'justify-start gap-3')}>
          <label className="flex min-w-0 items-center gap-2 text-muted-foreground">
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={(e): void => setShowCompleted(e.target.checked)}
            />
            <span className="truncate">{t('tasks.shell.showCompleted')}</span>
          </label>
          <button
            type="button"
            onClick={(): void => void loadTasks()}
            className={moduleColumnHeaderOutlineSmClass}
          >
            <RefreshCw className={cn(moduleColumnHeaderIconGlyphClass, tasksLoading && 'animate-spin')} />
            {t('tasks.shell.refreshTasks')}
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col border-b border-border lg:border-b-0 lg:border-r">
            <div className="border-b border-border p-3">
              <div className="flex gap-2">
                <input
                  value={newTitle}
                  onChange={(e): void => setNewTitle(e.target.value)}
                  onKeyDown={(e): void => {
                    if (e.key === 'Enter') void createTask()
                  }}
                  placeholder={t('tasks.shell.newTaskPlaceholder')}
                  className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
                  disabled={!accountId || !listId || saving}
                />
                <button
                  type="button"
                  onClick={(): void => void createTask()}
                  disabled={!accountId || !listId || saving || !newTitle.trim()}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t('tasks.shell.add')}
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {tasksError ? (
                <p className="p-4 text-xs text-destructive">{tasksError}</p>
              ) : tasksLoading && tasks.length === 0 ? (
                <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('common.loading')}
                </div>
              ) : tasks.length === 0 ? (
                <p className="p-4 text-xs text-muted-foreground">{t('tasks.shell.emptyTasks')}</p>
              ) : (
                <ul>
                  {tasks.map((task) => {
                    const active = selected?.id === task.id
                    return (
                      <li key={task.id} className="border-b border-border/60">
                        <div className="flex items-start gap-2 px-3 py-2">
                          <button
                            type="button"
                            title={task.completed ? t('tasks.shell.markOpen') : t('tasks.shell.markDone')}
                            onClick={(): void => void toggleCompleted(task)}
                            className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
                          >
                            {task.completed ? (
                              <CheckSquare className="h-4 w-4 text-primary" />
                            ) : (
                              <Square className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={(): void => setSelected(task)}
                            className={cn(
                              'min-w-0 flex-1 text-left text-xs',
                              active ? 'font-semibold text-foreground' : 'text-foreground/90',
                              task.completed && 'text-muted-foreground line-through'
                            )}
                          >
                            <span className="line-clamp-2">{task.title}</span>
                            {task.dueIso ? (
                              <span className="mt-0.5 block text-[10px] text-muted-foreground">
                                {dueDateInputValue(task.dueIso)}
                              </span>
                            ) : null}
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>

          <div className="flex w-full shrink-0 flex-col bg-card lg:w-[360px]">
            <div className="border-b border-border px-3 py-2">
              <h2 className="text-xs font-semibold text-foreground">{t('tasks.shell.detailHeading')}</h2>
            </div>
            {selected ? (
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
                <div>
                  <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {t('tasks.shell.fieldTitle')}
                  </label>
                  <input
                    value={editTitle}
                    onChange={(e): void => setEditTitle(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {t('tasks.shell.fieldDue')}
                  </label>
                  <input
                    type="date"
                    value={editDue}
                    onChange={(e): void => setEditDue(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="min-h-0 flex-1">
                  <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {t('tasks.shell.fieldNotes')}
                  </label>
                  <textarea
                    value={editNotes}
                    onChange={(e): void => setEditNotes(e.target.value)}
                    rows={8}
                    className="h-full min-h-[120px] w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={(): void => void saveSelected()}
                    disabled={saving}
                    className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                  >
                    {saving ? t('common.loading') : t('common.save')}
                  </button>
                  <button
                    type="button"
                    onClick={(): void => void deleteSelected()}
                    disabled={saving}
                    className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t('common.delete')}
                  </button>
                </div>
              </div>
            ) : (
              <p className="p-4 text-xs text-muted-foreground">{t('tasks.shell.selectTask')}</p>
            )}
          </div>
        </div>
      </main>
    </section>
  )
}
