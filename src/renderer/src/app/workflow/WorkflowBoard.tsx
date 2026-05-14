import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type ReactNode
} from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useMailStore } from '@/stores/mail'
import { useAccountsStore } from '@/stores/accounts'
import { useComposeStore } from '@/stores/compose'
import { useSnoozeUiStore } from '@/stores/snooze-ui'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import {
  moduleColumnHeaderIconGlyphClass,
  moduleColumnHeaderShellBarClass,
  moduleColumnHeaderTitleClass
} from '@/components/ModuleColumnHeader'
import { indexMessagesByThread, type ThreadGroup } from '@/lib/thread-group'
import type { TFunction } from 'i18next'
import type {
  ConnectedAccount,
  MailListItem,
  TodoDueKindList,
  TodoDueKindOpen,
  WorkflowBoard as WorkflowBoardType,
  WorkflowColumn
} from '@shared/types'
import {
  buildMailContextItems,
  buildMailCategorySubmenuItems,
  type MailContextHandlers
} from '@/lib/mail-context-menu'
import { ContextMenu, type ContextMenuItem } from '@/components/ContextMenu'
import { ObjectNoteDialog, type ObjectNoteTarget } from '@/components/ObjectNoteEditor'
import { ReadingPane } from '@/app/layout/ReadingPane'
import { VerticalSplitter, useResizableWidth } from '@/components/ResizableSplitter'
import { ChevronLeft, ChevronRight, GripVertical, LayoutGrid } from 'lucide-react'
import { WorkflowThreadBlock } from '@/app/workflow/WorkflowThreadBlock'
import { useUndoStore } from '@/stores/undo'
import { MIME_THREAD_IDS, readDraggedWorkflowMessageIds } from '@/lib/workflow-dnd'

const COLLAPSE_STORAGE_KEY = 'mailclient.workflow.collapsedColumns'
const THREAD_EXPAND_KEY = 'mailclient.workflow.expandedThreads'

/** Offene ToDo-Spalten im Workflow (Anzeige nach Fälligkeit, ohne Erledigt-Liste). */
type WorkflowTodoBucket = Exclude<TodoDueKindList, 'done'>

const WORKFLOW_TODO_BUCKETS: readonly WorkflowTodoBucket[] = [
  'overdue',
  'today',
  'tomorrow',
  'this_week',
  'later'
]

function resolveColumnOpenTodoKind(col: WorkflowColumn): WorkflowTodoBucket | null {
  const dk = col.todoDueKind
  if (dk === 'overdue') return 'overdue'
  if (dk === 'today' || dk === 'tomorrow' || dk === 'this_week' || dk === 'later') return dk
  if (col.quickStepId === 2 || col.id === 'today' || col.title === 'ToDo Heute') return 'today'
  return null
}

/** Anzeigename Kanban-Spalte: DB-`title` nur Fallback fuer unbekannte Spalten. */
function workflowKanbanColumnHeading(column: WorkflowColumn, t: TFunction): string {
  const kind = column.todoDueKind ?? null
  if (kind === 'done') return t('workflow.doneColumnTitle')
  if (
    kind === 'overdue' ||
    kind === 'today' ||
    kind === 'tomorrow' ||
    kind === 'this_week' ||
    kind === 'later'
  ) {
    return t(`mail.todoBucket.${kind}`)
  }
  if (column.quickStepId == null && kind === null) {
    return t('workflow.inboxColumnTitle')
  }
  return column.title
}

function threadExpandKey(columnId: string, threadKey: string): string {
  return `${columnId}\t${threadKey}`
}

function readExpandedThreadKeys(): Set<string> {
  try {
    const raw = window.localStorage.getItem(THREAD_EXPAND_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((x): x is string => typeof x === 'string'))
  } catch {
    return new Set()
  }
}

function persistExpandedThreadKeys(ids: Set<string>): void {
  try {
    window.localStorage.setItem(THREAD_EXPAND_KEY, JSON.stringify([...ids]))
  } catch {
    // ignore
  }
}

function readCollapsedIds(): Set<string> {
  try {
    const raw = window.localStorage.getItem(COLLAPSE_STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((x): x is string => typeof x === 'string'))
  } catch {
    return new Set()
  }
}

function persistCollapsedIds(ids: Set<string>): void {
  try {
    window.localStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify([...ids]))
  } catch {
    // ignore
  }
}

