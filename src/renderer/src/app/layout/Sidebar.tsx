import {
  AlertCircle,
  Clock,
  FolderPlus,
  Hourglass,
  Layers,
  ListChecks,
  Move,
  Pencil,
  Plus,
  RefreshCw,
  ScanSearch,
  Star,
  StarOff,
  Trash2,
  PanelLeftClose
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { cn } from '@/lib/utils'
import { useAccountsStore } from '@/stores/accounts'
import { useMailStore } from '@/stores/mail'
import { showAppConfirm } from '@/stores/app-dialog'
import { sidebarIsProtectedWellKnownFolder } from '@/lib/sidebar-well-known'
import { ContextMenu, type ContextMenuItem } from '@/components/ContextMenu'
import { MoveFolderDialog } from '@/components/MoveFolderDialog'
import { MetaFolderDialog } from '@/components/MetaFolderDialog'
import { buildAccountColorAndNewContextItems } from '@/lib/account-sidebar-context-menu'
import type { ConnectedAccount, MailFolder, MailListItem, MetaFolderSummary } from '@shared/types'
import type { SidebarInlineEditState } from '@/app/layout/sidebar/sidebar-types'
import {
  SidebarCollapsibleSection
} from '@/app/layout/sidebar/SidebarNavItems'
import {
  readQuickAccessOrder,
  persistQuickAccessOrder,
  readFavoriteFolderOrder,
  persistFavoriteFolderOrder,
  reconcileFavoriteFolderOrder,
  type QuickAccessNavId
} from '@/app/layout/sidebar/sidebar-order-storage'
import {
  SortableSidebarFavoriteRow,
  SortableSidebarNavButton
} from '@/app/layout/sidebar/SidebarSortableNav'
import { SidebarSortableAccountFolderSection } from '@/app/layout/sidebar/SidebarSortableAccount'
import { SidebarFooter } from '@/app/layout/sidebar/SidebarFooter'
import { useUndoStore } from '@/stores/undo'
import { useConnectivityStore } from '@/stores/connectivity'
import { readDraggedWorkflowMessageIds } from '@/lib/workflow-dnd'
import {
  SIDEBAR_HIDDEN_MAIL_FOLDER_KEYS_STORAGE_KEY,
  MAIL_SIDEBAR_FOLDER_VISIBILITY_CHANGED_EVENT,
  mailFolderSidebarVisibilityKey,
  readSidebarHiddenMailFolderKeysFromStorage,
  filterFoldersForMailSidebar
} from '@/lib/mail-sidebar-folder-visibility-storage'

function sameStringSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const x of a) {
    if (!b.has(x)) return false
  }
  return true
}

interface Props {
  onOpenAccountDialog: () => void
}

interface ContextState {
  x: number
  y: number
  folder: MailFolder | null
  accountId: string
}

