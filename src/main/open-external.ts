import { shell } from 'electron'

/** Nur diese Ziele duerfen per `shell.openExternal` geoeffnet werden (Renderer + Main konsistent). */
export function normalizeExternalOpenUrl(url: string): string | null {
  let raw = url.trim()
  if (!raw) return null
  if (raw.startsWith('//')) raw = `https:${raw}`
  const allowed = /^(https?:\/\/|mailto:|tel:|msteams:\/\/|ms-teams:\/\/)/i
  if (!allowed.test(raw)) return null
  return raw
}

/** `file:` / localhost / about: / data: / blob: — Navigation bleibt in der App. */
export function isAppInternalNavigationUrl(url: string): boolean {
  const u = url.trim()
  if (u === 'about:blank' || u.startsWith('about:srcdoc')) return true
  if (u.startsWith('data:') || u.startsWith('blob:')) return true
  try {
    const parsed = new URL(u)
    if (parsed.protocol === 'file:') return true
    if (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')
    ) {
      return true
    }
  } catch {
    return false
  }
  return false
}

let lastOpen: { url: string; t: number } | null = null

/**
 * Oeffnet im OS-Browser; kurze Dedupe-Fenster verhindert doppelte Tabs, wenn sowohl
 * Renderer-Klick (IPC) als auch Session-Abfang dieselbe Navigation ausloesen.
 */
export async function openExternalDeduped(rawUrl: string): Promise<void> {
  const normalized = normalizeExternalOpenUrl(rawUrl)
  if (!normalized) return
  const now = Date.now()
  if (lastOpen && lastOpen.url === normalized && now - lastOpen.t < 800) return
  lastOpen = { url: normalized, t: now }
  await shell.openExternal(normalized)
}

export function openExternalIfAllowedSync(rawUrl: string): void {
  void openExternalDeduped(rawUrl).catch((e) => console.warn('[openExternal]', e))
}
