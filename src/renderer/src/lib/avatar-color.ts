/**
 * Deterministische Avatar-Farbe aus einer E-Mail / einem Namen. Wir
 * waehlen aus einer kuratierten Palette, damit die Farben in beiden
 * Themes (Light/Dark) gut aussehen und genug Kontrast zu weisser
 * Schrift haben.
 */

const AVATAR_PALETTE = [
  { bg: 'bg-blue-500', text: 'text-white' },
  { bg: 'bg-emerald-500', text: 'text-white' },
  { bg: 'bg-violet-500', text: 'text-white' },
  { bg: 'bg-amber-500', text: 'text-white' },
  { bg: 'bg-rose-500', text: 'text-white' },
  { bg: 'bg-cyan-500', text: 'text-white' },
  { bg: 'bg-fuchsia-500', text: 'text-white' },
  { bg: 'bg-teal-500', text: 'text-white' },
  { bg: 'bg-indigo-500', text: 'text-white' },
  { bg: 'bg-orange-500', text: 'text-white' },
  { bg: 'bg-lime-600', text: 'text-white' },
  { bg: 'bg-pink-500', text: 'text-white' }
] as const

export interface AvatarColor {
  bg: string
  text: string
}

function hashString(input: string): number {
  let h = 0
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

export function avatarColorFor(seed: string | null | undefined): AvatarColor {
  const key = (seed ?? '').trim().toLowerCase()
  if (!key) return AVATAR_PALETTE[0]!
  return AVATAR_PALETTE[hashString(key) % AVATAR_PALETTE.length]!
}

/**
 * Initials aus einem Namen oder einer E-Mail-Adresse extrahieren.
 * Max 2 Zeichen, immer uppercase. Bei Adressen wird der Local-Part
 * verwendet.
 */
export function initialsFor(name: string | null | undefined, email?: string | null): string {
  const raw = (name ?? '').trim() || (email ?? '').split('@')[0] || ''
  if (!raw) return '?'
  const parts = raw.split(/\s+|[._-]+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
  }
  return raw.slice(0, 2).toUpperCase()
}

/**
 * Wandelt eine Tailwind-Background-Klasse (`bg-blue-500`) in eine
 * Ring-Klasse (`ring-blue-500`) um, damit Account-Farben als
 * `ring-1 ring-blue-500` um Avatare gesetzt werden koennen.
 *
 * Hinweis: Tailwind muss die finale Klasse im Source-Code statisch
 * sehen koennen. Wir halten daher ein explizites Mapping fuer alle in
 * `src/main/accounts.ts` definierten Account-Farben (sowie die
 * AVATAR_PALETTE oben).
 */
export function bgToRingClass(bg: string | null | undefined): string {
  switch (bg) {
    case 'bg-blue-500':
      return 'ring-blue-500'
    case 'bg-emerald-500':
      return 'ring-emerald-500'
    case 'bg-violet-500':
      return 'ring-violet-500'
    case 'bg-amber-500':
      return 'ring-amber-500'
    case 'bg-rose-500':
      return 'ring-rose-500'
    case 'bg-cyan-500':
      return 'ring-cyan-500'
    case 'bg-fuchsia-500':
      return 'ring-fuchsia-500'
    case 'bg-teal-500':
      return 'ring-teal-500'
    case 'bg-indigo-500':
      return 'ring-indigo-500'
    case 'bg-orange-500':
      return 'ring-orange-500'
    case 'bg-lime-600':
      return 'ring-lime-600'
    case 'bg-pink-500':
      return 'ring-pink-500'
    default:
      return ''
  }
}

/**
 * Wandelt eine Tailwind-Background-Klasse (`bg-blue-500`) in einen
 * Pseudo-Element-Background-Selector (`before:bg-blue-500`) um. Wird
 * fuer den vertikalen Account-Farb-Strich in der Sidebar verwendet.
 */
export function bgToBeforeBgClass(bg: string | null | undefined): string {
  switch (bg) {
    case 'bg-blue-500':
      return 'before:bg-blue-500'
    case 'bg-emerald-500':
      return 'before:bg-emerald-500'
    case 'bg-violet-500':
      return 'before:bg-violet-500'
    case 'bg-amber-500':
      return 'before:bg-amber-500'
    case 'bg-rose-500':
      return 'before:bg-rose-500'
    case 'bg-cyan-500':
      return 'before:bg-cyan-500'
    case 'bg-fuchsia-500':
      return 'before:bg-fuchsia-500'
    case 'bg-teal-500':
      return 'before:bg-teal-500'
    case 'bg-indigo-500':
      return 'before:bg-indigo-500'
    case 'bg-orange-500':
      return 'before:bg-orange-500'
    case 'bg-lime-600':
      return 'before:bg-lime-600'
    case 'bg-pink-500':
      return 'before:bg-pink-500'
    default:
      return 'before:bg-border'
  }
}

/**
 * Kontenfarbe (Tailwind `bg-*-500` aus accounts.ts / Avatar-Palette oder echtes CSS)
 * als Wert fuer `element.style.backgroundColor` (z. B. FullCalendar-Events).
 */
export function accountColorToCssBackground(input: string | null | undefined): string | null {
  const v = (input ?? '').trim()
  if (!v) return null
  if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v)) return v
  if (/^hsla?\(/i.test(v) || /^rgba?\(/i.test(v)) return v
  switch (v) {
    case 'bg-blue-500':
      return '#3b82f6'
    case 'bg-emerald-500':
      return '#10b981'
    case 'bg-violet-500':
      return '#8b5cf6'
    case 'bg-amber-500':
      return '#f59e0b'
    case 'bg-rose-500':
      return '#f43f5e'
    case 'bg-cyan-500':
      return '#06b6d4'
    case 'bg-fuchsia-500':
      return '#d946ef'
    case 'bg-teal-500':
      return '#14b8a6'
    case 'bg-indigo-500':
      return '#6366f1'
    case 'bg-orange-500':
      return '#f97316'
    case 'bg-lime-600':
      return '#65a30d'
    case 'bg-pink-500':
      return '#ec4899'
    default:
      return null
  }
}

/** CSS-Hintergrundfarbe fuer Kontokennungen (Preset oder Hex); Fallback neutral. */
export function resolvedAccountColorCss(input: string | null | undefined): string {
  return accountColorToCssBackground(input) ?? '#64748b'
}
