/** Globales Event: Topbar-Suchfeld fokussieren (z. B. von Start-Dashboard). */
export const FOCUS_MAIN_SEARCH_EVENT = 'mailclient:focus-main-search'

export function requestFocusMainSearch(): void {
  window.dispatchEvent(new Event(FOCUS_MAIN_SEARCH_EVENT))
}
