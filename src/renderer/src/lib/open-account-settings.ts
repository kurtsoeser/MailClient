export const OPEN_ACCOUNT_SETTINGS_EVENT = 'mailclient:open-account-settings'

export type OpenAccountSettingsTab = 'general' | 'accounts' | 'mail' | 'calendar' | 'contacts'

export type OpenAccountSettingsDetail = {
  tab?: OpenAccountSettingsTab
  /** Unterpunkt im Mail-Tab (z. B. `rules`). */
  mailSubNav?: string
}

export function requestOpenAccountSettings(detail: OpenAccountSettingsDetail = {}): void {
  window.dispatchEvent(new CustomEvent(OPEN_ACCOUNT_SETTINGS_EVENT, { detail }))
}
