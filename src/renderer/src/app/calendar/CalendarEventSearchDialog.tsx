import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { Search } from 'lucide-react'

export interface CalendarEventSearchDialogProps {
  open: boolean
  query: string
  inputRef: RefObject<HTMLInputElement>
  onQueryChange: (value: string) => void
  onClose: () => void
}

export function CalendarEventSearchDialog({
  open,
  query,
  inputRef,
  onQueryChange,
  onClose
}: CalendarEventSearchDialogProps): JSX.Element | null {
  const { t } = useTranslation()

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[95] flex items-start justify-center bg-black/40 p-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cal-event-search-title"
      onMouseDown={(e): void => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="flex w-full max-w-md flex-col gap-2 rounded-xl border border-border bg-popover p-4 shadow-xl"
        onMouseDown={(e): void => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <h2 id="cal-event-search-title" className="text-sm font-semibold text-foreground">
            {t('calendar.shell.eventSearchTitle')}
          </h2>
        </div>
        <input
          ref={inputRef}
          type="search"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
          placeholder={t('calendar.shell.eventSearchPlaceholder')}
          value={query}
          onChange={(e): void => onQueryChange(e.target.value)}
          onKeyDown={(e): void => {
            if (e.key === 'Enter') {
              e.preventDefault()
              onClose()
            }
          }}
        />
        <p className="text-[11px] leading-snug text-muted-foreground">
          {t('calendar.shell.eventSearchHint')}
        </p>
        <div className="flex justify-end">
          <button
            type="button"
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            onClick={onClose}
          >
            {t('calendar.shell.eventSearchClose')}
          </button>
        </div>
      </div>
    </div>
  )
}
