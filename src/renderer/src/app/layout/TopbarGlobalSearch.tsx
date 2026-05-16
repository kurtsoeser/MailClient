import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Calendar,
  ListTodo,
  Loader2,
  Paperclip,
  Search,
  StickyNote,
  Users,
  X
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type {
  CalendarEventView,
  GlobalSearchContactHit,
  GlobalSearchNoteHit,
  GlobalSearchResult,
  GlobalSearchTaskHit,
  SearchHit
} from '@shared/types'
import { resolvedAccountColorCss } from '@/lib/avatar-color'
import { pushRecentSearch } from '@/app/home/dashboard-recent-searches'
import { FOCUS_MAIN_SEARCH_EVENT } from '@/lib/search-focus'
import { useSearchDropdownPortal } from '@/lib/use-search-dropdown-portal'
import { useAccountsStore } from '@/stores/accounts'
import { useAppModeStore } from '@/stores/app-mode'
import { useMailStore } from '@/stores/mail'
import { useCalendarPendingFocusStore } from '@/stores/calendar-pending-focus'
import { useNotesPendingFocusStore } from '@/stores/notes-pending-focus'
import { usePeoplePendingFocusStore } from '@/stores/people-pending-focus'
import { useTasksPendingFocusStore } from '@/stores/tasks-pending-focus'
import { persistTasksViewSelection } from '@/app/tasks/tasks-view-storage'
function hasAnyResults(result: GlobalSearchResult | null): boolean {
  if (!result) return false
  return (
    result.mails.length > 0 ||
    result.notes.length > 0 ||
    result.calendarEvents.length > 0 ||
    result.tasks.length > 0 ||
    result.contacts.length > 0
  )
}

function SearchSection({
  title,
  children
}: {
  title: string
  children: React.ReactNode
}): JSX.Element | null {
  if (!children) return null
  return (
    <div>
      <div className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      {children}
    </div>
  )
}

