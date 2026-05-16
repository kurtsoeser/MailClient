import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import type { MailFilter } from '@/stores/mail'
import { type MailListArrangeBy, type MailListChronoOrder } from '@/lib/mail-list-arrange'
import { Check, ChevronDown } from 'lucide-react'

const ARRANGE_ORDER: MailListArrangeBy[] = [
  'date_conversations',
  'from',
  'to',
  'categories',
  'read_status',
  'importance',
  'flag_start',
  'flag_due',
  'todo_bucket',
  'size_preview',
  'subject',
  'message_type',
  'attachments',
  'account'
]

interface Props {
  arrange: MailListArrangeBy
  chrono: MailListChronoOrder
  filter: MailFilter
  filterCounts: { all: number; unread: number; flagged: number; withTodo: number }
  onArrangeChange: (v: MailListArrangeBy) => void
  onChronoChange: (v: MailListChronoOrder) => void
  onFilterChange: (v: MailFilter) => void
  disabled?: boolean
}

function MenuSectionTitle({ children }: { children: string }): JSX.Element {
  return (
    <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </div>
  )
}

function MenuDivider(): JSX.Element {
  return <div className="my-1 border-t border-border/80" role="separator" />
}

function MenuRow({
  selected,
  onPick,
  disabled,
  title,
  suffix,
  children
}: {
  selected?: boolean
  onPick?: () => void
  disabled?: boolean
  title?: string
  suffix?: ReactNode
  children: React.ReactNode
}): JSX.Element {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={onPick}
      className={cn(
        'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors',
        disabled
          ? 'cursor-not-allowed text-muted-foreground/50'
          : selected
            ? 'bg-secondary text-foreground'
            : 'text-foreground hover:bg-secondary/70'
      )}
    >
      <span className="flex w-4 shrink-0 justify-center">
        {selected && !disabled ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
      </span>
      <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
        <span className="min-w-0 leading-snug">{children}</span>
        {suffix != null ? (
          <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground">{suffix}</span>
        ) : null}
      </span>
    </button>
  )
}

export function MailListViewMenu({
  arrange,
  chrono,
  filter,
  filterCounts,
  onArrangeChange,
  onChronoChange,
  onFilterChange,
  disabled
}: Props): JSX.Element {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({})

  const arrangeLabel = useCallback(
    (key: MailListArrangeBy): string => t(`mail.listArrange.${key}` as const),
    [t]
  )

  const summary = useMemo(() => arrangeLabel(arrange), [arrange, arrangeLabel])

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const width = Math.min(320, vw - 16)
    let left = r.left
    if (left + width > vw - 8) left = vw - 8 - width
    if (left < 8) left = 8
    const maxH = Math.max(200, vh - r.bottom - 12)
    setPanelStyle({
      position: 'fixed',
      top: r.bottom + 4,
      left,
      width,
      maxHeight: maxH
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

  return (
    <div className="relative min-w-0 flex-1">
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={(): void => setOpen((o) => !o)}
        className={cn(
          'flex max-w-full min-w-0 items-center gap-1 rounded-md border border-transparent px-2 py-1 text-left text-xs font-medium transition-colors',
          disabled
            ? 'cursor-not-allowed text-muted-foreground'
            : 'text-foreground hover:border-border hover:bg-secondary/60'
        )}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="truncate">
          {t('mail.listViewMenu.viewByPrefix')} <span className="text-muted-foreground">: </span>
          {summary}
        </span>
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground', open && 'rotate-180')} />
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            aria-label={t('mail.listViewMenu.menuAria')}
            className={cn(
              'z-[400] overflow-y-auto rounded-lg border border-border bg-popover py-1 shadow-xl',
              'text-popover-foreground'
            )}
            style={panelStyle}
          >
          <MenuSectionTitle>{t('mail.listViewMenu.filterSection')}</MenuSectionTitle>
          <div className="px-1">
            <MenuRow
              selected={filter === 'all'}
              suffix={filterCounts.all}
              onPick={(): void => {
                onFilterChange('all')
                setOpen(false)
              }}
            >
              {t('mail.listViewMenu.filterAll')}
            </MenuRow>
            <MenuRow
              selected={filter === 'unread'}
              suffix={filterCounts.unread > 0 ? filterCounts.unread : undefined}
              onPick={(): void => {
                onFilterChange('unread')
                setOpen(false)
              }}
            >
              {t('mail.listViewMenu.filterUnread')}
            </MenuRow>
            <MenuRow
              selected={filter === 'flagged'}
              suffix={filterCounts.flagged > 0 ? filterCounts.flagged : undefined}
              title={t('mail.listViewMenu.filterFlaggedTitle')}
              onPick={(): void => {
                onFilterChange('flagged')
                setOpen(false)
              }}
            >
              {t('mail.listViewMenu.filterFlagged')}
            </MenuRow>
            <MenuRow
              selected={filter === 'with_todo'}
              suffix={filterCounts.withTodo > 0 ? filterCounts.withTodo : undefined}
              onPick={(): void => {
                onFilterChange('with_todo')
                setOpen(false)
              }}
            >
              {t('mail.listViewMenu.filterTodo')}
            </MenuRow>
            <MenuRow disabled title={t('mail.listViewMenu.filterMentionedTitle')}>
              {t('mail.listViewMenu.filterMentioned')}
            </MenuRow>
          </div>

          <MenuDivider />

          <MenuSectionTitle>{t('mail.listViewMenu.arrangeSection')}</MenuSectionTitle>
          <div className="px-1">
            {ARRANGE_ORDER.map((key) => (
              <MenuRow
                key={key}
                selected={arrange === key}
                onPick={(): void => {
                  onArrangeChange(key)
                  setOpen(false)
                }}
              >
                {arrangeLabel(key)}
              </MenuRow>
            ))}
          </div>

          <MenuDivider />

          <MenuSectionTitle>{t('mail.listViewMenu.sortSection')}</MenuSectionTitle>
          <div className="px-1 pb-1">
            <MenuRow
              selected={chrono === 'newest_on_top'}
              onPick={(): void => {
                onChronoChange('newest_on_top')
                setOpen(false)
              }}
            >
              {t('mail.listViewMenu.chronoNewest')}
            </MenuRow>
            <MenuRow
              selected={chrono === 'oldest_on_top'}
              onPick={(): void => {
                onChronoChange('oldest_on_top')
                setOpen(false)
              }}
            >
              {t('mail.listViewMenu.chronoOldest')}
            </MenuRow>
          </div>
        </div>,
          document.body
        )}
    </div>
  )
}
