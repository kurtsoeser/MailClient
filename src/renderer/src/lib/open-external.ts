import { normalizeExternalOpenUrl } from '@shared/external-open-url'

/**
 * Oeffnet erlaubte URLs per IPC (`shell.openExternal`); siehe `@shared/external-open-url`.
 * Protokoll-relative URLs `//...` werden im Shared-Normalizer zu https.
 * Ohne Preload-Bridge: bewusst kein `window.open` (Electron-WebContents + CSP-Fehler).
 */

/** Gleiche erlaubte Ziele wie im Main-Prozess (`normalizeExternalOpenUrl`). */
export function hrefForExternalOpen(raw: string | null | undefined): string | null {
  const u = typeof raw === 'string' ? raw.trim() : ''
  if (!u || u === '#' || u.startsWith('#')) return null
  return normalizeExternalOpenUrl(u)
}

export async function openExternalUrl(url: string): Promise<void> {
  const normalized = hrefForExternalOpen(url)
  if (!normalized) {
    const trimmed = typeof url === 'string' ? url.trim() : ''
    if (!trimmed) {
      throw new Error('Keine URL.')
    }
    throw new Error('Diese URL darf nicht extern geoeffnet werden (nicht in der erlaubten Liste).')
  }

  const fn = window.mailClient?.app?.openExternal
  if (typeof fn === 'function') {
    await fn.call(window.mailClient.app, normalized)
    return
  }

  // Kein `window.open` fuer http(s): oeffnet eine Electron-WebContents und scheitert
  // oft mit ERR_BLOCKED_BY_CSP (Tracking-Redirects). Preload/IPC ist Pflicht.
  throw new Error('openExternal (Preload) nicht verfuegbar — bitte App neu starten.')
}
