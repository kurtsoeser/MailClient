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
  type CalendarPatchEventIconInput,
  type CalendarPatchScheduleInput,
  type CalendarTransferEventInput,
  type CalendarPatchCalendarColorInput,
  type CalendarGraphCalendarRow,
  type CalendarAccountSyncStateRow,
  type CalendarListCalendarsInput,
  type CalendarListEventsInput,
  type CalendarM365GroupCalendarsPage
} from '@shared/types'
import { listAccounts } from '../accounts'
import {
  afterCalendarEventCreated,
  afterCalendarEventDeleted,
  afterCalendarEventIconPatched,
  afterCalendarEventSchedulePatched,
  afterCalendarEventUpdated
} from '../calendar-cache-mutations'
import {
  listCalendarAccountSyncStates,
  listCalendarEventsCached,
  syncCalendarAccount
} from '../calendar-cache-service'
import { syncCalendarFoldersForAccount } from '../calendar-folders-cache-service'
import { getCalendarEventCached } from '../calendar-event-details-cache-service'
import {
  listCalendarsCached,
  listM365GroupCalendarsCached
} from '../calendar-folders-cache-service'
import {
  patchMicrosoftCalendarColor,
  createTeamsMeetingForAccount,
  createSimpleCalendarEventForAccount,
  updateCalendarEventForAccount,
  deleteCalendarEventForAccount,
  patchCalendarEventScheduleForAccount,
  patchCalendarEventCategories,
  buildCalendarSuggestionFromMessage
} from '../calendar-service'
import { transferCalendarEvent } from '../calendar-event-transfer'
import { assertAppOnline } from '../network-status'
import {
  listStandardCalendarFoldersFromCache,
  setCalendarFolderDisplayColorOverride
} from '../db/calendar-folders-repo'
import { graphCalendarColorToDisplayHex } from '@shared/graph-calendar-colors'

