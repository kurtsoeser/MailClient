import { format, parseISO } from 'date-fns'
import { de, enUS } from 'date-fns/locale'
import type { WorkItem } from '@shared/work-item'
import { workItemEffectiveSortIso } from '@/app/work-items/work-item-bucket'

export function megaItemTimeLabel(item: WorkItem, localeCode: string): string {
  const locale = localeCode.startsWith('de') ? de : enUS
  if (item.kind === 'calendar_event') {
    const ev = item.event
    if (ev.isAllDay) {
      return localeCode.startsWith('de') ? 'Ganztägig' : 'All day'
    }
    try {
      const s = parseISO(ev.startIso)
      const e = parseISO(ev.endIso)
      if (!Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime())) {
        return `${format(s, 'HH:mm')} – ${format(e, 'HH:mm')}`
      }
    } catch {
      // fall through
    }
    return format(parseISO(ev.startIso), 'HH:mm', { locale })
  }

  const plannedStart = item.planned.plannedStartIso?.trim()
  const plannedEnd = item.planned.plannedEndIso?.trim()
  if (plannedStart && plannedEnd) {
    try {
      const s = parseISO(plannedStart)
      const e = parseISO(plannedEnd)
      if (!Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime())) {
        return `${format(s, 'HH:mm')} – ${format(e, 'HH:mm')}`
      }
    } catch {
      // fall through
    }
  }

  const due = item.dueAtIso?.trim()
  if (due) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(due)) {
      return localeCode.startsWith('de') ? 'Fällig' : 'Due'
    }
    try {
      return format(parseISO(due), 'HH:mm', { locale })
    } catch {
      return due.slice(0, 10)
    }
  }

  const eff = workItemEffectiveSortIso(item)
  if (eff && item.kind === 'mail_todo') {
    return localeCode.startsWith('de') ? 'Empfangen' : 'Received'
  }
  return ''
}
