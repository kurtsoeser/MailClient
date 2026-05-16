const KEY = 'mailclient.notes.calendar.fcView.v1'

const DEFAULT_VIEW = 'dayGridMonth'

const VALID = new Set([
  'dayGridMonth',
  'timeGridWeek',
  'timeGridDay',
  'listWeek',
  ...Array.from({ length: 20 }, (_, i) => `timeGrid${i + 2}Day`)
])

export function readNotesCalendarFcView(): string {
  try {
    const raw = window.localStorage.getItem(KEY)?.trim()
    if (raw && VALID.has(raw)) return raw
  } catch {
    // ignore
  }
  return DEFAULT_VIEW
}

export function persistNotesCalendarFcView(viewId: string): void {
  try {
    if (VALID.has(viewId)) window.localStorage.setItem(KEY, viewId)
  } catch {
    // ignore
  }
}
