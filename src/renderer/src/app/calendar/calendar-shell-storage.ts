/** LocalStorage und Konstanten fuer den Kalender-Shell (ohne React). */

export const CAL_MAIL_TODO_OVERLAY_KEY = 'mailclient.calendar.mailTodoOverlay'

export const CAL_CLOUD_TASK_OVERLAY_KEY = 'mailclient.calendar.cloudTaskOverlay'

/** Frueher: Vollbild-Ansicht nur Mail-Termine; wird einmalig in Mail-Overlay migriert. */
export const LEGACY_CAL_SHELL_SOURCE_KEY = 'mailclient.calendar.shellSource'

/** Groesse der schwebenden Seitenpanels (JSON `{w,h}`), siehe `CalendarFloatingPanel`. */
export const CAL_FLOAT_INBOX_SIZE_KEY = 'mailclient.calendar.float.inbox'
export const CAL_FLOAT_PREVIEW_SIZE_KEY = 'mailclient.calendar.float.preview'

/** Sidebar: Konto-Zweige auf-/zugeklappt (`accountId` -> false = zugeklappt). */
export const ACCOUNT_SIDEBAR_OPEN_KEY = 'mailclient.calendar.accountSidebarOpen'

/** Platzhalter-ID in der Sidebar, wenn Graph noch keine Kalenderliste liefert. */
export const SIDEBAR_DEFAULT_CAL_ID = '__default__'

export const CAL_RIGHT_INBOX_OPEN_KEY = 'mailclient.calendar.rightInboxOpen'

export function readRightInboxOpenFromStorage(): boolean {
  try {
    const v = window.localStorage.getItem(CAL_RIGHT_INBOX_OPEN_KEY)
    if (v === '0') return false
    if (v === '1') return true
  } catch {
    // ignore
  }
  return true
}

export function persistRightInboxOpen(value: boolean): void {
  try {
    window.localStorage.setItem(CAL_RIGHT_INBOX_OPEN_KEY, value ? '1' : '0')
  } catch {
    // ignore
  }
}

export const CAL_RIGHT_PREVIEW_OPEN_KEY = 'mailclient.calendar.rightPreviewOpen'

export function readRightPreviewOpenFromStorage(): boolean {
  try {
    const v = window.localStorage.getItem(CAL_RIGHT_PREVIEW_OPEN_KEY)
    if (v === '0') return false
    if (v === '1') return true
  } catch {
    // ignore
  }
  return true
}

export function persistRightPreviewOpen(value: boolean): void {
  try {
    window.localStorage.setItem(CAL_RIGHT_PREVIEW_OPEN_KEY, value ? '1' : '0')
  } catch {
    // ignore
  }
}

export function parseAccountSidebarOpenFromStorage(): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(ACCOUNT_SIDEBAR_OPEN_KEY)
    if (!raw) return {}
    const o = JSON.parse(raw) as unknown
    if (!o || typeof o !== 'object' || Array.isArray(o)) return {}
    const out: Record<string, boolean> = {}
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (typeof k === 'string' && k.length > 0 && typeof v === 'boolean') out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

export function persistAccountSidebarOpen(value: Record<string, boolean>): void {
  try {
    window.localStorage.setItem(ACCOUNT_SIDEBAR_OPEN_KEY, JSON.stringify(value))
  } catch {
    // ignore
  }
}

/** Sidebar: Unterzweig «Gruppenkalender» pro Microsoft-Konto (`accountId` -> true = aufgeklappt). */
export const GROUP_CAL_SIDEBAR_OPEN_KEY = 'mailclient.calendar.groupCalSidebarOpen'

export function parseGroupCalSidebarOpenFromStorage(): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(GROUP_CAL_SIDEBAR_OPEN_KEY)
    if (!raw) return {}
    const o = JSON.parse(raw) as unknown
    if (!o || typeof o !== 'object' || Array.isArray(o)) return {}
    const out: Record<string, boolean> = {}
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (typeof k === 'string' && k.length > 0 && typeof v === 'boolean') out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

export function persistGroupCalSidebarOpen(value: Record<string, boolean>): void {
  try {
    window.localStorage.setItem(GROUP_CAL_SIDEBAR_OPEN_KEY, JSON.stringify(value))
  } catch {
    // ignore
  }
}

/** Trenner fuer Schluessel `kontoId\u001dgruppenId` (Konto-IDs koennen `:` enthalten). */
export const ACCOUNT_NAMED_GROUP_SIDEBAR_KEY_SEP = '\u001d'

/** Sidebar: Konten-Ansicht — benannte Kalender-Gruppen (`kontoId\u001dgruppenId` -> false = zugeklappt). */
export const ACCOUNT_NAMED_GROUPS_SIDEBAR_OPEN_KEY = 'mailclient.calendar.accountNamedGroupsSidebarOpen'

/** Sidebar: Sections-Ansicht — globale Bereiche (`sectionId` -> false = zugeklappt). */
export const GLOBAL_SECTIONS_SIDEBAR_OPEN_KEY = 'mailclient.calendar.globalSectionsSidebarOpen'

export function accountNamedGroupSidebarKey(accountId: string, groupId: string): string {
  return `${accountId}${ACCOUNT_NAMED_GROUP_SIDEBAR_KEY_SEP}${groupId}`
}

