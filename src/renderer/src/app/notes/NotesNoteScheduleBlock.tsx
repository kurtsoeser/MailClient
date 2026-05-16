import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { UserNote } from '@shared/types'

function toLocalDateInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function toLocalTimeInput(iso: string | null): string {
  if (!iso) return '09:00'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '09:00'
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function combineLocalDateTime(date: string, time: string): string | null {
  if (!date.trim()) return null
  const t = time.trim() || '09:00'
  const d = new Date(`${date}T${t}:00`)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

export interface NotesNoteScheduleBlockProps {
  note: Pick<UserNote, 'scheduledStartIso' | 'scheduledEndIso' | 'scheduledAllDay'>
  disabled?: boolean
  onChange: (value: {
    scheduledStartIso: string | null
    scheduledEndIso: string | null
    scheduledAllDay: boolean
    clearSchedule?: boolean
  }) => void
}

export function NotesNoteScheduleBlock({
  note,
  disabled = false,
  onChange
}: NotesNoteScheduleBlockProps): JSX.Element {
  const { t } = useTranslation()
  const [enabled, setEnabled] = useState(Boolean(note.scheduledStartIso))
  const [allDay, setAllDay] = useState(note.scheduledAllDay)
  const [date, setDate] = useState(() => toLocalDateInput(note.scheduledStartIso))
  const [startTime, setStartTime] = useState(() => toLocalTimeInput(note.scheduledStartIso))
  const [endTime, setEndTime] = useState(() => toLocalTimeInput(note.scheduledEndIso))

  useEffect(() => {
    setEnabled(Boolean(note.scheduledStartIso))
    setAllDay(note.scheduledAllDay)
    setDate(toLocalDateInput(note.scheduledStartIso))
    setStartTime(toLocalTimeInput(note.scheduledStartIso))
    setEndTime(toLocalTimeInput(note.scheduledEndIso))
  }, [note.scheduledStartIso, note.scheduledEndIso, note.scheduledAllDay])

  function emit(nextEnabled: boolean, nextAllDay: boolean, nextDate: string, nextStart: string, nextEnd: string): void {
    if (!nextEnabled) {
      onChange({
        scheduledStartIso: null,
        scheduledEndIso: null,
        scheduledAllDay: false,
        clearSchedule: true
      })
      return
    }
    if (nextAllDay) {
      const startIso = nextDate.trim() ? `${nextDate.trim()}T00:00:00.000Z`.slice(0, 10) : null
      onChange({
        scheduledStartIso: startIso,
        scheduledEndIso: startIso,
        scheduledAllDay: true
      })
      return
    }
    const startIso = combineLocalDateTime(nextDate, nextStart)
    const endIso = combineLocalDateTime(nextDate, nextEnd)
    onChange({
      scheduledStartIso: startIso,
      scheduledEndIso: endIso ?? startIso,
      scheduledAllDay: false
    })
  }

  return (
    <div className="rounded-lg border border-border bg-background/60 p-3">
      <label className="flex items-center gap-2 text-xs font-medium text-foreground">
        <input
          type="checkbox"
          checked={enabled}
          disabled={disabled}
          onChange={(e): void => {
            const next = e.target.checked
            setEnabled(next)
            emit(next, allDay, date, startTime, endTime)
          }}
        />
        {t('notes.schedule.enable')}
      </label>
      {enabled ? (
        <div className="mt-3 space-y-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={allDay}
              disabled={disabled}
              onChange={(e): void => {
                const next = e.target.checked
                setAllDay(next)
                emit(true, next, date, startTime, endTime)
              }}
            />
            {t('notes.schedule.allDay')}
          </label>
          <input
            type="date"
            value={date}
            disabled={disabled}
            onChange={(e): void => {
              const next = e.target.value
              setDate(next)
              emit(true, allDay, next, startTime, endTime)
            }}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
          />
          {!allDay ? (
            <div className="grid grid-cols-2 gap-2">
              <input
                type="time"
                value={startTime}
                disabled={disabled}
                onChange={(e): void => {
                  const next = e.target.value
                  setStartTime(next)
                  emit(true, allDay, date, next, endTime)
                }}
                className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                title={t('notes.schedule.start')}
              />
              <input
                type="time"
                value={endTime}
                disabled={disabled}
                onChange={(e): void => {
                  const next = e.target.value
                  setEndTime(next)
                  emit(true, allDay, date, startTime, next)
                }}
                className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                title={t('notes.schedule.end')}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
