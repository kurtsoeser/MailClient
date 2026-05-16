import type { TeamsChatMessageView, TeamsChatSummary } from '@shared/types'

export function chatTitle(c: TeamsChatSummary): string {
  const t = c.topic?.trim()
  if (t) return t
  const peer = c.peerDisplayName?.trim()
  if (c.chatType === 'oneOnOne' && peer) return peer
  if (c.chatType === 'oneOnOne') return 'Direktnachricht'
  if (c.chatType === 'group') return 'Gruppenchat'
  if (c.chatType === 'meeting') return 'Besprechungschat'
  return 'Chat'
}

export function formatTime(iso: string): string {
  if (!iso) return ''
  const d = Date.parse(iso)
  if (!Number.isFinite(d)) return ''
  return new Intl.DateTimeFormat('de-DE', { timeStyle: 'short' }).format(d)
}

export function formatDay(iso: string): string {
  if (!iso) return ''
  const d = Date.parse(iso)
  if (!Number.isFinite(d)) return ''
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(d)
}

export function initialsFromName(name: string | null | undefined): string {
  const s = name?.trim() || '?'
  const parts = s.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
  return s.slice(0, 2).toUpperCase()
}

export function isOwnMessage(
  m: TeamsChatMessageView,
  myGraphUserId: string | null,
  accountDisplayName: string | null
): boolean {
  if (myGraphUserId && m.fromUserId != null && m.fromUserId === myGraphUserId) return true
  if (!m.fromUserId && m.fromDisplayName?.trim() && accountDisplayName?.trim()) {
    return m.fromDisplayName.trim().toLowerCase() === accountDisplayName.trim().toLowerCase()
  }
  return false
}

export function dayKey(iso: string): string {
  if (!iso) return ''
  const d = Date.parse(iso)
  if (!Number.isFinite(d)) return ''
  return new Date(d).toDateString()
}

export function teamsChatPopoutRefKey(accountId: string, chatId: string): string {
  return `${accountId}::${chatId}`
}

/** Gruppierung nach Anzeigetitel (bei 1:1 typischerweise Personenname), A–Z. */
export function titleBucketKey(c: TeamsChatSummary): string {
  const t = chatTitle(c).trim()
  if (!t) return '#'
  const u = t.charAt(0).toLocaleUpperCase('de-DE')
  if (/^[A-ZÄÖÜ]$/.test(u)) return u
  if (/^\d$/.test(u)) return '0–9'
  return '#'
}