export function TopbarGlobalSearch(): JSX.Element {
  const { t, i18n } = useTranslation()
  const accounts = useAccountsStore((s) => s.accounts)
  const openMessageInFolder = useMailStore((s) => s.openMessageInFolder)
  const setAppMode = useAppModeStore((s) => s.setMode)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GlobalSearchResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelStyle = useSearchDropdownPortal(containerRef, open && query.trim().length >= 2, {
    width: Math.min(420, window.innerWidth - 16),
    align: 'left'
  })

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
  const accountColorById = new Map(accounts.map((a) => [a.id, a.color] as const))

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults(null)
      setLoading(false)
      return
    }
    setLoading(true)
    const handle = window.setTimeout(async () => {
      try {
        const res = await window.mailClient.app.globalSearch({ query: q, limitPerKind: 8 })
        setResults(res)
      } catch (e) {
        console.warn('[global-search] failed', e)
        setResults(null)
      } finally {
        setLoading(false)
      }
    }, 180)
    return (): void => window.clearTimeout(handle)
  }, [query])

  useEffect(() => {
    function onDown(e: MouseEvent): void {
      if (!containerRef.current) return
      if (!containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return (): void => window.removeEventListener('mousedown', onDown)
  }, [])

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

  function closeSearch(): void {
    setOpen(false)
    setQuery('')
    setResults(null)
  }

  async function handleSelectMail(hit: SearchHit): Promise<void> {
    const q = query.trim()
    if (q.length >= 2) pushRecentSearch(q)
    closeSearch()
    await openMessageInFolder(hit.id)
  }

  function handleSelectNote(note: GlobalSearchNoteHit): void {
    const q = query.trim()
    if (q.length >= 2) pushRecentSearch(q)
    useNotesPendingFocusStore.getState().setPendingNoteId(note.id)
    setAppMode('notes')
    closeSearch()
  }

  function handleSelectCalendar(ev: CalendarEventView): void {
    const q = query.trim()
    if (q.length >= 2) pushRecentSearch(q)
    useCalendarPendingFocusStore.getState().queueFocusEvent(ev)
    setAppMode('calendar')
    closeSearch()
  }

  function handleSelectTask(task: GlobalSearchTaskHit): void {
    const q = query.trim()
    if (q.length >= 2) pushRecentSearch(q)
    useTasksPendingFocusStore.getState().queueTask({
      accountId: task.accountId,
      listId: task.listId,
      taskId: task.taskId
    })
    persistTasksViewSelection({
      kind: 'list',
      accountId: task.accountId,
      listId: task.listId
    })
    setAppMode('tasks')
    closeSearch()
  }

  function handleSelectContact(contact: GlobalSearchContactHit): void {
    const q = query.trim()
    if (q.length >= 2) pushRecentSearch(q)
    usePeoplePendingFocusStore.getState().setPendingContactId(contact.id)
    setAppMode('people')
    closeSearch()
  }

  function reset(): void {
    setQuery('')
    setResults(null)
    inputRef.current?.focus()
  }

  const showPanel = open && query.trim().length >= 2

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
        {query && !loading ? (
          <button
            type="button"
            onClick={reset}
            className="text-muted-foreground hover:text-foreground"
            title={t('topbar.searchClearTitle')}
          >
            <X className="h-3 w-3" />
          </button>
        ) : null}
        <kbd className="hidden rounded border border-border bg-secondary/60 px-1 text-[9px] text-muted-foreground/80 lg:inline">
          {t('topbar.ctrlK')}
        </kbd>
      </div>

      {showPanel &&
        createPortal(
          <div
            role="listbox"
            aria-label={t('topbar.searchPlaceholder')}
            className="glass-panel-elevated glass-animate-in overflow-y-auto rounded-lg text-popover-foreground shadow-xl"
            style={panelStyle}
          >
            {loading && !hasAnyResults(results) ? (
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                {t('topbar.searching')}
              </div>
            ) : null}
            {!loading && !hasAnyResults(results) ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                {t('topbar.searchNoHits', { query: query.trim() })}
              </div>
            ) : null}

            {results && results.mails.length > 0 ? (
              <SearchSection title={t('topbar.searchSectionMail')}>
                {results.mails.map((hit) => {
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
                      key={`mail-${hit.id}`}
                      type="button"
                      onClick={(): void => void handleSelectMail(hit)}
                      className="flex w-full items-start gap-2 border-b border-border/50 px-3 py-1.5 text-left text-xs transition-colors last:border-b-0 hover:bg-secondary/60"
                    >
                      {color ? (
                        <span
                          className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: resolvedAccountColorCss(color) }}
                        />
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="flex-1 truncate font-medium text-foreground">
                            {hit.fromName || hit.fromAddr || `(${t('common.unknown')})`}
                          </span>
                          {hit.hasAttachments ? (
                            <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                          ) : null}
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
              </SearchSection>
            ) : null}

            {results && results.notes.length > 0 ? (
              <SearchSection title={t('topbar.searchSectionNotes')}>
                {results.notes.map((note) => (
                  <button
                    key={`note-${note.id}`}
                    type="button"
                    onClick={(): void => handleSelectNote(note)}
                    className="flex w-full items-start gap-2 px-3 py-1.5 text-left text-xs hover:bg-secondary/60"
                  >
                    <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate font-medium">{note.title}</span>
                  </button>
                ))}
              </SearchSection>
            ) : null}

            {results && results.calendarEvents.length > 0 ? (
              <SearchSection title={t('topbar.searchSectionCalendar')}>
                {results.calendarEvents.map((ev) => (
                  <button
                    key={`cal-${ev.id}`}
                    type="button"
                    onClick={(): void => handleSelectCalendar(ev)}
                    className="flex w-full items-start gap-2 px-3 py-1.5 text-left text-xs hover:bg-secondary/60"
                  >
                    <Calendar className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{ev.title}</span>
                      {ev.location ? (
                        <span className="block truncate text-[10px] text-muted-foreground">
                          {ev.location}
                        </span>
                      ) : null}
                    </span>
                  </button>
                ))}
              </SearchSection>
            ) : null}

            {results && results.tasks.length > 0 ? (
              <SearchSection title={t('topbar.searchSectionTasks')}>
                {results.tasks.map((task) => (
                  <button
                    key={`task-${task.accountId}-${task.listId}-${task.taskId}`}
                    type="button"
                    onClick={(): void => handleSelectTask(task)}
                    className="flex w-full items-start gap-2 px-3 py-1.5 text-left text-xs hover:bg-secondary/60"
                  >
                    <ListTodo className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate font-medium">{task.title}</span>
                  </button>
                ))}
              </SearchSection>
            ) : null}

            {results && results.contacts.length > 0 ? (
              <SearchSection title={t('topbar.searchSectionContacts')}>
                {results.contacts.map((c) => (
                  <button
                    key={`contact-${c.id}`}
                    type="button"
                    onClick={(): void => handleSelectContact(c)}
                    className="flex w-full items-start gap-2 px-3 py-1.5 text-left text-xs hover:bg-secondary/60"
                  >
                    <Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {c.displayName || c.primaryEmail || t('common.unknown')}
                      </span>
                      {c.primaryEmail ? (
                        <span className="block truncate text-[10px] text-muted-foreground">
                          {c.primaryEmail}
                        </span>
                      ) : null}
                    </span>
                  </button>
                ))}
              </SearchSection>
            ) : null}
          </div>,
          document.body
        )}
    </div>
  )
}
