import { useEffect, useRef, useState } from 'react'

/** Positiv-Ergebnisse (Data-URLs) — begrenzt, damit lange Listen nicht den RAM sprengen. */
const MAX_POSITIVE_CACHE = 120
const positiveCache = new Map<number, string>()
const inflight = new Map<number, Promise<string | null>>()

function touchPositiveCache(id: number, url: string): void {
  positiveCache.delete(id)
  positiveCache.set(id, url)
  while (positiveCache.size > MAX_POSITIVE_CACHE) {
    const k = positiveCache.keys().next().value
    if (k === undefined) break
    positiveCache.delete(k)
  }
}

export async function loadPeopleContactPhotoDataUrl(contactId: number): Promise<string | null> {
  const hit = positiveCache.get(contactId)
  if (hit !== undefined) return hit
  const running = inflight.get(contactId)
  if (running) return running
  const p = (async (): Promise<string | null> => {
    try {
      const url = await window.mailClient.people.getPhotoDataUrl(contactId)
      if (url) touchPositiveCache(contactId, url)
      return url
    } catch {
      return null
    } finally {
      inflight.delete(contactId)
    }
  })()
  inflight.set(contactId, p)
  return p
}

/**
 * Lädt das lokal gespeicherte Kontaktfoto (Data-URL) per IPC, optional erst wenn `loadEnabled` true ist
 * (z. B. nach Sichtbarkeit in der Liste).
 * `refreshToken` (z. B. `updatedLocal` aus der DB) invalidiert den Cache, wenn sich das Bild geändert hat.
 */
export function useContactPhotoDataUrl(
  contactId: number | null,
  photoLocalPath: string | null | undefined,
  loadEnabled: boolean,
  refreshToken?: string | null
): string | null {
  const [url, setUrl] = useState<string | null>(() => {
    if (contactId != null && loadEnabled && photoLocalPath?.trim()) {
      return positiveCache.get(contactId) ?? null
    }
    return null
  })

  const lastLoadKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (contactId == null || !loadEnabled || !photoLocalPath?.trim()) {
      lastLoadKeyRef.current = null
      setUrl(null)
      return
    }

    const loadKey = `${contactId}:${refreshToken ?? ''}`
    if (lastLoadKeyRef.current !== loadKey) {
      lastLoadKeyRef.current = loadKey
      positiveCache.delete(contactId)
      inflight.delete(contactId)
    }

    const cached = positiveCache.get(contactId)
    if (cached) {
      setUrl(cached)
      return
    }

    let cancelled = false
    void loadPeopleContactPhotoDataUrl(contactId).then((u) => {
      if (!cancelled) setUrl(u)
    })
    return (): void => {
      cancelled = true
    }
  }, [contactId, photoLocalPath, loadEnabled, refreshToken])

  return url
}
