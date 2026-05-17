import type { Dispatch, SetStateAction } from 'react'
import { CheckSquare, Eye, EyeOff, Mails, StickyNote } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import {
  persistCloudTaskOverlay,
  persistMailTodoOverlay,
  persistUserNoteOverlay
} from '@/app/calendar/calendar-shell-storage'

interface Props {
  mailTodoOverlay: boolean
  setMailTodoOverlay: Dispatch<SetStateAction<boolean>>
  cloudTaskOverlay: boolean
  setCloudTaskOverlay: Dispatch<SetStateAction<boolean>>
  userNoteOverlay: boolean
  setUserNoteOverlay: Dispatch<SetStateAction<boolean>>
  taskAccountsCount: number
}

export function CalendarShellOverlayToggles({
  mailTodoOverlay,
  setMailTodoOverlay,
  cloudTaskOverlay,
  setCloudTaskOverlay,
  userNoteOverlay,
  setUserNoteOverlay,
  taskAccountsCount
}: Props): JSX.Element {
  const { t } = useTranslation()

  return (
    <ul className="space-y-0.5">
      <li>
        <div className="flex w-full items-center gap-1 rounded-md px-1 py-1.5 text-left text-[12px] text-muted-foreground">
          <button
            type="button"
            onClick={(): void => {
              setMailTodoOverlay((prev) => {
                const next = !prev
                persistMailTodoOverlay(next)
                return next
              })
            }}
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors',
              'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
              !mailTodoOverlay && 'opacity-60'
            )}
            title={
              mailTodoOverlay
                ? t('calendar.shell.mailTodoHideTooltip')
                : t('calendar.shell.mailTodoShowTooltip')
            }
            aria-label={
              mailTodoOverlay
                ? t('calendar.shell.mailTodoHideTooltip')
                : t('calendar.shell.mailTodoShowTooltip')
            }
          >
            {!mailTodoOverlay ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
          <Mails className="h-3.5 w-3.5 shrink-0 opacity-70" />
          <span className="min-w-0 flex-1 truncate text-foreground">
            {t('calendar.shell.mailTodosLabel')}
          </span>
        </div>
      </li>
      <li>
        <div className="flex w-full items-center gap-1 rounded-md px-1 py-1.5 text-left text-[12px] text-muted-foreground">
          <button
            type="button"
            onClick={(): void => {
              setCloudTaskOverlay((prev) => {
                const next = !prev
                persistCloudTaskOverlay(next)
                return next
              })
            }}
            disabled={taskAccountsCount === 0}
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors',
              'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
              !cloudTaskOverlay && 'opacity-60',
              taskAccountsCount === 0 && 'cursor-not-allowed opacity-40'
            )}
            title={
              cloudTaskOverlay
                ? t('calendar.shell.cloudTaskHideTooltip')
                : t('calendar.shell.cloudTaskShowTooltip')
            }
            aria-label={
              cloudTaskOverlay
                ? t('calendar.shell.cloudTaskHideTooltip')
                : t('calendar.shell.cloudTaskShowTooltip')
            }
          >
            {!cloudTaskOverlay ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
          <CheckSquare className="h-3.5 w-3.5 shrink-0 opacity-70" />
          <span className="min-w-0 flex-1 truncate text-foreground">
            {t('calendar.shell.cloudTasksLabel')}
          </span>
        </div>
      </li>
      <li>
        <div className="flex w-full items-center gap-1 rounded-md px-1 py-1.5 text-left text-[12px] text-muted-foreground">
          <button
            type="button"
            onClick={(): void => {
              setUserNoteOverlay((prev) => {
                const next = !prev
                persistUserNoteOverlay(next)
                return next
              })
            }}
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors',
              'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
              !userNoteOverlay && 'opacity-60'
            )}
            title={
              userNoteOverlay
                ? t('calendar.shell.notesHideTooltip')
                : t('calendar.shell.notesShowTooltip')
            }
            aria-label={
              userNoteOverlay
                ? t('calendar.shell.notesHideTooltip')
                : t('calendar.shell.notesShowTooltip')
            }
          >
            {!userNoteOverlay ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
          <StickyNote className="h-3.5 w-3.5 shrink-0 opacity-70" />
          <span className="min-w-0 flex-1 truncate text-foreground">{t('calendar.shell.notesLabel')}</span>
        </div>
      </li>
    </ul>
  )
}
