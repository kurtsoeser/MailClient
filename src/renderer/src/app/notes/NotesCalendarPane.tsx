import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type Ref
} from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin from '@fullcalendar/interaction'
import luxonPlugin from '@fullcalendar/luxon'
import deLocale from '@fullcalendar/core/locales/de'
import enGbLocale from '@fullcalendar/core/locales/en-gb'
import type { EventDropArg } from '@fullcalendar/core'
import type { EventResizeDoneArg } from '@fullcalendar/interaction'
import { useTranslation } from 'react-i18next'
import type { UserNoteListItem } from '@shared/types'
import { cn } from '@/lib/utils'
import {
  CALENDAR_KIND_USER_NOTE,
  computePersistTargetForUserNote,
  notesToFullCalendarEvents,
  userNoteEventId
} from '@/app/calendar/notes-calendar'
import { scheduleRemoveDuplicateFullCalendarEventsById } from '@/app/calendar/calendar-fc-event-source'
import { MAX_TIME_GRID_SPAN_DAYS } from '@/app/calendar/calendar-shell-view-helpers'
import { useCalendarFcEventContent } from '@/app/calendar/use-calendar-fc-event-content'
import '@/app/calendar/notion-calendar.css'

function assignMergedFullCalendarRef(
  inst: FullCalendar | null,
  inner: MutableRefObject<FullCalendar | null>,
  outer?: Ref<FullCalendar | null>
): void {
  inner.current = inst
  if (!outer) return
  if (typeof outer === 'function') {
    outer(inst)
    return
  }
  ;(outer as MutableRefObject<FullCalendar | null>).current = inst
}

export function NotesCalendarPane({
  onSelectNote,
  fcView,
  fullCalendarRef,
  onViewMeta,
  selectedNoteId,
  className
}: {
  onSelectNote: (note: UserNoteListItem) => void
  fcView: string
  fullCalendarRef?: Ref<FullCalendar | null>
  onViewMeta?: (meta: { title: string; viewType: string; currentStart: Date }) => void
  selectedNoteId?: number | null
  className?: string
}): JSX.Element {
  const { t, i18n } = useTranslation()
  const calendarFcEventContentRender = useCalendarFcEventContent()
  const fcLocale = i18n.language.startsWith('de') ? deLocale : enGbLocale
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const calendarRef = useRef<FullCalendar | null>(null)
  const lastRangeRef = useRef<{ start: Date; end: Date }>({ start: new Date(), end: new Date() })
  const noteByIdRef = useRef<Map<number, UserNoteListItem>>(new Map())

  const [rangeNotes, setRangeNotes] = useState<UserNoteListItem[]>([])
  const [loading, setLoading] = useState(false)

  const fcEvents = useMemo(
    () => notesToFullCalendarEvents(rangeNotes, { defaultTitle: t('notes.shell.untitled') }),
    [rangeNotes, t]
  )

  const multiDayViews = useMemo(() => {
    const o: Record<string, { type: 'timeGrid'; duration: { days: number }; buttonText: string }> = {}
    for (let n = 2; n <= MAX_TIME_GRID_SPAN_DAYS; n++) {
      o[`timeGrid${n}Day`] = { type: 'timeGrid', duration: { days: n }, buttonText: `${n} Tage` }
    }
    return o
  }, [])

  const loadRange = useCallback(async (start: Date, end: Date): Promise<void> => {
    lastRangeRef.current = { start, end }
    setLoading(true)
    try {
      const list = await window.mailClient.notes.listInRange({
        startIso: start.toISOString(),
        endIso: end.toISOString(),
        limit: 500
      })
      setRangeNotes(list)
      const map = new Map<number, UserNoteListItem>()
      for (const n of list) map.set(n.id, n)
      noteByIdRef.current = map
    } catch {
      setRangeNotes([])
      noteByIdRef.current = new Map()
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const { start, end } = lastRangeRef.current
    void loadRange(start, end)
    const off = window.mailClient.events.onNotesChanged(() => {
      void loadRange(lastRangeRef.current.start, lastRangeRef.current.end)
    })
    return off
  }, [loadRange])

  const persistEventChange = useCallback(
    async (info: EventDropArg | EventResizeDoneArg): Promise<void> => {
      const target = computePersistTargetForUserNote(info.event, timeZone)
      if (!target) {
        info.revert()
        return
      }
      try {
        await window.mailClient.notes.setSchedule({
          id: target.noteId,
          scheduledStartIso: target.scheduledStartIso,
          scheduledEndIso: target.scheduledEndIso,
          scheduledAllDay: target.scheduledAllDay
        })
        scheduleRemoveDuplicateFullCalendarEventsById(calendarRef.current?.getApi(), [
          userNoteEventId(target.noteId)
        ])
        const api = calendarRef.current?.getApi()
        if (api) {
          await loadRange(api.view.activeStart, api.view.activeEnd)
        }
      } catch {
        info.revert()
      }
    },
    [loadRange, timeZone]
  )

  return (
    <div className={cn('calendar-notion-shell relative h-full min-h-0 flex-1', className)}>
      {loading ? (
        <div className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center bg-background/40">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : null}
      <FullCalendar
        key={`${timeZone}-${fcView}`}
        ref={(inst): void => {
          assignMergedFullCalendarRef(inst, calendarRef, fullCalendarRef)
        }}
        plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin, luxonPlugin]}
        locale={fcLocale}
        height="100%"
        timeZone={timeZone}
        headerToolbar={false}
        firstDay={1}
        views={{ ...multiDayViews }}
        initialView={fcView}
        slotMinTime="00:00:00"
        slotMaxTime="24:00:00"
        scrollTime="07:00:00"
        slotDuration="00:30:00"
        slotLabelInterval="01:00:00"
        defaultTimedEventDuration="00:30:00"
        nowIndicator
        editable
        eventResizableFromStart
        dayMaxEvents
        events={fcEvents}
        eventContent={calendarFcEventContentRender}
        eventDidMount={(info): void => {
          if (info.event.extendedProps.calendarKind !== CALENDAR_KIND_USER_NOTE) return
          const noteId = (info.event.extendedProps.userNote as UserNoteListItem | undefined)?.id
          if (selectedNoteId != null && noteId === selectedNoteId) {
            info.el.classList.add('ring-2', 'ring-primary')
          }
        }}
        datesSet={(arg): void => {
          void loadRange(arg.start, arg.end)
          onViewMeta?.({
            title: arg.view.title,
            viewType: arg.view.type,
            currentStart: arg.view.currentStart
          })
        }}
        eventClick={(info): void => {
          info.jsEvent.preventDefault()
          const note = info.event.extendedProps.userNote as UserNoteListItem | undefined
          if (note) onSelectNote(note)
        }}
        eventDrop={(info): void => {
          void persistEventChange(info)
        }}
        eventResize={(info): void => {
          void persistEventChange(info)
        }}
      />
    </div>
  )
}
