/** Vorschlag aus OSM/Photon-Geocoding (kostenlos, kein API-Key). */
export interface LocationSuggestion {
  /** Vollständige Zeile für Kalender/Ort-Feld. */
  label: string
  /** Kurztitel in der Liste. */
  primary: string
  /** Unterzeile (Adresse). */
  secondary: string
  latitude: number
  longitude: number
}

export type LocationSearchLanguage = 'de' | 'en'

export type PhotonProperties = {
  name?: string
  street?: string
  housenumber?: string
  postcode?: string
  city?: string
  town?: string
  village?: string
  municipality?: string
  state?: string
  country?: string
  countrycode?: string
  district?: string
  locality?: string
}

export function formatPhotonLocation(properties: PhotonProperties): LocationSuggestion | null {
  const name = properties.name?.trim() ?? ''
  const street = properties.street?.trim() ?? ''
  const housenumber = properties.housenumber?.trim() ?? ''
  const streetLine = [street, housenumber].filter(Boolean).join(' ').trim()

  const locality =
    properties.city?.trim() ||
    properties.town?.trim() ||
    properties.village?.trim() ||
    properties.municipality?.trim() ||
    properties.locality?.trim() ||
    ''

  const regionLine = [
    properties.postcode?.trim(),
    locality,
    properties.state?.trim(),
    properties.country?.trim()
  ]
    .filter(Boolean)
    .join(', ')

  let primary = name || streetLine || locality
  if (!primary) return null

  const secondaryParts: string[] = []
  if (streetLine && streetLine !== primary && !primary.includes(streetLine)) {
    secondaryParts.push(streetLine)
  }
  if (regionLine) secondaryParts.push(regionLine)

  const secondary = secondaryParts.join(' · ')
  const label = secondary ? `${primary}, ${secondary}` : primary

  return {
    label,
    primary,
    secondary,
    latitude: 0,
    longitude: 0
  }
}
