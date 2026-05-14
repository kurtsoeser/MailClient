import type { CalendarGraphCalendarRow, ConnectedAccount } from '@shared/types'
import {
  calendarVisibilityKey,
  readHiddenCalendarKeysFromStorage,
  readSidebarHiddenCalendarKeysFromStorage
} from '@/lib/calendar-visibility-storage'

/**
 * Baut die Liste der Kalender, fuer die Cloud-Termine geladen werden sollen
 * (sichtbare = alle ausser in `hiddenKeys` bzw. localStorage ausgeblendete;
 * zusaetzlich ohne in `sidebarHiddenKeys` entfernte Seitenleisten-Kalender).
 */
export async function buildCalendarIncludeCalendars(
  linkedAccounts: ConnectedAccount[],
  calendarsByAccount?: Record<string, CalendarGraphCalendarRow[]>,
  hiddenKeys?: Set<string>,
  sidebarHiddenKeys?: Set<string>
): Promise<{ accountId: string; graphCalendarId: string }[]> {
  const hidden = hiddenKeys ?? readHiddenCalendarKeysFromStorage()
  const sidebarHidden = sidebarHiddenKeys ?? readSidebarHiddenCalendarKeysFromStorage()
  const out: { accountId: string; graphCalendarId: string }[] = []
  for (const acc of linkedAccounts) {
    if (acc.provider !== 'microsoft' && acc.provider !== 'google') continue
    let rows = calendarsByAccount?.[acc.id]
    if (!rows?.length) {
      try {
        rows = await window.mailClient.calendar.listCalendars({ accountId: acc.id })
      } catch {
        rows = []
      }
    }
    for (const cal of rows) {
      const vk = calendarVisibilityKey(acc.id, cal.id)
      if (!hidden.has(vk) && !sidebarHidden.has(vk)) {
        out.push({ accountId: acc.id, graphCalendarId: cal.id })
      }
    }
  }
  return out
}
