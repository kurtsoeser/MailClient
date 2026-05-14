import {
  House,
  Inbox,
  LayoutDashboard,
  Calendar,
  Search,
  Settings,
  PenSquare,
  RefreshCw,
  Loader2,
  X,
  Paperclip,
  Sun,
  Moon,
  Monitor,
  Check,
  ListFilter,
  MessageCircle,
  BookOpen,
  StickyNote,
  ListTodo,
  Users
} from 'lucide-react'
import {
  DndContext,
  PointerSensor,
  closestCenter,
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
import { cn } from '@/lib/utils'
import { resolvedAccountColorCss } from '@/lib/avatar-color'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useAccountsStore } from '@/stores/accounts'
import { useComposeStore } from '@/stores/compose'
import { useMailStore } from '@/stores/mail'
import {
  ACCENT_LIST,
  accentHsl,
  useThemeStore,
  type AccentName,
  type ThemeMode,
  type DarkPalette
} from '@/stores/theme'
import type { SearchHit } from '@shared/types'
import { useAppModeStore, type AppShellMode } from '@/stores/app-mode'
import {
  readTopbarModuleOrder,
  persistTopbarModuleOrder,
  reconcileTopbarModuleOrder
} from '@/app/layout/topbar-module-order'
import { useMailWorkspaceLayoutStore } from '@/stores/mail-workspace-layout'
import { FOCUS_MAIN_SEARCH_EVENT } from '@/lib/search-focus'
import { pushRecentSearch } from '@/app/home/dashboard-recent-searches'

interface Props {
  onOpenAccountDialog: () => void
}

function SortableTopbarModeTab({
  id,
  label,
  icon: Icon,
  active,
  onSelect,
  dragAria,
  dragTitle
}: {
  id: AppShellMode
  label: string
  icon: React.ComponentType<{ className?: string }>
  active: boolean
  onSelect: (mode: AppShellMode) => void
  dragAria: string
  dragTitle: string
}): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id
  })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging ? { zIndex: 10, position: 'relative' } : {})
  }
  return (
    <button
      ref={setNodeRef}
      style={style}
      type="button"
      {...attributes}
      {...listeners}
      onClick={(): void => onSelect(id)}
      title={dragTitle}
      className={cn(
        'relative inline-flex h-12 shrink-0 touch-none items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-xs font-medium transition-colors',
        'cursor-grab active:cursor-grabbing',
        active ? 'text-foreground' : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground',
        isDragging && 'opacity-90'
      )}
      aria-current={active ? 'page' : undefined}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
      <span className="sr-only">{` ${dragAria}`}</span>
      <span
        aria-hidden
        className={cn(
          'absolute inset-x-1 -bottom-px h-0.5 rounded-t bg-primary transition-opacity',
          active ? 'opacity-100' : 'opacity-0'
        )}
      />
    </button>
  )
}

