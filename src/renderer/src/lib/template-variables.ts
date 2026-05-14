/**
 * Ersetzt `{{platzhalter}}` im HTML (Gross/Kleinschreibung egal).
 * `variablesJson` ist ein JSON-Objekt-String, z.B. `{"vorname":"Kurt"}`.
 */
export function applyTemplateVariables(
  html: string,
  variablesJson: string | null | undefined,
  builtins?: Record<string, string>
): string {
  const now = new Date()
  const base: Record<string, string> = {
    datum: now.toLocaleDateString('de-DE'),
    zeit: now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
    ...(builtins ?? {})
  }
  let extra: Record<string, string> = {}
  if (variablesJson?.trim()) {
    try {
      const parsed: unknown = JSON.parse(variablesJson)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
          if (typeof v === 'string' || typeof v === 'number') {
            extra[k.toLowerCase()] = String(v)
          }
        }
      }
    } catch {
      /* ignorieren */
    }
  }
  const map = { ...base, ...extra }
  return html.replace(/\{\{\s*([^}]+?)\s*\}\}/gi, (_m, rawKey: string) => {
    const key = String(rawKey).trim().toLowerCase()
    if (!key) return ''
    const val = map[key]
    return val !== undefined ? val : ''
  })
}
