import type { PeopleContactView, PeopleListSort } from '@shared/types'

/** Klassische Anzeige: Anzeigename, sonst „Vorname Nachname“, sonst E-Mail / ID. */
export function peopleDisplayLabel(c: PeopleContactView): string {
  const n = c.displayName?.trim()
  if (n) return n
  const parts = [c.givenName, c.surname].filter(Boolean).join(' ').trim()
  if (parts) return parts
  return c.primaryEmail?.trim() || c.remoteId
}

/** Listen- und Kopfzeile: Vor-/Nachname-Reihenfolge wie die gewählte Sortierung. */
export function peopleListPrimaryLabel(c: PeopleContactView, sortBy: PeopleListSort): string {
  if (sortBy === 'displayName') return peopleDisplayLabel(c)

  const given = c.givenName?.trim() || ''
  const sur = c.surname?.trim() || ''
  const display = c.displayName?.trim() || ''

  if (sortBy === 'surname') {
    if (sur && given) return `${sur} ${given}`
    if (sur) return sur
    if (given) return given
    if (display) return display
    return c.primaryEmail?.trim() || c.remoteId
  }

  if (sortBy === 'givenName') {
    if (given && sur) return `${given} ${sur}`
    if (given) return given
    if (sur) return sur
    if (display) return display
    return c.primaryEmail?.trim() || c.remoteId
  }

  return peopleDisplayLabel(c)
}