export function Topbar({ onOpenAccountDialog }: Props): JSX.Element {
  const { t, i18n } = useTranslation()
  const shellModes = useMemo(
    () =>
      [
        { id: 'home' as const, label: t('topbar.modeHome'), icon: House },
        { id: 'mail' as const, label: t('topbar.modeMail'), icon: Inbox },
        { id: 'workflow' as const, label: t('topbar.modeWorkflow'), icon: LayoutDashboard },
        { id: 'calendar' as const, label: t('topbar.modeCalendar'), icon: Calendar },
        { id: 'tasks' as const, label: t('topbar.modeTasks'), icon: ListTodo },
        { id: 'people' as const, label: t('topbar.modePeople'), icon: Users },
        { id: 'notes' as const, label: t('topbar.modeNotes'), icon: StickyNote },
        { id: 'rules' as const, label: t('topbar.modeRules'), icon: ListFilter },
        { id: 'chat' as const, label: t('topbar.modeChat'), icon: MessageCircle }
      ] satisfies Array<{
        id: AppShellMode
        label: string
        icon: React.ComponentType<{ className?: string }>
      }>,
    [t]
  )

  const [refreshing, setRefreshing] = useState(false)
  const mode = useAppModeStore((s) => s.mode)
  const setAppMode = useAppModeStore((s) => s.setMode)
  const accounts = useAccountsStore((s) => s.accounts)
  const openNew = useComposeStore((s) => s.openNew)
  const refreshNow = useMailStore((s) => s.refreshNow)
  const syncByAccount = useMailStore((s) => s.syncByAccount)
  const anyAccountSyncing = Object.values(syncByAccount).some((s) => s.state.startsWith('syncing'))

  const [modeOrder, setModeOrder] = useState(readTopbarModuleOrder)

  const orderedShellModes = useMemo(() => {
    const byId = new Map(shellModes.map((m) => [m.id, m]))
    return modeOrder
      .map((id) => byId.get(id))
      .filter((x): x is (typeof shellModes)[number] => x != null)
  }, [shellModes, modeOrder])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Ohne Distanz-Schwelle wuerde der Sensor sofort aktiv werden und Klicks zum Moduswechsel blockieren.
      activationConstraint: { distance: 8 }
    })
  )

  useEffect(() => {
    const canonical = shellModes.map((m) => m.id)
    setModeOrder((prev) => {
      const next = reconcileTopbarModuleOrder(prev, canonical)
      if (next.length === prev.length && next.every((id, i) => id === prev[i])) return prev
      persistTopbarModuleOrder(next)
      return next
    })
  }, [shellModes])

  const onTopbarModesDragEnd = useCallback(
    (e: DragEndEvent): void => {
      const { active, over } = e
      if (!over || active.id === over.id) return
      const oldIndex = modeOrder.indexOf(active.id as AppShellMode)
      const newIndex = modeOrder.indexOf(over.id as AppShellMode)
      if (oldIndex < 0 || newIndex < 0) return
      const next = arrayMove(modeOrder, oldIndex, newIndex)
      setModeOrder(next)
      persistTopbarModuleOrder(next)
    },
    [modeOrder]
  )

  const readingOpenMw = useMailWorkspaceLayoutStore((s) => s.readingOpen)
  const calendarOpenMw = useMailWorkspaceLayoutStore((s) => s.calendarOpen)
  const setReadingOpenMw = useMailWorkspaceLayoutStore((s) => s.setReadingOpen)
  const setCalendarOpenMw = useMailWorkspaceLayoutStore((s) => s.setCalendarOpen)
  const setReadingPlacementMw = useMailWorkspaceLayoutStore((s) => s.setReadingPlacement)
  const setCalendarPlacementMw = useMailWorkspaceLayoutStore((s) => s.setCalendarPlacement)

  function startNewMail(): void {
    const first = accounts[0]
    if (!first) {
      onOpenAccountDialog()
      return
    }
    openNew(first.id)
  }

  async function handleRefresh(): Promise<void> {
    if (refreshing) return
    setRefreshing(true)
    try {
      await refreshNow()
    } finally {
      // Spinner kurz weiterdrehen lassen, damit ein Klick auch sichtbar
      // ist, falls der Server nichts Neues zurueckliefert.
      window.setTimeout(() => setRefreshing(false), 500)
    }
  }

  return (
    <header className="glass-topbar flex h-12 min-w-0 shrink-0 select-none items-center gap-2 px-2 sm:gap-3 sm:px-3">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onTopbarModesDragEnd}
      >
        <nav
          className="flex h-12 min-h-12 min-w-0 flex-1 items-stretch overflow-x-auto overflow-y-hidden overscroll-x-contain py-0 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]"
          aria-label={t('topbar.modesAria')}
        >
          <SortableContext items={modeOrder} strategy={horizontalListSortingStrategy}>
            <div className="flex min-w-min flex-nowrap items-stretch gap-0.5 pr-1 pl-0.5 sm:gap-1 sm:pl-1">
              {orderedShellModes.map(({ id, label, icon }) => (
                <SortableTopbarModeTab
                  key={id}
                  id={id}
                  label={label}
                  icon={icon}
                  active={mode === id}
                  onSelect={setAppMode}
                  dragAria={t('topbar.moduleDragAria')}
                  dragTitle={t('topbar.moduleDragTitle')}
                />
              ))}
            </div>
          </SortableContext>
        </nav>
      </DndContext>

      <div className="min-w-[9rem] max-w-2xl flex-[2] basis-0 px-0.5 sm:min-w-[11rem] sm:px-1">
        <SearchBox />
      </div>

      <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
        {mode === 'mail' && !readingOpenMw ? (
          <button
            type="button"
            title={t('topbar.readingPaneShowTitle')}
            onClick={(): void => {
              setReadingOpenMw(true)
              setReadingPlacementMw('dock')
            }}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label={t('topbar.readingPaneShowAria')}
          >
            <BookOpen className="h-4 w-4" />
          </button>
        ) : null}
        {mode === 'mail' && !calendarOpenMw ? (
          <button
            type="button"
            title={t('topbar.calendarPaneShowTitle')}
            onClick={(): void => {
              setCalendarOpenMw(true)
              setCalendarPlacementMw('dock')
            }}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label={t('topbar.calendarPaneShowAria')}
          >
            <Calendar className="h-4 w-4" />
          </button>
        ) : null}

        <button
          type="button"
          onClick={(): void => void handleRefresh()}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label={t('topbar.refreshAria')}
          title={t('topbar.refreshTitle')}
        >
          <RefreshCw
            className={cn(
              'h-4 w-4',
              (refreshing || anyAccountSyncing) && 'animate-spin text-foreground'
            )}
          />
        </button>

        <ThemeToggle />

        <span className="mx-1 h-5 w-px bg-border" aria-hidden />

        <button
          type="button"
          onClick={startNewMail}
          className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          title={t('topbar.newMailTitle')}
        >
          <PenSquare className="h-4 w-4" />
          {t('topbar.newMail')}
        </button>

        <button
          type="button"
          onClick={onOpenAccountDialog}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label={t('topbar.settingsAria')}
          title={t('topbar.settingsTitle')}
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>
    </header>
  )
}