/** Ohne preventDefault auf dragenter/dragover loest Chromium oft kein drop aus. */
function handleColumnNativeDragHover(e: DragEvent<Element>): void {
  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'
}

/** Cross-Ordner-Threadteile fuer Workflow-Posteingang (nur Inbox-Liste, pro Konto batchen). */
async function fetchInboxTriageThreadExtras(
  messages: MailListItem[]
): Promise<Record<string, MailListItem[]>> {
  const byAccount = new Map<string, Set<string>>()
  for (const m of messages) {
    const k = m.remoteThreadId
    if (!k) continue
    let s = byAccount.get(m.accountId)
    if (!s) {
      s = new Set()
      byAccount.set(m.accountId, s)
    }
    s.add(k)
  }
  const merged: Record<string, MailListItem[]> = {}
  for (const [accountId, keys] of byAccount) {
    if (keys.size === 0) continue
    const list = await window.mailClient.mail
      .listMessagesByThreads({ accountId, threadKeys: [...keys] })
      .catch(() => [] as MailListItem[])
    for (const m of list) {
      const tk = m.remoteThreadId
      if (!tk) continue
      const arr = merged[tk] ?? (merged[tk] = [])
      if (!arr.some((x) => x.id === m.id)) arr.push(m)
    }
  }
  for (const arr of Object.values(merged)) {
    arr.sort((a, b) => {
      const ad = a.receivedAt ?? a.sentAt ?? ''
      const bd = b.receivedAt ?? b.sentAt ?? ''
      if (ad === bd) return 0
      return ad < bd ? 1 : -1
    })
  }
  return merged
}

interface MailContextState {
  x: number
  y: number
  items: ContextMenuItem[]
}

