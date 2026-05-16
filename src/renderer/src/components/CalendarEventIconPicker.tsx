import { useEffect, useRef, useState, type JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import {
  CALENDAR_EVENT_ICON_IDS,
  calendarEventIconIsExplicit,
  resolveCalendarEventIcon
} from '@/lib/calendar-event-icons'

export interface CalendarEventIconPickerProps {
  iconId?: string | null
  title: string
  disabled?: boolean
  onIconChange: (iconId: string | undefined) => void
  /** Vorschau: großes Icon + Titel + Raster; Dialog: nur Button + Popover */
  layout?: 'preview' | 'compact'
  className?: string
}

export function CalendarEventIconPicker({
  iconId,
  title,
  disabled,
  onIconChange,
  layout = 'preview',
  className
}: CalendarEventIconPickerProps): JSX.Element {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)
  const SelectedIcon = resolveCalendarEventIcon(iconId)
  const hasExplicit = calendarEventIconIsExplicit(iconId)

  useEffect(() => {
    if (!open) return
    function onDocMouseDown(e: MouseEvent): void {
      const el = popoverRef.current
      if (!el || el.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return (): void => document.removeEventListener('mousedown', onDocMouseDown)
  }, [open])

  const grid = (
    <div className="grid grid-cols-6 gap-0.5 sm:grid-cols-8">
      {CALENDAR_EVENT_ICON_IDS.map((id) => {
        const Icon = resolveCalendarEventIcon(id)
        const selected =
          (hasExplicit && iconId === id) || (!hasExplicit && id === 'calendar')
        return (
          <button
            key={id}
            type="button"
            disabled={disabled}
            title={t(`calendar.eventIcon.${id}` as 'calendar.eventIcon.car')}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary/80 hover:text-foreground',
              selected && 'bg-primary/15 text-primary ring-1 ring-primary/40',
              disabled && 'pointer-events-none opacity-50'
            )}
            onClick={(): void => {
              onIconChange(id === 'calendar' ? undefined : id)
              setOpen(false)
            }}
          >
            <Icon className="h-4 w-4" strokeWidth={2} />
          </button>
        )
      })}
    </div>
  )

  if (layout === 'compact') {
    return (
      <div className={cn('relative shrink-0', className)}>
        <button
          type="button"
          disabled={disabled}
          onClick={(): void => setOpen((o) => !o)}
          className="flex h-9 w-9 items-center justify-center rounded-md border border-border/60 bg-secondary/20 text-muted-foreground hover:bg-secondary/60 hover:text-foreground disabled:opacity-50"
          title={t('calendar.eventIcon.pickerTitle')}
          aria-label={t('calendar.eventIcon.pickerTitle')}
        >
          <SelectedIcon className="h-4 w-4" strokeWidth={2} />
        </button>
        {open ? (
          <div
            ref={popoverRef}
            className="absolute left-0 top-full z-50 mt-1 w-[220px] rounded-lg border border-border bg-popover p-2 shadow-lg"
            role="dialog"
            aria-label={t('calendar.eventIcon.pickerTitle')}
          >
            {grid}
          </div>
        ) : null}
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
            <SelectedIcon className="h-6 w-6" strokeWidth={2} />
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
          {grid}
        </div>
      ) : null}
    </div>
  )
}
