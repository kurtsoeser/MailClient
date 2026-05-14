import { create } from 'zustand'

export type ThemeMode = 'system' | 'light' | 'dark'
export type EffectiveTheme = 'light' | 'dark'

export type DarkPalette = 'default' | 'midnight' | 'nord' | 'graphite'

export type AccentName =
  | 'blue'
  | 'indigo'
  | 'violet'
  | 'pink'
  | 'rose'
  | 'amber'
  | 'emerald'
  | 'slate'

const STORAGE_MODE_KEY = 'mailclient.theme'
const STORAGE_ACCENT_KEY = 'mailclient.themeAccent'
const STORAGE_DARK_PALETTE = 'mailclient.darkPalette'

const PALETTE_CLASSES = ['palette-midnight', 'palette-nord', 'palette-graphite'] as const

/**
 * HSL-Werte fuer die acht waehlbaren Akzentfarben. Funktionieren in
 * beiden Themes (Light/Dark) ausreichend, kleine Helligkeits-Anpassung
 * koennte spaeter pro Theme erfolgen.
 */
const ACCENT_HSL: Record<AccentName, string> = {
  blue: '217 91% 60%',
  indigo: '235 75% 65%',
  violet: '262 70% 65%',
  pink: '330 75% 62%',
  rose: '350 75% 60%',
  amber: '32 92% 55%',
  emerald: '152 60% 48%',
  slate: '215 12% 55%'
}

export const ACCENT_LIST: { id: AccentName; label: string }[] = [
  { id: 'blue', label: 'Blau' },
  { id: 'indigo', label: 'Indigo' },
  { id: 'violet', label: 'Violett' },
  { id: 'pink', label: 'Pink' },
  { id: 'rose', label: 'Rosé' },
  { id: 'amber', label: 'Bernstein' },
  { id: 'emerald', label: 'Smaragd' },
  { id: 'slate', label: 'Schiefer' }
]

export function accentHsl(name: AccentName): string {
  return ACCENT_HSL[name]
}

interface ThemeState {
  mode: ThemeMode
  effective: EffectiveTheme
  accent: AccentName
  darkPalette: DarkPalette

  setMode: (mode: ThemeMode) => void
  setAccent: (accent: AccentName) => void
  setDarkPalette: (palette: DarkPalette) => void

  /**
   * Liest die OS-Praeferenz und persistiert nichts. Wird beim Start und
   * bei OS-Theme-Wechseln aufgerufen, sofern `mode === 'system'`.
   */
  syncFromSystem: () => void
}

function readStoredMode(): ThemeMode {
  try {
    const v = window.localStorage.getItem(STORAGE_MODE_KEY)
    if (v === 'system' || v === 'light' || v === 'dark') return v
  } catch {
    // localStorage nicht verfuegbar (z.B. private mode) – Default
  }
  return 'system'
}

function readStoredDarkPalette(): DarkPalette {
  try {
    const v = window.localStorage.getItem(STORAGE_DARK_PALETTE) as DarkPalette | null
    if (v === 'midnight' || v === 'nord' || v === 'graphite' || v === 'default') return v
  } catch {
    // ignore
  }
  return 'default'
}

function persistDarkPalette(palette: DarkPalette): void {
  try {
    window.localStorage.setItem(STORAGE_DARK_PALETTE, palette)
  } catch {
    // ignore
  }
}

function applyDarkPaletteClasses(effective: EffectiveTheme, palette: DarkPalette): void {
  const root = document.documentElement
  for (const c of PALETTE_CLASSES) root.classList.remove(c)
  if (effective !== 'dark' || palette === 'default') return
  if (palette === 'midnight') root.classList.add('palette-midnight')
  if (palette === 'nord') root.classList.add('palette-nord')
  if (palette === 'graphite') root.classList.add('palette-graphite')
}

function readStoredAccent(): AccentName {
  try {
    const v = window.localStorage.getItem(STORAGE_ACCENT_KEY) as AccentName | null
    if (v && v in ACCENT_HSL) return v
  } catch {
    // ignore
  }
  return 'blue'
}

function persistMode(mode: ThemeMode): void {
  try {
    window.localStorage.setItem(STORAGE_MODE_KEY, mode)
  } catch {
    // ignore
  }
}

function persistAccent(accent: AccentName): void {
  try {
    window.localStorage.setItem(STORAGE_ACCENT_KEY, accent)
  } catch {
    // ignore
  }
}

function systemPrefersDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches === true
}

function resolveEffective(mode: ThemeMode): EffectiveTheme {
  if (mode === 'system') return systemPrefersDark() ? 'dark' : 'light'
  return mode
}

function applyTheme(theme: EffectiveTheme, palette: DarkPalette): void {
  const root = document.documentElement
  if (theme === 'dark') root.classList.add('dark')
  else root.classList.remove('dark')
  root.style.colorScheme = theme
  applyDarkPaletteClasses(theme, palette)
}

function applyAccent(name: AccentName): void {
  const root = document.documentElement
  const hsl = ACCENT_HSL[name]
  // Wir ueberschreiben sowohl --primary (Buttons, aktive Modes) als
  // auch --ring (Focus-Outline) und --status-unread (Ungelesen-Dot +
  // Mail-Item-Akzent), damit die Akzentfarbe in der gesamten UI greift.
  root.style.setProperty('--primary', hsl)
  root.style.setProperty('--ring', hsl)
  root.style.setProperty('--status-unread', hsl)
}

const initialMode = readStoredMode()
const initialEffective = resolveEffective(initialMode)
const initialAccent = readStoredAccent()
const initialDarkPalette = readStoredDarkPalette()
applyTheme(initialEffective, initialDarkPalette)
applyAccent(initialAccent)

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: initialMode,
  effective: initialEffective,
  accent: initialAccent,
  darkPalette: initialDarkPalette,

  setMode(mode): void {
    persistMode(mode)
    const effective = resolveEffective(mode)
    applyTheme(effective, get().darkPalette)
    set({ mode, effective })
  },

  setAccent(accent): void {
    persistAccent(accent)
    applyAccent(accent)
    set({ accent })
  },

  setDarkPalette(palette): void {
    persistDarkPalette(palette)
    applyDarkPaletteClasses(get().effective, palette)
    set({ darkPalette: palette })
  },

  syncFromSystem(): void {
    if (get().mode !== 'system') return
    const effective = resolveEffective('system')
    applyTheme(effective, get().darkPalette)
    set({ effective })
  }
}))

/**
 * Listener fuer OS-Theme-Wechsel registrieren. Wird einmal beim
 * Module-Load aufgerufen – `matchMedia` haelt den Listener am Leben,
 * solange das Fenster existiert.
 */
function installSystemListener(): void {
  if (!window.matchMedia) return
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = (): void => useThemeStore.getState().syncFromSystem()
  if (typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', handler)
  } else {
    // Aelteres Safari-API
    const legacy = mq as unknown as {
      addListener?: (h: (e: MediaQueryListEvent) => void) => void
    }
    if (typeof legacy.addListener === 'function') legacy.addListener(handler)
  }
}

installSystemListener()
