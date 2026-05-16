import { listAccounts } from './accounts'
import {
  afterCalendarEventCreated,
  afterCalendarEventDeleted
} from './calendar-cache-mutations'
import { broadcastCalendarChanged } from './ipc/ipc-broadcasts'
import {
  createSimpleCalendarEventForAccount,
  deleteCalendarEventForAccount,
  getCalendarEventForAccount
} from './calendar-service'
import { getCalendarEventDetailsFromCache } from './db/calendar-event-details-repo'
import type {
  CalendarSaveEventInput,
  CalendarSaveEventResult,
  CalendarTransferEventInput
} from '@shared/types'

function normalizeCalendarId(id?: string | null): string {
  return id?.trim() ?? ''
}

function isSameDestination(
  sourceAccountId: string,
  sourceCalendarId: string | null | undefined,
  targetAccountId: string,
  targetCalendarId: string | null | undefined
): boolean {
  return (
    sourceAccountId === targetAccountId &&
    normalizeCalendarId(sourceCalendarId) === normalizeCalendarId(targetCalendarId)
  )
}

/** Termin in anderen Kalender kopieren oder verschieben (auch anderes Konto). */
export async function transferCalendarEvent(
  input: CalendarTransferEventInput
): Promise<CalendarSaveEventResult> {
  const src = input.source
  const targetAccountId = input.targetAccountId.trim()
  const targetCalendarId = normalizeCalendarId(input.targetGraphCalendarId)
  if (!targetAccountId) throw new Error('Zielkonto fehlt.')

  if (isSameDestination(src.accountId, src.graphCalendarId, targetAccountId, targetCalendarId)) {
    throw new Error('Termin liegt bereits in diesem Kalender.')
  }

  const accounts = await listAccounts()
  const srcAcc = accounts.find((a) => a.id === src.accountId)
  const tgtAcc = accounts.find((a) => a.id === targetAccountId)
  if (!srcAcc || !tgtAcc) throw new Error('Konto nicht gefunden.')
  if (srcAcc.provider !== 'microsoft' && srcAcc.provider !== 'google') {
    throw new Error('Quellkonto unterstützt keine Kalenderübertragung.')
  }
  if (tgtAcc.provider !== 'microsoft' && tgtAcc.provider !== 'google') {
    throw new Error('Zielkonto unterstützt keine Kalenderübertragung.')
  }

  if (input.mode === 'move' && input.source.calendarCanEdit === false) {
    throw new Error(
      'Termin kann nicht aus einem schreibgeschützten Kalender (z. B. Abo oder Feed) verschoben werden. Bitte «Kopieren nach…» verwenden.'
    )
  }

  let detail: Awaited<ReturnType<typeof getCalendarEventForAccount>>
  try {
    detail = await getCalendarEventForAccount({
      accountId: src.accountId,
      graphEventId: src.graphEventId,
      graphCalendarId: src.graphCalendarId ?? null
    })
  } catch {
    const cached = getCalendarEventDetailsFromCache(src.accountId, src.graphEventId)
    detail = {
      subject: cached?.subject ?? src.title,
      attendeeEmails: cached?.attendeeEmails ?? [],
      joinUrl: cached?.joinUrl ?? null,
      isOnlineMeeting: cached?.isOnlineMeeting ?? false,
      bodyHtml: cached?.bodyHtml ?? null
    }
  }

  const isAllDay = input.payloadOverride?.isAllDay ?? src.isAllDay
  const saveInput: CalendarSaveEventInput = {
    accountId: targetAccountId,
    graphCalendarId: targetCalendarId || null,
    subject: (input.payloadOverride?.subject ?? src.title.trim()) || '(Ohne Titel)',
    startIso: input.payloadOverride?.startIso ?? src.startIso,
    endIso: input.payloadOverride?.endIso ?? src.endIso,
    isAllDay,
    location: input.payloadOverride?.location ?? src.location ?? null,
    bodyHtml: input.payloadOverride?.bodyHtml ?? detail.bodyHtml,
    categories:
      input.payloadOverride?.categories ??
      (tgtAcc.provider === 'microsoft' ? src.categories ?? null : null),
    attendeeEmails:
      input.payloadOverride?.attendeeEmails ??
      (tgtAcc.provider === 'microsoft' || tgtAcc.provider === 'google'
        ? detail.attendeeEmails
        : null),
    teamsMeeting:
      input.payloadOverride?.teamsMeeting ??
      (tgtAcc.provider === 'microsoft' && !isAllDay ? detail.isOnlineMeeting : null)
  }

  const result = await createSimpleCalendarEventForAccount(saveInput)
  await afterCalendarEventCreated(targetAccountId, saveInput, result)

  if (input.mode === 'move') {
    await deleteCalendarEventForAccount({
      accountId: src.accountId,
      graphEventId: src.graphEventId,
      graphCalendarId: src.graphCalendarId ?? null
    })
    afterCalendarEventDeleted(src.accountId, src.graphEventId)
    broadcastCalendarChanged(src.accountId)
  }

  return result
}
