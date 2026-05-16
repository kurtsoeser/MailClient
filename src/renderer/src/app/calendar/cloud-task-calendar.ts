import type { EventApi, EventInput } from '@fullcalendar/core'
import type { WorkItemPlannedSchedule } from '@shared/work-item'
import type { TaskItemRow } from '@shared/types'
import { DateTime } from 'luxon'
import { cloudTaskStableKey } from '@shared/work-item-keys'
import type { TaskItemWithContext } from '@/app/tasks/tasks-types'

/** extendedProps.calendarKind: Cloud-Aufgaben vs. Graph-Termine / Mail-ToDos. */
export const CALENDAR_KIND_CLOUD_TASK = 'cloudTask' as const

const DEFAULT_APPOINTMENT_MINUTES = 30

export type CloudTaskCalendarContext = TaskItemWithContext

function addMinutesIso(iso: string, minutes: number): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  d.setMinutes(d.getMinutes() + minutes)
  return d.toISOString()
}

function utcDateOnly(iso: string): string {
  const t = iso.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  return t.slice(0, 10)
}

function addOneCalendarDay(dateOnly: string): string {
  const d = new Date(`${dateOnly}T12:00:00.000Z`)
  if (Number.isNaN(d.getTime())) return dateOnly
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

export type CloudTaskVisualSpan = {
  allDay: boolean
  fcStart: string
  fcEnd: string
  startMs: number
  endMs: number
}

/** Anzeige im Aufgaben-Kalender: nur Fälligkeit oder nur Planung. */
export type CloudTaskCalendarDateMode = 'due' | 'planned'

function cloudTaskPlannedVisualSpan(
  planned?: WorkItemPlannedSchedule | null
): CloudTaskVisualSpan | null {
  const start = planned?.plannedStartIso?.trim()
  const end = planned?.plannedEndIso?.trim()
  if (start && end) {
    const s = new Date(start).getTime()
    const e = new Date(end).getTime()
    if (Number.isFinite(s) && Number.isFinite(e) && e > s) {
      return { allDay: false, fcStart: start, fcEnd: end, startMs: s, endMs: e }
    }
  }
  if (start && !end) {
    const endIso = addMinutesIso(start, DEFAULT_APPOINTMENT_MINUTES)
    const s = new Date(start).getTime()
    const e = new Date(endIso).getTime()
    if (Number.isFinite(s) && Number.isFinite(e) && e > s) {
      return { allDay: false, fcStart: start, fcEnd: endIso, startMs: s, endMs: e }
    }
  }
  return null
}

function cloudTaskDueVisualSpan(task: Pick<TaskItemRow, 'dueIso'>): CloudTaskVisualSpan | null {
  const due = task.dueIso?.trim()
  if (!due) return null

  const d0 = utcDateOnly(due)
  const d1 = addOneCalendarDay(d0)
  const startMs = new Date(`${d0}T00:00:00.000Z`).getTime()
  const endMs = new Date(`${d1}T00:00:00.000Z`).getTime()
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null
  return { allDay: true, fcStart: d0, fcEnd: d1, startMs, endMs }
}

export function cloudTaskVisualSpanForMode(
  task: Pick<TaskItemRow, 'dueIso'>,
  planned: WorkItemPlannedSchedule | null | undefined,
  mode: CloudTaskCalendarDateMode
): CloudTaskVisualSpan | null {
  return mode === 'due' ? cloudTaskDueVisualSpan(task) : cloudTaskPlannedVisualSpan(planned)
}

/** Planungszeit hat Vorrang vor Fälligkeit (Hauptkalender / kombinierte Ansicht). */
export function cloudTaskVisualSpan(
  task: Pick<TaskItemRow, 'dueIso'>,
  planned?: WorkItemPlannedSchedule | null
): CloudTaskVisualSpan | null {
  return cloudTaskPlannedVisualSpan(planned) ?? cloudTaskDueVisualSpan(task)
}

function endDateFromStart(start: Date, minutes: number): Date {
  return new Date(start.getTime() + minutes * 60 * 1000)
}

export function defaultScheduleForCalendarDayFc(
  dateStr: string,
  fcTimeZone: string
): { startIso: string; endIso: string } {
  const zone = fcTimeZone === 'local' ? 'local' : fcTimeZone
  const start = DateTime.fromISO(`${dateStr}T09:00:00`, { zone })
  if (!start.isValid) {
    const d = new Date(`${dateStr}T09:00:00`)
    const end = endDateFromStart(d, DEFAULT_APPOINTMENT_MINUTES)
    return { startIso: d.toISOString(), endIso: end.toISOString() }
  }
  const end = start.plus({ minutes: DEFAULT_APPOINTMENT_MINUTES })
  return { startIso: start.toISO()!, endIso: end.toISO()! }
}

export function cloudTaskEventId(taskKey: string): string {
  return `cloud-task:${encodeURIComponent(taskKey)}`
}

export function parseCloudTaskEventId(eventId: string): string | null {
  const prefix = 'cloud-task:'
  if (!eventId.startsWith(prefix)) return null
  try {
    return decodeURIComponent(eventId.slice(prefix.length))
  } catch {
    return null
  }
}

export function cloudTasksToFullCalendarEvents(
  items: CloudTaskCalendarContext[],
  accountColorById: Record<string, string>,
  plannedByTaskKey?: ReadonlyMap<string, WorkItemPlannedSchedule>,
  dateMode?: CloudTaskCalendarDateMode
): EventInput[] {
  const out: EventInput[] = []
  for (const task of items) {
    const taskKey = cloudTaskStableKey(task.accountId, task.listId, task.id)
    const planned = plannedByTaskKey?.get(taskKey)
    const span = dateMode
      ? cloudTaskVisualSpanForMode(task, planned, dateMode)
      : cloudTaskVisualSpan(task, planned)
    if (!span) continue

    const title = task.title?.trim() || '(Ohne Titel)'
    const accountColor = accountColorById[task.accountId] ?? '#6366f1'
    const extendedProps = {
      cloudTask: task,
      taskKey,
      accountColor,
      calendarKind: CALENDAR_KIND_CLOUD_TASK
    }

    if (span.allDay) {
      out.push({
        id: cloudTaskEventId(taskKey),
        title,
        start: span.fcStart,
        end: span.fcEnd,
        allDay: true,
        editable: true,
        startEditable: true,
        durationEditable: true,
        extendedProps,
        classNames: ['fc-cloud-task-event', 'fc-cloud-task-allday-due']
      })
    } else {
      out.push({
        id: cloudTaskEventId(taskKey),
        title,
        start: span.fcStart,
        end: span.fcEnd,
        allDay: false,
        editable: true,
        startEditable: true,
        durationEditable: true,
        extendedProps,
        classNames: ['fc-cloud-task-event', 'fc-cloud-task-planned']
      })
    }
  }
  return out
}

export type CloudTaskPersistTarget =
  | { kind: 'planned'; taskKey: string; plannedStartIso: string; plannedEndIso: string }
  | { kind: 'due'; taskKey: string; dueIso: string }

/** Fälligkeit (Ende des Kalendertags) aus geplantem Start oder Ganztags-Start. */
export function dueIsoFromCloudTaskScheduleStart(
  start: Date | string,
  fcTimeZone: string
): string {
  const zone = fcTimeZone === 'local' ? 'local' : fcTimeZone
  const dt =
    typeof start === 'string'
      ? DateTime.fromISO(start, { setZone: true }).setZone(zone)
      : DateTime.fromJSDate(start, { zone })
  if (!dt.isValid) {
    const fallback =
      typeof start === 'string' ? start.slice(0, 10) : start.toISOString().slice(0, 10)
    return `${fallback}T23:59:59.000Z`
  }
  const dateOnly = dt.toISODate()!
  const end = DateTime.fromISO(`${dateOnly}T23:59:59`, { zone })
  if (end.isValid) return end.toUTC().toISO()!
  return `${dateOnly}T23:59:59.000Z`
}

function dueIsoFromAllDayStart(start: Date, fcTimeZone: string): string {
  return dueIsoFromCloudTaskScheduleStart(start, fcTimeZone)
}

export function isoRangeFromCloudTaskFullCalendarEvent(
  ev: EventApi,
  fcTimeZone: string
): { startIso: string; endIso: string; allDay: boolean } | null {
  if (ev.extendedProps.calendarKind !== CALENDAR_KIND_CLOUD_TASK) return null
  const s = ev.start
  if (!s) return null
  if (ev.allDay) {
    const y = s.getFullYear()
    const mo = String(s.getMonth() + 1).padStart(2, '0')
    const d = String(s.getDate()).padStart(2, '0')
    const dateOnly = `${y}-${mo}-${d}`
    const scheduled = defaultScheduleForCalendarDayFc(dateOnly, fcTimeZone)
    return { ...scheduled, allDay: true }
  }
  let e = ev.end
  if (!e || e.getTime() <= s.getTime()) {
    e = endDateFromStart(s, DEFAULT_APPOINTMENT_MINUTES)
  }
  return { startIso: s.toISOString(), endIso: e.toISOString(), allDay: false }
}

/**
 * Nach Drag/Resize: Ganztag → Fälligkeit; Zeitblock → lokale Planungszeit.
 * Wechsel Ganztag → Zeitraster erzeugt Planungsblock (nicht Due).
 */
export function computePersistTargetForCloudTask(
  event: EventApi,
  oldEvent: EventApi | null,
  fcTimeZone: string,
  dateMode?: CloudTaskCalendarDateMode
): CloudTaskPersistTarget | null {
  if (event.extendedProps.calendarKind !== CALENDAR_KIND_CLOUD_TASK) return null
  const taskKey =
    (typeof event.extendedProps.taskKey === 'string' && event.extendedProps.taskKey) ||
    parseCloudTaskEventId(event.id)
  if (!taskKey) return null

  const s = event.start
  if (!s) return null

  if (dateMode === 'due') {
    return { kind: 'due', taskKey, dueIso: dueIsoFromAllDayStart(s, fcTimeZone) }
  }

  if (dateMode === 'planned') {
    if (event.allDay) {
      const dateOnly = `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, '0')}-${String(s.getDate()).padStart(2, '0')}`
      const scheduled = defaultScheduleForCalendarDayFc(dateOnly, fcTimeZone)
      return {
        kind: 'planned',
        taskKey,
        plannedStartIso: scheduled.startIso,
        plannedEndIso: scheduled.endIso
      }
    }
    let e = event.end
    if (!e || e.getTime() <= s.getTime()) {
      e = endDateFromStart(s, DEFAULT_APPOINTMENT_MINUTES)
    }
    return {
      kind: 'planned',
      taskKey,
      plannedStartIso: s.toISOString(),
      plannedEndIso: e.toISOString()
    }
  }

  if (oldEvent && oldEvent.allDay === true && event.allDay === false) {
    let e = event.end
    if (!e || e.getTime() <= s.getTime()) {
      e = endDateFromStart(s, DEFAULT_APPOINTMENT_MINUTES)
    }
    return {
      kind: 'planned',
      taskKey,
      plannedStartIso: s.toISOString(),
      plannedEndIso: e.toISOString()
    }
  }

  if (event.allDay) {
    return { kind: 'due', taskKey, dueIso: dueIsoFromAllDayStart(s, fcTimeZone) }
  }

  let e = event.end
  if (!e || e.getTime() <= s.getTime()) {
    e = endDateFromStart(s, DEFAULT_APPOINTMENT_MINUTES)
  }
  return {
    kind: 'planned',
    taskKey,
    plannedStartIso: s.toISOString(),
    plannedEndIso: e.toISOString()
  }
}

export function computePersistIsoRangeForCloudTask(
  event: EventApi,
  oldEvent: EventApi | null,
  fcTimeZone: string
): { startIso: string; endIso: string } | null {
  const target = computePersistTargetForCloudTask(event, oldEvent, fcTimeZone)
  if (!target) return null
  if (target.kind === 'due') {
    const d0 = utcDateOnly(target.dueIso)
    return defaultScheduleForCalendarDayFc(d0, fcTimeZone)
  }
  return { startIso: target.plannedStartIso, endIso: target.plannedEndIso }
}
