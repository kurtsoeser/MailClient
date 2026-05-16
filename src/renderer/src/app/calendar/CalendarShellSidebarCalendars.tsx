import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type JSX,
  type ReactNode,
  type SetStateAction
} from 'react'
import {
  DndContext,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  GripVertical,
  Loader2,
  Users
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { CalendarGraphCalendarRow, ConnectedAccount } from '@shared/types'
import { resolveCalendarDisplayHex } from '@shared/graph-calendar-colors'
import { CalendarFolderColorSwatch } from '@/components/CalendarFolderColorSwatch'
import { cn } from '@/lib/utils'
import { resolvedAccountColorCss } from '@/lib/avatar-color'
import { Avatar } from '@/components/Avatar'
import { AccountSyncStatusButton } from '@/components/AccountSyncStatusButton'
import type { SyncStatus } from '@shared/types'
import { AccountColorStripe } from '@/components/AccountColorStripe'
import { calendarVisibilityKey } from '@/lib/calendar-visibility-storage'
import {
  SIDEBAR_DEFAULT_CAL_ID,
  accountNamedGroupSidebarKey,
  persistAccountNamedGroupsSidebarOpen,
  persistGlobalSectionsSidebarOpen,
  readAccountNamedGroupsSidebarOpenFromStorage,
  readGlobalSectionsSidebarOpenFromStorage
} from '@/app/calendar/calendar-shell-storage'
import {
  UNGROUPED_BUCKET_ID,
  addAccountGroup,
  addGlobalSection,
  buildAccountBucketsView,
  buildSectionBucketsView,
  calSidebarKey,
  moveCalToAccountGroup,
  moveCalToSection,
  parseCalSidebarKey,
  persistSidebarLayout,
  readSidebarLayoutFromStorage,
  removeGlobalSection,
  renameGlobalSection,
  setGlobalSectionIcon,
  type CalendarSidebarLayoutV1,
  type SectionBucketsView
} from '@/lib/calendar-sidebar-layout'
import { CalendarSidebarSectionHeader } from '@/app/calendar/CalendarSidebarSectionHeader'

const CAL_DRAG_PREFIX = 'cal-drag:'

/** Trenner fuer zusammengesetzte DnD-IDs — Konten-IDs enthalten `:` (z. B. `ms:…`, `google:…`). */
const ACC_DROP_FIELD_SEP = '\u001d'

function accDropId(accountId: string, groupId: string): string {
  return `acc-drop${ACC_DROP_FIELD_SEP}${accountId}${ACC_DROP_FIELD_SEP}${groupId}`
}

function parseAccDropId(id: string): { accountId: string; groupId: string } | null {
  const prefix = `acc-drop${ACC_DROP_FIELD_SEP}`
  if (!id.startsWith(prefix)) return null
  const inner = id.slice(prefix.length)
  const idx = inner.indexOf(ACC_DROP_FIELD_SEP)
  if (idx <= 0) return null
  return {
    accountId: inner.slice(0, idx),
    groupId: inner.slice(idx + ACC_DROP_FIELD_SEP.length)
  }
}

function secDropId(sectionId: string): string {
  return `sec:${sectionId}`
}

function parseSecDropId(id: string): { sectionId: string } | null {
  if (!id.startsWith('sec:')) return null
  return { sectionId: id.slice(4) }
}

function CalDragHandle({ dragId, disabled }: { dragId: string; disabled?: boolean }): JSX.Element {
  const { t } = useTranslation()
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${CAL_DRAG_PREFIX}${dragId}`,
    disabled
  })
  const label = t('calendar.shell.sidebarDragHandleAria')
  return (
    <button
      type="button"
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        'flex h-7 w-6 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground/70',
        'hover:bg-secondary/60 hover:text-foreground active:cursor-grabbing',
        disabled && 'pointer-events-none opacity-30',
        isDragging && 'opacity-50'
      )}
      aria-label={label}
      title={label}
    >
      <GripVertical className="h-3.5 w-3.5" />
    </button>
  )
}

function DroppableBucket({
  id,
  className,
  children,
  emptyLabel
}: {
  id: string
  className?: string
  children: ReactNode
  emptyLabel?: string
}): JSX.Element {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-md border border-transparent transition-colors',
        isOver && 'border-primary/50 bg-primary/5',
        className
      )}
    >
      {children}
      {emptyLabel ? (
        <p className="px-2 py-1 text-[10px] text-muted-foreground/80">{emptyLabel}</p>
      ) : null}
    </div>
  )
}

export interface CalendarShellSidebarCalendarsProps {
  calendarLinkedAccounts: ConnectedAccount[]
  calendarsByAccount: Record<string, CalendarGraphCalendarRow[]>
  /** Kalender, die in der Seitenleiste gar nicht mehr erscheinen (Rechtsklick / Einstellungen). */
  sidebarHiddenCalendarKeys: Set<string>
  hiddenCalendarKeys: Set<string>
  toggleCalendarVisibility: (accountId: string, graphCalendarId: string) => void
  showAllCalendarsInView: () => void
  onCalendarRowContextMenu: (clientX: number, clientY: number, accountId: string, cal: CalendarGraphCalendarRow) => void
  profilePhotoDataUrls: Record<string, string>
  setAccountSidebarOpen: Dispatch<SetStateAction<Record<string, boolean>>>
  isAccountSidebarOpen: (accountId: string) => boolean
  accountGroupCalSidebarOpen: Record<string, boolean>
  setAccountGroupCalSidebarOpen: Dispatch<SetStateAction<Record<string, boolean>>>
  groupCalendarsLoading: Record<string, boolean>
  m365GroupCalPaging: Record<string, { total: number; nextOffset: number }>
  fetchMicrosoft365GroupCalendarsIfNeeded: (accountId: string) => Promise<void>
  fetchMoreMicrosoft365GroupCalendars: (accountId: string, offset: number) => Promise<void>
  /** Rechtsklick auf Konto-Zeile: Kontofarbe, neuer Termin, … */
  onAccountHeaderContextMenu?: (clientX: number, clientY: number, account: ConnectedAccount) => void
  syncByAccount: Record<string, SyncStatus>
  onAccountSync: (accountId: string) => void
}

function filterCalendarsForSidebar(
  accountId: string,
  rows: CalendarGraphCalendarRow[],
  sidebarHidden: Set<string>
): CalendarGraphCalendarRow[] {
  return rows.filter((c) => !sidebarHidden.has(calendarVisibilityKey(accountId, c.id)))
}

export function CalendarShellSidebarCalendars({
  calendarLinkedAccounts,
  calendarsByAccount,
  sidebarHiddenCalendarKeys,
  hiddenCalendarKeys,
  toggleCalendarVisibility,
  showAllCalendarsInView,
  onCalendarRowContextMenu,
  profilePhotoDataUrls,
  setAccountSidebarOpen,
  isAccountSidebarOpen,
  accountGroupCalSidebarOpen,
  setAccountGroupCalSidebarOpen,
  groupCalendarsLoading,
  m365GroupCalPaging,
  fetchMicrosoft365GroupCalendarsIfNeeded,
  fetchMoreMicrosoft365GroupCalendars,
  onAccountHeaderContextMenu,
  syncByAccount,
  onAccountSync
}: CalendarShellSidebarCalendarsProps): JSX.Element {
  const { t } = useTranslation()
  const [layout, setLayout] = useState<CalendarSidebarLayoutV1>(() => readSidebarLayoutFromStorage())
  const [newAccountGroupDraft, setNewAccountGroupDraft] = useState<{ accountId: string; name: string } | null>(null)
  const [addingGlobalSection, setAddingGlobalSection] = useState(false)
  const [newGlobalSectionName, setNewGlobalSectionName] = useState('')
  const [accountNamedGroupsOpen, setAccountNamedGroupsOpen] = useState<Record<string, boolean>>(() =>
    readAccountNamedGroupsSidebarOpenFromStorage()
  )
  const [globalSectionsOpen, setGlobalSectionsOpen] = useState<Record<string, boolean>>(() =>
    readGlobalSectionsSidebarOpenFromStorage()
  )

  useEffect(() => {
    persistSidebarLayout(layout)
  }, [layout])

  useEffect(() => {
    persistAccountNamedGroupsSidebarOpen(accountNamedGroupsOpen)
  }, [accountNamedGroupsOpen])

  useEffect(() => {
    persistGlobalSectionsSidebarOpen(globalSectionsOpen)
  }, [globalSectionsOpen])

  useEffect(() => {
    if (layout.listMode !== 'accounts') return
    setAccountNamedGroupsOpen((prev) => {
      const allowed = new Set<string>()
      for (const acc of calendarLinkedAccounts) {
        for (const g of layout.accountGroups[acc.id] ?? []) {
          allowed.add(accountNamedGroupSidebarKey(acc.id, g.id))
        }
      }
      let changed = false
      const next = { ...prev }
      for (const k of Object.keys(next)) {
        if (!allowed.has(k)) {
          delete next[k]
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [layout.listMode, layout.accountGroups, calendarLinkedAccounts])

  useEffect(() => {
    if (layout.listMode !== 'sections') return
    setGlobalSectionsOpen((prev) => {
      const allowed = new Set(layout.globalSections.map((s) => s.id))
      let changed = false
      const next = { ...prev }
      for (const k of Object.keys(next)) {
        if (!allowed.has(k)) {
          delete next[k]
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [layout.listMode, layout.globalSections])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 10 }
    })
  )

  const accountById = useMemo(
    () => new Map(calendarLinkedAccounts.map((a) => [a.id, a] as const)),
    [calendarLinkedAccounts]
  )

  const calendarsByAccountForSidebar = useMemo(() => {
    const out: Record<string, CalendarGraphCalendarRow[]> = {}
    for (const a of calendarLinkedAccounts) {
      const rows = calendarsByAccount[a.id]
      out[a.id] = rows?.length ? filterCalendarsForSidebar(a.id, rows, sidebarHiddenCalendarKeys) : []
    }
    return out
  }, [calendarLinkedAccounts, calendarsByAccount, sidebarHiddenCalendarKeys])

  const sectionBuckets = useMemo(() => {
    if (layout.listMode !== 'sections') {
      return { unassigned: [] as SectionBucketsView['unassigned'], sections: [] as SectionBucketsView['sections'] }
    }
    return buildSectionBucketsView(calendarLinkedAccounts, calendarsByAccountForSidebar, layout)
  }, [layout.listMode, layout, calendarLinkedAccounts, calendarsByAccountForSidebar])

  const handleDragEnd = useCallback(
    (ev: DragEndEvent): void => {
      const { active, over } = ev
      if (!over) return
      const aid = String(active.id)
      if (!aid.startsWith(CAL_DRAG_PREFIX)) return
      const calKey = aid.slice(CAL_DRAG_PREFIX.length)
      const parsedCal = parseCalSidebarKey(calKey)
      if (!parsedCal) return
      const overId = String(over.id)

      if (layout.listMode === 'accounts') {
        const drop = parseAccDropId(overId)
        if (!drop) return
        if (drop.accountId !== parsedCal.accountId) return
        setLayout((prev) =>
          moveCalToAccountGroup(prev, drop.accountId, calKey, drop.groupId, 9999)
        )
        return
      }

      const sec = parseSecDropId(overId)
      if (!sec) return
      setLayout((prev) => moveCalToSection(prev, calKey, sec.sectionId, 9999))
    },
    [layout.listMode]
  )

  const renderCalRow = (
    accountId: string,
    c: CalendarGraphCalendarRow,
    opts?: { showAccountHint?: boolean }
  ): JSX.Element => {
    const visKey = calendarVisibilityKey(accountId, c.id)
    const isHidden = hiddenCalendarKeys.has(visKey)
    const acc = accountById.get(accountId)
    const dragDisabled = c.id === SIDEBAR_DEFAULT_CAL_ID
    const calKey = calSidebarKey(accountId, c.id)
    const isPrimaryPlaceholder = c.id === SIDEBAR_DEFAULT_CAL_ID
    const isDefaultCal = Boolean(c.isDefaultCalendar || isPrimaryPlaceholder)
    const displayHex = resolveCalendarDisplayHex(c)
    const iconHex =
      displayHex ?? (isPrimaryPlaceholder && acc ? resolvedAccountColorCss(acc.color) : null)
    return (
      <li key={`${accountId}:${c.id}`} className="list-none">
        <div
          className={cn(
            'flex w-full cursor-context-menu items-center gap-0.5 rounded-md px-0.5 py-1.5 text-left text-[12px] text-muted-foreground'
          )}
          onContextMenu={(e): void => {
            if (c.id === SIDEBAR_DEFAULT_CAL_ID) {
              e.preventDefault()
              return
            }
            e.preventDefault()
            e.stopPropagation()
            onCalendarRowContextMenu(e.clientX, e.clientY, accountId, c)
          }}
        >
          <CalDragHandle dragId={calKey} disabled={dragDisabled} />
          <button
            type="button"
            onClick={(): void => {
              toggleCalendarVisibility(accountId, c.id)
            }}
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors',
              'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
              isHidden && 'opacity-60'
            )}
            title={isHidden ? t('calendar.shell.calendarShowTooltip') : t('calendar.shell.calendarHideTooltip')}
            aria-label={isHidden ? t('calendar.shell.calendarShowTooltip') : t('calendar.shell.calendarHideTooltip')}
          >
            {isHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
          <CalendarFolderColorSwatch hex={iconHex} />
          <span className="min-w-0 flex-1 truncate text-foreground">{c.name}</span>
          {opts?.showAccountHint && acc ? (
            <span className="max-w-[72px] shrink-0 truncate text-[9px] text-muted-foreground/70" title={acc.email}>
              {acc.email}
            </span>
          ) : null}
        </div>
      </li>
    )
  }

  const renderAccountsMode = (): JSX.Element => (
    <div className="space-y-1">
      {calendarLinkedAccounts.map((a) => {
        const open = isAccountSidebarOpen(a.id)
        const cals = calendarsByAccount[a.id]
        const showCalLoading = open && cals === undefined
        const fallbackPersonal: CalendarGraphCalendarRow[] = [
          {
            id: SIDEBAR_DEFAULT_CAL_ID,
            name: t('calendar.shell.primaryCalendarFallback'),
            isDefaultCalendar: true,
            canEdit: false
          }
        ]
        const sourceList = cals?.length ? cals : fallbackPersonal
        const visibleSource = filterCalendarsForSidebar(a.id, sourceList, sidebarHiddenCalendarKeys)
        const personalList = visibleSource.filter(
          (c) => c.calendarKind !== 'm365Group' && typeof c.id === 'string' && c.id.length > 0
        )
        const groupList = filterCalendarsForSidebar(a.id, cals ?? [], sidebarHiddenCalendarKeys).filter(
          (c) => c.calendarKind === 'm365Group' && typeof c.id === 'string' && c.id.length > 0
        )
        const groupBranchOpen = accountGroupCalSidebarOpen[a.id] === true
        const groupLoading = groupCalendarsLoading[a.id] === true
        const groupPaging = m365GroupCalPaging[a.id]
        const groupTotalBadge =
          groupPaging != null && groupPaging.total > 0
            ? groupPaging.total
            : groupList.length > 0
              ? groupList.length
              : null

        const buckets = buildAccountBucketsView(a.id, personalList, layout)

        return (
          <div key={a.id} className="mb-2">
            <div
              className={cn('group flex items-center gap-1 rounded-md px-1 py-1', open ? '' : 'hover:bg-secondary/40')}
              onContextMenu={(e): void => {
                if (!onAccountHeaderContextMenu) return
                e.preventDefault()
                e.stopPropagation()
                onAccountHeaderContextMenu(e.clientX, e.clientY, a)
              }}
            >
              <button
                type="button"
                onClick={(): void => {
                  setAccountSidebarOpen((prev) => {
                    const currentlyOpen = prev[a.id] !== false
                    return { ...prev, [a.id]: !currentlyOpen }
                  })
                }}
                className="flex h-5 w-4 shrink-0 items-center justify-center text-muted-foreground/70 hover:text-foreground"
                aria-label={open ? t('calendar.shell.accountCollapseAria') : t('calendar.shell.accountExpandAria')}
              >
                {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </button>
              <button
                type="button"
                onClick={(): void => {
                  setAccountSidebarOpen((prev) => {
                    const currentlyOpen = prev[a.id] !== false
                    return { ...prev, [a.id]: !currentlyOpen }
                  })
                }}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                title={a.email}
              >
                <Avatar
                  name={a.displayName}
                  email={a.email}
                  bgClass={a.color}
                  accountColor={a.color}
                  initials={a.initials}
                  imageSrc={profilePhotoDataUrls[a.id]}
                  size="sm"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-foreground">
                    {a.displayName || a.email}
                  </span>
                  <span className="block truncate text-[10px] text-muted-foreground">{a.email}</span>
                </span>
              </button>
              <AccountSyncStatusButton
                sync={syncByAccount[a.id]}
                onSync={(): void => onAccountSync(a.id)}
                syncedTitle={t('calendar.shell.accountSyncSyncedTitle')}
                syncingTitle={t('calendar.shell.accountSyncSyncingTitle')}
                syncTitle={t('calendar.shell.accountSyncTitle')}
                errorTitlePrefix={t('calendar.shell.accountSyncErrorTitle')}
              />
            </div>

            {open && (
              <div className="relative mt-1 ml-3 space-y-0.5 pl-2">
                <AccountColorStripe
                  color={a.color}
                  className="left-0 top-1 bottom-1 w-0.5 rounded-full opacity-60"
                />
                {showCalLoading ? (
                  <div className="flex items-center gap-2 px-2 py-1.5 text-[10px] text-muted-foreground">
                    <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
                    {t('calendar.shell.calendarsLoading')}
                  </div>
                ) : (
                  <>
                    <DroppableBucket
                      id={accDropId(a.id, UNGROUPED_BUCKET_ID)}
                      emptyLabel={
                        buckets.ungrouped.length === 0 && buckets.groups.length > 0
                          ? t('calendar.shell.sidebarDropUngroupedHint')
                          : undefined
                      }
                    >
                      <ul className="space-y-0.5">{buckets.ungrouped.map((c) => renderCalRow(a.id, c))}</ul>
                    </DroppableBucket>

                    {buckets.groups.map(({ group, calendars: gcals }) => {
                      const gKey = accountNamedGroupSidebarKey(a.id, group.id)
                      const namedGroupBranchOpen = accountNamedGroupsOpen[gKey] !== false
                      return (
                        <div key={group.id} className="list-none pt-2">
                          <div className="mb-0.5 flex items-center gap-0.5">
                            <button
                              type="button"
                              onClick={(): void => {
                                setAccountNamedGroupsOpen((prev) => {
                                  const next = { ...prev }
                                  const open = next[gKey] !== false
                                  if (open) next[gKey] = false
                                  else delete next[gKey]
                                  return next
                                })
                              }}
                              className="flex h-5 w-4 shrink-0 items-center justify-center text-muted-foreground/70 hover:text-foreground"
                              aria-label={
                                namedGroupBranchOpen
                                  ? t('calendar.shell.sidebarNamedGroupCollapseAria', { name: group.name })
                                  : t('calendar.shell.sidebarNamedGroupExpandAria', { name: group.name })
                              }
                            >
                              {namedGroupBranchOpen ? (
                                <ChevronDown className="h-3 w-3" />
                              ) : (
                                <ChevronRight className="h-3 w-3" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={(): void => {
                                setAccountNamedGroupsOpen((prev) => {
                                  const next = { ...prev }
                                  const open = next[gKey] !== false
                                  if (open) next[gKey] = false
                                  else delete next[gKey]
                                  return next
                                })
                              }}
                              className="min-w-0 flex-1 rounded-md py-0.5 text-left hover:bg-secondary/40"
                              title={group.name}
                            >
                              <p className="truncate px-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                {group.name}
                              </p>
                            </button>
                          </div>
                          {namedGroupBranchOpen ? (
                            <DroppableBucket
                              id={accDropId(a.id, group.id)}
                              emptyLabel={gcals.length === 0 ? t('calendar.shell.sidebarDropGroupHint') : undefined}
                            >
                              <ul className="space-y-0.5 border-l border-border/50 pl-2">
                                {gcals.map((c) => renderCalRow(a.id, c))}
                              </ul>
                            </DroppableBucket>
                          ) : null}
                        </div>
                      )
                    })}

                    <div className="list-none pt-1.5">
                      {newAccountGroupDraft?.accountId === a.id ? (
                        <div className="flex flex-col gap-1 px-1">
                          <input
                            value={newAccountGroupDraft.name}
                            onChange={(e): void =>
                              setNewAccountGroupDraft((d) => (d ? { ...d, name: e.target.value } : d))
                            }
                            placeholder={t('calendar.shell.sidebarGroupNamePlaceholder')}
                            className="w-full rounded-md border border-border bg-background px-2 py-1 text-[11px]"
                            autoFocus
                            onKeyDown={(e): void => {
                              if (e.key === 'Escape') {
                                setNewAccountGroupDraft(null)
                              }
                              if (e.key === 'Enter') {
                                const name = newAccountGroupDraft.name.trim()
                                if (name) {
                                  setLayout((prev) => addAccountGroup(prev, a.id, name))
                                }
                                setNewAccountGroupDraft(null)
                              }
                            }}
                          />
                          <div className="flex gap-1">
                            <button
                              type="button"
                              className="rounded-md bg-primary px-2 py-1 text-[11px] text-primary-foreground"
                              onClick={(): void => {
                                const name = newAccountGroupDraft.name.trim()
                                if (name) setLayout((prev) => addAccountGroup(prev, a.id, name))
                                setNewAccountGroupDraft(null)
                              }}
                            >
                              {t('calendar.shell.sidebarConfirmAdd')}
                            </button>
                            <button
                              type="button"
                              className="rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-secondary/60"
                              onClick={(): void => setNewAccountGroupDraft(null)}
                            >
                              {t('calendar.shell.sidebarCancel')}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={(): void => setNewAccountGroupDraft({ accountId: a.id, name: '' })}
                          className="w-full rounded-md px-2 py-1.5 text-left text-[11px] text-primary hover:bg-primary/10"
                        >
                          {t('calendar.shell.sidebarAddAccountGroup')}
                        </button>
                      )}
                    </div>

                    {a.provider === 'microsoft' ? (
                      <div key={`${a.id}:m365GroupCals`} className="list-none pt-1.5">
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={(): void => {
                              setAccountGroupCalSidebarOpen((prev) => {
                                const wasOpen = prev[a.id] === true
                                const nextOpen = !wasOpen
                                const next = { ...prev, [a.id]: nextOpen }
                                if (!wasOpen && nextOpen) {
                                  void fetchMicrosoft365GroupCalendarsIfNeeded(a.id)
                                }
                                return next
                              })
                            }}
                            className="flex h-5 w-4 shrink-0 items-center justify-center text-muted-foreground/70 hover:text-foreground"
                            aria-label={
                              groupBranchOpen
                                ? t('calendar.shell.groupCalendarsCollapseAria')
                                : t('calendar.shell.groupCalendarsExpandAria')
                            }
                          >
                            {groupBranchOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                          </button>
                          <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground/80" aria-hidden />
                          <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-muted-foreground">
                            {t('calendar.shell.groupCalendarsSubgroup')}
                          </span>
                          {groupTotalBadge != null ? (
                            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/90">
                              ({groupTotalBadge})
                            </span>
                          ) : null}
                        </div>
                        {groupBranchOpen ? (
                          <ul className="relative mt-1 ml-4 space-y-0.5 border-l border-border/60 pl-2">
                            {groupLoading && groupList.length === 0 ? (
                              <li className="flex items-center gap-2 px-1 py-1 text-[10px] text-muted-foreground">
                                <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
                                {t('calendar.shell.groupCalendarsLoading')}
                              </li>
                            ) : !groupLoading &&
                              groupList.length === 0 &&
                              (!groupPaging || groupPaging.total === 0) ? (
                              <li className="px-1 py-1 text-[10px] leading-snug text-muted-foreground">
                                {t('calendar.shell.groupCalendarsEmptyHint')}
                              </li>
                            ) : (
                              <>
                                {groupList.map((c) => renderCalRow(a.id, c))}
                                {groupPaging && groupPaging.nextOffset < groupPaging.total ? (
                                  <li className="list-none px-1 pt-1">
                                    <button
                                      type="button"
                                      disabled={groupLoading}
                                      onClick={(): void => {
                                        void fetchMoreMicrosoft365GroupCalendars(a.id, groupPaging.nextOffset)
                                      }}
                                      className={cn(
                                        'w-full rounded-md px-2 py-1.5 text-left text-[11px] font-medium text-primary hover:bg-primary/10',
                                        groupLoading && 'cursor-not-allowed opacity-50'
                                      )}
                                    >
                                      {groupLoading ? (
                                        <span className="inline-flex items-center gap-2 text-muted-foreground">
                                          <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
                                          {t('calendar.shell.groupCalendarsLoadingMore')}
                                        </span>
                                      ) : (
                                        t('calendar.shell.groupCalendarsLoadMore', {
                                          count: groupPaging.total - groupPaging.nextOffset
                                        })
                                      )}
                                    </button>
                                  </li>
                                ) : null}
                              </>
                            )}
                          </ul>
                        ) : null}
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )

  const renderSectionsMode = (): JSX.Element => (
    <div className="space-y-3">
      <div>
        <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t('calendar.shell.sidebarUngroupedLabel')}
        </p>
        <DroppableBucket
          id={secDropId(UNGROUPED_BUCKET_ID)}
          emptyLabel={
            sectionBuckets.unassigned.length === 0 && sectionBuckets.sections.length > 0
              ? t('calendar.shell.sidebarDropUngroupedHint')
              : undefined
          }
        >
          <ul className="space-y-0.5">
            {sectionBuckets.unassigned.map(({ cal, accountId }) =>
              renderCalRow(accountId, cal, { showAccountHint: true })
            )}
          </ul>
        </DroppableBucket>
      </div>

      {sectionBuckets.sections.map(({ section, items }) => {
        const sectionBranchOpen = globalSectionsOpen[section.id] !== false
        return (
          <div key={section.id}>
            <CalendarSidebarSectionHeader
              section={section}
              branchOpen={sectionBranchOpen}
              onToggleBranch={(): void => {
                setGlobalSectionsOpen((prev) => {
                  const next = { ...prev }
                  const open = next[section.id] !== false
                  if (open) next[section.id] = false
                  else delete next[section.id]
                  return next
                })
              }}
              onRename={(name): void => {
                setLayout((prev) => renameGlobalSection(prev, section.id, name))
              }}
              onDelete={(): void => {
                setLayout((prev) => removeGlobalSection(prev, section.id))
              }}
              onIconChange={(icon): void => {
                setLayout((prev) => setGlobalSectionIcon(prev, section.id, icon))
              }}
            />
            {sectionBranchOpen ? (
              <DroppableBucket
                id={secDropId(section.id)}
                emptyLabel={items.length === 0 ? t('calendar.shell.sidebarDropGroupHint') : undefined}
              >
                <ul className="space-y-0.5 border-l border-border/50 pl-2">
                  {items.map(({ cal, accountId }) => renderCalRow(accountId, cal, { showAccountHint: true }))}
                </ul>
              </DroppableBucket>
            ) : null}
          </div>
        )
      })}

      {!addingGlobalSection ? (
        <button
          type="button"
          onClick={(): void => {
            setAddingGlobalSection(true)
            setNewGlobalSectionName('')
          }}
          className="w-full rounded-md px-2 py-1.5 text-left text-[11px] text-primary hover:bg-primary/10"
        >
          {t('calendar.shell.sidebarAddGlobalSection')}
        </button>
      ) : (
        <div className="flex flex-col gap-1 px-1">
          <input
            value={newGlobalSectionName}
            onChange={(e): void => setNewGlobalSectionName(e.target.value)}
            placeholder={t('calendar.shell.sidebarSectionNamePlaceholder')}
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-[11px]"
            autoFocus
            onKeyDown={(e): void => {
              if (e.key === 'Escape') {
                setAddingGlobalSection(false)
                setNewGlobalSectionName('')
              }
              if (e.key === 'Enter') {
                const name = newGlobalSectionName.trim()
                if (name) setLayout((prev) => addGlobalSection(prev, name))
                setAddingGlobalSection(false)
                setNewGlobalSectionName('')
              }
            }}
          />
          <div className="flex gap-1">
            <button
              type="button"
              className="rounded-md bg-primary px-2 py-1 text-[11px] text-primary-foreground"
              onClick={(): void => {
                const name = newGlobalSectionName.trim()
                if (name) setLayout((prev) => addGlobalSection(prev, name))
                setAddingGlobalSection(false)
                setNewGlobalSectionName('')
              }}
            >
              {t('calendar.shell.sidebarConfirmAdd')}
            </button>
            <button
              type="button"
              className="rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-secondary/60"
              onClick={(): void => {
                setAddingGlobalSection(false)
                setNewGlobalSectionName('')
              }}
            >
              {t('calendar.shell.sidebarCancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div>
      <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {layout.listMode === 'accounts' ? t('calendar.shell.accountsSection') : t('calendar.shell.sidebarListModeSections')}
      </p>

      <div className="mb-2 flex rounded-lg bg-muted/50 p-0.5">
        <button
          type="button"
          onClick={(): void => setLayout((p) => ({ ...p, listMode: 'accounts' }))}
          className={cn(
            'flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors',
            layout.listMode === 'accounts' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
          )}
        >
          {t('calendar.shell.sidebarListModeAccounts')}
        </button>
        <button
          type="button"
          onClick={(): void => setLayout((p) => ({ ...p, listMode: 'sections' }))}
          className={cn(
            'flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors',
            layout.listMode === 'sections' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
          )}
        >
          {t('calendar.shell.sidebarListModeSections')}
        </button>
      </div>

      {hiddenCalendarKeys.size > 0 || sidebarHiddenCalendarKeys.size > 0 ? (
        <button
          type="button"
          onClick={showAllCalendarsInView}
          className="mb-2 w-full rounded-lg px-2 py-2 text-left text-[12px] text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
        >
          {t('calendar.shell.showAllCalendars')}
        </button>
      ) : null}

      {calendarLinkedAccounts.length === 0 ? (
        <p className="px-2 text-[12px] text-muted-foreground">{t('calendar.shell.noLinkedAccount')}</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
          {layout.listMode === 'accounts' ? renderAccountsMode() : renderSectionsMode()}
        </DndContext>
      )}
    </div>
  )
}
