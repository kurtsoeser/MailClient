/**
 * Microsoft Graph nutzt fuer dateTimeTimeZone haeufig Windows-Zeitzonen-IDs.
 * Luxon/IANA brauchen Olson-Namen. Erweiterbare Zuordnung.
 * @see https://learn.microsoft.com/en-us/graph/api/resources/datetimetimezone
 */

/** Windows-Zonenname (Graph) -> IANA (ohne doppelte Keys) */
export const WINDOWS_TO_IANA: Record<string, string> = {
  UTC: 'UTC',
  'UTC+00:00': 'UTC',
  GMT: 'UTC',
  'GMT Standard Time': 'Europe/London',
  'W. Europe Standard Time': 'Europe/Berlin',
  'Central Europe Standard Time': 'Europe/Prague',
  'Central European Standard Time': 'Europe/Warsaw',
  'Romance Standard Time': 'Europe/Paris',
  'W. Central Europe Standard Time': 'Europe/Budapest',
  'E. Europe Standard Time': 'Europe/Chisinau',
  'FLE Standard Time': 'Europe/Helsinki',
  'GTB Standard Time': 'Europe/Athens',
  'Turkey Standard Time': 'Europe/Istanbul',
  'Russian Standard Time': 'Europe/Moscow',
  'Belarus Standard Time': 'Europe/Minsk',
  'Kaliningrad Standard Time': 'Europe/Kaliningrad',
  'Volgograd Standard Time': 'Europe/Volgograd',
  'Saratov Standard Time': 'Europe/Saratov',
  'Astrakhan Standard Time': 'Europe/Astrakhan',
  'Russia Time Zone 3': 'Europe/Samara',
  'Russia Time Zone 10': 'Asia/Srednekolymsk',
  'Russia Time Zone 11': 'Asia/Kamchatka',
  'SA Pacific Standard Time': 'America/Bogota',
  'Eastern Standard Time': 'America/New_York',
  'US Eastern Standard Time': 'America/Indianapolis',
  'Central Standard Time': 'America/Chicago',
  'Mountain Standard Time': 'America/Denver',
  'Pacific Standard Time': 'America/Los_Angeles',
  'Atlantic Standard Time': 'America/Halifax',
  'China Standard Time': 'Asia/Shanghai',
  'Tokyo Standard Time': 'Asia/Tokyo',
  'Singapore Standard Time': 'Asia/Singapore',
  'Taipei Standard Time': 'Asia/Taipei',
  'Korea Standard Time': 'Asia/Seoul',
  'India Standard Time': 'Asia/Kolkata',
  'West Asia Standard Time': 'Asia/Tashkent',
  'Central Asia Standard Time': 'Asia/Almaty',
  'Ekaterinburg Standard Time': 'Asia/Yekaterinburg',
  'N. Central Asia Standard Time': 'Asia/Novosibirsk',
  'North Asia Standard Time': 'Asia/Krasnoyarsk',
  'North Asia East Standard Time': 'Asia/Irkutsk',
  'Transbaikal Standard Time': 'Asia/Chita',
  'W. Mongolia Standard Time': 'Asia/Hovd',
  'Ulaanbaatar Standard Time': 'Asia/Ulaanbaatar',
  'Magadan Standard Time': 'Asia/Magadan',
  'Vladivostok Standard Time': 'Asia/Vladivostok',
  'Yakutsk Standard Time': 'Asia/Yakutsk',
  'AUS Eastern Standard Time': 'Australia/Sydney',
  'E. Australia Standard Time': 'Australia/Brisbane',
  'AUS Central Standard Time': 'Australia/Adelaide',
  'Cen. Australia Standard Time': 'Australia/Darwin',
  'W. Australia Standard Time': 'Australia/Perth',
  'Aus Central W. Standard Time': 'Australia/Eucla',
  'Tasmania Standard Time': 'Australia/Hobart',
  'New Zealand Standard Time': 'Pacific/Auckland',
  'South Africa Standard Time': 'Africa/Johannesburg',
  'Arabian Standard Time': 'Asia/Dubai',
  'Arab Standard Time': 'Asia/Riyadh',
  'Israel Standard Time': 'Asia/Jerusalem',
  'Jordan Standard Time': 'Asia/Amman',
  'Syria Standard Time': 'Asia/Damascus',
  'Iran Standard Time': 'Asia/Tehran',
  'Afghanistan Standard Time': 'Asia/Kabul',
  'Nepal Standard Time': 'Asia/Kathmandu',
  'Central Brazilian Standard Time': 'America/Campo_Grande',
  'Argentina Standard Time': 'America/Buenos_Aires',
  'E. South America Standard Time': 'America/Sao_Paulo',
  'Greenland Standard Time': 'America/Nuuk',
  'Azores Standard Time': 'Atlantic/Azores',
  'Mid-Atlantic Standard Time': 'Atlantic/South_Georgia',
  'Cape Verde Standard Time': 'Atlantic/Cape_Verde',
  'Morocco Standard Time': 'Africa/Casablanca',
  'Namibia Standard Time': 'Africa/Windhoek',
  'South Sudan Standard Time': 'Africa/Juba',
  'Sudan Standard Time': 'Africa/Khartoum',
  'Libya Standard Time': 'Africa/Tripoli',
  'Tunisia Standard Time': 'Africa/Tunis',
  'Central America Standard Time': 'America/Guatemala',
  'SA Western Standard Time': 'America/La_Paz',
  'Paraguay Standard Time': 'America/Asuncion',
  'Montevideo Standard Time': 'America/Montevideo',
  'Venezuela Standard Time': 'America/Caracas',
  'Pacific SA Standard Time': 'America/Santiago',
  'Canada Central Standard Time': 'America/Regina',
  'Haiti Standard Time': 'America/Port-au-Prince',
  'Cuba Standard Time': 'America/Havana',
  'Bahia Standard Time': 'America/Bahia',
  'Tocantins Standard Time': 'America/Araguaina',
  'Magallanes Standard Time': 'America/Punta_Arenas',
  'Saint Pierre Standard Time': 'America/Miquelon',
  'Aleutian Standard Time': 'America/Adak',
  'Alaskan Standard Time': 'America/Anchorage',
  'Hawaiian Standard Time': 'Pacific/Honolulu',
  'Samoa Standard Time': 'Pacific/Apia',
  'Line Islands Standard Time': 'Pacific/Kiritimati',
  'Dateline Standard Time': 'Etc/GMT+12',
  'Marquesas Standard Time': 'Pacific/Marquesas',
  'West Pacific Standard Time': 'Pacific/Port_Moresby',
  'Central Pacific Standard Time': 'Pacific/Guadalcanal',
  'Fiji Standard Time': 'Pacific/Fiji',
  'Tonga Standard Time': 'Pacific/Tongatapu'
}

