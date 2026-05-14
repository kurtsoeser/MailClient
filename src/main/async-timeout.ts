/**
 * Bricht ab, wenn `promise` laenger als `ms` braucht (z. B. haengender Graph-Call ohne Fetch-Timeout).
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      reject(
        new Error(
          `${label}: Keine Antwort nach ${Math.round(ms / 1000)} s. Netzwerk pruefen oder App neu starten; ggf. wartet Microsoft im Browser auf eine Anmeldung (Fenster im Hintergrund).`
        )
      )
    }, ms)
    promise.then(
      (v) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(e)
      }
    )
  })
}
