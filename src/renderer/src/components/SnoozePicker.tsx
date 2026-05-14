import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Clock,
  Sunrise,
  Sunset,
  CalendarDays,
  CalendarClock,
  Timer
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SnoozePreset } from '@shared/types'

interface PresetItem {
  id: SnoozePreset
  label: string
  hint: string
  icon: React.ComponentType<{ className?: string }>
  compute: (now: Date) => Date | null
}

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
  // 1 = Montag, 0 = Sonntag
  const daysUntilMonday = day === 0 ? 1 : day === 1 ? 7 : 8 - day
  const target = setTime(addDays(now, daysUntilMonday), 8, 0)
  return target
}

const PRESETS: PresetItem[] = [
  {
    id: 'in-1-hour',
    label: 'In einer Stunde',
    hint: 'kurzer Aufschub',
    icon: Timer,
    compute: (now): Date => new Date(now.getTime() + 60 * 60 * 1000)
  },
  {
    id: 'in-3-hours',
    label: 'In drei Stunden',
    hint: 'lange Mittagspause',
    icon: Timer,
    compute: (now): Date => new Date(now.getTime() + 3 * 60 * 60 * 1000)
  },
  {
    id: 'this-evening',
    label: 'Heute Abend',
    hint: '18:00 Uhr',
    icon: Sunset,
    compute: (now): Date | null => {
      const target = setTime(now, 18, 0)
      if (target.getTime() <= now.getTime() + 5 * 60 * 1000) return null
      return target
    }
  },
  {
    id: 'tomorrow-morning',
    label: 'Morgen frueh',
    hint: 'morgen 08:00',
    icon: Sunrise,
    compute: (now): Date => setTime(addDays(now, 1), 8, 0)
  },
  {
    id: 'tomorrow-evening',
    label: 'Morgen Abend',
    hint: 'morgen 18:00',
    icon: Sunset,
    compute: (now): Date => setTime(addDays(now, 1), 18, 0)
  },
  {
    id: 'next-monday',
    label: 'Naechste Woche',
    hint: 'Montag 08:00',
    icon: CalendarDays,
    compute: (now): Date => nextMondayMorning(now)
  }
]

export interface SnoozePickerProps {
  /** Wenn null, ist der Picker geschlossen. */
  anchorPosition: { x: number; y: number } | null
  /** Aktueller Snooze-Zeitpunkt (falls die Mail bereits gesnoozt ist). */
  currentSnoozeIso?: string | null
  onClose: () => void
  onSelect: (wakeAtIso: string, preset: SnoozePreset) => void
  onClear?: () => void
}

export function SnoozePicker({
  anchorPosition,
  currentSnoozeIso,
  onClose,
  onSelect,
  onClear
}: SnoozePickerProps): JSX.Element | null {
  const ref = useRef<HTMLDivElement>(null)
  const [customValue, setCustomValue] = useState<string>('')
  const now = useMemo(() => new Date(), [anchorPosition])
  const open = anchorPosition != null

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent): void {
      if (!ref.current) return
      if (!ref.current.contains(e.target as Node)) onClose()
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey, true)
    return (): void => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open, onClose])

  if (!open || !anchorPosition) return null

  function selectPreset(item: PresetItem): void {
    const target = item.compute(new Date())
    if (!target) return
    onSelect(target.toISOString(), item.id)
    onClose()
  }

  function selectCustom(): void {
    if (!customValue) return
    const target = new Date(customValue)
    if (Number.isNaN(target.getTime())) return
    if (target.getTime() < Date.now()) return
    onSelect(target.toISOString(), 'custom')
    onClose()
  }

  const currentLabel = currentSnoozeIso
    ? new Date(currentSnoozeIso).toLocaleString('de-DE', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })
    : null

  const style: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(window.innerWidth - 280, Math.max(8, anchorPosition.x)),
    top: Math.min(window.innerHeight - 380, Math.max(8, anchorPosition.y)),
    zIndex: 60
  }

  return (
    <div
      ref={ref}
      style={style}
      className="w-72 overflow-hidden rounded-lg border border-border bg-popover shadow-xl"
    >
      <div className="border-b border-border bg-secondary/40 px-3 py-2 text-[11px] font-medium text-muted-foreground">
        {currentLabel ? (
          <span>
            Aktuell gesnoozt bis <span className="text-foreground">{currentLabel}</span>
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <Clock className="h-3 w-3" /> Snooze - wann zurueck?
          </span>
        )}
      </div>
      <ul className="divide-y divide-border/40">
        {PRESETS.map((p) => {
          const target = p.compute(now)
          const disabled = target === null
          const targetLabel = target
            ? target.toLocaleString('de-DE', {
                weekday: 'short',
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
              })
            : 'nicht moeglich'
          return (
            <li key={p.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={(): void => selectPreset(p)}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors',
                  disabled
                    ? 'cursor-not-allowed text-muted-foreground/60'
                    : 'text-foreground hover:bg-secondary/60'
                )}
              >
                <p.icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate">
                  <span className="block font-medium">{p.label}</span>
                  <span className="block text-[10px] text-muted-foreground">{p.hint}</span>
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                  {targetLabel}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <div className="border-t border-border bg-card/40 p-2">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <CalendarClock className="h-3 w-3" /> Benutzerdefiniert
        </div>
        <div className="mt-1.5 flex items-center gap-1.5">
          <input
            type="datetime-local"
            value={customValue}
            onChange={(e): void => setCustomValue(e.target.value)}
            className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-ring"
          />
          <button
            type="button"
            onClick={selectCustom}
            disabled={!customValue}
            className={cn(
              'rounded px-2 py-1 text-xs font-semibold transition-colors',
              customValue
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'bg-secondary text-muted-foreground/60'
            )}
          >
            OK
          </button>
        </div>
      </div>

      {currentSnoozeIso && onClear && (
        <div className="border-t border-border bg-card/40 px-2 py-1.5">
          <button
            type="button"
            onClick={(): void => {
              onClear()
              onClose()
            }}
            className="w-full rounded px-2 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
          >
            Snooze aufheben
          </button>
        </div>
      )}
    </div>
  )
}
