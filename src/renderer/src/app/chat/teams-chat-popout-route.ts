export interface TeamsChatPopoutRoute {
  accountId: string
  chatId: string
}

/** Popout-Fenster: `#teams-chat-popout?accountId=…&chatId=…` */
export function parseTeamsChatPopoutRoute(): TeamsChatPopoutRoute | null {
  const hash = window.location.hash.replace(/^#/, '')
  if (!hash.startsWith('teams-chat-popout')) return null
  const qIdx = hash.indexOf('?')
  const qs = qIdx >= 0 ? hash.slice(qIdx + 1) : ''
  const params = new URLSearchParams(qs)
  const accountId = params.get('accountId')?.trim() ?? ''
  const chatId = params.get('chatId')?.trim() ?? ''
  if (!accountId || !chatId) return null
  return { accountId, chatId }
}

export function isTeamsChatPopoutWindow(): boolean {
  return parseTeamsChatPopoutRoute() != null
}
