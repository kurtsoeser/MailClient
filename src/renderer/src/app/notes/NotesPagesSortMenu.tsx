import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDownAZ, Check, ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import {
  NOTES_PAGES_SORT_KEYS,
  notesPagesSortLabelKey,
  persistNotesPagesSort,
  type NotesPagesSortKey
} from '@/lib/notes-pages-sort'
import { moduleColumnHeaderSubToolbarClass } from '@/components/ModuleColumnHeader'

export function NotesPagesSortMenu({
  sortKey,
  onSortChange,
  disabled
}: {
  sortKey: NotesPagesSortKey
  onSortChange: (key: NotesPagesSortKey) => void
  disabled?: boolean
}): JSX.Element {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({})

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const width = Math.min(240, vw - 16)
    let left = r.left
    if (left + width > vw - 8) left = vw - 8 - width
    if (left < 8) left = 8
    const maxH = Math.max(160, vh - r.bottom - 12)
    setPanelStyle({
      position: 'fixed',
      top: r.bottom + 4,
      left,
      width,
      maxHeight: maxH,
      zIndex: 500
    })
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') setOpen(false)
    }
    function onDown(e: MouseEvent): void {
      const target = e.target as Node
      if (btnRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    return (): void => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
    }
  }, [open])

  const pick = (key: NotesPagesSortKey): void => {
    persistNotesPagesSort(key)
    onSortChange(key)
    setOpen(false)
  }

  return (
    <div className={cn(moduleColumnHeaderSubToolbarClass, 'shrink-0 border-b border-border py-1.5')}>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={(): void => setOpen((o) => !o)}
        className={cn(
          'flex w-full min-w-0 items-center gap-1.5 rounded-md border border-border px-2 py-1 text-left text-[11px] font-medium transition-colors',
          disabled
            ? 'cursor-not-allowed text-muted-foreground/50'
            : 'text-foreground hover:bg-secondary/60'
        )}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <ArrowDownAZ className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">
          {t('notes.shell.pagesSortLabel')}: {t(notesPagesSortLabelKey(sortKey) as 'notes.shell.pagesSort.manual')}
        </span>
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground', open && 'rotate-180')} />
      </button>
      {open
        ? createPortal(
            <div
              ref={panelRef}
              role="menu"
              aria-label={t('notes.shell.pagesSortLabel')}
              className="overflow-y-auto rounded-lg border border-border bg-popover py-1 shadow-xl"
              style={panelStyle}
            >
              {NOTES_PAGES_SORT_KEYS.map((key) => {
                const selected = key === sortKey
                return (
                  <button
                    key={key}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    onClick={(): void => pick(key)}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-secondary/70',
                      selected && 'bg-secondary font-medium'
                    )}
                  >
                    <span className="flex w-4 shrink-0 justify-center">
                      {selected ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
                    </span>
                    <span>{t(notesPagesSortLabelKey(key) as 'notes.shell.pagesSort.manual')}</span>
                  </button>
                )
              })}
            </div>,
            document.body
          )
        : null}
    </div>
  )
}