function parseStringBooleanRecordFromStorage(raw: string | null): Record<string, boolean> {
  if (!raw) return {}
  try {
    const o = JSON.parse(raw) as unknown
    if (!o || typeof o !== 'object' || Array.isArray(o)) return {}
    const out: Record<string, boolean> = {}
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (typeof k === 'string' && k.length > 0 && typeof v === 'boolean') out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

export function readAccountNamedGroupsSidebarOpenFromStorage(): Record<string, boolean> {
  try {
    return parseStringBooleanRecordFromStorage(window.localStorage.getItem(ACCOUNT_NAMED_GROUPS_SIDEBAR_OPEN_KEY))
  } catch {
    return {}
  }
}

export function persistAccountNamedGroupsSidebarOpen(value: Record<string, boolean>): void {
  try {
    window.localStorage.setItem(ACCOUNT_NAMED_GROUPS_SIDEBAR_OPEN_KEY, JSON.stringify(value))
  } catch {
    // ignore
  }
}

export function readGlobalSectionsSidebarOpenFromStorage(): Record<string, boolean> {
  try {
    return parseStringBooleanRecordFromStorage(window.localStorage.getItem(GLOBAL_SECTIONS_SIDEBAR_OPEN_KEY))
  } catch {
    return {}
  }
}

export function persistGlobalSectionsSidebarOpen(value: Record<string, boolean>): void {
  try {
    window.localStorage.setItem(GLOBAL_SECTIONS_SIDEBAR_OPEN_KEY, JSON.stringify(value))
  } catch {
    // ignore
  }
}

export function readMailTodoOverlayFromStorage(): boolean {
  try {
    const v = window.localStorage.getItem(CAL_MAIL_TODO_OVERLAY_KEY)
    if (v === '0') return false
    return true
  } catch {
    return true
  }
}

export function persistMailTodoOverlay(value: boolean): void {
  try {
    window.localStorage.setItem(CAL_MAIL_TODO_OVERLAY_KEY, value ? '1' : '0')
  } catch {
    // ignore
  }
}

export function readCloudTaskOverlayFromStorage(): boolean {
  try {
    const v = window.localStorage.getItem(CAL_CLOUD_TASK_OVERLAY_KEY)
    if (v === '0') return false
    return true
  } catch {
    return true
  }
}

export function persistCloudTaskOverlay(value: boolean): void {
  try {
    window.localStorage.setItem(CAL_CLOUD_TASK_OVERLAY_KEY, value ? '1' : '0')
  } catch {
    // ignore
  }
}

/**
 * Einmalige Migration: frueherer Vollbild-Modus nur Mail-Termine → Mail-ToDo-Overlay.
 * Entfernt den Legacy-Key aus localStorage.
 */
export function migrateLegacyCalendarShellSource(): boolean {
  try {
    const legacy = window.localStorage.getItem(LEGACY_CAL_SHELL_SOURCE_KEY)
    const enable = legacy === 'mail_appointments'
    if (legacy != null) {
      window.localStorage.removeItem(LEGACY_CAL_SHELL_SOURCE_KEY)
    }
    return enable
  } catch {
    return false
  }
}

/** Tag/Woche: Rasterbreite in Minuten (FullCalendar `slotDuration`). */
export const CAL_TIME_GRID_SLOT_MINUTES_KEY = 'mailclient.calendar.timeGridSlotMinutes'

export const TIME_GRID_SLOT_MINUTES_OPTIONS = [5, 6, 10, 12, 15, 20, 30, 60] as const

export type TimeGridSlotMinutes = (typeof TIME_GRID_SLOT_MINUTES_OPTIONS)[number]

export function isTimeGridSlotMinutes(n: number): n is TimeGridSlotMinutes {
  return (TIME_GRID_SLOT_MINUTES_OPTIONS as readonly number[]).includes(n)
}

export function readTimeGridSlotMinutesFromStorage(): TimeGridSlotMinutes {
  try {
    const raw = window.localStorage.getItem(CAL_TIME_GRID_SLOT_MINUTES_KEY)
    const n = raw != null ? Number(raw) : NaN
    if (Number.isInteger(n) && isTimeGridSlotMinutes(n)) return n
  } catch {
    // ignore
  }
  return 30
}

export function persistTimeGridSlotMinutes(min: TimeGridSlotMinutes): void {
  try {
    window.localStorage.setItem(CAL_TIME_GRID_SLOT_MINUTES_KEY, String(min))
  } catch {
    // ignore
  }
}

/** ISO-Dauer `HH:MM:SS` fuer FullCalendar. */
export function timeGridSlotMinutesToDuration(min: TimeGridSlotMinutes): string {
  return `00:${String(min).padStart(2, '0')}:00`
}

export function stepTimeGridSlotMinutes(
  current: TimeGridSlotMinutes,
  direction: 'finer' | 'coarser'
): TimeGridSlotMinutes {
  const opts = TIME_GRID_SLOT_MINUTES_OPTIONS
  const idx = opts.indexOf(current)
  const i = idx >= 0 ? idx : opts.indexOf(30)
  if (direction === 'finer') return opts[Math.max(0, i - 1)]
  return opts[Math.min(opts.length - 1, i + 1)]
}

/** Linke Kalender-Seitenleiste (Mini-Monat + Konten) zugeklappt. */
export const CAL_LEFT_SIDEBAR_COLLAPSED_KEY = 'mailclient.calendar.leftSidebarCollapsed'

export function readLeftSidebarCollapsedFromStorage(): boolean {
  try {
    return window.localStorage.getItem(CAL_LEFT_SIDEBAR_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

export function persistLeftSidebarCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(CAL_LEFT_SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0')
  } catch {
    // ignore
  }
}
