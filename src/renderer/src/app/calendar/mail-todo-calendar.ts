import type { EventApi, EventInput } from '@fullcalendar/core'
import type { MailListItem } from '@shared/types'
import { DateTime } from 'luxon'
import { threadGroupingKey } from '@/lib/thread-group'

/** extendedProps.calendarKind: Mail-ToDos vs. Graph-Termine. */
export const CALENDAR_KIND_MAIL_TODO = 'mailTodo' as const

const THREAD_APPOINTMENT_MINUTES = 30

function addMinutesIso(iso: string, minutes: number): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  d.setMinutes(d.getMinutes() + minutes)
  return d.toISOString()
}

/** Ein Kalendertag (nur Datum) aus ISO-UTC, fuer ganztaegige Bucket-Faelligkeiten ohne Termin-Uhrzeit. */
function utcDateOnly(iso: string): string {
  return iso.slice(0, 10)
}

function addOneCalendarDay(dateOnly: string): string {
  const d = new Date(`${dateOnly}T12:00:00.000Z`)
  if (Number.isNaN(d.getTime())) return dateOnly
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

function messageTodoVisualSpan(
  m: MailListItem
): { allDay: boolean; fcStart: string; fcEnd: string; startMs: number; endMs: number } | null {
  if (m.todoStartAt && m.todoEndAt) {
    const s = new Date(m.todoStartAt).getTime()
    const e = new Date(m.todoEndAt).getTime()
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return null
    return {
      allDay: false,
      fcStart: m.todoStartAt,
      fcEnd: m.todoEndAt,
      startMs: s,
      endMs: e
    }
  }
  if (m.todoStartAt) {
    const endIso = addMinutesIso(m.todoStartAt, THREAD_APPOINTMENT_MINUTES)
    const s = new Date(m.todoStartAt).getTime()
    const e = new Date(endIso).getTime()
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return null
    return { allDay: false, fcStart: m.todoStartAt, fcEnd: endIso, startMs: s, endMs: e }
  }
  const due = m.todoDueAt
  if (!due) return null
  const d0 = utcDateOnly(due)
  const d1 = addOneCalendarDay(d0)
  const startMs = new Date(`${d0}T00:00:00.000Z`).getTime()
  const endMs = new Date(`${d1}T00:00:00.000Z`).getTime()
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null
  return { allDay: true, fcStart: d0, fcEnd: d1, startMs, endMs }
}

function mergeConversationSpans(
  spans: Array<{ allDay: boolean; fcStart: string; fcEnd: string; startMs: number; endMs: number }>
): { allDay: boolean; fcStart: string; fcEnd: string } | null {
  if (spans.length === 0) return null
  const anyTimed = spans.some((s) => !s.allDay)
  if (!anyTimed) {
    const d0 = spans.map((s) => s.fcStart).sort()[0]!
    const d1Exclusive = spans.map((s) => s.fcEnd).sort().at(-1)!
    return { allDay: true, fcStart: d0, fcEnd: d1Exclusive }
  }
  const startMs = Math.min(...spans.map((s) => s.startMs))
  const endMs = Math.max(...spans.map((s) => s.endMs))
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null
  return {
    allDay: false,
    fcStart: new Date(startMs).toISOString(),
    fcEnd: new Date(endMs).toISOString()
  }
}

function sortMessagesByDateDesc(a: MailListItem, b: MailListItem): number {
  const ad = a.receivedAt ?? a.sentAt ?? ''
  const bd = b.receivedAt ?? b.sentAt ?? ''
  if (ad === bd) return 0
  return ad < bd ? 1 : -1
}

/**
 * Workflow-Mail-Kalender: ein FullCalendar-Eintrag pro Konversation (Thread),
 * damit Ziehen/Termin wie im Kanban fuer alle Mails im Thread gilt.
 * `extendedProps.threadKey` / neueste `mailMessage` fuer Vorschau; Persistenz laedt den vollen Thread per IPC.
 */
export function mailTodoConversationsToFullCalendarEvents(
  items: MailListItem[],
  accountColorById: Record<string, string>
): EventInput[] {
  const groups = new Map<string, MailListItem[]>()
  for (const m of items) {
    const key = threadGroupingKey(m, true)
    const arr = groups.get(key)
    if (arr) arr.push(m)
    else groups.set(key, [m])
  }

  const out: EventInput[] = []
  for (const [threadKey, msgs] of groups) {
    const sorted = [...msgs].sort(sortMessagesByDateDesc)
    const anchor = sorted[0]!
    const spans: Array<{ allDay: boolean; fcStart: string; fcEnd: string; startMs: number; endMs: number }> = []
    for (const m of sorted) {
      const sp = messageTodoVisualSpan(m)
      if (sp) spans.push(sp)
    }
    const merged = mergeConversationSpans(spans)
    if (!merged) continue

    const titleBase = anchor.subject?.trim() ? anchor.subject.trim() : '(Mail)'
    const title = sorted.length > 1 ? `${titleBase} (${sorted.length})` : titleBase
    const eventId = `mail-todo-thread:${encodeURIComponent(threadKey)}`

    const commonExtended = {
      mailMessage: anchor,
      threadKey,
      accountColor: accountColorById[anchor.accountId] ?? '#6366f1',
      calendarKind: CALENDAR_KIND_MAIL_TODO
    }

    if (merged.allDay) {
      out.push({
        id: eventId,
        title,
        start: merged.fcStart,
        end: merged.fcEnd,
        allDay: true,
        editable: true,
        startEditable: true,
        durationEditable: true,
        extendedProps: commonExtended,
        classNames: ['fc-mail-todo-event', 'fc-mail-todo-allday-bucket', 'fc-mail-todo-thread']
      })
    } else {
      out.push({
        id: eventId,
        title,
        start: merged.fcStart,
        end: merged.fcEnd,
        allDay: false,
        editable: true,
        startEditable: true,
        durationEditable: true,
        extendedProps: commonExtended,
        classNames: ['fc-mail-todo-event', 'fc-mail-todo-thread']
      })
    }
  }
  return out
}

/**
 * Mappt Mail-ToDos auf FullCalendar-Events: expliziter Termin (Start+Ende) oder Fallback aus `due_at`.
 * Pro Mail ein Balken (z. B. Kalender-Overlay im Hauptkalender).
 */
export function mailTodoItemsToFullCalendarEvents(
  items: MailListItem[],
  accountColorById: Record<string, string>
): EventInput[] {
  const out: EventInput[] = []
  for (const m of items) {
    const tid = m.todoId ?? m.id
    const title = m.subject?.trim() ? m.subject.trim() : '(Mail)'

    if (m.todoStartAt && m.todoEndAt) {
      out.push({
        id: `mail-todo:${tid}`,
        title,
        start: m.todoStartAt,
        end: m.todoEndAt,
        allDay: false,
        editable: true,
        startEditable: true,
        durationEditable: true,
        extendedProps: {
          mailMessage: m,
          accountColor: accountColorById[m.accountId] ?? '#6366f1',
          calendarKind: CALENDAR_KIND_MAIL_TODO
        },
        classNames: ['fc-mail-todo-event']
      })
      continue
    }

    if (m.todoStartAt) {
      out.push({
        id: `mail-todo:${tid}`,
        title,
        start: m.todoStartAt,
        end: addMinutesIso(m.todoStartAt, THREAD_APPOINTMENT_MINUTES),
        allDay: false,
        editable: true,
        startEditable: true,
        durationEditable: true,
        extendedProps: {
          mailMessage: m,
          accountColor: accountColorById[m.accountId] ?? '#6366f1',
          calendarKind: CALENDAR_KIND_MAIL_TODO
        },
        classNames: ['fc-mail-todo-event']
      })
      continue
    }

    const due = m.todoDueAt
    if (!due) continue

    const d0 = utcDateOnly(due)
    const d1 = addOneCalendarDay(d0)
    out.push({
      id: `mail-todo:${tid}`,
      title,
      start: d0,
      end: d1,
      allDay: true,
      editable: true,
      startEditable: true,
      /** Muss true sein, damit Ganztags-Balken in die Wochen-Zeitleiste gezogen werden koennen. */
      durationEditable: true,
      extendedProps: {
        mailMessage: m,
        accountColor: accountColorById[m.accountId] ?? '#6366f1',
        calendarKind: CALENDAR_KIND_MAIL_TODO
      },
      classNames: ['fc-mail-todo-event', 'fc-mail-todo-allday-bucket']
    })
  }
  return out
}

/** Agenda / Sidebar: sichtbares Start-/Ende-Fenster fuer ein Mail-ToDo (ohne FullCalendar). */
export function mailListItemTodoScheduleWindow(
  m: MailListItem
): { startIso: string; endIso: string; allDay: boolean; startMs: number; endMs: number } | null {
  const sp = messageTodoVisualSpan(m)
  if (!sp) return null
  return {
    startIso: sp.fcStart,
    endIso: sp.fcEnd,
    allDay: sp.allDay,
    startMs: sp.startMs,
    endMs: sp.endMs
  }
}

const FC_APPOINTMENT_MINUTES = 30

function endDateFromStartForFc(start: Date, minutes: number): Date {
  return new Date(start.getTime() + minutes * 60 * 1000)
}

/** Default-Zeitfenster (09:00, 30 min) beim Terminieren per Tag-Drop (Inbox-Sidebar, FullCalendar). */
export function defaultScheduleForCalendarDayFc(
  dateStr: string,
  fcTimeZone: string
): { startIso: string; endIso: string } {
  const zone = fcTimeZone === 'local' ? 'local' : fcTimeZone
  const start = DateTime.fromISO(`${dateStr}T09:00:00`, { zone })
  if (!start.isValid) {
    const d = new Date(`${dateStr}T09:00:00`)
    const end = endDateFromStartForFc(d, FC_APPOINTMENT_MINUTES)
    return { startIso: d.toISOString(), endIso: end.toISOString() }
  }
  const end = start.plus({ minutes: FC_APPOINTMENT_MINUTES })
  return { startIso: start.toISO()!, endIso: end.toISO()! }
}

/** Zeitraum fuer lokale Mail-Termin-Persistenz aus FullCalendar-Event. */
export function isoRangeFromMailTodoFullCalendarEvent(
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
    return defaultScheduleForCalendarDayFc(`${y}-${mo}-${d}`, fcTimeZone)
  }
  let e = ev.end
  if (!e || e.getTime() <= s.getTime()) {
    e = endDateFromStartForFc(s, FC_APPOINTMENT_MINUTES)
  }
  return { startIso: s.toISOString(), endIso: e.toISOString() }
}

export function computePersistIsoRangeForMailTodo(
  event: EventApi,
  oldEvent: EventApi | null,
  fcTimeZone: string
): { startIso: string; endIso: string } | null {
  if (event.extendedProps.calendarKind !== CALENDAR_KIND_MAIL_TODO) return null
  const s = event.start
  if (!s) return null
  if (oldEvent && oldEvent.allDay === true && event.allDay === false) {
    const e = endDateFromStartForFc(s, FC_APPOINTMENT_MINUTES)
    return { startIso: s.toISOString(), endIso: e.toISOString() }
  }
  return isoRangeFromMailTodoFullCalendarEvent(event, fcTimeZone)
}