function ThemeToggle(): JSX.Element {
  const { t } = useTranslation()
  const mode = useThemeStore((s) => s.mode)
  const effective = useThemeStore((s) => s.effective)
  const accent = useThemeStore((s) => s.accent)
  const darkPalette = useThemeStore((s) => s.darkPalette)
  const setMode = useThemeStore((s) => s.setMode)
  const setAccent = useThemeStore((s) => s.setAccent)
  const setDarkPalette = useThemeStore((s) => s.setDarkPalette)
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({})

  const themeModeOptions = useMemo(
    () =>
      [
        { id: 'light' as const, label: t('topbar.themeLight'), icon: Sun },
        { id: 'dark' as const, label: t('topbar.themeDark'), icon: Moon },
        { id: 'system' as const, label: t('topbar.themeSystem'), icon: Monitor }
      ] satisfies Array<{
        id: ThemeMode
        label: string
        icon: React.ComponentType<{ className?: string }>
      }>,
    [t]
  )

  const darkPaletteOptions = useMemo(
    () =>
      [
        { id: 'default' as const, label: t('topbar.paletteDefault') },
        { id: 'midnight' as const, label: 'Midnight' },
        { id: 'nord' as const, label: 'Nord' },
        { id: 'graphite' as const, label: 'Graphite' }
      ] satisfies Array<{ id: DarkPalette; label: string }>,
    [t]
  )

  const updatePanelPosition = useCallback((): void => {
    if (!buttonRef.current) return
    const r = buttonRef.current.getBoundingClientRect()
    const width = 224
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, r.right - width))
    setPanelStyle({
      position: 'fixed',
      top: r.bottom + 4,
      left,
      width,
      zIndex: 210
    })
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    updatePanelPosition()
  }, [open, updatePanelPosition])

  useEffect(() => {
    if (!open) return
    updatePanelPosition()
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') setOpen(false)
    }
    function onDown(e: MouseEvent): void {
      const target = e.target as Node
      if (buttonRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('resize', updatePanelPosition)
    window.addEventListener('scroll', updatePanelPosition, true)
    return (): void => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('resize', updatePanelPosition)
      window.removeEventListener('scroll', updatePanelPosition, true)
    }
  }, [open, updatePanelPosition])

  const Icon = effective === 'dark' ? Moon : Sun
  const themeButtonTitle =
    mode === 'system'
      ? t('topbar.themeTitleSystem', {
          effective: t(effective === 'dark' ? 'topbar.themeDark' : 'topbar.themeLight')
        })
      : t('topbar.themeTitleExplicit', {
          mode: t(mode === 'dark' ? 'topbar.themeDark' : 'topbar.themeLight')
        })

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={(): void => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        aria-label={t('topbar.themeToggleAria')}
        aria-expanded={open}
        aria-haspopup="menu"
        title={themeButtonTitle}
      >
        <Icon className="h-4 w-4" />
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            aria-label={t('topbar.appearance')}
            className="glass-panel-elevated glass-animate-in overflow-hidden rounded-lg py-1 text-popover-foreground"
            style={panelStyle}
          >
          <div className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t('topbar.appearance')}
          </div>
          {themeModeOptions.map(({ id, label, icon: OptIcon }) => {
            const selected = mode === id
            return (
              <button
                key={id}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={(): void => {
                  setMode(id)
                }}
                className={cn(
                  'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-secondary/60',
                  selected ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                <OptIcon className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1">{label}</span>
                {selected && <Check className="h-3.5 w-3.5 text-primary" />}
              </button>
            )
          })}

          <div className="my-1 h-px bg-border" />

          {effective === 'dark' && (
            <>
              <div className="px-2.5 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t('topbar.darkVariant')}
              </div>
              {darkPaletteOptions.map(({ id, label }) => {
                const selected = darkPalette === id
                return (
                  <button
                    key={id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    onClick={(): void => setDarkPalette(id)}
                    className={cn(
                      'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-secondary/60',
                      selected ? 'text-foreground' : 'text-muted-foreground'
                    )}
                  >
                    <span className="flex-1">{label}</span>
                    {selected && <Check className="h-3.5 w-3.5 text-primary" />}
                  </button>
                )
              })}
              <div className="my-1 h-px bg-border" />
            </>
          )}

          <div className="px-2.5 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t('topbar.accent')}
          </div>
          <div className="grid grid-cols-4 gap-1.5 px-2.5 py-1.5">
            {ACCENT_LIST.map(({ id }) => (
              <AccentSwatch
                key={id}
                id={id}
                label={t(`topbar.accentNames.${id}`)}
                selected={accent === id}
                onClick={(): void => setAccent(id)}
              />
            ))}
          </div>
          </div>,
          document.body
        )}
    </div>
  )
}

