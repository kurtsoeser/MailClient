import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Clock, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

export const DASHBOARD_SECOND_CLOCK_TIME_ZONE_STORAGE_KEY =
  'mailclient.dashboardSecondClockTimeZone.v1'

const DEFAULT_WORLD_CLOCK_TIME_ZONE = 'America/New_York'

const COMMON_TIME_ZONES = [
  { value: 'Europe/Vienna', label: 'Wien' },
  { value: 'Europe/Berlin', label: 'Berlin' },
  { value: 'Europe/London', label: 'London' },
  { value: 'America/New_York', label: 'New York' },
  { value: 'America/Chicago', label: 'Chicago' },
  { value: 'America/Los_Angeles', label: 'Los Angeles' },
  { value: 'America/Sao_Paulo', label: 'Sao Paulo' },
  { value: 'Asia/Dubai', label: 'Dubai' },
  { value: 'Asia/Kolkata', label: 'Mumbai' },
  { value: 'Asia/Singapore', label: 'Singapur' },
  { value: 'Asia/Tokyo', label: 'Tokio' },
  { value: 'Australia/Sydney', label: 'Sydney' }
] as const

interface DashboardTodayClockProps {
  timeZone?: string
  storageKey?: string
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date())
    return true
  } catch {
    return false
  }
}

function readStoredTimeZone(storageKey: string | undefined, fallback: string): string {
  if (!storageKey) return fallback
  try {
    const stored = window.localStorage.getItem(storageKey)?.trim()
    if (stored && isValidTimeZone(stored)) return stored
  } catch {
    // ignore
  }
  return fallback
}

function writeStoredTimeZone(storageKey: string | undefined, timeZone: string): void {
  if (!storageKey) return
  try {
    window.localStorage.setItem(storageKey, timeZone)
  } catch {
    // ignore
  }
}

function displayLabelForTimeZone(timeZone: string): string {
  const common = COMMON_TIME_ZONES.find((z) => z.value === timeZone)
  if (common) return common.label
  const city = timeZone.split('/').pop()?.replace(/_/g, ' ').trim()
  return city || timeZone
}

