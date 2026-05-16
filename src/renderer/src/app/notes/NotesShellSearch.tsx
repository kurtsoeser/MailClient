import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent
} from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Loader2, Search, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ConnectedAccount, NoteSection, UserNoteListItem, UserNoteKind } from '@shared/types'
import { NoteDisplayIcon } from '@/components/NoteDisplayIcon'
import { noteSearchBreadcrumb, noteSearchResultTitle } from '@/lib/notes-search-breadcrumb'
import {
  pushNotesSearchRecentId,
  readNotesSearchRecentIds
} from '@/lib/notes-search-recent'
import { useSearchDropdownPortal } from '@/lib/use-search-dropdown-portal'
import { cn } from '@/lib/utils'

const SEARCH_DEBOUNCE_MS = 280
const ALL_KINDS: UserNoteKind[] = ['mail', 'calendar', 'standalone']

export function NotesShellSearch({
  sections,
  accounts,
  onOpenNote,
  className
}: {
  sections: NoteSection[]
  accounts: ConnectedAccount[]
  onOpenNote: (note: UserNoteListItem) => void
  className?: string
}): JSX.Element {
  const { t } = useTranslation()
  const listboxId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<UserNoteListItem[]>([])
  const [recentNotes, setRecentNotes] = useState<UserNoteListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [highlight, setHighlight] = useState(-1)
  const searchGenRef = useRef(0)
  const panelStyle = useSearchDropdownPortal(rootRef, open, {
    width: Math.min(360, window.innerWidth - 16),
    align: 'right'
  })

  const loadRecent = useCallback(async (): Promise<void> => {
    const ids = readNotesSearchRecentIds()
    if (ids.length === 0) {
      setRecentNotes([])
      return
    }
    const loaded = await Promise.all(
      ids.map((id) => window.mailClient.notes.getById(id).catch(() => null))
    )
    const byId = new Map<number, UserNoteListItem>()
    for (const note of loaded) {
      if (note) byId.set(note.id, note as UserNoteListItem)
    }
    setRecentNotes(ids.map((id) => byId.get(id)).filter((n): n is UserNoteListItem => n != null))
  }, [])

  useEffect(() => {
    if (!open) return
    function onDocMouseDown(e: MouseEvent): void {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
        setHighlight(-1)
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return (): void => document.removeEventListener('mousedown', onDocMouseDown)
  }, [open])

  useEffect(() => {
    if (!open) return
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      setLoading(false)
      void loadRecent()
      return
    }

    const gen = ++searchGenRef.current
    setLoading(true)
    const timer = window.setTimeout(() => {
      void window.mailClient.notes
        .search({ query: q, kinds: ALL_KINDS, limit: 30 })
        .then((rows) => {
          if (searchGenRef.current !== gen) return
          setResults(rows)
          setHighlight(rows.length > 0 ? 0 : -1)
        })
        .catch(() => {
          if (searchGenRef.current !== gen) return
          setResults([])
          setHighlight(-1)
        })
        .finally(() => {
          if (searchGenRef.current === gen) setLoading(false)
        })
    }, SEARCH_DEBOUNCE_MS)

    return (): void => clearTimeout(timer)
  }, [query, open, loadRecent])

  const visibleRows =
    query.trim().length >= 2 ? results : recentNotes
  const showRecentHeader = open && query.trim().length < 2 && recentNotes.length > 0

  const pickNote = useCallback(
    (note: UserNoteListItem): void => {
      pushNotesSearchRecentId(note.id)
      onOpenNote(note)
      setQuery('')
      setOpen(false)
      setHighlight(-1)
      inputRef.current?.blur()
    },
    [onOpenNote]
  )

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true)
      return
    }
    if (e.key === 'Escape') {
      setOpen(false)
      setHighlight(-1)
      return
    }
    if (!open || visibleRows.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => (h + 1) % visibleRows.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => (h <= 0 ? visibleRows.length - 1 : h - 1))
    } else if (e.key === 'Enter' && highlight >= 0) {
      e.preventDefault()
      const note = visibleRows[highlight]
      if (note) pickNote(note)
    }
  }

  return (
    <div ref={rootRef} className={cn('relative min-w-[12rem] max-w-[18rem] flex-1', className)}>
      <div
        className={cn(
          'flex h-8 items-center gap-1 rounded-md border bg-background/80 px-1.5',
          open ? 'border-ring ring-1 ring-ring/30' : 'border-border'
        )}
      >
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e): void => setQuery(e.target.value)}
          onFocus={(): void => {
            setOpen(true)
            void loadRecent()
          }}
          onKeyDown={onKeyDown}
          placeholder={t('notes.shell.searchPlaceholder')}
          aria-label={t('notes.shell.searchPlaceholder')}
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          role="combobox"
          className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
        />
        {query ? (
          <button
            type="button"
            onClick={(): void => {
              setQuery('')
              setResults([])
              inputRef.current?.focus()
            }}
            className="rounded p-0.5 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
            aria-label={t('notes.shell.searchClear')}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
        <button
          type="button"
          onClick={(): void => {
            setOpen((o) => !o)
            if (!open) void loadRecent()
          }}
          className="rounded p-0.5 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
          aria-label={t('notes.shell.searchToggle')}
          aria-expanded={open}
        >
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
        </button>
      </div>

      {open
        ? createPortal(
            <div
              id={listboxId}
              role="listbox"
              className="overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-xl"
              style={panelStyle}
            >
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5 text-[10px] text-muted-foreground">
            <span className="truncate">
              {query.trim().length >= 2
                ? t('notes.shell.searchResultsScope')
                : t('notes.shell.searchRecent')}
            </span>
            {loading ? <Loader2 className="h-3 w-3 shrink-0 animate-spin" /> : null}
          </div>

          <div className="max-h-72 overflow-y-auto py-1">
            {query.trim().length >= 2 && !loading && results.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                {t('notes.shell.searchNoResults')}
              </div>
            ) : null}

            {showRecentHeader && query.trim().length < 2 ? (
              <div className="px-3 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {t('notes.shell.searchRecent')}
              </div>
            ) : null}

            {visibleRows.map((note, index) => {
              const active = index === highlight
              return (
                <button
                  key={note.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onMouseEnter={(): void => setHighlight(index)}
                  onClick={(): void => pickNote(note)}
                  className={cn(
                    'flex w-full items-start gap-2 px-2 py-1.5 text-left text-xs',
                    active && 'bg-secondary/80'
                  )}
                >
                  {active ? (
                    <span className="mt-1 w-0.5 shrink-0 self-stretch rounded-full bg-primary" aria-hidden />
                  ) : (
                    <span className="w-0.5 shrink-0" aria-hidden />
                  )}
                  <NoteDisplayIcon note={note} className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-foreground">
                      {noteSearchResultTitle(note, t('notes.shell.untitled'))}
                    </span>
                    <span className="block truncate text-[10px] text-muted-foreground">
                      ({noteSearchBreadcrumb(note, sections, accounts, t)})
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
            </div>,
            document.body
          )
        : null}
    </div>
  )
}