export function Sidebar({ onOpenAccountDialog }: Props): JSX.Element {
  const { t } = useTranslation()
  const accounts = useAccountsStore((s) => s.accounts)
  const patchAccountColor = useAccountsStore((s) => s.patchAccountColor)
  const profilePhotoDataUrls = useAccountsStore((s) => s.profilePhotoDataUrls)
  const foldersByAccount = useMailStore((s) => s.foldersByAccount)
  const selectedFolderId = useMailStore((s) => s.selectedFolderId)
  const syncByAccount = useMailStore((s) => s.syncByAccount)
  const selectFolder = useMailStore((s) => s.selectFolder)
  const selectTodoView = useMailStore((s) => s.selectTodoView)
  const selectSnoozedView = useMailStore((s) => s.selectSnoozedView)
  const selectWaitingView = useMailStore((s) => s.selectWaitingView)
  const selectUnifiedInbox = useMailStore((s) => s.selectUnifiedInbox)
  const selectMetaFolder = useMailStore((s) => s.selectMetaFolder)
  const createMetaFolder = useMailStore((s) => s.createMetaFolder)
  const updateMetaFolder = useMailStore((s) => s.updateMetaFolder)
  const deleteMetaFolder = useMailStore((s) => s.deleteMetaFolder)
  const reorderMetaFolders = useMailStore((s) => s.reorderMetaFolders)
  const metaFolders = useMailStore((s) => s.metaFolders)
  const selectedMetaFolderId = useMailStore((s) => s.selectedMetaFolderId)
  const listKind = useMailStore((s) => s.listKind)
  const todoDueKind = useMailStore((s) => s.todoDueKind)
  const todoCounts = useMailStore((s) => s.todoCounts)
  const triggerSync = useMailStore((s) => s.triggerSync)
  const createFolder = useMailStore((s) => s.createFolder)
  const renameFolder = useMailStore((s) => s.renameFolder)
  const deleteFolder = useMailStore((s) => s.deleteFolder)
  const moveFolder = useMailStore((s) => s.moveFolder)
  const toggleFolderFavorite = useMailStore((s) => s.toggleFolderFavorite)
  const moveMessagesToFolder = useMailStore((s) => s.moveMessagesToFolder)

  function handleMailDropOnFolder(folder: MailFolder, e: React.DragEvent): void {
    e.preventDefault()
    const ids = readDraggedWorkflowMessageIds(e.dataTransfer)
    if (ids.length === 0) return
    const state = useMailStore.getState()
    const msgs: MailListItem[] = []
    for (const id of ids) {
      const m = state.messages.find((x) => x.id === id)
      if (m) msgs.push(m)
    }
    if (msgs.length === 0) return
    if (msgs.some((m) => m.accountId !== folder.accountId)) {
      useUndoStore.getState().pushToast({
        label: t('mail.move.dropWrongAccount'),
        variant: 'error'
      })
      return
    }
    void moveMessagesToFolder(ids, folder.id)
  }

  const totalUnread = Object.values(foldersByAccount)
    .flat()
    .filter((f) => f.wellKnown === 'inbox')
    .reduce((sum, f) => sum + (f.unreadCount ?? 0), 0)
  const online = useConnectivityStore((s) => s.online)
  const [contextMenu, setContextMenu] = useState<ContextState | null>(null)
  const [inlineEdit, setInlineEdit] = useState<SidebarInlineEditState | null>(null)
  const [moveDialogFor, setMoveDialogFor] = useState<MailFolder | null>(null)
  const [metaDialogOpen, setMetaDialogOpen] = useState(false)
  const [metaDialogEdit, setMetaDialogEdit] = useState<MetaFolderSummary | null>(null)
  const [metaContext, setMetaContext] = useState<{
    x: number
    y: number
    id: number
    name: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sidebarHiddenFolderKeys, setSidebarHiddenFolderKeys] = useState<Set<string>>(() =>
    readSidebarHiddenMailFolderKeysFromStorage()
  )

  useEffect(() => {
    const onVis = (): void => {
      setSidebarHiddenFolderKeys((prev) => {
        const next = readSidebarHiddenMailFolderKeysFromStorage()
        return sameStringSet(prev, next) ? prev : next
      })
    }
    window.addEventListener(MAIL_SIDEBAR_FOLDER_VISIBILITY_CHANGED_EVENT, onVis)
    return (): void => window.removeEventListener(MAIL_SIDEBAR_FOLDER_VISIBILITY_CHANGED_EVENT, onVis)
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(
        SIDEBAR_HIDDEN_MAIL_FOLDER_KEYS_STORAGE_KEY,
        JSON.stringify(Array.from(sidebarHiddenFolderKeys))
      )
    } catch {
      // ignore
    }
    window.dispatchEvent(new CustomEvent(MAIL_SIDEBAR_FOLDER_VISIBILITY_CHANGED_EVENT))
  }, [sidebarHiddenFolderKeys])

  const accountIds = useMemo(() => accounts.map((a) => a.id), [accounts])

  const foldersForSidebar = useMemo(() => {
    const out: Record<string, MailFolder[]> = {}
    for (const acc of accounts) {
      const all = foldersByAccount[acc.id] ?? []
      out[acc.id] = filterFoldersForMailSidebar(acc.id, all, sidebarHiddenFolderKeys)
    }
    return out
  }, [accounts, foldersByAccount, sidebarHiddenFolderKeys])
  const accountDragSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  function onAccountDragEnd(event: DragEndEvent): void {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = accounts.findIndex((a) => a.id === active.id)
    const newIndex = accounts.findIndex((a) => a.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const nextIds = arrayMove(
      accounts.map((a) => a.id),
      oldIndex,
      newIndex
    )
    setError(null)
    void window.mailClient.auth.reorderAccounts(nextIds).catch((e) => {
      setError(e instanceof Error ? e.message : String(e))
    })
  }

  function openContextForFolder(e: React.MouseEvent, folder: MailFolder): void {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, folder, accountId: folder.accountId })
  }

  function openContextForAccount(e: React.MouseEvent, accountId: string): void {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, folder: null, accountId })
  }

  function startCreate(accountId: string, parentFolderId: number | null): void {
    const acc = accounts.find((a) => a.id === accountId)
    const initialValue = acc?.provider === 'google' ? 'Neues Label' : 'Neuer Ordner'
    setInlineEdit({
      mode: 'create',
      parentFolderId,
      accountId,
      initialValue
    })
  }

  function startRename(folder: MailFolder): void {
    setInlineEdit({
      mode: 'rename',
      folderId: folder.id,
      parentFolderId: null,
      accountId: folder.accountId,
      initialValue: folder.name
    })
  }

  async function handleInlineSubmit(value: string): Promise<void> {
    if (!inlineEdit) return
    const name = value.trim()
    setInlineEdit(null)
    if (!name) return
    setError(null)
    try {
      if (inlineEdit.mode === 'create') {
        await createFolder(inlineEdit.accountId, inlineEdit.parentFolderId, name)
      } else if (inlineEdit.mode === 'rename' && inlineEdit.folderId != null) {
        await renameFolder(inlineEdit.folderId, name)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleDelete(folder: MailFolder): Promise<void> {
    const acc = accounts.find((a) => a.id === folder.accountId)
    const isGoogle = acc?.provider === 'google'
    const ok = await showAppConfirm(
      isGoogle
        ? `Label „${folder.name}“ wirklich loeschen?\n\nDie Nachrichten bleiben in Gmail erhalten; das Label wird entfernt. Lokale Eintraege in diesem Label-Ordner werden entfernt und der Posteingang anschliessend neu geladen.`
        : `Ordner „${folder.name}“ wirklich loeschen?\n\nAlle Mails darin werden in den Papierkorb verschoben.`,
      {
        title: isGoogle ? 'Label loeschen' : 'Ordner loeschen',
        variant: 'danger',
        confirmLabel: 'Loeschen'
      }
    )
    if (!ok) return
    setError(null)
    try {
      await deleteFolder(folder.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleMove(destinationFolderId: number | null): Promise<void> {
    if (!moveDialogFor) return
    await moveFolder(moveDialogFor.id, destinationFolderId)
  }

  async function handleSyncFolder(folder: MailFolder): Promise<void> {
    if (!online) {
      useUndoStore.getState().pushToast({
        label: t('sidebar.syncFolderOffline'),
        variant: 'error'
      })
      return
    }
    setError(null)
    try {
      await window.mailClient.mail.syncFolder(folder.id)
      useUndoStore.getState().pushToast({
        label: t('sidebar.syncFolderDone', { name: folder.name }),
        variant: 'success'
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      useUndoStore.getState().pushToast({ label: msg, variant: 'error' })
    }
  }

  function buildContextItems(folder: MailFolder | null, accountId: string): ContextMenuItem[] {
    if (!folder) {
      const acc = accounts.find((a) => a.id === accountId)
      if (!acc) {
        return []
      }
      return buildAccountColorAndNewContextItems({
        account: acc,
        patchAccountColor,
        onPatchError: (msg) => setError(msg),
        newItem: {
          id: 'new-top',
          label: acc.provider === 'google' ? 'Neues Label' : 'Neuer Ordner (oberste Ebene)',
          icon: FolderPlus,
          onSelect: (): void => startCreate(accountId, null)
        }
      })
    }

    const protectedFolder = sidebarIsProtectedWellKnownFolder(folder.wellKnown)
    const accForFolder = accounts.find((a) => a.id === folder.accountId)
    const isGmail = accForFolder?.provider === 'google'

    return [
      {
        id: 'fav',
        label: folder.isFavorite ? 'Aus Schnellzugriff entfernen' : 'Zum Schnellzugriff hinzufuegen',
        icon: folder.isFavorite ? StarOff : Star,
        onSelect: (): void => {
          void toggleFolderFavorite(folder.id, !folder.isFavorite)
        }
      },
      {
        id: 'sync-folder',
        label: t('sidebar.syncFolder'),
        icon: RefreshCw,
        disabled: !online,
        onSelect: (): void => {
          void handleSyncFolder(folder)
        }
      },
      {
        id: 'hide-mail-sidebar',
        label: t('sidebar.mailContextHideFromSidebar'),
        icon: PanelLeftClose,
        disabled: folder.wellKnown === 'inbox',
        onSelect: (): void => {
          setContextMenu(null)
          if (folder.wellKnown === 'inbox') return
          setSidebarHiddenFolderKeys((prev) => {
            const next = new Set(prev)
            next.add(mailFolderSidebarVisibilityKey(folder.accountId, folder.remoteId))
            return next
          })
          if (selectedFolderId === folder.id) {
            const list = foldersByAccount[folder.accountId] ?? []
            const inbox = list.find((f) => f.wellKnown === 'inbox')
            if (inbox) void selectFolder(folder.accountId, inbox.id)
          }
        }
      },
      ...(isGmail
        ? folder.wellKnown === 'inbox'
          ? ([
              { id: 'sep-inbox-label', label: '', separator: true },
              {
                id: 'new-gmail-from-inbox',
                label: 'Neues Label…',
                icon: FolderPlus,
                onSelect: (): void => startCreate(accountId, null)
              }
            ] as ContextMenuItem[])
          : ([] as ContextMenuItem[])
        : ([
            { id: 'sep0', label: '', separator: true },
            {
              id: 'new-sub',
              label: 'Neuer Unterordner',
              icon: FolderPlus,
              onSelect: (): void => startCreate(accountId, folder.id)
            }
          ] as ContextMenuItem[])),
      {
        id: 'rename',
        label: 'Umbenennen',
        icon: Pencil,
        disabled: protectedFolder,
        onSelect: (): void => startRename(folder)
      },
      ...(isGmail
        ? ([] as ContextMenuItem[])
        : ([
            {
              id: 'move',
              label: 'Verschieben...',
              icon: Move,
              disabled: protectedFolder,
              onSelect: (): void => setMoveDialogFor(folder)
            }
          ] as ContextMenuItem[])),
      { id: 'sep', label: '', separator: true },
      {
        id: 'delete',
        label: isGmail ? 'Label loeschen' : 'Loeschen',
        icon: Trash2,
        destructive: true,
        disabled: protectedFolder,
        onSelect: (): void => {
          void handleDelete(folder)
        }
      }
    ]
  }

  const [qaOrder, setQaOrder] = useState<QuickAccessNavId[]>(() => readQuickAccessOrder())
  const [favOrder, setFavOrder] = useState<number[]>(() => readFavoriteFolderOrder())

  const favoriteFolderRowsUnordered = useMemo(() => {
    const all: Array<{ folder: MailFolder; account: ConnectedAccount }> = []
    for (const acc of accounts) {
      const folders = foldersByAccount[acc.id] ?? []
      for (const f of folders) {
        if (f.isFavorite) all.push({ folder: f, account: acc })
      }
    }
    return all
  }, [accounts, foldersByAccount])

  const favById = useMemo(
    () => new Map(favoriteFolderRowsUnordered.map((x) => [x.folder.id, x])),
    [favoriteFolderRowsUnordered]
  )

  useEffect(() => {
    const ids = favoriteFolderRowsUnordered.map((x) => x.folder.id)
    setFavOrder((prev) => reconcileFavoriteFolderOrder(ids, prev))
  }, [favoriteFolderRowsUnordered])

  const metaFolderSortableIds = useMemo(() => metaFolders.map((m) => m.id), [metaFolders])

  function onQuickAccessDragEnd(event: DragEndEvent): void {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = qaOrder.indexOf(active.id as QuickAccessNavId)
    const newIndex = qaOrder.indexOf(over.id as QuickAccessNavId)
    if (oldIndex < 0 || newIndex < 0) return
    const next = arrayMove(qaOrder, oldIndex, newIndex)
    setQaOrder(next)
    persistQuickAccessOrder(next)
  }

  function onFavoriteFoldersDragEnd(event: DragEndEvent): void {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const activeId = Number(active.id)
    const overId = Number(over.id)
    const oldIndex = favOrder.indexOf(activeId)
    const newIndex = favOrder.indexOf(overId)
    if (oldIndex < 0 || newIndex < 0) return
    const next = arrayMove(favOrder, oldIndex, newIndex)
    setFavOrder(next)
    persistFavoriteFolderOrder(next)
  }

  function onMetaFoldersDragEnd(event: DragEndEvent): void {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const ids = metaFolders.map((m) => m.id)
    const oldIndex = ids.indexOf(Number(active.id))
    const newIndex = ids.indexOf(Number(over.id))
    if (oldIndex < 0 || newIndex < 0) return
    const next = arrayMove(ids, oldIndex, newIndex)
    setError(null)
    void reorderMetaFolders(next).catch((e) => {
      setError(e instanceof Error ? e.message : String(e))
    })
  }

  return (
    <aside className="glass-sidebar flex h-full w-full flex-col text-sidebar-foreground">
      <nav className="flex-1 overflow-y-auto px-2 pb-3 pt-3">
        <SidebarCollapsibleSection title={t('sidebar.quickAccess')}>
          <DndContext
            sensors={accountDragSensors}
            collisionDetection={closestCenter}
            onDragEnd={onQuickAccessDragEnd}
          >
            <SortableContext items={qaOrder} strategy={verticalListSortingStrategy}>
              {qaOrder.map((qid) => {
                const dragTitle = t('topbar.moduleDragTitle')
                const dragAria = t('topbar.moduleDragAria')
                switch (qid) {
                  case 'unified_inbox':
                    return (
                      <SortableSidebarNavButton
                        key={qid}
                        id={qid}
                        icon={Layers}
                        iconClass="text-primary"
                        label={t('sidebar.allInboxes')}
                        count={totalUnread > 0 ? totalUnread : undefined}
                        isSelected={listKind === 'unified_inbox'}
                        onClick={(): void => {
                          void selectUnifiedInbox()
                        }}
                        dragTitle={dragTitle}
                        dragAria={dragAria}
                      />
                    )
                  case 'flagged':
                    return (
                      <SortableSidebarNavButton
                        key={qid}
                        id={qid}
                        icon={Star}
                        iconClass="text-status-flagged"
                        label={t('sidebar.flagged')}
                        disabled
                        dragTitle={dragTitle}
                        dragAria={dragAria}
                      />
                    )
                  case 'todo':
                    return (
                      <SortableSidebarNavButton
                        key={qid}
                        id={qid}
                        icon={ListChecks}
                        iconClass="text-status-todo"
                        label={t('mail.todoNav.sectionTitle')}
                        count={
                          todoCounts.overdue +
                          todoCounts.today +
                          todoCounts.tomorrow +
                          todoCounts.this_week +
                          todoCounts.later
                        }
                        isSelected={listKind === 'todo' && todoDueKind == null}
                        onClick={(): void => {
                          void selectTodoView(null)
                        }}
                        dragTitle={dragTitle}
                        dragAria={dragAria}
                      />
                    )
                  case 'snoozed':
                    return (
                      <SortableSidebarNavButton
                        key={qid}
                        id={qid}
                        icon={Clock}
                        iconClass="text-status-unread"
                        label={t('sidebar.snoozed')}
                        isSelected={listKind === 'snoozed'}
                        onClick={(): void => {
                          void selectSnoozedView()
                        }}
                        dragTitle={dragTitle}
                        dragAria={dragAria}
                      />
                    )
                  case 'waiting':
                    return (
                      <SortableSidebarNavButton
                        key={qid}
                        id={qid}
                        icon={Hourglass}
                        iconClass="text-status-waiting"
                        label={t('sidebar.waitingFor')}
                        count={
                          todoCounts.waiting > 0 ? Math.min(todoCounts.waiting, 99) : undefined
                        }
                        isSelected={listKind === 'waiting'}
                        onClick={(): void => {
                          void selectWaitingView()
                        }}
                        dragTitle={dragTitle}
                        dragAria={dragAria}
                      />
                    )
                  default:
                    return null
                }
              })}
            </SortableContext>
          </DndContext>

          {favoriteFolderRowsUnordered.length > 0 && (
            <>
              <li className="list-none px-2 pt-2 pb-0.5">
                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80">
                  {t('sidebar.foldersHeading')}
                </span>
              </li>
              <DndContext
                sensors={accountDragSensors}
                collisionDetection={closestCenter}
                onDragEnd={onFavoriteFoldersDragEnd}
              >
                <SortableContext items={favOrder} strategy={verticalListSortingStrategy}>
                  {favOrder.map((folderId) => {
                    const row = favById.get(folderId)
                    if (!row) return null
                    const { folder, account } = row
                    return (
                      <SortableSidebarFavoriteRow
                        key={folder.id}
                        folder={folder}
                        account={account}
                        isSelected={folder.id === selectedFolderId}
                        onSelect={(): void => {
                          void selectFolder(account.id, folder.id)
                        }}
                        onContext={(e): void => openContextForFolder(e, folder)}
                        onUnfavorite={(): void => {
                          void toggleFolderFavorite(folder.id, false)
                        }}
                        onMailDropToFolder={handleMailDropOnFolder}
                      />
                    )
                  })}
                </SortableContext>
              </DndContext>
            </>
          )}
        </SidebarCollapsibleSection>

        <SidebarCollapsibleSection title={t('sidebar.metaFolders')} defaultOpen>
          <DndContext
            sensors={accountDragSensors}
            collisionDetection={closestCenter}
            onDragEnd={onMetaFoldersDragEnd}
          >
            <SortableContext items={metaFolderSortableIds} strategy={verticalListSortingStrategy}>
              {metaFolders.map((mf) => (
                <SortableSidebarNavButton
                  key={mf.id}
                  id={mf.id}
                  icon={ScanSearch}
                  iconClass="text-sky-500"
                  label={mf.name}
                  isSelected={listKind === 'meta_folder' && selectedMetaFolderId === mf.id}
                  onClick={(): void => {
                    void selectMetaFolder(mf.id)
                  }}
                  onContextMenu={(e): void => {
                    e.preventDefault()
                    e.stopPropagation()
                    setMetaContext({ x: e.clientX, y: e.clientY, id: mf.id, name: mf.name })
                  }}
                  dragTitle={t('topbar.moduleDragTitle')}
                  dragAria={t('topbar.moduleDragAria')}
                />
              ))}
            </SortableContext>
          </DndContext>
          <li className="list-none px-2 pt-1">
            <button
              type="button"
              onClick={(): void => {
                setMetaDialogEdit(null)
                setMetaDialogOpen(true)
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5 shrink-0 opacity-80" />
              {t('sidebar.newMetaFolder')}
            </button>
          </li>
        </SidebarCollapsibleSection>

        <DndContext
          sensors={accountDragSensors}
          collisionDetection={closestCenter}
          onDragEnd={onAccountDragEnd}
        >
          <SortableContext items={accountIds} strategy={verticalListSortingStrategy}>
            {accounts.map((account) => (
              <SidebarSortableAccountFolderSection
                key={account.id}
                account={account}
                showDragHandle={accounts.length > 1}
                profilePhotoDataUrl={profilePhotoDataUrls[account.id]}
                folders={foldersForSidebar[account.id] ?? []}
                sync={syncByAccount[account.id]}
                selectedFolderId={selectedFolderId}
                inlineEdit={inlineEdit?.accountId === account.id ? inlineEdit : null}
                onSelect={(folderId): void => {
                  void selectFolder(account.id, folderId)
                }}
                onSync={(): void => {
                  void triggerSync(account.id)
                }}
                onContextAccount={(e): void => openContextForAccount(e, account.id)}
                onContextFolder={openContextForFolder}
                onNewTopLevel={(): void => startCreate(account.id, null)}
                onInlineSubmit={handleInlineSubmit}
                onInlineCancel={(): void => setInlineEdit(null)}
                onToggleFolderQuickAccess={(folder): void => {
                  void toggleFolderFavorite(folder.id, !folder.isFavorite)
                }}
                onMailDropToFolder={handleMailDropOnFolder}
              />
            ))}
          </SortableContext>
        </DndContext>
      </nav>

      {error && (
        <div className="border-t border-destructive/40 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div className="flex-1">{error}</div>
            <button
              type="button"
              onClick={(): void => setError(null)}
              className="text-destructive/80 hover:text-destructive"
            >
              x
            </button>
          </div>
        </div>
      )}

      <SidebarFooter
        accounts={accounts}
        profilePhotoDataUrls={profilePhotoDataUrls}
        syncByAccount={syncByAccount}
        onOpenAccountDialog={onOpenAccountDialog}
      />

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={buildContextItems(contextMenu.folder, contextMenu.accountId)}
          onClose={(): void => setContextMenu(null)}
        />
      )}

      <MoveFolderDialog
        open={Boolean(moveDialogFor)}
        folder={moveDialogFor}
        allFolders={moveDialogFor ? foldersByAccount[moveDialogFor.accountId] ?? [] : []}
        onClose={(): void => setMoveDialogFor(null)}
        onMove={handleMove}
      />

      <MetaFolderDialog
        open={metaDialogOpen}
        editing={metaDialogEdit}
        accounts={accounts}
        foldersByAccount={foldersByAccount}
        onClose={(): void => {
          setMetaDialogOpen(false)
          setMetaDialogEdit(null)
        }}
        onCreate={async (input): Promise<void> => {
          await createMetaFolder(input)
        }}
        onUpdate={async (input): Promise<void> => {
          await updateMetaFolder(input)
        }}
      />

      {metaContext && (
        <ContextMenu
          x={metaContext.x}
          y={metaContext.y}
          items={[
            {
              id: 'meta-edit',
              label: 'Meta-Ordner bearbeiten',
              onSelect: (): void => {
                const id = metaContext.id
                const mf = metaFolders.find((m) => m.id === id) ?? null
                setMetaContext(null)
                if (mf) {
                  setMetaDialogEdit(mf)
                  setMetaDialogOpen(true)
                }
              }
            },
            {
              id: 'meta-del',
              label: 'Meta-Ordner loeschen',
              destructive: true,
              onSelect: (): void => {
                const id = metaContext.id
                const name = metaContext.name
                setMetaContext(null)
                void (async (): Promise<void> => {
                  const ok = await showAppConfirm(
                    `Meta-Ordner „${name}“ loeschen? Die Mails bleiben in den echten Ordnern.`,
                    { title: 'Meta-Ordner loeschen', variant: 'danger', confirmLabel: 'Loeschen' }
                  )
                  if (!ok) return
                  setError(null)
                  try {
                    await deleteMetaFolder(id)
                  } catch (e) {
                    setError(e instanceof Error ? e.message : String(e))
                  }
                })()
              }
            }
          ]}
          onClose={(): void => setMetaContext(null)}
        />
      )}
    </aside>
  )
}