export function WorkflowBoard(): JSX.Element {
  const { t } = useTranslation()
  const [boards, setBoards] = useState<WorkflowBoardType[]>([])
  const [orderedColumns, setOrderedColumns] = useState<WorkflowColumn[]>([])
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(readCollapsedIds)
  const [contextMenu, setContextMenu] = useState<MailContextState | null>(null)
  const [noteTarget, setNoteTarget] = useState<ObjectNoteTarget | null>(null)
  const [todoMessagesByKind, setTodoMessagesByKind] = useState<
    Partial<Record<WorkflowTodoBucket, MailListItem[]>>
  >({})
  const [expandedThreadKeys, setExpandedThreadKeys] = useState<Set<string>>(readExpandedThreadKeys)
  const [inboxTriageMessages, setInboxTriageMessages] = useState<MailListItem[]>([])
  const [triageThreadExtras, setTriageThreadExtras] = useState<Record<string, MailListItem[]>>({})

  /** Verhindert, dass aeltere parallele `loadInboxTriage`-Laeufe frische Daten ueberschreiben. */
  const inboxTriageFetchGen = useRef(0)

  const threadMessages = useMailStore((s) => s.threadMessages)
  const todoCounts = useMailStore((s) => s.todoCounts)
  const refreshNow = useMailStore((s) => s.refreshNow)
  const selectMessage = useMailStore((s) => s.selectMessage)
  const selectedMessageId = useMailStore((s) => s.selectedMessageId)
  const setMessageRead = useMailStore((s) => s.setMessageRead)
  const toggleMessageFlag = useMailStore((s) => s.toggleMessageFlag)
  const archiveMessage = useMailStore((s) => s.archiveMessage)
  const deleteMessage = useMailStore((s) => s.deleteMessage)
  const setTodoForMessage = useMailStore((s) => s.setTodoForMessage)
  const completeTodoForMessage = useMailStore((s) => s.completeTodoForMessage)
  const setWaitingForMessage = useMailStore((s) => s.setWaitingForMessage)
  const clearWaitingForMessage = useMailStore((s) => s.clearWaitingForMessage)

  const accounts = useAccountsStore((s) => s.accounts)
  const openReply = useComposeStore((s) => s.openReply)
  const openForward = useComposeStore((s) => s.openForward)
  const openSnoozePicker = useSnoozeUiStore((s) => s.open)

  const [previewWidth, setPreviewWidth] = useResizableWidth({
    storageKey: 'mailclient.workflowPreviewWidth',
    defaultWidth: 400,
    minWidth: 280,
    maxWidth: 900
  })

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 }
    })
  )

  const reloadBoards = useCallback((): void => {
    void window.mailClient.workflow
      .listBoards()
      .then(setBoards)
      .catch(() => setBoards([]))
  }, [])

  useEffect(() => {
    reloadBoards()
  }, [reloadBoards])

  const board = boards[0]

  const todoDueKindsOnBoard = useMemo((): WorkflowTodoBucket[] => {
    const seen = new Set<WorkflowTodoBucket>()
    for (const c of orderedColumns) {
      const k = resolveColumnOpenTodoKind(c)
      if (k) seen.add(k)
    }
    return [...seen]
  }, [orderedColumns])

  const todoDueKindsOnBoardKey = useMemo(() => todoDueKindsOnBoard.join(','), [todoDueKindsOnBoard])

  const todoDueKindsRef = useRef<WorkflowTodoBucket[]>([])
  todoDueKindsRef.current = todoDueKindsOnBoard

  const loadOpenTodoBuckets = useCallback((kinds: readonly WorkflowTodoBucket[]): void => {
    if (kinds.length === 0) {
      setTodoMessagesByKind({})
      return
    }
    void Promise.all(
      kinds.map(async (dueKind) => {
        const list = await window.mailClient.mail
          .listTodoMessages({ accountId: null, dueKind, limit: 200 })
          .catch(() => [] as MailListItem[])
        return [dueKind, list] as const
      })
    ).then((pairs) => {
      setTodoMessagesByKind(
        Object.fromEntries(pairs) as Partial<Record<WorkflowTodoBucket, MailListItem[]>>
      )
    })
  }, [])

  const reloadTodoBuckets = useCallback((): void => {
    loadOpenTodoBuckets(todoDueKindsRef.current)
  }, [loadOpenTodoBuckets])

  const loadInboxTriage = useCallback(async (): Promise<void> => {
    const gen = ++inboxTriageFetchGen.current
    try {
      const raw = await window.mailClient.mail.listInboxTriage(200)
      if (gen !== inboxTriageFetchGen.current) return
      const extras = await fetchInboxTriageThreadExtras(raw)
      if (gen !== inboxTriageFetchGen.current) return
      setInboxTriageMessages(raw)
      setTriageThreadExtras(extras)
    } catch {
      if (gen !== inboxTriageFetchGen.current) return
      setInboxTriageMessages([])
      setTriageThreadExtras({})
    }
  }, [])

  const accountsKey = useMemo(
    () =>
      [...accounts]
        .map((a) => a.id)
        .sort()
        .join('\0'),
    [accounts]
  )

  useEffect(() => {
    if (!board) return
    void loadInboxTriage()
  }, [board?.id, accountsKey, loadInboxTriage, board])

  useEffect(() => {
    const off = window.mailClient.events.onMailChanged(() => {
      void loadInboxTriage()
      reloadTodoBuckets()
    })
    return off
  }, [loadInboxTriage, reloadTodoBuckets])

  useEffect(() => {
    if (!board) {
      setOrderedColumns([])
      return
    }
    if (board.columns?.length) {
      setOrderedColumns(board.columns)
    }
  }, [board])

  const todoOpenSignature = useMemo(
    () =>
      [
        todoCounts.overdue,
        todoCounts.today,
        todoCounts.tomorrow,
        todoCounts.this_week,
        todoCounts.later
      ].join('|'),
    [
      todoCounts.overdue,
      todoCounts.today,
      todoCounts.tomorrow,
      todoCounts.this_week,
      todoCounts.later
    ]
  )

  useEffect(() => {
    loadOpenTodoBuckets(todoDueKindsOnBoard)
  }, [board?.id, todoDueKindsOnBoardKey, todoOpenSignature, loadOpenTodoBuckets, todoDueKindsOnBoard])

  const setTodoForMessageWorkflow = useCallback(
    async (messageId: number, dueKind: TodoDueKindOpen): Promise<void> => {
      await setTodoForMessage(messageId, dueKind)
      reloadTodoBuckets()
    },
    [setTodoForMessage, reloadTodoBuckets]
  )

  const completeTodoForMessageWorkflow = useCallback(
    async (messageId: number): Promise<void> => {
      await completeTodoForMessage(messageId)
      reloadTodoBuckets()
    },
    [completeTodoForMessage, reloadTodoBuckets]
  )

  const mailContextHandlers = useMemo<MailContextHandlers>(
    () => ({
      openReply,
      openForward,
      openNote: (message): void => {
        void selectMessage(message.id)
        setNoteTarget({
          kind: 'mail',
          messageId: message.id,
          title: message.subject || t('common.noSubject')
        })
      },
      setMessageRead,
      toggleMessageFlag,
      archiveMessage,
      deleteMessage,
      setTodoForMessage: setTodoForMessageWorkflow,
      completeTodoForMessage: completeTodoForMessageWorkflow,
      setWaitingForMessage,
      clearWaitingForMessage,
      openSnoozePicker,
      refreshNow
    }),
    [
      openReply,
      openForward,
      selectMessage,
      t,
      setMessageRead,
      toggleMessageFlag,
      archiveMessage,
      deleteMessage,
      setTodoForMessageWorkflow,
      completeTodoForMessageWorkflow,
      setWaitingForMessage,
      clearWaitingForMessage,
      openSnoozePicker,
      refreshNow
    ]
  )

  const openWorkflowMailContext = useCallback(
    async (
      e: React.MouseEvent,
      message: MailListItem,
      opts?: { applyToMessageIds?: number[]; threadMessagesForContext?: MailListItem[] }
    ): Promise<void> => {
      e.preventDefault()
      e.stopPropagation()
      const anchor = { x: e.clientX, y: e.clientY }
      const ui = {
        snoozeAnchor: anchor,
        applyToMessageIds: opts?.applyToMessageIds,
        threadMessagesForContext: opts?.threadMessagesForContext
      }
      const cat = await buildMailCategorySubmenuItems(message, ui, refreshNow)
      const items = buildMailContextItems(message, mailContextHandlers, {
        ...ui,
        categorySubmenu: cat.length > 0 ? cat : undefined,
        t
      })
      setContextMenu({ x: anchor.x, y: anchor.y, items })
    },
    [mailContextHandlers, refreshNow, t]
  )

  const unionOpenTodoIdsOnBoard = useMemo(() => {
    const s = new Set<number>()
    for (const k of todoDueKindsOnBoard) {
      const arr = todoMessagesByKind[k]
      if (arr) for (const m of arr) s.add(m.id)
    }
    return s
  }, [todoDueKindsOnBoard, todoMessagesByKind])

  const triageInboxMessages = useMemo(
    () => inboxTriageMessages.filter((m) => !unionOpenTodoIdsOnBoard.has(m.id)).slice(0, 80),
    [inboxTriageMessages, unionOpenTodoIdsOnBoard]
  )

  const { threads: triageThreads, messagesByThread: triageByThread } = useMemo(
    () => indexMessagesByThread(triageInboxMessages, triageThreadExtras),
    [triageInboxMessages, triageThreadExtras]
  )

  const todoThreadIndexes = useMemo(() => {
    const m = new Map<
      WorkflowTodoBucket,
      { threads: ThreadGroup[]; messagesByThread: Map<string, MailListItem[]> }
    >()
    for (const k of WORKFLOW_TODO_BUCKETS) {
      if (!todoDueKindsOnBoard.includes(k)) continue
      const msgs = todoMessagesByKind[k] ?? []
      m.set(k, indexMessagesByThread(msgs, threadMessages))
    }
    return m
  }, [todoDueKindsOnBoard, todoMessagesByKind, threadMessages])

  const toggleWorkflowThreadExpanded = useCallback((columnId: string, threadKey: string): void => {
    const key = threadExpandKey(columnId, threadKey)
    setExpandedThreadKeys((prev) => {
      const n = new Set(prev)
      if (n.has(key)) n.delete(key)
      else n.add(key)
      persistExpandedThreadKeys(n)
      return n
    })
  }, [])

  async function onDropColumnMany(
    quickStepId: number | null,
    messageIds: number[]
  ): Promise<void> {
    if (quickStepId == null || messageIds.length === 0) return
    try {
      for (const messageId of messageIds) {
        await window.mailClient.mail.runQuickStep({ quickStepId, messageId })
      }
      await refreshNow()
      reloadTodoBuckets()
      void loadInboxTriage()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.warn('[WorkflowBoard] QuickStep:', e)
      useUndoStore.getState().pushToast({
        label: `QuickStep fehlgeschlagen: ${msg}`,
        variant: 'error',
        durationMs: 8000
      })
    }
  }

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!board) return
      const { active, over } = event
      if (!over || active.id === over.id) return
      setOrderedColumns((cols) => {
        const oldIndex = cols.findIndex((c) => c.id === active.id)
        const newIndex = cols.findIndex((c) => c.id === over.id)
        if (oldIndex < 0 || newIndex < 0) return cols
        const next = arrayMove(cols, oldIndex, newIndex)
        void window.mailClient.workflow
          .updateBoardColumns({ boardId: board.id, columns: next })
          .then(() => reloadBoards())
          .catch((err) => {
            console.warn('[WorkflowBoard] Spalten-Reihenfolge speichern fehlgeschlagen:', err)
            reloadBoards()
          })
        return next
      })
    },
    [board, reloadBoards]
  )

  const toggleCollapsed = useCallback((colId: string): void => {
    setCollapsedIds((prev) => {
      const n = new Set(prev)
      if (n.has(colId)) n.delete(colId)
      else n.add(colId)
      persistCollapsedIds(n)
      return n
    })
  }, [])

  /** Rechte Vorschau: Splitter sitzt links von der Vorschau — Delta zur Sidebar spiegeln. */
  const onDragPreview = useCallback(
    (delta: number) => setPreviewWidth((w) => w - delta),
    [setPreviewWidth]
  )

  if (!board) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        {t('workflow.noBoard')}
      </div>
    )
  }

  const columnIds = orderedColumns.map((c) => c.id)

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-background">
      <header className={cn(moduleColumnHeaderShellBarClass, 'min-w-0 gap-2')}>
        <LayoutGrid className={cn(moduleColumnHeaderIconGlyphClass, 'shrink-0 text-muted-foreground')} />
        <span className={cn(moduleColumnHeaderTitleClass, 'shrink-0')}>{board.name}</span>
        <span className="min-w-0 truncate text-muted-foreground">{t('workflow.introHint')}</span>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={columnIds} strategy={horizontalListSortingStrategy}>
              <div className="flex min-h-0 flex-1 gap-2 overflow-x-auto overflow-y-hidden p-2">
                {orderedColumns.map((col) => {
                  /** Posteingang: beides null; ueberfaellig: todoDueKind gesetzt, quickStepId null. */
                  const isInboxTriage = col.quickStepId == null && col.todoDueKind == null
                  const openTodoKind = resolveColumnOpenTodoKind(col)
                  const todoIdx = openTodoKind ? todoThreadIndexes.get(openTodoKind) : undefined
                  return (
                    <SortableWorkflowColumn
                      key={col.id}
                      column={col}
                      collapsed={collapsedIds.has(col.id)}
                      onToggleCollapsed={(): void => toggleCollapsed(col.id)}
                      onNativeDragEnter={handleColumnNativeDragHover}
                      onNativeDragOver={handleColumnNativeDragHover}
                      onNativeDrop={(e): void => {
                        e.preventDefault()
                        const ids = readDraggedWorkflowMessageIds(e.dataTransfer)
                        if (ids.length > 0) void onDropColumnMany(col.quickStepId, ids)
                      }}
                    >
                      {isInboxTriage &&
                        triageThreads.map((t) => {
                          const tMsgs = triageByThread.get(t.threadKey) ?? [t.latestMessage]
                          const convIds = [...new Set(tMsgs.map((m) => m.id))]
                          const exKey = threadExpandKey(col.id, t.threadKey)
                          return (
                            <WorkflowThreadBlock
                              key={t.threadKey}
                              thread={t}
                              threadMessages={tMsgs}
                              conversationDragIds={convIds}
                              expanded={expandedThreadKeys.has(exKey)}
                              onToggleExpand={(): void => toggleWorkflowThreadExpanded(col.id, t.threadKey)}
                              accounts={accounts}
                              selectedMessageId={selectedMessageId}
                              onSelectMessage={(id): void => void selectMessage(id)}
                              onOpenConversationContext={(e, latest, ids, ctxMsgs): void => {
                                void openWorkflowMailContext(e, latest, {
                                  applyToMessageIds: ids,
                                  threadMessagesForContext: ctxMsgs
                                })
                              }}
                              onOpenMessageContext={(e, m): void => {
                                void openWorkflowMailContext(e, m)
                              }}
                            />
                          )
                        })}
                      {todoIdx &&
                        todoIdx.threads.map((t) => {
                          const tMsgs = todoIdx.messagesByThread.get(t.threadKey) ?? [t.latestMessage]
                          const convIds = [...new Set(tMsgs.map((m) => m.id))]
                          const exKey = threadExpandKey(col.id, t.threadKey)
                          return (
                            <WorkflowThreadBlock
                              key={`${col.id}:${t.threadKey}`}
                              thread={t}
                              threadMessages={tMsgs}
                              conversationDragIds={convIds}
                              expanded={expandedThreadKeys.has(exKey)}
                              onToggleExpand={(): void => toggleWorkflowThreadExpanded(col.id, t.threadKey)}
                              accounts={accounts}
                              selectedMessageId={selectedMessageId}
                              onSelectMessage={(id): void => void selectMessage(id)}
                              onOpenConversationContext={(e, latest, ids, ctxMsgs): void => {
                                void openWorkflowMailContext(e, latest, {
                                  applyToMessageIds: ids,
                                  threadMessagesForContext: ctxMsgs
                                })
                              }}
                              onOpenMessageContext={(e, m): void => {
                                void openWorkflowMailContext(e, m)
                              }}
                            />
                          )
                        })}
                    </SortableWorkflowColumn>
                  )
                })}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        <VerticalSplitter onDrag={onDragPreview} ariaLabel={t('workflow.previewSplitterAria')} />
        <div
          style={{ width: previewWidth }}
          className="flex h-full min-h-0 shrink-0 flex-col border-l border-border bg-card"
        >
          <ReadingPane />
        </div>
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={(): void => setContextMenu(null)}
        />
      )}
      <ObjectNoteDialog target={noteTarget} onClose={(): void => setNoteTarget(null)} />
    </div>
  )
}

