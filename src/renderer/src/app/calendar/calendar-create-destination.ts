import type { CalendarGraphCalendarRow, ConnectedAccount } from '@shared/types'

/** Zielkalender fuer Anlegen/Kopieren/Verschieben (keine schreibgeschuetzten Abos). */
export function isWritableCalendarTarget(cal: CalendarGraphCalendarRow): boolean {
  return cal.canEdit !== false
}

/** Ein `<option>`-Wert: Konto + Graph-Kalender (leer = Standardkalender). */
export function calendarDestinationKey(accountId: string, graphCalendarId: string): string {
  return JSON.stringify({ accountId, graphCalendarId })
}

export function parseCalendarDestinationKey(
  key: string
): { accountId: string; graphCalendarId: string } | null {
  try {
    const o = JSON.parse(key) as { accountId?: unknown; graphCalendarId?: unknown }
    if (typeof o.accountId !== 'string') return null
    const graphCalendarId = typeof o.graphCalendarId === 'string' ? o.graphCalendarId : ''
    return { accountId: o.accountId, graphCalendarId }
  } catch {
    return null
  }
}

export function destinationAccountOptgroupLabel(account: ConnectedAccount): string {
  const name = account.displayName.trim()
  const email = account.email.trim()
  if (!name) return email || account.id
  if (!email || name.toLowerCase() === email.toLowerCase()) return name
  return `${name} · ${email}`
}
