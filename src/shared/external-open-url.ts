/**
 * Welche URLs duerfen per IPC / shell.openExternal im System geoeffnet werden.
 * Muss mit dem Mail-/Kalender-HTML-Sanitizer (data-mail-external) uebereinstimmen.
 */
export function normalizeExternalOpenUrl(url: string): string | null {
  let raw = url.trim()
  if (!raw) return null
  if (raw.startsWith('//')) raw = `https:${raw}`

  if (/^https?:\/\//i.test(raw)) return raw
  if (/^notion:\/\//i.test(raw)) return raw
  if (/^mailto:/i.test(raw)) return raw
  if (/^tel:/i.test(raw)) return raw
  if (/^(msteams|ms-teams):\/\//i.test(raw)) return raw
  if (/^ms-outlook:/i.test(raw)) return raw
  if (/^outlook:/i.test(raw)) return raw
  if (/^microsoft-edge:/i.test(raw)) return raw

  return null
}