function SortableWorkflowColumn({
  column,
  collapsed,
  onToggleCollapsed,
  onNativeDragEnter,
  onNativeDragOver,
  onNativeDrop,
  children
}: {
  column: WorkflowColumn
  collapsed: boolean
  onToggleCollapsed: () => void
  onNativeDragEnter: (e: DragEvent<Element>) => void
  onNativeDragOver: (e: DragEvent<Element>) => void
  onNativeDrop: (e: DragEvent<Element>) => void
  children: ReactNode
}): JSX.Element {
  const { t } = useTranslation()
  const heading = workflowKanbanColumnHeading(column, t)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: column.id
  })
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.88 : 1,
    zIndex: isDragging ? 2 : undefined
  }

  if (collapsed) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className={cn(
          'flex h-full min-h-[160px] w-11 shrink-0 flex-col rounded-lg border border-border bg-card shadow-sm'
        )}
        onDragEnter={onNativeDragEnter}
        onDragOver={onNativeDragOver}
        onDrop={onNativeDrop}
      >
        <div className="flex shrink-0 flex-col items-center gap-0.5 border-b border-border py-1">
          <button
            type="button"
            className="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            title={t('workflow.dragMoveColumn')}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            title={t('workflow.expandColumn')}
            onClick={onToggleCollapsed}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <button
          type="button"
          className="flex min-h-0 flex-1 items-center justify-center px-1 py-2 text-[10px] font-semibold uppercase leading-tight text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
          style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
          onClick={onToggleCollapsed}
          title={heading}
        >
          {heading}
        </button>
      </div>
    )
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex h-full min-h-0 w-[220px] shrink-0 flex-col rounded-lg border border-border bg-card shadow-sm'
      )}
      onDragEnter={onNativeDragEnter}
      onDragOver={onNativeDragOver}
      onDrop={onNativeDrop}
    >
      <div className="flex shrink-0 items-center gap-1 border-b border-border bg-secondary/40 px-1 py-1">
        <button
          type="button"
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          title={t('workflow.dragMoveColumn')}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          title={t('workflow.collapseColumn')}
          onClick={onToggleCollapsed}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1 truncate px-0.5 text-xs font-semibold" title={heading}>
          {heading}
          {column.quickStepId == null && (
            <span className="ml-1 font-normal text-muted-foreground">{t('workflow.stashSuffix')}</span>
          )}
        </div>
      </div>
      <div className="min-h-[120px] flex-1 space-y-1 overflow-y-auto overflow-x-hidden p-1">{children}</div>
    </div>
  )
}
