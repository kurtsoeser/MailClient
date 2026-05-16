import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent
} from 'react'
import { Loader2, MapPin, Navigation } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import {
  reverseLocationSuggestion,
  searchLocationSuggestions,
  type LocationSuggestion
} from '@/lib/location-search'

export interface LocationAutocompleteInputProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  className?: string
  inputClassName?: string
}

const SEARCH_DEBOUNCE_MS = 380

export function LocationAutocompleteInput({
  value,
  onChange,
  disabled,
  className,
  inputClassName
}: LocationAutocompleteInputProps): JSX.Element {
  const { t, i18n } = useTranslation()
  const listboxId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value)
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [highlight, setHighlight] = useState(-1)
  const [geoAvailable, setGeoAvailable] = useState(false)
  const [geoLoading, setGeoLoading] = useState(false)
  const searchGenRef = useRef(0)

  useEffect(() => {
    setQuery(value)
  }, [value])

  useEffect(() => {
    setGeoAvailable(typeof navigator !== 'undefined' && 'geolocation' in navigator)
  }, [])

  useEffect(() => {
    if (!open) return
    function onDocMouseDown(e: MouseEvent): void {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
        setHighlight(-1)
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return (): void => document.removeEventListener('mousedown', onDocMouseDown)
  }, [open])

  useEffect(() => {
    if (!open) return
    const q = query.trim()
    if (q.length < 2) {
      setSuggestions([])
      setLoading(false)
      setError(null)
      return
    }

    const gen = ++searchGenRef.current
    setLoading(true)
    setError(null)
    const timer = window.setTimeout(() => {
      void searchLocationSuggestions(q, i18n.language)
        .then((rows) => {
          if (searchGenRef.current !== gen) return
          setSuggestions(rows)
          setHighlight(rows.length > 0 ? 0 : -1)
        })
        .catch((e) => {
          if (searchGenRef.current !== gen) return
          setSuggestions([])
          setError(e instanceof Error ? e.message : String(e))
        })
        .finally(() => {
          if (searchGenRef.current === gen) setLoading(false)
        })
    }, SEARCH_DEBOUNCE_MS)

    return (): void => clearTimeout(timer)
  }, [query, open, i18n.language])

  const pickSuggestion = useCallback(
    (s: LocationSuggestion): void => {
      onChange(s.label)
      setQuery(s.label)
      setOpen(false)
      setHighlight(-1)
      inputRef.current?.blur()
    },
    [onChange]
  )

  const useCurrentLocation = useCallback((): void => {
    if (!navigator.geolocation) return
    setGeoLoading(true)
    setError(null)
    navigator.geolocation.getCurrentPosition(
      (pos): void => {
        void reverseLocationSuggestion(
          pos.coords.latitude,
          pos.coords.longitude,
          i18n.language
        )
          .then((hit) => {
            if (hit) pickSuggestion(hit)
            else setError(t('calendar.eventDialog.locationSearchEmpty'))
          })
          .catch((e) => {
            setError(e instanceof Error ? e.message : String(e))
          })
          .finally(() => setGeoLoading(false))
      },
      (): void => {
        setGeoLoading(false)
        setError(t('calendar.eventDialog.locationGeoDenied'))
      },
      { enableHighAccuracy: false, timeout: 12_000, maximumAge: 60_000 }
    )
  }, [i18n.language, pickSuggestion, t])

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true)
      return
    }
    if (e.key === 'Escape') {
      setOpen(false)
      setHighlight(-1)
      return
    }
    if (!open || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => (h + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => (h <= 0 ? suggestions.length - 1 : h - 1))
    } else if (e.key === 'Enter' && highlight >= 0) {
      e.preventDefault()
      const s = suggestions[highlight]
      if (s) pickSuggestion(s)
    }
  }

  const showList = open && (loading || suggestions.length > 0 || error || query.trim().length >= 2)

  return (
    <div ref={rootRef} className={cn('relative min-w-0', className)}>
      <input
        ref={inputRef}
        type="text"
        value={query}
        disabled={disabled}
        role="combobox"
        aria-expanded={Boolean(showList)}
        aria-controls={showList ? listboxId : undefined}
        aria-autocomplete="list"
        placeholder={t('calendar.eventDialog.locationPlaceholder')}
        className={cn(
          'mt-0.5 w-full rounded-md border border-border/60 bg-secondary/20 px-2 py-1.5 text-[13px] text-foreground outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60',
          inputClassName
        )}
        onChange={(e): void => {
          const next = e.target.value
          setQuery(next)
          onChange(next)
          setOpen(true)
          setHighlight(-1)
        }}
        onFocus={(): void => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {showList ? (
        <div
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg"
        >
          {geoAvailable ? (
            <button
              type="button"
              disabled={disabled || geoLoading}
              className="flex w-full items-center gap-2 border-b border-border/80 px-3 py-2 text-left text-xs hover:bg-secondary/80 disabled:opacity-50"
              onMouseDown={(e): void => e.preventDefault()}
              onClick={(): void => useCurrentLocation()}
            >
              {geoLoading ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
              ) : (
                <Navigation className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className="font-medium">{t('calendar.eventDialog.locationCurrentPosition')}</span>
            </button>
          ) : null}
          <div className="max-h-[min(240px,40vh)] overflow-y-auto overflow-x-hidden py-1">
            {loading ? (
              <p className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t('calendar.eventDialog.locationSearchLoading')}
              </p>
            ) : null}
            {!loading && error ? (
              <p className="px-3 py-2 text-xs text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            {!loading && !error && suggestions.length === 0 && query.trim().length >= 2 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                {t('calendar.eventDialog.locationSearchEmpty')}
              </p>
            ) : null}
            {suggestions.map((s, i) => (
              <button
                key={`${s.label}-${s.latitude}-${s.longitude}-${i}`}
                type="button"
                role="option"
                aria-selected={highlight === i}
                className={cn(
                  'flex w-full min-w-0 items-start gap-2 px-3 py-2 text-left text-xs hover:bg-secondary/80',
                  highlight === i && 'bg-secondary/80'
                )}
                onMouseDown={(e): void => e.preventDefault()}
                onMouseEnter={(): void => setHighlight(i)}
                onClick={(): void => pickSuggestion(s)}
              >
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground">{s.primary}</span>
                  {s.secondary ? (
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {s.secondary}
                    </span>
                  ) : null}
                </span>
              </button>
            ))}
          </div>
          <p className="border-t border-border/80 px-2 py-1 text-[9px] leading-snug text-muted-foreground">
            {t('calendar.eventDialog.locationAttribution')}
          </p>
        </div>
      ) : null}
    </div>
  )
}