/** IANA-Zonen, die in der UI angeboten werden; Wert = Graph-Windows-Zone */
export const CALENDAR_TIMEZONE_UI_OPTIONS: Array<{ iana: string; label: string }> = [
  { iana: 'Europe/Berlin', label: 'Mitteleuropa (Berlin)' },
  { iana: 'Europe/Vienna', label: 'Mitteleuropa (Wien)' },
  { iana: 'Europe/Zurich', label: 'Mitteleuropa (Zuerich)' },
  { iana: 'Europe/Amsterdam', label: 'Mitteleuropa (Amsterdam)' },
  { iana: 'Europe/Paris', label: 'Westeuropa (Paris)' },
  { iana: 'Europe/London', label: 'Vereinigtes Koenigreich (London)' },
  { iana: 'Europe/Rome', label: 'Mitteleuropa (Rom)' },
  { iana: 'Europe/Madrid', label: 'Westeuropa (Madrid)' },
  { iana: 'Europe/Warsaw', label: 'Mitteleuropa (Warschau)' },
  { iana: 'Europe/Athens', label: 'Osteuropa (Athen)' },
  { iana: 'America/New_York', label: 'USA Ost (New York)' },
  { iana: 'America/Chicago', label: 'USA Zentral (Chicago)' },
  { iana: 'America/Denver', label: 'USA Mountain (Denver)' },
  { iana: 'America/Los_Angeles', label: 'USA West (Los Angeles)' },
  { iana: 'Asia/Tokyo', label: 'Japan (Tokio)' },
  { iana: 'Asia/Shanghai', label: 'China (Shanghai)' },
  { iana: 'Australia/Sydney', label: 'Australien (Sydney)' },
  { iana: 'UTC', label: 'UTC' }
]

const IANA_TO_WINDOWS_CACHE = new Map<string, string>()

function buildIanaToWindows(): void {
  if (IANA_TO_WINDOWS_CACHE.size > 0) return
  for (const [win, iana] of Object.entries(WINDOWS_TO_IANA)) {
    if (!IANA_TO_WINDOWS_CACHE.has(iana)) {
      IANA_TO_WINDOWS_CACHE.set(iana, win)
    }
  }
  for (const { iana } of CALENDAR_TIMEZONE_UI_OPTIONS) {
    if (!IANA_TO_WINDOWS_CACHE.has(iana)) {
      IANA_TO_WINDOWS_CACHE.set(iana, pickWindowsForIana(iana))
    }
  }
}

function pickWindowsForIana(iana: string): string {
  if (iana === 'UTC') return 'UTC'
  const sameOffsetAsBerlin = new Set([
    'Europe/Berlin',
    'Europe/Vienna',
    'Europe/Zurich',
    'Europe/Amsterdam',
    'Europe/Rome',
    'Europe/Stockholm',
    'Europe/Oslo',
    'Europe/Copenhagen'
  ])
  if (sameOffsetAsBerlin.has(iana)) return 'W. Europe Standard Time'
  if (iana === 'Europe/Paris' || iana === 'Europe/Madrid' || iana === 'Europe/Brussels') {
    return 'Romance Standard Time'
  }
  if (iana === 'Europe/London') return 'GMT Standard Time'
  if (iana === 'Europe/Warsaw') return 'Central European Standard Time'
  if (iana === 'Europe/Athens') return 'GTB Standard Time'
  if (iana.startsWith('America/')) {
    const hit = Object.entries(WINDOWS_TO_IANA).find(([, v]) => v === iana)
    if (hit) return hit[0]
  }
  if (iana.startsWith('Asia/')) {
    const hit = Object.entries(WINDOWS_TO_IANA).find(([, v]) => v === iana)
    if (hit) return hit[0]
  }
  if (iana.startsWith('Australia/')) {
    const hit = Object.entries(WINDOWS_TO_IANA).find(([, v]) => v === iana)
    if (hit) return hit[0]
  }
  return 'UTC'
}

/** IANA (z. B. Europe/Berlin) -> Windows-Name fuer Graph create/update. */
export function ianaToWindowsTimeZone(iana: string): string {
  buildIanaToWindows()
  const t = iana.trim()
  if (!t) return 'UTC'
  const hit = IANA_TO_WINDOWS_CACHE.get(t)
  if (hit) return hit
  return pickWindowsForIana(t)
}

export function graphWindowsZoneToIana(windowsOrIana: string | null | undefined): string {
  const raw = (windowsOrIana ?? 'UTC').trim()
  if (!raw) return 'UTC'
  if (raw.includes('/')) return raw
  return WINDOWS_TO_IANA[raw] ?? 'UTC'
}
