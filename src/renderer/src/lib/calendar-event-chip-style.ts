/**
 * FullCalendar-Terminkacheln: MS365-Kalenderfarbe (Hex) oder Konten-Tailwind-Farbe als RGB-Hintergrund.
 */

const TAILWIND_BG_TO_HEX: Record<string, string> = {
  'bg-blue-500': '#3b82f6',
  'bg-emerald-500': '#10b981',
  'bg-violet-500': '#8b5cf6',
  'bg-amber-500': '#f59e0b',
  'bg-rose-500': '#f43f5e',
  'bg-cyan-500': '#06b6d4',
  'bg-fuchsia-500': '#d946ef',
  'bg-teal-500': '#14b8a6',
  'bg-indigo-500': '#6366f1',
  'bg-orange-500': '#f97316',
  'bg-lime-600': '#65a30d',
  'bg-pink-500': '#ec4899'
}

export function tailwindAccountBgToHex(bgClass: string | null | undefined): string | null {
  if (!bgClass) return null
  return TAILWIND_BG_TO_HEX[bgClass] ?? null
}

function normalizeHex6(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null
  const t = raw.trim()
  if (/^#[0-9A-Fa-f]{6}$/i.test(t)) return t
  if (/^[0-9A-Fa-f]{6}$/i.test(t)) return `#${t}`
  return null
}

function contrastTextOnHex(bgHex: string): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(bgHex.trim())
  if (!m) return 'hsl(var(--primary-foreground))'
  const r = parseInt(m[1], 16)
  const g = parseInt(m[2], 16)
  const b = parseInt(m[3], 16)
  const yiq = (r * 299 + g * 587 + b * 114) / 1000
  return yiq >= 168 ? '#0f172a' : '#fafafa'
}

function darkenHex(hex: string, factor: number): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim())
  if (!m) return hex
  const clamp = (n: number): number => Math.max(0, Math.min(255, Math.round(n)))
  const mix = (c: number): number => clamp(c * (1 + factor))
  const r = mix(parseInt(m[1], 16))
  const g = mix(parseInt(m[2], 16))
  const b = mix(parseInt(m[3], 16))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

export function applyCalendarEventDomColors(
  el: HTMLElement,
  opts: { displayColorHex?: string | null; accountTailwindBgClass?: string | null }
): void {
  const fromMs = normalizeHex6(opts.displayColorHex ?? undefined)
  const fromAccount = tailwindAccountBgToHex(opts.accountTailwindBgClass ?? undefined)
  const fill = fromMs ?? fromAccount
  if (fill) {
    el.style.backgroundColor = fill
    el.style.borderColor = 'rgba(15, 23, 42, 0.18)'
    el.style.color = contrastTextOnHex(fill)
    el.style.borderLeftWidth = '4px'
    el.style.borderLeftStyle = 'solid'
    el.style.borderLeftColor = darkenHex(fill, -0.2)
    return
  }
  el.style.backgroundColor = ''
  el.style.borderColor = ''
  el.style.color = ''
  el.style.borderLeft = '4px solid hsl(var(--primary))'
}
