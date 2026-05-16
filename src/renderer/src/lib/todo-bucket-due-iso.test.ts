import { describe, expect, it } from 'vitest'
import { dueIsoForOpenTodoBucket, isOpenTodoBucket } from '@/lib/todo-bucket-due-iso'

describe('dueIsoForOpenTodoBucket', () => {
  it('returns null for later', () => {
    expect(dueIsoForOpenTodoBucket('later', 'Europe/Berlin')).toBeNull()
  })

  it('returns ISO date strings for dated buckets', () => {
    const tz = 'UTC'
    expect(dueIsoForOpenTodoBucket('today', tz)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(dueIsoForOpenTodoBucket('tomorrow', tz)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(dueIsoForOpenTodoBucket('overdue', tz)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('isOpenTodoBucket', () => {
  it('excludes done', () => {
    expect(isOpenTodoBucket('done')).toBe(false)
    expect(isOpenTodoBucket('today')).toBe(true)
  })
})