export function registerCalendarIpc(): void {
  ipcMain.removeHandler(IPC.calendar.listEvents)
  ipcMain.handle(
    IPC.calendar.listEvents,
    async (_event, args: CalendarListEventsInput): Promise<CalendarEventView[]> => {
      const include = args.includeCalendars
      return listCalendarEventsCached(args.startIso, args.endIso, {
        focus: args.focusCalendar ?? undefined,
        includeCalendars: Array.isArray(include) ? include : undefined,
        forceRefresh: args.forceRefresh === true
      })
    }
  )
  ipcMain.removeHandler(IPC.calendar.listCalendars)
  ipcMain.handle(
    IPC.calendar.listCalendars,
    async (_event, args: CalendarListCalendarsInput): Promise<CalendarGraphCalendarRow[]> => {
      if (args.forceRefresh === true) assertAppOnline()
      return listCalendarsCached(args.accountId, { forceRefresh: args.forceRefresh === true })
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
      return listM365GroupCalendarsCached(args.accountId, {
        offset: args.offset,
        limit: args.limit
      })
    }
  )
  ipcMain.removeHandler(IPC.calendar.patchCalendarColor)
  ipcMain.handle(
    IPC.calendar.patchCalendarColor,
    async (_event, args: CalendarPatchCalendarColorInput): Promise<void> => {
      if (!args?.accountId?.trim() || !args.graphCalendarId?.trim() || !args.color?.trim()) {
        throw new Error('Ungueltige Parameter fuer Kalenderfarbe.')
      }
      const accountId = args.accountId.trim()
      const graphCalendarId = args.graphCalendarId.trim()
      const colorPreset = args.color.trim()
      const accounts = await listAccounts()
      const acc = accounts.find((a) => a.id === accountId)
      const cached = listStandardCalendarFoldersFromCache(accountId).find((c) => c.id === graphCalendarId)
      const canPatchRemote =
        acc?.provider === 'microsoft' &&
        cached?.canEdit !== false &&
        cached?.calendarKind !== 'm365Group'

      if (!canPatchRemote) {
        const hex =
          colorPreset === 'auto' ? null : graphCalendarColorToDisplayHex(null, colorPreset)
        if (colorPreset !== 'auto' && !hex) {
          throw new Error('Ungueltige Kalenderfarbe.')
        }
        setCalendarFolderDisplayColorOverride(accountId, graphCalendarId, hex)
        return
      }

      assertAppOnline()
      await patchMicrosoftCalendarColor({
        accountId,
        graphCalendarId,
        color: colorPreset
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
      const result = await createTeamsMeetingForAccount(args.accountId, {
        subject: args.subject,
        startIso: args.startIso,
        endIso: args.endIso,
        bodyHtml: args.bodyHtml,
        graphCalendarId: args.graphCalendarId ?? null,
        attendeeEmails: args.attendeeEmails
      })
      await afterCalendarEventCreated(
        args.accountId,
        {
          accountId: args.accountId,
          graphCalendarId: args.graphCalendarId ?? null,
          subject: args.subject,
          startIso: args.startIso,
          endIso: args.endIso,
          isAllDay: false,
          bodyHtml: args.bodyHtml ?? null,
          attendeeEmails: args.attendeeEmails ?? null,
          teamsMeeting: true
        },
        { id: result.id, webLink: result.webLink }
      )
      return result
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
      const result = await createSimpleCalendarEventForAccount(input)
      await afterCalendarEventCreated(input.accountId, input, result)
      return result
    }
  )

  ipcMain.removeHandler(IPC.calendar.updateEvent)
  ipcMain.handle(IPC.calendar.updateEvent, async (_event, input: CalendarUpdateEventInput): Promise<void> => {
    assertAppOnline()
    await updateCalendarEventForAccount(input)
    await afterCalendarEventUpdated(input.accountId, input)
  })

  ipcMain.removeHandler(IPC.calendar.getEvent)
  ipcMain.handle(
    IPC.calendar.getEvent,
    async (_event, input: CalendarGetEventInput): Promise<CalendarGetEventResult> => {
      assertAppOnline()
      if (!input?.accountId?.trim() || !input.graphEventId?.trim()) {
        throw new Error('Ungueltige Parameter fuer calendar:get-event.')
      }
      return getCalendarEventCached(
        {
          accountId: input.accountId.trim(),
          graphEventId: input.graphEventId.trim(),
          graphCalendarId: input.graphCalendarId?.trim() || null
        },
        { forceRefresh: input.forceRefresh === true }
      )
    }
  )

  ipcMain.removeHandler(IPC.calendar.deleteEvent)
  ipcMain.handle(IPC.calendar.deleteEvent, async (_event, input: CalendarDeleteEventInput): Promise<void> => {
    assertAppOnline()
    await deleteCalendarEventForAccount(input)
    afterCalendarEventDeleted(input.accountId, input.graphEventId)
  })

  ipcMain.removeHandler(IPC.calendar.patchEventSchedule)
  ipcMain.handle(
    IPC.calendar.patchEventSchedule,
    async (_event, input: CalendarPatchScheduleInput): Promise<void> => {
      assertAppOnline()
      await patchCalendarEventScheduleForAccount(input)
      afterCalendarEventSchedulePatched(input)
    }
  )

  ipcMain.removeHandler(IPC.calendar.transferEvent)
  ipcMain.handle(
    IPC.calendar.transferEvent,
    async (_event, input: CalendarTransferEventInput): Promise<CalendarSaveEventResult> => {
      assertAppOnline()
      return transferCalendarEvent(input)
    }
  )

  ipcMain.removeHandler(IPC.calendar.patchEventIcon)
  ipcMain.handle(
    IPC.calendar.patchEventIcon,
    async (_event, input: CalendarPatchEventIconInput): Promise<void> => {
      const graphEventId = input.graphEventId?.trim()
      if (!graphEventId) throw new Error('graphEventId fehlt.')
      afterCalendarEventIconPatched(input)
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

  ipcMain.removeHandler(IPC.calendar.syncAccount)
  ipcMain.handle(IPC.calendar.syncAccount, async (_event, accountId: unknown): Promise<void> => {
    assertAppOnline()
    const id = typeof accountId === 'string' ? accountId.trim() : ''
    if (!id) throw new Error('accountId fehlt.')
    await syncCalendarFoldersForAccount(id).catch((e) => {
      console.warn('[calendar] Ordner-Sync:', id, e)
    })
    await syncCalendarAccount(id)
  })

  ipcMain.removeHandler(IPC.calendar.getAccountSyncStates)
  ipcMain.handle(
    IPC.calendar.getAccountSyncStates,
    async (): Promise<CalendarAccountSyncStateRow[]> => listCalendarAccountSyncStates()
  )
}
