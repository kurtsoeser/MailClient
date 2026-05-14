import { IPC } from '@shared/types'
import type { CalendarDeleteEventInput } from '@shared/types'

/**
 * Termin loeschen — nutzt `calendar.deleteEvent`, falls im Preload vorhanden,
 * sonst `mailClient.invoke` (gleicher IPC-Kanal). So funktioniert Loeschen auch,
 * wenn der Renderer nach HMR neuer ist als das beim Fensterstart geladene Preload.
 */
export async function deleteCalendarEventIpc(input: CalendarDeleteEventInput): Promise<void> {
  const del = window.mailClient.calendar.deleteEvent
  if (typeof del === 'function') {
    await del(input)
    return
  }
  const inv = window.mailClient.invoke
  if (typeof inv === 'function') {
    await inv(IPC.calendar.deleteEvent, input)
    return
  }
  throw new Error(
    'Kalender: Loeschen nicht verfuegbar. Bitte MailClient vollstaendig beenden und neu starten (Preload-API).'
  )
}