function AccentSwatch({
  id,
  label,
  selected,
  onClick
}: {
  id: AccentName
  label: string
  selected: boolean
  onClick: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const style: React.CSSProperties = { backgroundColor: `hsl(${accentHsl(id)})` }
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={t('topbar.accentSwatchAria', { name: label })}
      aria-pressed={selected}
      className={cn(
        'relative flex h-7 items-center justify-center rounded-md transition-transform hover:scale-105',
        selected
          ? 'ring-2 ring-offset-2 ring-offset-popover'
          : 'ring-1 ring-inset ring-black/10 hover:ring-2'
      )}
      style={{
        ...style,
        ...(selected ? { '--tw-ring-color': `hsl(${accentHsl(id)})` } : {})
      } as React.CSSProperties}
    >
      {selected && <Check className="h-3.5 w-3.5 text-white drop-shadow" />}
    </button>
  )
}

function SearchBox(): JSX.Element {
  const { t, i18n } = useTranslation()
  const accounts = useAccountsStore((s) => s.accounts)
  const openMessageInFolder = useMailStore((s) => s.openMessageInFolder)

  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const folderLabel = useCallback(
    (hit: SearchHit): string => {
      if (hit.folderWellKnown === 'inbox') return t('topbar.folderInbox')
      if (hit.folderWellKnown === 'sentitems') return t('topbar.folderSent')
      if (hit.folderWellKnown === 'drafts') return t('topbar.folderDrafts')
      if (hit.folderWellKnown === 'deleteditems') return t('topbar.folderDeleted')
      if (hit.folderWellKnown === 'archive') return t('topbar.folderArchive')
      return hit.folderName ?? `(${t('common.folder')})`
    },
    [t]
  )

  const dateLocale = i18n.language.startsWith('de') ? 'de-DE' : 'en-US'

  // Debounced Suche
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setHits([])
      setLoading(false)
      return
    }
    setLoading(true)
    const handle = window.setTimeout(async () => {
      try {
        const res = await window.mailClient.mail.search(q, 30)
        setHits(res)
      } catch (e) {
        console.warn('[search] failed', e)
        setHits([])
      } finally {
        setLoading(false)
      }
    }, 180)
    return (): void => window.clearTimeout(handle)
  }, [query])

  // Klick ausserhalb schliesst das Popover.
  useEffect(() => {
    function onDown(e: MouseEvent): void {
      if (!containerRef.current) return
      if (!containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return (): void => window.removeEventListener('mousedown', onDown)
  }, [])

  // Strg+K / Cmd+K fokussiert das Suchfeld.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
        setOpen(true)
      } else if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        setOpen(false)
        inputRef.current?.blur()
      }
    }
    window.addEventListener('keydown', onKey)
    return (): void => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    function onFocusSearch(): void {
      setOpen(true)
      window.requestAnimationFrame(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      })
    }
    window.addEventListener(FOCUS_MAIN_SEARCH_EVENT, onFocusSearch)
    return (): void => window.removeEventListener(FOCUS_MAIN_SEARCH_EVENT, onFocusSearch)
  }, [])

  async function handleSelect(hit: SearchHit): Promise<void> {
    const q = query.trim()
    if (q.length >= 2) pushRecentSearch(q)
    setOpen(false)
    setQuery('')
    setHits([])
    await openMessageInFolder(hit.id)
  }

  function reset(): void {
    setQuery('')
    setHits([])
    inputRef.current?.focus()
  }

  const accountColorById = new Map(accounts.map((a) => [a.id, a.color] as const))

  return (
    <div ref={containerRef} className="relative w-full min-w-0 max-w-2xl">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(e): void => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onKeyDown={(e): void => {
          if (e.key !== 'Enter') return
          const q = query.trim()
          if (q.length < 2) return
          pushRecentSearch(q)
        }}
        onFocus={(): void => setOpen(true)}
        placeholder={t('topbar.searchPlaceholder')}
        className="glass-input h-8 w-full rounded-md border border-border/80 pl-9 pr-14 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:shadow-[0_0_0_3px_hsl(var(--ring)/0.18)] focus:ring-0"
      />
      <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
        {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        {query && !loading && (
          <button
            type="button"
            onClick={reset}
            className="text-muted-foreground hover:text-foreground"
            title={t('topbar.searchClearTitle')}
          >
            <X className="h-3 w-3" />
          </button>
        )}
        <kbd className="hidden rounded border border-border bg-secondary/60 px-1 text-[9px] text-muted-foreground/80 lg:inline">
          {t('topbar.ctrlK')}
        </kbd>
      </div>

      {open && query.trim().length >= 2 && (
        <div className="glass-panel-elevated glass-animate-in absolute left-0 right-0 top-full z-50 mt-1 max-h-[60vh] overflow-y-auto rounded-lg text-popover-foreground">
          {loading && hits.length === 0 && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t('topbar.searching')}
            </div>
          )}
          {!loading && hits.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              {t('topbar.searchNoHits', { query })}
            </div>
          )}
          {hits.map((hit) => {
            const color = accountColorById.get(hit.accountId)
            const date = hit.receivedAt
              ? new Date(hit.receivedAt).toLocaleDateString(dateLocale, {
                  day: '2-digit',
                  month: '2-digit',
                  year: '2-digit'
                })
              : ''
            return (
              <button
                key={hit.id}
                type="button"
                onClick={(): void => void handleSelect(hit)}
                className="flex w-full items-start gap-2 border-b border-border/50 px-3 py-1.5 text-left text-xs transition-colors last:border-b-0 hover:bg-secondary/60"
              >
                {color && (
                  <span
                    className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: resolvedAccountColorCss(color) }}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="flex-1 truncate font-medium text-foreground">
                      {hit.fromName || hit.fromAddr || `(${t('common.unknown')})`}
                    </span>
                    {hit.hasAttachments && (
                      <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                    )}
                    <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                      {date}
                    </span>
                  </div>
                  <div className="truncate text-foreground/80">
                    {hit.subject || t('common.noSubject')}
                  </div>
                  <div className="truncate text-[10px] text-muted-foreground">
                    {folderLabel(hit)} · {hit.snippet ?? ''}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
