import { describe, expect, it } from 'vitest'
import {
  groupLabelTodoDueBucketDe,
  parseOpenTodoDueKind,
  rankOpenTodoBucket,
  shortTitleTodoDueBucketDe
} from './todo-due-bucket'

describe('parseOpenTodoDueKind', () => {
  it('liefert null fuer leer/ungueltig', () => {
    expect(parseOpenTodoDueKind(null)).toBeNull()
    expect(parseOpenTodoDueKind(undefined)).toBeNull()
    expect(parseOpenTodoDueKind('')).toBeNull()
    expect(parseOpenTodoDueKind('  ')).toBeNull()
    expect(parseOpenTodoDueKind('invalid')).toBeNull()
  })

  it('akzeptiert gueltige Buckets', () => {
    expect(parseOpenTodoDueKind('today')).toBe('today')
    expect(parseOpenTodoDueKind(' overdue ')).toBe('overdue')
    expect(parseOpenTodoDueKind('done')).toBe('done')
  })
})

describe('rankOpenTodoBucket', () => {
  it('sortiert overdue vor today vor done', () => {
    expect(rankOpenTodoBucket('overdue')).toBeLessThan(rankOpenTodoBucket('today'))
    expect(rankOpenTodoBucket('today')).toBeLessThan(rankOpenTodoBucket('later'))
    expect(rankOpenTodoBucket('later')).toBeLessThan(rankOpenTodoBucket('done'))
  })
})

describe('Labels DE', () => {
  it('Gruppen- und Kurztitel sind gesetzt', () => {
    expect(groupLabelTodoDueBucketDe('today')).toContain('Heute')
    expect(shortTitleTodoDueBucketDe('today')).toBe('Heute')
    expect(groupLabelTodoDueBucketDe('done')).toContain('erledigt')
  })
})
