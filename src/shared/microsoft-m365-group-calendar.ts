/** Praefix fuer Kalender-IDs, die einen Microsoft-365-Gruppenkalender referenzieren (`/groups/{id}/calendar/...`). */
export const M365_GROUP_CALENDAR_ID_PREFIX = 'm365g:' as const

export function parseM365GroupIdFromCalendarRef(graphCalendarId: string): string | null {
  const t = graphCalendarId.trim()
  if (!t.startsWith(M365_GROUP_CALENDAR_ID_PREFIX)) return null
  const id = t.slice(M365_GROUP_CALENDAR_ID_PREFIX.length).trim()
  return id.length > 0 ? id : null
}

export function m365GroupCalendarRef(groupId: string): string {
  return `${M365_GROUP_CALENDAR_ID_PREFIX}${groupId.trim()}`
}
