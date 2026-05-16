import { useCallback, useMemo } from 'react'
import type { EventContentArg } from '@fullcalendar/core'
import { useTranslation } from 'react-i18next'
import {
  calendarFcEventContent,
  type CalendarFcEventContentLabels
} from '@/app/calendar/calendar-fc-event-content'

export function useCalendarFcEventContent(): (arg: EventContentArg) => ReturnType<
  typeof calendarFcEventContent
> {
  const { t } = useTranslation()
  const labels = useMemo(
    (): CalendarFcEventContentLabels => ({
      appointment: t('calendar.eventKindIcon.appointment'),
      mail: t('calendar.eventKindIcon.mail'),
      task: t('calendar.eventKindIcon.task')
    }),
    [t]
  )
  return useCallback((arg: EventContentArg) => calendarFcEventContent(arg, labels), [labels])
}
