const ALWAYS_ON_TOP_KEY = 'mailclient.teamsChat.popoutAlwaysOnTop'

export function loadTeamsChatPopoutAlwaysOnTopDefault(): boolean {
  try {
    return localStorage.getItem(ALWAYS_ON_TOP_KEY) === '1'
  } catch {
    return false
  }
}

export function saveTeamsChatPopoutAlwaysOnTopDefault(enabled: boolean): void {
  try {
    localStorage.setItem(ALWAYS_ON_TOP_KEY, enabled ? '1' : '0')
  } catch {
    /* Quota oder Private Mode */
  }
}
