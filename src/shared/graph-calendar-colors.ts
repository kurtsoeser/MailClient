/**
 * Microsoft Graph: calendar.color (calendarColor) und calendar.hexColor.
 * hexColor ist die in Outlook/365 gesetzte Farbe; fehlt sie, nutzen wir die Enum-Zuordnung.
 * @see https://learn.microsoft.com/en-us/graph/api/resources/calendar
 */

/** Typische Outlook-Web-Farben fuer calendarColor (ohne explizites hexColor). */
const CALENDAR_COLOR_ENUM_TO_HEX: Record<string, string> = {
  lightBlue: '#4A86E8',
  lightGreen: '#0F9D58',
  lightOrange: '#F4511E',
  lightGray: '#9E9E9E',
  lightYellow: '#F4B400',
  lightTeal: '#0097A7',
  lightPink: '#E91E63',
  lightBrown: '#795548',
  lightRed: '#DB4437',
  lightMagenta: '#AB47BC',
  auto: '',
  maxColor: ''
}

export function normalizeGraphHexColor(raw: string | null | undefined): string | null {
  if (raw == null || typeof raw !== 'string') return null
  const t = raw.trim()
  if (!t) return null
  if (/^#[0-9A-Fa-f]{6}$/i.test(t)) return t.slice(0, 7)
  if (/^[0-9A-Fa-f]{6}$/i.test(t)) return `#${t.slice(0, 6)}`
  if (/^[0-9A-Fa-f]{3}$/i.test(t)) {
    const x = t.slice(0, 3)
    return `#${x[0]}${x[0]}${x[1]}${x[1]}${x[2]}${x[2]}`.toUpperCase()
  }
  return null
}

export function graphCalendarColorToDisplayHex(
  hexColor: string | null | undefined,
  colorEnum: string | null | undefined
): string | null {
  const fromHex = normalizeGraphHexColor(hexColor)
  if (fromHex) return fromHex
  const key = (colorEnum ?? 'auto').trim()
  if (!key || key === 'auto' || key === 'maxColor') return null
  return CALENDAR_COLOR_ENUM_TO_HEX[key] ?? null
}

/** Einheitliche Anzeigefarbe fuer Sidebar, Termine und Farbmenue. */
export function resolveCalendarDisplayHex(cal: {
  hexColor?: string | null
  color?: string | null
  displayColorOverrideHex?: string | null
}): string | null {
  const override = normalizeGraphHexColor(cal.displayColorOverrideHex)
  if (override) return override
  return graphCalendarColorToDisplayHex(cal.hexColor, cal.color)
}

/** Graph `calendar.color` (PATCH): nur von Microsoft dokumentierte `calendarColor`-Werte (kein `lightMagenta` o. a.). */
export const GRAPH_CALENDAR_COLOR_PRESET_IDS = [
  'auto',
  'lightBlue',
  'lightGreen',
  'lightOrange',
  'lightGray',
  'lightYellow',
  'lightTeal',
  'lightPink',
  'lightBrown',
  'lightRed'
] as const

export type GraphCalendarColorPresetId = (typeof GRAPH_CALENDAR_COLOR_PRESET_IDS)[number]

export function isGraphCalendarColorPreset(value: string): value is GraphCalendarColorPresetId {
  return (GRAPH_CALENDAR_COLOR_PRESET_IDS as readonly string[]).includes(value)
}

export const GRAPH_CALENDAR_COLOR_PRESET_LABELS_DE: Record<GraphCalendarColorPresetId, string> = {
  auto: 'Automatisch',
  lightBlue: 'Hellblau',
  lightGreen: 'Hellgruen',
  lightOrange: 'Hellorange',
  lightGray: 'Hellgrau',
  lightYellow: 'Hellgelb',
  lightTeal: 'Hellpetrol',
  lightPink: 'Hellrosa',
  lightBrown: 'Hellbraun',
  lightRed: 'Hellrot'
}
