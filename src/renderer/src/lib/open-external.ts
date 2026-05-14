/**
 * Oeffnet http(s)-, mailto-, tel- oder Teams-URLs per IPC (`shell.openExternal`).
 * Protokoll-relative URLs `//...` werden als https normalisiert.
 * Ohne Preload-Bridge: bewusst kein `window.open` (Electron-WebContents + CSP-Fehler).
 */
export async function openExternalUrl(url: string): Promise<void> {
  let raw = typeof url === 'string' ? url.trim() : ''
  if (!raw) {
    throw new Error('Keine URL.')
  }
  if (raw.startsWith('//')) {
    raw = `https:${raw}`
  }
  const allowed = /^(https?:\/\/|mailto:|tel:|msteams:\/\/|ms-teams:\/\/)/i
  if (!allowed.test(raw)) {
    throw new Error('Nur http(s)-, mailto-, tel- oder Teams-Links duerfen geoeffnet werden.')
  }

  const fn = window.mailClient?.app?.openExternal
  if (typeof fn === 'function') {
    await fn.call(window.mailClient.app, raw)
    return
  }

  // Kein `window.open` fuer http(s): oeffnet eine Electron-WebContents und scheitert
  // oft mit ERR_BLOCKED_BY_CSP (Tracking-Redirects). Preload/IPC ist Pflicht.
  throw new Error('openExternal (Preload) nicht verfuegbar — bitte App neu starten.')
}
