/**
 * Gibt dem Electron-Main-Eventloop eine Chance, IPC/Renderer (z. B. UI-Updates)
 * vor dem naechsten Schritt zu verarbeiten. Kein eigener Worker — nur kooperatives
 * Scheduling; ein spaeterer Utility-Process fuer Sync kann dieselben Grenzen nutzen.
 */
export function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve)
  })
}
