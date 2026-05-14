import { useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { de, enUS } from 'date-fns/locale'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'

import { cn } from '@/lib/utils'
import { fetchOpenMeteoForecast, type OpenMeteoForecastDay } from '@/lib/open-meteo-weather'
import { requestOpenAccountSettings } from '@/lib/open-account-settings'

function weatherCodeLabelKey(code: number): string {
  if (code === 0) return 'clear'
  if (code >= 1 && code <= 3) return 'partly'
  if (code === 45 || code === 48) return 'fog'
  if (code >= 51 && code <= 57) return 'drizzle'
  if (code >= 61 && code <= 67) return 'rain'
  if (code >= 71 && code <= 77) return 'snow'
  if (code >= 80 && code <= 82) return 'showers'
  if (code >= 95) return 'storm'
  return 'unknown'
}

export interface DashboardWeatherTileProps {
  latitude: number | null
  longitude: number | null
  locationName: string | null
  calendarTimeZone: string | null
}

export function DashboardWeatherTile({
  latitude,
  longitude,
  locationName,
  calendarTimeZone
}: DashboardWeatherTileProps): JSX.Element {
  const { t, i18n } = useTranslation()
  const dfLocale = i18n.language.startsWith('de') ? de : enUS
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [daily, setDaily] = useState<OpenMeteoForecastDay[]>([])
  const [currentTemp, setCurrentTemp] = useState<number | null>(null)
  const [currentCode, setCurrentCode] = useState<number>(0)
  const [currentHum, setCurrentHum] = useState<number | null>(null)
  const [currentWind, setCurrentWind] = useState<number | null>(null)
  const [currentFeels, setCurrentFeels] = useState<number | null>(null)

  const hasCoords = latitude != null && longitude != null && Number.isFinite(latitude) && Number.isFinite(longitude)

  useEffect(() => {
    if (!hasCoords || latitude == null || longitude == null) {
      setDaily([])
      setCurrentTemp(null)
      setError(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    void fetchOpenMeteoForecast(latitude, longitude, calendarTimeZone)
      .then((d) => {
        if (cancelled) return
        setLoading(false)
        if (!d) {
          setError(t('dashboard.weather.loadError'))
          setDaily([])
          setCurrentTemp(null)
          return
        }
        setCurrentTemp(d.current.temperatureC)
        setCurrentCode(d.current.weatherCode)
        setCurrentHum(d.current.humidityPct)
        setCurrentWind(d.current.windKmh)
        setCurrentFeels(d.current.apparentTemperatureC)
        setDaily(d.daily.slice(0, 8))
      })
      .catch(() => {
        if (cancelled) return
        setLoading(false)
        setError(t('dashboard.weather.loadError'))
        setDaily([])
      })
    return (): void => {
      cancelled = true
    }
  }, [hasCoords, latitude, longitude, calendarTimeZone, t])

  const todayLabel = useMemo(() => {
    const first = daily[0]?.dateIso
    if (!first) return ''
    try {
      return format(parseISO(first), 'EEEE d. MMM', { locale: dfLocale })
    } catch {
      return first
    }
  }, [daily, dfLocale])

  if (!hasCoords) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-3 py-4 text-center">
        <p className="text-xs leading-relaxed text-muted-foreground">{t('dashboard.weather.configureHint')}</p>
        <button
          type="button"
          onClick={(): void => requestOpenAccountSettings({ tab: 'general' })}
          className="rounded-md border border-border bg-secondary/60 px-3 py-1.5 text-[11px] font-medium text-foreground hover:bg-secondary"
        >
          {t('dashboard.weather.openSettings')}
        </button>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border/50 px-3 py-2">
        {locationName ? (
          <div className="truncate text-[11px] font-medium text-foreground" title={locationName}>
            {locationName}
          </div>
        ) : null}
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t('dashboard.weather.todayHeading')}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            {t('dashboard.loading.generic')}
          </div>
        ) : error ? (
          <div className="py-4 text-center text-xs text-destructive">{error}</div>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-2">
              <span className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">
                {currentTemp != null ? `${Math.round(currentTemp)}°` : '—'}
              </span>
              <span className="pb-1 text-xs text-muted-foreground">
                {t(`dashboard.weather.codes.${weatherCodeLabelKey(currentCode)}`)}
              </span>
            </div>
            {currentFeels != null ? (
              <div className="mt-1 text-[11px] text-muted-foreground">
                {t('dashboard.weather.feelsLike', { temp: Math.round(currentFeels) })}
              </div>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
              {currentHum != null ? (
                <span>{t('dashboard.weather.humidity', { pct: Math.round(currentHum) })}</span>
              ) : null}
              {currentWind != null ? (
                <span>{t('dashboard.weather.wind', { kmh: Math.round(currentWind) })}</span>
              ) : null}
            </div>
            {todayLabel ? <div className="mt-2 text-[10px] text-muted-foreground/90">{todayLabel}</div> : null}

            <div className="mt-4 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t('dashboard.weather.weekHeading')}
            </div>
            <ul className="mt-1.5 space-y-1.5">
              {daily.slice(0, 7).map((d) => {
                let dayStr = d.dateIso
                try {
                  dayStr = format(parseISO(d.dateIso), 'EEE d.', { locale: dfLocale })
                } catch {
                  /* keep iso */
                }
                return (
                  <li
                    key={d.dateIso}
                    className={cn(
                      'flex items-center justify-between gap-2 rounded-md border border-transparent px-1.5 py-1',
                      'text-[11px]'
                    )}
                  >
                    <span className="min-w-0 shrink-0 text-muted-foreground">{dayStr}</span>
                    <span className="min-w-0 flex-1 truncate text-center text-[10px] text-muted-foreground/90">
                      {t(`dashboard.weather.codes.${weatherCodeLabelKey(d.weatherCode)}`)}
                    </span>
                    <span className="shrink-0 tabular-nums text-foreground/90">
                      {Math.round(d.tempMaxC)}° / {Math.round(d.tempMinC)}°
                    </span>
                  </li>
                )
              })}
            </ul>
            <p className="mt-3 text-[9px] text-muted-foreground/80">
              <a
                href="https://open-meteo.com"
                target="_blank"
                rel="noreferrer noopener"
                className="underline-offset-2 hover:underline"
              >
                {t('dashboard.weather.attribution')}
              </a>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
