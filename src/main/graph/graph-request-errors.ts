/**
 * Graph / Exchange liefern 404 + ErrorItemNotFound, wenn die Ressource
 * unter der bekannten Id nicht mehr existiert (verschoben, gelöscht, veralteter Cache).
 */
export function isGraphItemNotFound(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false
  const o = e as {
    statusCode?: number
    code?: string
    body?: unknown
    message?: string
  }
  if (o.statusCode === 404) return true
  if (o.code === 'ErrorItemNotFound') return true
  if (typeof o.message === 'string' && o.message.includes('ErrorItemNotFound')) return true
  const body = o.body
  if (typeof body === 'string' && body.includes('ErrorItemNotFound')) return true
  if (body && typeof body === 'object') {
    const code = (body as { error?: { code?: string } }).error?.code
    if (code === 'ErrorItemNotFound') return true
  }
  return false
}
