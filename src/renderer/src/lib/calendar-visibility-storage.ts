/** localStorage: ausgeblendete Kalender `accountId|graphCalendarId`. */
export const HIDDEN_CALENDARS_STORAGE_KEY = 'mailclient.calendar.hiddenCalendarKeys'

/** localStorage: Kalender, die in der linken Kalender-Seitenleiste gar nicht mehr erscheinen sollen. */
export const SIDEBAR_HIDDEN_CALENDARS_STORAGE_KEY = 'mailclient.calendar.sidebarHiddenCalendarKeys'

export const CALENDAR_VISIBILITY_CHANGED_EVENT = 'mailclient:calendar-visibility-changed'

export function readHiddenCalendarKeysFromStorage(): Set<string> {
  try {
    const raw = window.localStorage.getItem(HIDDEN_CALENDARS_STORAGE_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return new Set()
    return new Set(arr.filter((x): x is string => typeof x === 'string' && x.length > 0))
  } catch {
    return new Set()
  }
}

/** localStorage: welche `accountId|graphCalendarId`-Keys fuer M365-Gruppenkalender bereits mit Standard «ausgeblendet» versehen wurden. */
export const M365_GROUP_CAL_VIS_SEEDED_KEY = 'mailclient.calendar.m365GroupCalVisibilitySeeded'

export function readM365GroupCalVisibilitySeededKeys(): Set<string> {
  try {
    const raw = window.localStorage.getItem(M365_GROUP_CAL_VIS_SEEDED_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return new Set()
    return new Set(arr.filter((x): x is string => typeof x === 'string' && x.length > 0))
  } catch {
    return new Set()
  }
}

export function persistM365GroupCalVisibilitySeededKeys(keys: Set<string>): void {
  try {
    window.localStorage.setItem(M365_GROUP_CAL_VIS_SEEDED_KEY, JSON.stringify(Array.from(keys)))
  } catch {
    // ignore
  }
}

export function calendarVisibilityKey(accountId: string, graphCalendarId: string): string {
  return `${accountId}|${graphCalendarId}`
}

/** Zerlegt einen von `calendarVisibilityKey` erzeugten Schluessel (erstes `|` trennt Konto-ID). */
export function parseCalendarVisibilityKey(key: string): { accountId: string; graphCalendarId: string } | null {
  const i = key.indexOf('|')
  if (i <= 0) return null
  return { accountId: key.slice(0, i), graphCalendarId: key.slice(i + 1) }
}

export function readSidebarHiddenCalendarKeysFromStorage(): Set<string> {
  try {
    const raw = window.localStorage.getItem(SIDEBAR_HIDDEN_CALENDARS_STORAGE_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return new Set()
    return new Set(arr.filter((x): x is string => typeof x === 'string' && x.length > 0))
  } catch {
    return new Set()
  }
}

export function dispatchCalendarVisibilityChanged(): void {
  window.dispatchEvent(new CustomEvent(CALENDAR_VISIBILITY_CHANGED_EVENT))
}

export function writeHiddenCalendarKeysToStorage(keys: Set<string>): void {
  try {
    window.localStorage.setItem(HIDDEN_CALENDARS_STORAGE_KEY, JSON.stringify(Array.from(keys)))
  } catch {
    // ignore
  }
  dispatchCalendarVisibilityChanged()
}

export function writeSidebarHiddenCalendarKeysToStorage(keys: Set<string>): void {
  try {
    window.localStorage.setItem(SIDEBAR_HIDDEN_CALENDARS_STORAGE_KEY, JSON.stringify(Array.from(keys)))
  } catch {
    // ignore
  }
  dispatchCalendarVisibilityChanged()
}
