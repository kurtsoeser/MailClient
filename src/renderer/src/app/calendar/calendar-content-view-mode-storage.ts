/** Kalender-Raster oder chronologische Zeitliste. */
export type CalendarContentViewMode = 'calendar' | 'timeline'

const KEY = 'mailclient.calendar.contentViewMode.v1'
const LEGACY_MEGA_MIGRATED_KEY = 'mailclient.calendar.megaViewMigrated.v1'

export function readCalendarContentViewMode(): CalendarContentViewMode {
  try {
    migrateLegacyMegaTabOnce()
    const raw = window.localStorage.getItem(KEY)
    /** Zeitliste ist nur noch rechte Spalte; Vollbild-Modus entfällt. */
    if (raw === 'timeline') {
      window.localStorage.setItem(KEY, 'calendar')
    }
    return 'calendar'
  } catch {
    return 'calendar'
  }
}

export function persistCalendarContentViewMode(mode: CalendarContentViewMode): void {
  try {
    window.localStorage.setItem(KEY, mode)
  } catch {
    // ignore
  }
}

/** Früheres Top-Level-Modul „Zeitliste“ → Kalender mit Zeitlisten-Ansicht. */
function migrateLegacyMegaTabOnce(): void {
  try {
    if (window.localStorage.getItem(LEGACY_MEGA_MIGRATED_KEY) === '1') return
    const shellMode = window.localStorage.getItem('mailclient.appShellMode')
    if (shellMode === 'mega') {
      window.localStorage.setItem('mailclient.appShellMode', 'calendar')
      window.localStorage.setItem(KEY, 'calendar')
    }
    window.localStorage.setItem(LEGACY_MEGA_MIGRATED_KEY, '1')
  } catch {
    // ignore
  }
}
