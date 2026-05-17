import {
  useCallback,
  useEffect,
  useLayoutEffect,
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
import type { EventApi, EventDropArg } from '@fullcalendar/core'
import type { EventResizeDoneArg } from '@fullcalendar/interaction'
import {
  appointmentRangeFromCalendarSlot,
  defaultAppointmentRangeForCalendarDay
} from '@/lib/zoned-iso-date'
import type { MailListItem, ConnectedAccount } from '@shared/types'
import { accountColorToCssBackground } from '@/lib/avatar-color'
import { MIME_THREAD_IDS, readDraggedWorkflowMessageIds } from '@/lib/workflow-dnd'
import { scheduleRemoveDuplicateFullCalendarEventsById } from '@/app/calendar/calendar-fc-event-source'
import { CALENDAR_KIND_MAIL_TODO, mailTodoItemsToFullCalendarEvents } from './mail-todo-calendar'
import { useCalendarFcEventContent } from '@/app/calendar/use-calendar-fc-event-content'
import './notion-calendar.css'

/** Standard-Laenge fuer neue Zeitbloecke (Ganztag -> Zeitleiste, fehlendes Ende, Posteingang auf Tag). */
const DEFAULT_APPOINTMENT_MINUTES = 30

function endDateFromStart(start: Date, minutes: number): Date {
  return new Date(start.getTime() + minutes * 60 * 1000)
}

function isoRangeFromMailTodoEvent(
  ev: EventApi,
  fcTimeZone: string
): { startIso: string; endIso: string } | null {
  if (ev.extendedProps.calendarKind !== CALENDAR_KIND_MAIL_TODO) return null
  const s = ev.start
  if (!s) return null
  if (ev.allDay) {
    const y = s.getFullYear()
    const mo = String(s.getMonth() + 1).padStart(2, '0')
    const d = String(s.getDate()).padStart(2, '0')
    return defaultAppointmentRangeForCalendarDay(
      `${y}-${mo}-${d}`,
      fcTimeZone,
      9,
      DEFAULT_APPOINTMENT_MINUTES
    )
  }
  let e = ev.end
  if (!e || e.getTime() <= s.getTime()) {
    e = endDateFromStart(s, DEFAULT_APPOINTMENT_MINUTES)
  }
  return { startIso: s.toISOString(), endIso: e.toISOString() }
}

/** Persistenz-ISO: bei Wechsel Ganztag -> Zeitgitter immer {@link DEFAULT_APPOINTMENT_MINUTES}. */
function computePersistIsoRange(
  event: EventApi,
  oldEvent: EventApi,
  fcTimeZone: string
): { startIso: string; endIso: string } | null {
  if (event.extendedProps.calendarKind !== CALENDAR_KIND_MAIL_TODO) return null
  const s = event.start
  if (!s) return null
  if (oldEvent.allDay === true && event.allDay === false) {
    const e = endDateFromStart(s, DEFAULT_APPOINTMENT_MINUTES)
    return { startIso: s.toISOString(), endIso: e.toISOString() }
  }
  return isoRangeFromMailTodoEvent(event, fcTimeZone)
}

/** FullCalendar-Ansicht fuer den Workflow-Mail-Kalender. */
type MailTodoCalendarFcView = 'dayGridMonth' | 'timeGridWeek'

/** Wie im Kalender-Shell: N-Tage-Zeitleiste bis 21 Tage. */
const MAX_TIME_GRID_SPAN_DAYS = 21

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

function dataTransferLooksLikeMailDrag(dt: DataTransfer): boolean {
  const types = Array.from(dt.types ?? [])
  return (
    types.includes(MIME_THREAD_IDS) ||
    types.includes('text/plain') ||
    types.includes('text/mailclient-message-id') ||
    types.includes('application/x-mailclient-message-id')
  )
}

export interface MailTodoCalendarProps {
  /** FullCalendar `timeZone` (z. B. `Europe/Berlin` oder `local`). */
  timeZone: string
  accounts: ConnectedAccount[]
  /** Nach Klick auf einen Mail-ToDo-Balken (Vorschau im Workflow). */
  onSelectMessage: (messageId: number) => void | Promise<void>
  /**
   * Persistiert Start/Ende nach Drag im Kalender oder Drop von Konversationen auf einen Tag.
   * Fehler -> FullCalendar revert bzw. stillschweigend bei externem Drop.
   */
  onScheduleMessages?: (messageIds: number[], startIso: string, endIso: string) => Promise<void>
  /** Standard: Monatsraster; Woche: Zeitgitter mit Uhrzeiten. */
  calendarView?: MailTodoCalendarFcView
  /**
   * Uebersteuert `calendarView` fuer dieselben FC-Ansichten wie im Kalender-Shell
   * (Tag/Woche/Monat/Liste/N-Tage). Wenn gesetzt, bestimmt dies `initialView` und den Remount-`key`.
   */
  fcView?: string
  /** Optional: Shell steuert Vor/Zurueck/Heute und Mini-Monat. */
  fullCalendarRef?: Ref<FullCalendar | null>
  /** Titel und Ansicht nach `datesSet` (Kopfzeile in eingebetteten Shells). */
  onViewMeta?: (meta: { title: string; viewType: string; currentStart: Date }) => void
  className?: string
}

/**
 * Kalender fuer Mail-ToDos: expliziter Termin (Start/Ende) oder Faelligkeit aus Bucket (`due_at`).
 * Ziehen verschiebt den Termin; Ganztags-Faelligkeit in die Wochen-Zeitleiste = 30-Min-Block ab Drop-Zeit.
 * Konversation: gleicher Termin fuer alle Mails im Thread (wie Kanban).
 */
export function MailTodoCalendar({
  timeZone,
  accounts,
  onSelectMessage,
  onScheduleMessages,
  calendarView = 'dayGridMonth',
  fcView,
  fullCalendarRef,
  onViewMeta,
  className
}: MailTodoCalendarProps): JSX.Element {
  const calendarFcEventContentRender = useCalendarFcEventContent()
  const calendarRef = useRef<FullCalendar>(null)
  const resolvedFcView = fcView ?? calendarView
  const shellRef = useRef<HTMLDivElement>(null)
  const lastRangeRef = useRef<{ start: Date; end: Date }>({
    start: new Date(),
    end: new Date()
  })

  const [items, setItems] = useState<MailListItem[]>([])

  const accountColorById = useMemo(
    () => Object.fromEntries(accounts.map((a) => [a.id, a.color])),
    [accounts]
  )

  const fcEvents = useMemo(
    () => mailTodoItemsToFullCalendarEvents(items, accountColorById),
    [items, accountColorById]
  )

  const multiDayViews = useMemo(() => {
    const o: Record<string, { type: 'timeGrid'; duration: { days: number }; buttonText: string }> = {}
    for (let n = 2; n <= MAX_TIME_GRID_SPAN_DAYS; n++) {
      o[`timeGrid${n}Day`] = {
        type: 'timeGrid',
        duration: { days: n },
        buttonText: `${n} Tage`
      }
    }
    return o
  }, [])

  const loadRange = useCallback(async (start: Date, end: Date): Promise<void> => {
    lastRangeRef.current = { start, end }
    try {
      const list = await window.mailClient.mail.listTodoMessagesInRange({
        accountId: null,
        rangeStartIso: start.toISOString(),
        rangeEndIso: end.toISOString(),
        limit: 500
      })
      setItems(list)
    } catch {
      setItems([])
    }
  }, [])

  useEffect(() => {
    const off = window.mailClient.events.onMailChanged(() => {
      const { start, end } = lastRangeRef.current
      void loadRange(start, end)
    })
    return off
  }, [loadRange])

  const persistEventChange = useCallback(
    async (info: EventDropArg | EventResizeDoneArg): Promise<void> => {
      if (!onScheduleMessages) {
        info.revert()
        return
      }
      const m = info.event.extendedProps.mailMessage as MailListItem | undefined
      const range = computePersistIsoRange(info.event, info.oldEvent, timeZone)
      if (!m || !range) {
        info.revert()
        return
      }
      try {
        await onScheduleMessages([m.id], range.startIso, range.endIso)
        scheduleRemoveDuplicateFullCalendarEventsById(calendarRef.current?.getApi(), [
          `mail-todo:${m.id}`
        ])
        const { start, end } = lastRangeRef.current
        void loadRange(start, end)
      } catch {
        info.revert()
      }
    },
    [onScheduleMessages, timeZone]
  )

  useLayoutEffect(() => {
    if (!onScheduleMessages) return
    const root = shellRef.current
    if (!root) return

    const findDateHostFromElement = (start: Element | null): HTMLElement | null => {
      const el = start as HTMLElement | null
      if (!el) return null
      return (
        el.closest('td.fc-timegrid-col[data-date]') ||
        el.closest('td.fc-daygrid-day[data-date]') ||
        el.closest('.fc-daygrid-day[data-date]') ||
        el.closest('th.fc-col-header-cell[data-date]') ||
        el.closest('.fc-daygrid-body td[data-date]') ||
        null
      )
    }

    /** Drop-Ziel: manchmal liegt der Cursor ueber einem Overlay; dann hilft elementsFromPoint. */
    const findDateHostForDrop = (
      target: EventTarget | null,
      clientX: number,
      clientY: number
    ): HTMLElement | null => {
      const tryOne = (node: Element | null): HTMLElement | null => {
        const cell = findDateHostFromElement(node)
        return cell && root.contains(cell) ? cell : null
      }
      let cell = tryOne(target as Element | null)
      if (cell) return cell
      for (const node of document.elementsFromPoint(clientX, clientY)) {
        if (!root.contains(node)) continue
        cell = tryOne(node)
        if (cell) return cell
      }
      return null
    }

    const scheduleRangeFromInboxDrop = (
      clientX: number,
      clientY: number,
      dateStr: string,
      fcTimeZone: string
    ): { startIso: string; endIso: string } => {
      let slotTime: string | undefined
      for (const node of document.elementsFromPoint(clientX, clientY)) {
        if (!(node instanceof HTMLElement) || !root.contains(node)) continue
        if (node.closest('.fc-timegrid-axis')) continue
        const t = node.getAttribute('data-time')
        if (t && /^\d{1,2}:\d{2}/.test(t)) {
          slotTime = t
          break
        }
      }
      if (slotTime) {
        return appointmentRangeFromCalendarSlot(
          dateStr,
          slotTime,
          fcTimeZone,
          DEFAULT_APPOINTMENT_MINUTES
        )
      }
      return defaultAppointmentRangeForCalendarDay(
        dateStr,
        fcTimeZone,
        9,
        DEFAULT_APPOINTMENT_MINUTES
      )
    }

    const onDragHoverNative = (e: DragEvent): void => {
      if (!e.dataTransfer) return
      if (!dataTransferLooksLikeMailDrag(e.dataTransfer)) return
      const cell = findDateHostForDrop(e.target, e.clientX, e.clientY)
      if (!cell) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
    }

    const onDrop = (e: DragEvent): void => {
      if (!e.dataTransfer) return
      if (!dataTransferLooksLikeMailDrag(e.dataTransfer)) return
      const cell = findDateHostForDrop(e.target, e.clientX, e.clientY)
      if (!cell) return
      const dragged = readDraggedWorkflowMessageIds(e.dataTransfer)
      if (dragged.length === 0) return
      e.preventDefault()
      e.stopPropagation()
      const dateStr = cell.getAttribute('data-date')
      if (!dateStr) return
      const range = scheduleRangeFromInboxDrop(e.clientX, e.clientY, dateStr, timeZone)
      void (async (): Promise<void> => {
        try {
          await onScheduleMessages(dragged, range.startIso, range.endIso)
        } catch {
          /* Toast / Store */
        }
      })()
    }

    const capHover = { capture: true, passive: false } as const
    root.addEventListener('dragenter', onDragHoverNative, capHover)
    root.addEventListener('dragover', onDragHoverNative, capHover)
    root.addEventListener('drop', onDrop, { capture: true })
    return () => {
      root.removeEventListener('dragenter', onDragHoverNative, capHover)
      root.removeEventListener('dragover', onDragHoverNative, capHover)
      root.removeEventListener('drop', onDrop, { capture: true })
    }
  }, [onScheduleMessages, timeZone])

  return (
    <div ref={shellRef} className={className ?? 'calendar-notion-shell h-full min-h-0 flex-1'}>
      <FullCalendar
        key={`${timeZone}-${resolvedFcView}`}
        ref={(inst): void => {
          assignMergedFullCalendarRef(inst, calendarRef, fullCalendarRef)
        }}
        plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin, luxonPlugin]}
        locale={deLocale}
        height="100%"
        timeZone={timeZone}
        headerToolbar={false}
        firstDay={1}
        views={{ ...multiDayViews }}
        initialView={resolvedFcView}
        slotMinTime="00:00:00"
        slotMaxTime="24:00:00"
        scrollTime="07:00:00"
        slotDuration="00:30:00"
        slotLabelInterval="01:00:00"
        defaultTimedEventDuration="00:30:00"
        nowIndicator
        editable
        selectable={false}
        dayMaxEvents
        events={fcEvents}
        eventContent={calendarFcEventContentRender}
        eventDidMount={(info): void => {
          const kind = info.event.extendedProps.calendarKind as string | undefined
          if (kind !== CALENDAR_KIND_MAIL_TODO) return
          const raw = info.event.extendedProps.accountColor as string | undefined
          const bg = accountColorToCssBackground(raw)
          if (bg) {
            info.el.style.backgroundColor = bg
            info.el.style.borderColor = 'transparent'
            info.el.style.color = '#fafafa'
          } else {
            info.el.style.borderLeft = '4px solid hsl(var(--primary))'
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
        eventClick={(info): boolean => {
          info.jsEvent.preventDefault()
          const kind = info.event.extendedProps.calendarKind as string | undefined
          if (kind !== CALENDAR_KIND_MAIL_TODO) return false
          const m = info.event.extendedProps.mailMessage as MailListItem | undefined
          if (m) void onSelectMessage(m.id)
          return false
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
