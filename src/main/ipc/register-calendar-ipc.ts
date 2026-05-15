import { ipcMain } from 'electron'
import {
  IPC,
  type CalendarEventView,
  type CalendarSuggestionFromMail,
  type CalendarSaveEventInput,
  type CalendarSaveEventResult,
  type CalendarUpdateEventInput,
  type CalendarGetEventInput,
  type CalendarGetEventResult,
  type CalendarDeleteEventInput,
  type CalendarPatchScheduleInput,
  type CalendarPatchCalendarColorInput,
  type CalendarGraphCalendarRow,
  type CalendarListCalendarsInput,
  type CalendarListEventsInput,
  type CalendarM365GroupCalendarsPage
} from '@shared/types'
import { listAccounts } from '../accounts'
import {
  listMergedCalendarEvents,
  listMicrosoftCalendars,
  listMicrosoft365GroupCalendars,
  patchMicrosoftCalendarColor,
  createTeamsMeetingForAccount,
  createSimpleCalendarEventForAccount,
  updateCalendarEventForAccount,
  getCalendarEventForAccount,
  deleteCalendarEventForAccount,
  patchCalendarEventScheduleForAccount,
  patchCalendarEventCategories,
  buildCalendarSuggestionFromMessage
} from '../calendar-service'
import { assertAppOnline } from '../network-status'

export function registerCalendarIpc(): void {
  ipcMain.removeHandler(IPC.calendar.listEvents)
  ipcMain.handle(
    IPC.calendar.listEvents,
    async (_event, args: CalendarListEventsInput): Promise<CalendarEventView[]> => {
      assertAppOnline()
      const include = args.includeCalendars
      return listMergedCalendarEvents(args.startIso, args.endIso, {
        focus: args.focusCalendar ?? undefined,
        includeCalendars: Array.isArray(include) ? include : undefined
      })
    }
  )
  ipcMain.removeHandler(IPC.calendar.listCalendars)
  ipcMain.handle(
    IPC.calendar.listCalendars,
    async (_event, args: CalendarListCalendarsInput): Promise<CalendarGraphCalendarRow[]> => {
      assertAppOnline()
      return listMicrosoftCalendars(args.accountId, { forceRefresh: args.forceRefresh === true })
    }
  )
  ipcMain.removeHandler(IPC.calendar.listMicrosoft365GroupCalendars)
  ipcMain.handle(
    IPC.calendar.listMicrosoft365GroupCalendars,
    async (
      _event,
      args: { accountId: string; offset?: number; limit?: number }
    ): Promise<CalendarM365GroupCalendarsPage> => {
      assertAppOnline()
      return listMicrosoft365GroupCalendars(args.accountId, {
        offset: args.offset,
        limit: args.limit
      })
    }
  )
  ipcMain.removeHandler(IPC.calendar.patchCalendarColor)
  ipcMain.handle(
    IPC.calendar.patchCalendarColor,
    async (_event, args: CalendarPatchCalendarColorInput): Promise<void> => {
      assertAppOnline()
      if (!args?.accountId?.trim() || !args.graphCalendarId?.trim() || !args.color?.trim()) {
        throw new Error('Ungueltige Parameter fuer Kalenderfarbe.')
      }
      const accounts = await listAccounts()
      const acc = accounts.find((a) => a.id === args.accountId.trim())
      if (acc?.provider === 'google') {
        throw new Error('Kalenderfarben aendern wird fuer Google-Konten noch nicht unterstuetzt.')
      }
      await patchMicrosoftCalendarColor({
        accountId: args.accountId.trim(),
        graphCalendarId: args.graphCalendarId.trim(),
        color: args.color.trim()
      })
    }
  )
  ipcMain.removeHandler(IPC.calendar.createTeamsMeeting)
  ipcMain.handle(
    IPC.calendar.createTeamsMeeting,
    async (
      _event,
      args: {
        accountId: string
        subject: string
        startIso: string
        endIso: string
        bodyHtml?: string
        graphCalendarId?: string | null
        attendeeEmails?: string[] | null
      }
    ) => {
      assertAppOnline()
      return createTeamsMeetingForAccount(args.accountId, {
        subject: args.subject,
        startIso: args.startIso,
        endIso: args.endIso,
        bodyHtml: args.bodyHtml,
        graphCalendarId: args.graphCalendarId ?? null,
        attendeeEmails: args.attendeeEmails
      })
    }
  )
  ipcMain.removeHandler(IPC.calendar.suggestFromMessage)
  ipcMain.handle(
    IPC.calendar.suggestFromMessage,
    (_event, messageId: number): CalendarSuggestionFromMail =>
      buildCalendarSuggestionFromMessage(messageId)
  )

  ipcMain.removeHandler(IPC.calendar.createEvent)
  ipcMain.handle(
    IPC.calendar.createEvent,
    async (_event, input: CalendarSaveEventInput): Promise<CalendarSaveEventResult> => {
      assertAppOnline()
      return createSimpleCalendarEventForAccount(input)
    }
  )

  ipcMain.removeHandler(IPC.calendar.updateEvent)
  ipcMain.handle(IPC.calendar.updateEvent, async (_event, input: CalendarUpdateEventInput): Promise<void> => {
    assertAppOnline()
    await updateCalendarEventForAccount(input)
  })

  ipcMain.removeHandler(IPC.calendar.getEvent)
  ipcMain.handle(
    IPC.calendar.getEvent,
    async (_event, input: CalendarGetEventInput): Promise<CalendarGetEventResult> => {
      assertAppOnline()
      if (!input?.accountId?.trim() || !input.graphEventId?.trim()) {
        throw new Error('Ungueltige Parameter fuer calendar:get-event.')
      }
      return getCalendarEventForAccount({
        accountId: input.accountId.trim(),
        graphEventId: input.graphEventId.trim(),
        graphCalendarId: input.graphCalendarId?.trim() || null
      })
    }
  )

  ipcMain.removeHandler(IPC.calendar.deleteEvent)
  ipcMain.handle(IPC.calendar.deleteEvent, async (_event, input: CalendarDeleteEventInput): Promise<void> => {
    assertAppOnline()
    await deleteCalendarEventForAccount(input)
  })

  ipcMain.removeHandler(IPC.calendar.patchEventSchedule)
  ipcMain.handle(
    IPC.calendar.patchEventSchedule,
    async (_event, input: CalendarPatchScheduleInput): Promise<void> => {
      assertAppOnline()
      await patchCalendarEventScheduleForAccount(input)
    }
  )

  ipcMain.removeHandler(IPC.calendar.patchEventCategories)
  ipcMain.handle(
    IPC.calendar.patchEventCategories,
    async (
      _event,
      args: { accountId: string; graphEventId: string; categories: string[]; graphCalendarId?: string | null }
    ): Promise<void> => {
      assertAppOnline()
      await patchCalendarEventCategories(
        args.accountId,
        args.graphEventId,
        args.categories,
        args.graphCalendarId ?? null
      )
    }
  )
}
