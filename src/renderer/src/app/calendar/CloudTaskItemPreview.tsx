import { useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { de as deFns, enUS as enUSFns } from 'date-fns/locale'
import type { Locale } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { CheckSquare, Square } from 'lucide-react'
import type { WorkItemPlannedSchedule } from '@shared/work-item'
import type { TaskItemWithContext } from '@/app/tasks/tasks-types'
import type { CloudTaskDisplayPatch } from '@/app/work/CloudTaskWorkItemDetail'
import { CalendarEventIconPicker } from '@/components/CalendarEventIconPicker'
import { IconColorPickerFooter } from '@/components/IconColorPickerFooter'
import { resolveEntityIconColor } from '@shared/entity-icon-color'
import { RichTextNotesPreview } from '@/components/RichTextNotesPreview'
import { useThemeStore } from '@/stores/theme'
import { cn } from '@/lib/utils'

function formatIsoDate(iso: string | null, locale: Locale): string | null {
  if (!iso) return null
  const d = parseISO(iso.length <= 10 ? `${iso.slice(0, 10)}T12:00:00` : iso)
  if (Number.isNaN(d.getTime())) return null
  return format(d, 'PPP', { locale })
}

function formatPlannedRange(planned: WorkItemPlannedSchedule, locale: Locale): string | null {
  if (!planned.plannedStartIso || !planned.plannedEndIso) return null
  const start = parseISO(planned.plannedStartIso)
  const end = parseISO(planned.plannedEndIso)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return `${planned.plannedStartIso} – ${planned.plannedEndIso}`
  }
  if (format(start, 'yyyy-MM-dd') === format(end, 'yyyy-MM-dd')) {
    return `${format(start, 'PPP', { locale })} · ${format(start, 'HH:mm')} – ${format(end, 'HH:mm')}`
  }
  return `${format(start, 'Pp', { locale })} – ${format(end, 'Pp', { locale })}`
}

export function CloudTaskItemPreview(props: {
  task: TaskItemWithContext
  planned?: WorkItemPlannedSchedule | null
  accountDisplayName?: string
  className?: string
  onDisplayChange?: (patch: CloudTaskDisplayPatch) => void | Promise<void>
}): JSX.Element {
  const { task, planned, accountDisplayName, className, onDisplayChange } = props
  const { t, i18n } = useTranslation()
  const viewerTheme = useThemeStore((s) => s.effective)
  const dfLocale: Locale = i18n.language.startsWith('de') ? deFns : enUSFns

  const dueLabel = useMemo(() => formatIsoDate(task.dueIso, dfLocale), [task.dueIso, dfLocale])
  const plannedLabel = useMemo(
    () => (planned ? formatPlannedRange(planned, dfLocale) : null),
    [planned, dfLocale]
  )

  const title = task.title?.trim() || t('tasks.shell.untitled')

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col overflow-y-auto bg-background', className)}>
      <div className="shrink-0 space-y-2 border-b border-border px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t('calendar.cloudTaskPreview.sourceLabel')}
        </p>
        <div className="flex items-start gap-2">
          {onDisplayChange ? (
            <CalendarEventIconPicker
              layout="compact"
              openOn="doubleClick"
              iconId={task.iconId}
              iconColorHex={resolveEntityIconColor(task.iconColor)}
              title={title}
              onIconChange={(iconId): void =>
                void onDisplayChange({ iconId: iconId ?? null })
              }
              footer={
                <IconColorPickerFooter
                  iconColor={task.iconColor}
                  onIconColorChange={(iconColor): void => void onDisplayChange({ iconColor })}
                />
              }
            />
          ) : null}
          <h2 className="min-w-0 flex-1 text-[17px] font-semibold leading-snug text-foreground">
            {title}
          </h2>
        </div>
        {accountDisplayName ? (
          <p className="text-[12px] text-muted-foreground">
            {accountDisplayName}
            {task.listName ? ` · ${task.listName}` : ''}
          </p>
        ) : task.listName ? (
          <p className="text-[12px] text-muted-foreground">{task.listName}</p>
        ) : null}
        <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          {task.completed ? (
            <CheckSquare className="h-3.5 w-3.5 shrink-0 text-primary" />
          ) : (
            <Square className="h-3.5 w-3.5 shrink-0" />
          )}
          <span>
            {task.completed
              ? t('calendar.cloudTaskPreview.statusDone')
              : t('calendar.cloudTaskPreview.statusOpen')}
          </span>
        </div>
      </div>
      <div className="space-y-3 px-4 py-3 text-[12px]">
        <div>
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t('calendar.cloudTaskPreview.plannedLabel')}
          </p>
          <p className="text-foreground">
            {plannedLabel ?? t('calendar.cloudTaskPreview.plannedUnset')}
          </p>
        </div>
        <div>
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t('calendar.cloudTaskPreview.dueLabel')}
          </p>
          <p className="text-foreground">{dueLabel ?? t('calendar.cloudTaskPreview.dueUnset')}</p>
        </div>
        {task.notes?.trim() ? (
          <div>
            <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t('calendar.cloudTaskPreview.notesLabel')}
            </p>
            <RichTextNotesPreview notes={task.notes.trim()} viewerTheme={viewerTheme} />
          </div>
        ) : null}
      </div>
    </div>
  )
}
