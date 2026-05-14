/**
 * RFC 8058 One-Click: POST mit `List-Unsubscribe=One-Click` an HTTPS-URL aus dem Header.
 */
export async function performOneClickUnsubscribe(
  listUnsubscribe: string | null | undefined,
  listUnsubscribePost: string | null | undefined
): Promise<void> {
  const postHdr = (listUnsubscribePost ?? '').toLowerCase()
  if (!postHdr.includes('list-unsubscribe=one-click')) {
    throw new Error('Diese Mail unterstuetzt keinen RFC-8058-One-Click-Abmeldelink.')
  }
  const raw = listUnsubscribe ?? ''
  const urls = Array.from(raw.matchAll(/<([^>]+)>/g))
    .map((m) => m[1]!.trim())
    .filter((u) => /^https:/i.test(u))
  if (urls.length === 0) {
    throw new Error('Kein HTTPS-Abmeldelink im List-Unsubscribe-Header gefunden.')
  }
  const url = urls[0]!
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'List-Unsubscribe=One-Click'
  })
  if (!res.ok) {
    throw new Error(`Abmelden fehlgeschlagen (HTTP ${res.status}).`)
  }
}
