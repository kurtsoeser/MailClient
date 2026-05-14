/**
 * Gravatar (SHA-256-Hash der normalisierten E-Mail), s. offizielle Doku.
 * `d=404`: keine generische Silhouette – wir fallen im Avatar auf Initialen zurueck.
 */
const sha256HexMemo = new Map<string, string>()

export async function gravatarUrlForEmail(
  email: string | null | undefined,
  pixelSize: number
): Promise<string | null> {
  const normalized = email?.trim().toLowerCase()
  if (!normalized) return null
  let hash = sha256HexMemo.get(normalized)
  if (!hash) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized))
    hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
    sha256HexMemo.set(normalized, hash)
  }
  return `https://gravatar.com/avatar/${hash}?s=${pixelSize}&d=404&r=pg`
}
