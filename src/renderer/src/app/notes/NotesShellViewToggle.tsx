import { CalendarDays, List } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

export type NotesShellView = 'list' | 'calendar'

export function NotesShellViewToggle({
  value,
  onChange
}: {
  value: NotesShellView
  onChange: (view: NotesShellView) => void
}): JSX.Element {
  const { t } = useTranslation()

  return (
    <div
      className="flex shrink-0 items-center gap-0.5 rounded-md border border-border bg-background/80 p-0.5"
      role="group"
      aria-label={t('notes.shell.viewSwitcherLabel')}
    >
      <button
        type="button"
        onClick={(): void => onChange('list')}
        className={cn(
          'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors',
          value === 'list'
            ? 'bg-secondary text-foreground'
            : 'text-muted-foreground hover:bg-secondary/50'
        )}
      >
        <List className="h-3 w-3" aria-hidden />
        {t('notes.shell.viewList')}
      </button>
      <button
        type="button"
        onClick={(): void => onChange('calendar')}
        className={cn(
          'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors',
          value === 'calendar'
            ? 'bg-secondary text-foreground'
            : 'text-muted-foreground hover:bg-secondary/50'
        )}
      >
        <CalendarDays className="h-3 w-3" aria-hidden />
        {t('notes.shell.viewCalendar')}
      </button>
    </div>
  )
}
