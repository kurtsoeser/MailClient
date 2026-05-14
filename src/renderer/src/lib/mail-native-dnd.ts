import { MIME_THREAD_IDS } from '@/lib/workflow-dnd'

/** Prueft, ob ein natives Drag aus der Mailliste stammen kann (MIME / Fallback-Typen). */
export function nativeDragHasMailMessagePayload(dt: DataTransfer): boolean {
  const types = dt.types
  if (typeof types.includes === 'function') {
    if (types.includes(MIME_THREAD_IDS)) return true
    if (types.includes('text/mailclient-message-id')) return true
    if (types.includes('application/x-mailclient-message-id')) return true
  } else {
    for (let i = 0; i < types.length; i++) {
      const t = types[i]
      if (
        t === MIME_THREAD_IDS ||
        t === 'text/mailclient-message-id' ||
        t === 'application/x-mailclient-message-id'
      ) {
        return true
      }
    }
  }
  return false
}
