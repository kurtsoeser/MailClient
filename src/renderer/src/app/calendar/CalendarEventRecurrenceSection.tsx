import { Repeat2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { CalendarRecurrenceFrequency, CalendarRecurrenceRangeEndMode } from '@shared/types'

type RecurrenceUiFrequency = 'none' | CalendarRecurrenceFrequency

interface Props {
  recurFreq: RecurrenceUiFrequency
  setRecurFreq: (v: RecurrenceUiFrequency) => void
  recurEnd: CalendarRecurrenceRangeEndMode
  setRecurEnd: (v: CalendarRecurrenceRangeEndMode) => void
  recurUntilDate: string
  setRecurUntilDate: (v: string) => void
  recurCount: string
  setRecurCount: (v: string) => void
  eventFieldsLocked: boolean
}

export function CalendarEventRecurrenceSection({
  recurFreq,
  setRecurFreq,
  recurEnd,
  setRecurEnd,
  recurUntilDate,
  setRecurUntilDate,
  recurCount,
  setRecurCount,
  eventFieldsLocked
}: Props): JSX.Element {
  const { t } = useTranslation()

  return (
    <div className="border-b border-border py-3">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Repeat2 className="h-3.5 w-3.5" />
        {t('calendar.eventDialog.recurrenceHeading')}
      </div>
      <label className="block text-[11px] text-muted-foreground" htmlFor="cal-recur-freq">
        {t('calendar.eventDialog.recurrenceFreqLabel')}
      </label>
      <select
        id="cal-recur-freq"
        value={recurFreq}
        disabled={eventFieldsLocked}
        onChange={(e): void => {
          const v = e.target.value
          if (
            v === 'none' ||
            v === 'daily' ||
            v === 'weekly' ||
            v === 'biweekly' ||
            v === 'monthly' ||
            v === 'yearly'
          ) {
            setRecurFreq(v)
          }
        }}
        className="mt-1 w-full rounded-md border border-border bg-background px-2 py-2 text-[13px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <option value="none">{t('calendar.eventDialog.recurrenceFreqNone')}</option>
        <option value="daily">{t('calendar.eventDialog.recurrenceFreqDaily')}</option>
        <option value="weekly">{t('calendar.eventDialog.recurrenceFreqWeekly')}</option>
        <option value="biweekly">{t('calendar.eventDialog.recurrenceFreqBiweekly')}</option>
        <option value="monthly">{t('calendar.eventDialog.recurrenceFreqMonthly')}</option>
        <option value="yearly">{t('calendar.eventDialog.recurrenceFreqYearly')}</option>
      </select>
      {recurFreq !== 'none' ? (
        <div className="mt-3 space-y-2">
          <label className="block text-[11px] text-muted-foreground" htmlFor="cal-recur-end">
            {t('calendar.eventDialog.recurrenceEndLabel')}
          </label>
          <select
            id="cal-recur-end"
            value={recurEnd}
            disabled={eventFieldsLocked}
            onChange={(e): void => {
              const v = e.target.value
              if (v === 'never' || v === 'until' || v === 'count') setRecurEnd(v)
            }}
            className="w-full rounded-md border border-border bg-background px-2 py-2 text-[13px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="never">{t('calendar.eventDialog.recurrenceEndNever')}</option>
            <option value="until">{t('calendar.eventDialog.recurrenceEndUntil')}</option>
            <option value="count">{t('calendar.eventDialog.recurrenceEndCount')}</option>
          </select>
          {recurEnd === 'until' ? (
            <label className="block text-[11px]">
              <span className="mb-1 block text-muted-foreground">
                {t('calendar.eventDialog.recurrenceUntilLabel')}
              </span>
              <input
                type="date"
                value={recurUntilDate}
                onChange={(e): void => setRecurUntilDate(e.target.value)}
                disabled={eventFieldsLocked}
                className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
              />
            </label>
          ) : null}
          {recurEnd === 'count' ? (
            <label className="block text-[11px]">
              <span className="mb-1 block text-muted-foreground">
                {t('calendar.eventDialog.recurrenceCountLabel')}
              </span>
              <input
                type="number"
                min={1}
                max={999}
                value={recurCount}
                onChange={(e): void => setRecurCount(e.target.value)}
                disabled={eventFieldsLocked}
                className="w-full rounded border border-border bg-background px-2 py-1 text-xs tabular-nums"
              />
            </label>
          ) : null}
          <p className="text-[10px] leading-snug text-muted-foreground">
            {t('calendar.eventDialog.recurrenceHint')}
          </p>
        </div>
      ) : null}
    </div>
  )
}
