import type { PeopleContactView, PeopleListSort } from '@shared/types'

export type PeopleListGroup = { letter: string; items: PeopleContactView[] }

/** A–Z, Ziffern als `0-9`, alles andere als `#` (leerer Kopf → `#`). */
export function letterBucketForSortHead(source: string): string {
  const s = source.trim()
  if (!s) return '#'
  const first = [...s][0] ?? ''
  const stripped = first.normalize('NFD').replace(/\p{M}+/gu, '')
  const head = stripped ? [...stripped][0] ?? stripped : first
  const up = head.toLocaleUpperCase('de-DE')
  const letter = [...up][0] ?? up
  const n = letter.normalize('NFD').replace(/\p{M}+/gu, '')
  const h = (n || letter).toUpperCase()
  if (h >= 'A' && h <= 'Z') return h
  if (h >= '0' && h <= '9') return '0-9'
  return '#'
}

function sortHeadString(c: PeopleContactView, sortBy: PeopleListSort): string {
  if (sortBy === 'displayName') {
    return (
      c.displayName?.trim() ||
      [c.givenName, c.surname].filter(Boolean).join(' ').trim() ||
      c.primaryEmail?.trim() ||
      ''
    )
  }
  if (sortBy === 'surname') {
    return (
      c.surname?.trim() ||
      c.givenName?.trim() ||
      c.displayName?.trim() ||
      c.primaryEmail?.trim() ||
      ''
    )
  }
  return (
    c.givenName?.trim() ||
    c.surname?.trim() ||
    c.displayName?.trim() ||
    c.primaryEmail?.trim() ||
    ''
  )
}

/** Buchstaben-Gruppen für alle Sortierungen (Kopfzeichen = gleicher Schlüssel wie Server-Sortierung). */
export function groupPeopleListRows(rows: PeopleContactView[], sortBy: PeopleListSort): PeopleListGroup[] {
  const groups: PeopleListGroup[] = []
  for (const c of rows) {
    const bucket = letterBucketForSortHead(sortHeadString(c, sortBy))
    const tail = groups[groups.length - 1]
    if (tail && tail.letter === bucket) {
      tail.items.push(c)
    } else {
      groups.push({ letter: bucket, items: [c] })
    }
  }
  return groups
}
