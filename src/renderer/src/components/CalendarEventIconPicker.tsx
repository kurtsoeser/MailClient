import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type JSX,
  type ReactNode
} from 'react'
import { createPortal } from 'react-dom'
import { Calendar, Search, Shuffle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import {
  CALENDAR_EVENT_ICON_CATALOG,
  calendarEventIconIsExplicit,
  calendarEventIconLabel,
  resolveCalendarEventIcon
} from '@/lib/calendar-event-icons'
import {
  filterCalendarEventIconCatalog,
  pickRandomCalendarEventIconId
} from '@/lib/calendar-event-icon-search'

export interface CalendarEventIconPickerProps {
  iconId?: string | null
  title: string
  disabled?: boolean
  onIconChange: (iconId: string | undefined) => void
  /** Vorschau: großes Icon + Titel + Raster; Dialog: nur Button + Popover */
  layout?: 'preview' | 'compact'
  /** Kompakt: Klick oder Doppelklick öffnet den Picker. */
  openOn?: 'click' | 'doubleClick'
  /** Optionale Icon-Farbe (z. B. Sektionsfarbe in der Notizen-Sidebar). */
  iconColorHex?: string | null
  /** Zusätzlicher Inhalt unter dem Icon-Raster (z. B. Farbpalette). */
  footer?: ReactNode
  compactButtonClassName?: string
  className?: string
  /** Kompakt: Standard-Inhalt des Triggers wenn kein explizites `iconId` gesetzt ist. */
  triggerIcon?: ReactNode
}

const PICKER_GRID_COLS = 8
const PICKER_MAX_HEIGHT_PX = 280
const COMPACT_POPOVER_WIDTH_PX = 320

function computeCompactPopoverStyle(anchor: DOMRect): CSSProperties {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const margin = 8
  const width = Math.min(COMPACT_POPOVER_WIDTH_PX, vw - margin * 2)
  const spaceRight = vw - anchor.right - margin
  const spaceBelow = vh - anchor.bottom - margin
  const spaceAbove = anchor.top - margin

  if (spaceRight >= width) {
    const top = Math.max(margin, Math.min(anchor.top, vh - margin - 120))
    return {
      position: 'fixed',
      top,
      left: anchor.right + 4,
      width,
      maxHeight: vh - top - margin,
      zIndex: 500
    }
  }

  if (spaceBelow >= 160) {
    let left = anchor.left
    if (left + width > vw - margin) left = vw - margin - width
    if (left < margin) left = margin
    return {
      position: 'fixed',
      top: anchor.bottom + 4,
      left,
      width,
      maxHeight: spaceBelow,
      zIndex: 500
    }
  }

  const maxH = Math.max(160, Math.min(380, spaceAbove))
  let left = anchor.left
  if (left + width > vw - margin) left = vw - margin - width
  if (left < margin) left = margin
  return {
    position: 'fixed',
    top: Math.max(margin, anchor.top - maxH - 4),
    left,
    width,
    maxHeight: maxH,
    zIndex: 500
  }
}

export function CalendarEventIconPicker({
  iconId,
  title,
  disabled,
  onIconChange,
  layout = 'preview',
  openOn = 'click',
  iconColorHex,
  footer,
  compactButtonClassName,
  className,
  triggerIcon
}: CalendarEventIconPickerProps): JSX.Element {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const popoverRef = useRef<HTMLDivElement>(null)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [compactPopoverStyle, setCompactPopoverStyle] = useState<CSSProperties>({})
  const SelectedIcon = resolveCalendarEventIcon(iconId)
  const hasExplicit = calendarEventIconIsExplicit(iconId)

  const extraSearch = useMemo(
    () =>
      (id: string): string => {
        const key = `calendar.eventIcon.${id}`
        const localized = t(key)
        return localized === key ? '' : localized
      },
    [t]
  )

  const filteredIcons = useMemo(
    () => filterCalendarEventIconCatalog(CALENDAR_EVENT_ICON_CATALOG, query, extraSearch),
    [query, extraSearch]
  )

  useLayoutEffect(() => {
    if (!open || layout !== 'compact' || !anchorRef.current) return
    const update = (): void => {
      setCompactPopoverStyle(computeCompactPopoverStyle(anchorRef.current!.getBoundingClientRect()))
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return (): void => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, layout])

  useEffect(() => {
    if (!open) return
    function onDocMouseDown(e: MouseEvent): void {
      const target = e.target as Node
      if (layout === 'compact') {
        if (anchorRef.current?.contains(target)) return
        if (popoverRef.current?.contains(target)) return
        setOpen(false)
        return
      }
      const el = popoverRef.current
      if (!el || el.contains(target)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    window.addEventListener('keydown', onKey)
    return (): void => {
      document.removeEventListener('mousedown', onDocMouseDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, layout])

  useEffect(() => {
    if (!open) {
      setQuery('')
      return
    }
    const tmr = window.setTimeout(() => searchRef.current?.focus(), 0)
    return (): void => clearTimeout(tmr)
  }, [open])

  const iconStyle = iconColorHex ? { color: iconColorHex } : undefined

  const pickerPanel = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            ref={searchRef}
            type="search"
            value={query}
            disabled={disabled}
            placeholder={t('calendar.eventIcon.searchPlaceholder')}
            className="h-8 w-full rounded-md border border-border bg-background/80 pl-8 pr-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            onChange={(e): void => setQuery(e.target.value)}
            onKeyDown={(e): void => {
              if (e.key === 'Escape') {
                e.stopPropagation()
                if (query) setQuery('')
                else setOpen(false)
              }
            }}
          />
        </div>
        <button
          type="button"
          disabled={disabled || filteredIcons.length === 0}
          title={t('calendar.eventIcon.random')}
          aria-label={t('calendar.eventIcon.random')}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/60 text-muted-foreground hover:bg-secondary/80 hover:text-foreground disabled:opacity-40"
          onClick={(): void => {
            const pool = filteredIcons.length > 0 ? filteredIcons : CALENDAR_EVENT_ICON_CATALOG
            const id = pickRandomCalendarEventIconId(pool)
            if (id) onIconChange(id)
          }}
        >
          <Shuffle className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          disabled={disabled}
          title={t('calendar.eventIcon.clear')}
          aria-label={t('calendar.eventIcon.clear')}
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/60 text-muted-foreground hover:bg-secondary/80 hover:text-foreground disabled:opacity-40',
            !hasExplicit && 'ring-1 ring-primary/40 bg-primary/10 text-primary'
          )}
          onClick={(): void => {
            onIconChange(undefined)
            setOpen(false)
          }}
        >
          <Calendar className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </div>
      {query.trim() ? (
        <p className="px-0.5 text-[10px] text-muted-foreground">
          {t('calendar.eventIcon.searchCount', { count: filteredIcons.length })}
        </p>
      ) : null}
      <div
        className="overflow-y-auto overscroll-contain pr-0.5"
        style={{ maxHeight: PICKER_MAX_HEIGHT_PX }}
      >
        {filteredIcons.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            {t('calendar.eventIcon.searchEmpty')}
          </p>
        ) : (
          <div
            className="grid gap-0.5"
            style={{ gridTemplateColumns: `repeat(${PICKER_GRID_COLS}, minmax(0, 1fr))` }}
          >
            {filteredIcons.map((entry) => {
              const Icon = resolveCalendarEventIcon(entry.id)
              const selected = hasExplicit && iconId === entry.id
              const tip = calendarEventIconLabel(entry.id, (k) => t(k))
              return (
                <button
                  key={entry.id}
                  type="button"
                  disabled={disabled}
                  title={tip}
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary/80 hover:text-foreground',
                    selected && 'bg-primary/15 text-primary ring-1 ring-primary/40',
                    disabled && 'pointer-events-none opacity-50'
                  )}
                  onClick={(): void => {
                    onIconChange(entry.id)
                    setOpen(false)
                  }}
                >
                  <Icon className="h-4 w-4" strokeWidth={2} />
                </button>
              )
            })}
          </div>
        )}
      </div>
      {footer}
    </div>
  )

  const openPicker = (): void => setOpen(true)
  const togglePicker = (): void => setOpen((o) => !o)

  if (layout === 'compact') {
    return (
      <div className={cn('relative shrink-0', className)}>
        <button
          ref={anchorRef}
          type="button"
          disabled={disabled}
          onClick={openOn === 'click' ? togglePicker : undefined}
          onDoubleClick={
            openOn === 'doubleClick'
              ? (e): void => {
                  e.preventDefault()
                  e.stopPropagation()
                  openPicker()
                }
              : undefined
          }
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-md border border-border/60 bg-secondary/20 text-muted-foreground hover:bg-secondary/60 hover:text-foreground disabled:opacity-50',
            compactButtonClassName
          )}
          title={t('calendar.eventIcon.pickerTitle')}
          aria-label={t('calendar.eventIcon.pickerTitle')}
        >
          {hasExplicit ? (
            <SelectedIcon className="h-4 w-4" strokeWidth={2} style={iconStyle} />
          ) : (
            triggerIcon ?? <SelectedIcon className="h-4 w-4" strokeWidth={2} style={iconStyle} />
          )}
        </button>
        {open
          ? createPortal(
              <div
                ref={popoverRef}
                role="dialog"
                aria-label={t('calendar.eventIcon.pickerTitle')}
                className="overflow-hidden rounded-lg border border-border bg-popover p-2 shadow-xl"
                style={compactPopoverStyle}
              >
                {pickerPanel}
              </div>,
              document.body
            )
          : null}
      </div>
    )
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-start gap-2">
        <div className="relative shrink-0">
          <button
            type="button"
            disabled={disabled}
            onClick={(): void => setOpen((o) => !o)}
            className={cn(
              'flex h-11 w-11 items-center justify-center rounded-lg border-2 bg-secondary/30 text-foreground transition-colors hover:bg-secondary/50',
              open ? 'border-primary' : 'border-primary/50',
              disabled && 'pointer-events-none opacity-50'
            )}
            title={t('calendar.eventIcon.pickerTitle')}
            aria-label={t('calendar.eventIcon.pickerTitle')}
          >
            <SelectedIcon className="h-6 w-6" strokeWidth={2} style={iconStyle} />
          </button>
        </div>
        <p className="min-w-0 flex-1 pt-1 text-[17px] font-semibold leading-snug text-foreground">
          {title.trim() || t('calendar.eventPreview.noTitle')}
        </p>
      </div>
      {open ? (
        <div
          ref={popoverRef}
          className="rounded-lg border border-border bg-card/80 p-2"
          role="dialog"
          aria-label={t('calendar.eventIcon.pickerTitle')}
        >
          {pickerPanel}
        </div>
      ) : null}
    </div>
  )
}