export function DashboardTodayClock({
  timeZone,
  storageKey
}: DashboardTodayClockProps = {}): JSX.Element {
  const { t, i18n } = useTranslation()
  const [now, setNow] = useState(() => new Date())
  const fallbackTimeZone =
    timeZone && isValidTimeZone(timeZone) ? timeZone : storageKey ? DEFAULT_WORLD_CLOCK_TIME_ZONE : undefined
  const [selectedTimeZone, setSelectedTimeZone] = useState(() =>
    fallbackTimeZone ? readStoredTimeZone(storageKey, fallbackTimeZone) : undefined
  )
  const [customTimeZone, setCustomTimeZone] = useState(() => selectedTimeZone ?? DEFAULT_WORLD_CLOCK_TIME_ZONE)
  const [isTimeZoneMenuOpen, setIsTimeZoneMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return (): void => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (!isTimeZoneMenuOpen) return

    const closeOnOutsidePointer = (event: MouseEvent | TouchEvent): void => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (menuRef.current?.contains(target) || menuButtonRef.current?.contains(target)) return
      setIsTimeZoneMenuOpen(false)
    }

    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      setIsTimeZoneMenuOpen(false)
      menuButtonRef.current?.focus()
    }

    document.addEventListener('mousedown', closeOnOutsidePointer)
    document.addEventListener('touchstart', closeOnOutsidePointer)
    document.addEventListener('keydown', closeOnEscape)

    return (): void => {
      document.removeEventListener('mousedown', closeOnOutsidePointer)
      document.removeEventListener('touchstart', closeOnOutsidePointer)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [isTimeZoneMenuOpen])

  const locale = i18n.language.startsWith('de') ? 'de-DE' : 'en-US'
  const activeTimeZone = selectedTimeZone ?? fallbackTimeZone
  const isWorldClock = Boolean(storageKey)
  const zoneLabel = activeTimeZone ? displayLabelForTimeZone(activeTimeZone) : t('dashboard.clock.localLabel')

  const formatted = useMemo(() => {
    const formatOptions = activeTimeZone ? { timeZone: activeTimeZone } : {}
    const weekday = new Intl.DateTimeFormat(locale, {
      ...formatOptions,
      weekday: 'long'
    }).format(now)
    const dateLine = new Intl.DateTimeFormat(locale, {
      ...formatOptions,
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(now)
    const timeParts = new Intl.DateTimeFormat(locale, {
      ...formatOptions,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(now)
    const hour = timeParts.find((p) => p.type === 'hour')?.value ?? '00'
    const minute = timeParts.find((p) => p.type === 'minute')?.value ?? '00'
    const second = timeParts.find((p) => p.type === 'second')?.value ?? '00'
    return {
      weekday,
      dateLine,
      hm: `${hour}:${minute}`,
      sec: second
    }
  }, [activeTimeZone, locale, now])

  const applyTimeZone = (nextTimeZone: string): void => {
    if (!isValidTimeZone(nextTimeZone)) return
    setSelectedTimeZone(nextTimeZone)
    setCustomTimeZone(nextTimeZone)
    writeStoredTimeZone(storageKey, nextTimeZone)
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col justify-center overflow-hidden px-3 py-2">
      <div
        className={cn(
          'pointer-events-none absolute inset-0 rounded-lg',
          'bg-[radial-gradient(120%_80%_at_50%_-20%,hsl(var(--primary)/0.14),transparent_55%)]',
          'opacity-90'
        )}
        aria-hidden
      />
      <div
        className={cn(
          'pointer-events-none absolute -bottom-6 -right-4 h-28 w-28 rounded-full',
          'bg-gradient-to-tr from-primary/20 to-transparent blur-2xl'
        )}
        aria-hidden
      />
      <div
        className={cn(
          'relative flex min-h-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg border border-border/60',
          'bg-gradient-to-b from-card/90 to-muted/25 px-2 py-2 shadow-sm backdrop-blur-[2px]'
        )}
      >
        {isWorldClock ? (
          <>
            <button
              ref={menuButtonRef}
              type="button"
              onClick={(): void => setIsTimeZoneMenuOpen((open) => !open)}
              aria-label={t('dashboard.clock.timeZoneMenuAria')}
              aria-haspopup="dialog"
              aria-expanded={isTimeZoneMenuOpen}
              className={cn(
                'absolute right-2 top-2 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full',
                'border border-border/70 bg-background/85 text-muted-foreground shadow-sm backdrop-blur',
                'transition hover:border-primary/50 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40'
              )}
            >
              <Settings className="h-3.5 w-3.5" aria-hidden />
            </button>
            {isTimeZoneMenuOpen ? (
              <div
                ref={menuRef}
                role="dialog"
                aria-label={t('dashboard.clock.timeZoneMenuTitle')}
                className={cn(
                  'absolute right-2 top-10 z-30 w-56 rounded-lg border border-border bg-popover p-2 text-popover-foreground',
                  'shadow-lg ring-1 ring-black/5'
                )}
              >
                <div className="mb-1 px-1 text-[11px] font-semibold text-foreground">
                  {t('dashboard.clock.timeZoneMenuTitle')}
                </div>
                <div className="grid max-h-40 gap-1 overflow-y-auto pr-1">
                  {COMMON_TIME_ZONES.map((zone) => {
                    const isSelected = activeTimeZone === zone.value
                    return (
                      <button
                        key={zone.value}
                        type="button"
                        onClick={(): void => {
                          applyTimeZone(zone.value)
                          setIsTimeZoneMenuOpen(false)
                        }}
                        className={cn(
                          'rounded-md px-2 py-1.5 text-left text-[11px] outline-none transition',
                          'hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground',
                          isSelected
                            ? 'bg-primary/10 font-medium text-foreground'
                            : 'text-muted-foreground'
                        )}
                      >
                        <span className="block truncate">{zone.label}</span>
                        <span className="block truncate text-[10px] opacity-75">{zone.value}</span>
                      </button>
                    )
                  })}
                </div>
                <label className="mt-2 block border-t border-border/70 pt-2">
                  <span className="mb-1 block px-1 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    {t('dashboard.clock.customTimeZone')}
                  </span>
                  <input
                    type="text"
                    value={customTimeZone}
                    onChange={(e): void => {
                      const value = e.currentTarget.value.trim()
                      setCustomTimeZone(value)
                      if (isValidTimeZone(value)) applyTimeZone(value)
                    }}
                    onBlur={(): void => {
                      if (isValidTimeZone(customTimeZone)) applyTimeZone(customTimeZone)
                    }}
                    placeholder={t('dashboard.clock.customPlaceholder')}
                    aria-label={t('dashboard.clock.customTimeZoneAria')}
                    className="h-8 w-full rounded-md border border-border bg-background px-2 text-[11px] text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring/40"
                    spellCheck={false}
                  />
                </label>
              </div>
            ) : null}
          </>
        ) : null}
        <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          <Clock className="h-3 w-3 shrink-0 text-primary/80" aria-hidden />
          <span className="truncate">{isWorldClock ? zoneLabel : formatted.weekday}</span>
        </div>
        {isWorldClock ? (
          <div className="max-w-full truncate text-center text-[10px] font-medium text-muted-foreground">
            {formatted.weekday} · {activeTimeZone}
          </div>
        ) : null}
        <div className="truncate text-center text-[11px] font-medium text-foreground/90">
          {formatted.dateLine}
        </div>
        <div
          className="mt-0.5 flex items-baseline justify-center tabular-nums tracking-tight text-foreground"
          aria-live="off"
          aria-label={t('dashboard.clock.timeAria', {
            label: zoneLabel,
            time: `${formatted.hm}:${formatted.sec}`
          })}
        >
          <span className="text-[clamp(1.5rem,4.5vw,2.35rem)] font-semibold leading-none">
            {formatted.hm}
          </span>
          <span className="text-[clamp(0.95rem,2.8vw,1.35rem)] font-medium leading-none text-muted-foreground">
            :{formatted.sec}
          </span>
        </div>
      </div>
    </div>
  )
}
