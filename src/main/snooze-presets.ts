import type { RuleSnoozePreset } from '@shared/mail-rules'

function setTime(d: Date, hours: number, minutes: number): Date {
  const copy = new Date(d)
  copy.setHours(hours, minutes, 0, 0)
  return copy
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d)
  copy.setDate(copy.getDate() + days)
  return copy
}

function nextMondayMorning(now: Date): Date {
  const day = now.getDay()
  const daysUntilMonday = day === 0 ? 1 : day === 1 ? 7 : 8 - day
  return setTime(addDays(now, daysUntilMonday), 8, 0)
}

/**
 * Wake-Zeit fuer Regel-Aktion „snooze“ (gleiche Logik wie SnoozePicker).
 */
export function computeRuleSnoozeWakeAt(preset: RuleSnoozePreset, now = new Date()): string | null {
  switch (preset) {
    case 'in-1-hour':
      return new Date(now.getTime() + 60 * 60 * 1000).toISOString()
    case 'in-3-hours':
      return new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString()
    case 'this-evening': {
      const target = setTime(now, 18, 0)
      if (target.getTime() <= now.getTime() + 5 * 60 * 1000) return null
      return target.toISOString()
    }
    case 'tomorrow-morning':
      return setTime(addDays(now, 1), 8, 0).toISOString()
    case 'tomorrow-evening':
      return setTime(addDays(now, 1), 18, 0).toISOString()
    case 'next-week':
    case 'next-monday':
      return nextMondayMorning(now).toISOString()
    default:
      return setTime(addDays(now, 1), 8, 0).toISOString()
  }
}
