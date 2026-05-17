/** Prueft einen IANA-Zeitzonennamen (z. B. Europe/Berlin). */
export function isValidIanaTimeZone(timeZone: string): boolean {
  const t = timeZone.trim()
  if (!t) return false
  try {
    Intl.DateTimeFormat(undefined, { timeZone: t })
    return true
  } catch {
    return false
  }
}
