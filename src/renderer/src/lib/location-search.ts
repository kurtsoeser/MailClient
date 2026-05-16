import type { LocationSearchLanguage, LocationSuggestion } from '@shared/types'

function languageFromI18n(lang: string): LocationSearchLanguage {
  return lang.startsWith('de') ? 'de' : 'en'
}

/** Adressvorschläge (Photon/OSM, kostenlos) — läuft im Main-Prozess wegen CSP. */
export async function searchLocationSuggestions(
  query: string,
  language: string
): Promise<LocationSuggestion[]> {
  const q = query.trim()
  if (q.length < 2) return []
  return window.mailClient.location.search(q, languageFromI18n(language))
}

export async function reverseLocationSuggestion(
  latitude: number,
  longitude: number,
  language: string
): Promise<LocationSuggestion | null> {
  return window.mailClient.location.reverse(latitude, longitude, languageFromI18n(language))
}

export type { LocationSuggestion }
