/** UA: echtes Electron-Rendererfenster (nicht Chrome mit localhost:5173). */
export function isElectronRendererUserAgent(): boolean {
  return typeof navigator !== 'undefined' && /\bElectron\b/i.test(navigator.userAgent)
}

/** True, wenn Preload die volle `window.mailClient`-API bereitstellt. */
export function isMailClientRuntimeComplete(): boolean {
  return Boolean(
    typeof window !== 'undefined' &&
      window.mailClient?.mail &&
      window.mailClient?.events &&
      window.mailClient?.auth &&
      window.mailClient?.app
  )
}

const warnedOnce = new Set<string>()

/**
 * Ein Log pro Session/Key. Im **Browser** (Vite ohne Electron): `console.debug`
 * (in der Konsole oft ausgeblendet). Im **Electron** ohne API: `console.warn` — dann Preload/Neustart prüfen.
 */
export function warnMailClientMissingOnce(key: string, message: string): void {
  if (warnedOnce.has(key)) return
  warnedOnce.add(key)
  if (isElectronRendererUserAgent()) {
    console.warn(message)
  } else {
    console.debug(`${message} (Vite-Renderer ohne Electron-Preload.)`)
  }
}