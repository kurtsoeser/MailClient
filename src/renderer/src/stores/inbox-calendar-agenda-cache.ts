/**
 * Gemeinsamer In-Memory-Cache (mit TTL) für die Terminleiste im Posteingang und die
 * Kalender-Kachel auf dem Dashboard — ein Abruf, zwei Darstellungen.
 */
import { create } from 'zustand'
import type { CalendarEventView, ConnectedAccount, MailListItem } from '@shared/types'
import { buildCalendarIncludeCalendars } from '@/lib/build-calendar-include-calendars'
import {
  calendarPreviewRangeIso,
  filterUpcomingCalendarEvents
} from '@/lib/calendar-dashboard-range'
import { mailListItemTodoScheduleWindow } from '@/app/calendar/mail-todo-calendar'

const MAX_AGENDA = 10
/** Wie viele reine Kalender-Termine die Startseiten-Kachel höchstens zeigt (s. HomeDashboard). */
const DASHBOARD_CALENDAR_MAX_EVENTS = 20

/** Wie lange gecachte Termine ohne erneuten Netzwerkabruf gelten (Modulwechsel). */
export const INBOX_AGENDA_STALE_MS = 120_000

export type InboxAgendaRow =
  | { kind: 'graph'; ev: CalendarEventView; startMs: number; endMs: number }
  | { kind: 'mail'; message: MailListItem; startMs: number; endMs: number }

function calendarLinkedKey(accounts: ConnectedAccount[]): string {
  return accounts
    .filter((a) => a.provider === 'microsoft' || a.provider === 'google')
    .map((a) => a.id)
    .sort()
    .join('\u001f')
}

let loadSeq = 0

interface InboxCalendarAgendaCacheState {
  agenda: InboxAgendaRow[]
  /** Nur Cloud-Kalender, sortiert — gleiche Datenbasis wie `agenda` (Graph), für die Dashboard-Kachel. */
  dashboardUpcomingCalendar: CalendarEventView[]
  /** Alle Cloud-Termine im Vorschau-Zeitraum (SQLite-Cache via `listEvents`). */
  previewRangeEvents: CalendarEventView[]
  error: string | null
  fetchedAt: number
  cachedKey: string | null
  inFlight: boolean

  /**
   * Agenda + Dashboard-Termine laden (ein IPC-Abruf über Kalender-SQLite-Cache). Ohne `force`: bei frischem
   * RAM-Cache (gleiche Konten, Alter unter INBOX_AGENDA_STALE_MS) kein Abruf.
   */
  loadAgenda: (calendarLinkedAccounts: ConnectedAccount[], opts?: { force?: boolean }) => Promise<void>
}

export const useInboxCalendarAgendaCacheStore = create<InboxCalendarAgendaCacheState>((set, get) => ({
  agenda: [],
  dashboardUpcomingCalendar: [],
  previewRangeEvents: [],
  error: null,
  fetchedAt: 0,
  cachedKey: null,
  inFlight: false,

  async loadAgenda(calendarLinkedAccounts, opts): Promise<void> {
    const key = calendarLinkedKey(calendarLinkedAccounts)
    const force = opts?.force === true
    const now = Date.now()
    const { cachedKey, fetchedAt, agenda, dashboardUpcomingCalendar } = get()

    if (
      !force &&
      key === cachedKey &&
      fetchedAt > 0 &&
      now - fetchedAt < INBOX_AGENDA_STALE_MS
    ) {
      return
    }

    const hadRows =
      agenda.length > 0 ||
      dashboardUpcomingCalendar.length > 0 ||
      get().previewRangeEvents.length > 0
    const seq = ++loadSeq

    set({ inFlight: true, ...(hadRows ? {} : { error: null }) })

    const { startIso, endIso } = calendarPreviewRangeIso()

    try {
      const includeCalendars = await buildCalendarIncludeCalendars(calendarLinkedAccounts)
      const [graphEvents, mailTodos] = await Promise.all([
        window.mailClient.calendar.listEvents({
          startIso,
          endIso,
          focusCalendar: null,
          includeCalendars
        }),
        window.mailClient.mail.listTodoMessagesInRange({
          accountId: null,
          rangeStartIso: startIso,
          rangeEndIso: endIso,
          limit: 400
        })
      ])

      if (seq !== loadSeq) return

      const nowMs = Date.now()
      const rows: InboxAgendaRow[] = []

      const upcomingCalOnly = filterUpcomingCalendarEvents(
        graphEvents,
        DASHBOARD_CALENDAR_MAX_EVENTS,
        nowMs
      )

      for (const ev of graphEvents) {
        const s = Date.parse(ev.startIso)
        const e = Date.parse(ev.endIso)
        if (!Number.isFinite(s) || !Number.isFinite(e)) continue
        if (e < nowMs) continue
        rows.push({ kind: 'graph', ev, startMs: s, endMs: e })
      }

      for (const m of mailTodos) {
        const w = mailListItemTodoScheduleWindow(m)
        if (!w) continue
        if (w.endMs < nowMs) continue
        rows.push({ kind: 'mail', message: m, startMs: w.startMs, endMs: w.endMs })
      }

      rows.sort((a, b) => a.startMs - b.startMs)
      set({
        agenda: rows.slice(0, MAX_AGENDA),
        dashboardUpcomingCalendar: upcomingCalOnly,
        previewRangeEvents: graphEvents,
        error: null,
        fetchedAt: Date.now(),
        cachedKey: key
      })
    } catch (e) {
      if (seq !== loadSeq) return
      const msg = e instanceof Error ? e.message : String(e)
      set((s) => ({
        error: msg,
        agenda: s.agenda.length > 0 ? s.agenda : [],
        dashboardUpcomingCalendar:
          s.dashboardUpcomingCalendar.length > 0 ? s.dashboardUpcomingCalendar : [],
        previewRangeEvents: s.previewRangeEvents.length > 0 ? s.previewRangeEvents : []
      }))
    } finally {
      if (seq === loadSeq) {
        set({ inFlight: false })
      }
    }
  }
}))
