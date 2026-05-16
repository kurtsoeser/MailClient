import { normalizeGraphHexColor } from '@shared/graph-calendar-colors'

/** Voreingestellte Farben für Lucide-Icons (Outlook-ähnliche Palette). */
export const ENTITY_ICON_COLOR_PRESETS = [
  '#4A86E8',
  '#0F9D58',
  '#F4511E',
  '#9E9E9E',
  '#F4B400',
  '#0097A7',
  '#E91E63',
  '#795548',
  '#DB4437',
  '#AB47BC'
] as const

export type EntityIconColorPreset = (typeof ENTITY_ICON_COLOR_PRESETS)[number]

export function normalizeEntityIconColor(value: string | null | undefined): string | null {
  if (value == null) return null
  return normalizeGraphHexColor(value)
}

export function resolveEntityIconColor(iconColor: string | null | undefined): string | null {
  if (!iconColor?.trim()) return null
  const hex = iconColor.trim()
  if (/^#[0-9A-Fa-f]{6}$/i.test(hex)) return hex
  return null
}
