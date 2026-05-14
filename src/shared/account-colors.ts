/**
 * Kontofarben: gespeichert als Tailwind-Hintergrundklasse (z. B. `bg-blue-500`)
 * oder als Hex (`#rrggbb`). Muss mit `accountColorToCssBackground` im Renderer uebereinstimmen.
 */
export const ACCOUNT_COLOR_PRESET_OPTIONS = [
  { value: 'bg-blue-500', label: 'Blau' },
  { value: 'bg-emerald-500', label: 'Smaragd' },
  { value: 'bg-violet-500', label: 'Violett' },
  { value: 'bg-amber-500', label: 'Bernstein' },
  { value: 'bg-rose-500', label: 'Rose' },
  { value: 'bg-cyan-500', label: 'Cyan' },
  { value: 'bg-fuchsia-500', label: 'Fuchsia' },
  { value: 'bg-teal-500', label: 'Petrol' },
  { value: 'bg-indigo-500', label: 'Indigo' },
  { value: 'bg-orange-500', label: 'Orange' },
  { value: 'bg-lime-600', label: 'Lime' },
  { value: 'bg-pink-500', label: 'Pink' }
] as const

export type AccountColorPresetClass = (typeof ACCOUNT_COLOR_PRESET_OPTIONS)[number]['value']

export const ACCOUNT_COLOR_PRESET_CLASSES: readonly AccountColorPresetClass[] =
  ACCOUNT_COLOR_PRESET_OPTIONS.map((o) => o.value)

const PRESET_SET = new Set<string>(ACCOUNT_COLOR_PRESET_CLASSES as unknown as string[])

export function isPresetAccountColorClass(s: string): boolean {
  return PRESET_SET.has(s.trim())
}

/** `#rgb` oder `#rrggbb` (ohne Alpha). */
export function expandShortHex(hex: string): string | null {
  const v = hex.trim()
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v)
  if (!m) return null
  const g = m[1]!
  if (g.length === 3) {
    return `#${g[0]!}${g[0]!}${g[1]!}${g[1]!}${g[2]!}${g[2]!}`.toLowerCase()
  }
  return `#${g.toLowerCase()}`
}

export function normalizeStoredAccountColor(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  if (isPresetAccountColorClass(t)) return t
  return expandShortHex(t)
}
