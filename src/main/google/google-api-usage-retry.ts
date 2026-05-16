function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface GoogleApiErrLike {
  code?: number
  status?: number
  errors?: Array<{ reason?: string; domain?: string; message?: string }>
  message?: string
  response?: {
    status?: number
    data?: { error?: { errors?: Array<{ reason?: string; domain?: string }> } }
    headers?: Record<string, string | number | string[] | undefined>
  }
}

function collectGoogleErrors(err: GoogleApiErrLike): Array<{ reason?: string; domain?: string }> {
  const out: Array<{ reason?: string; domain?: string }> = []
  if (Array.isArray(err.errors)) {
    for (const e of err.errors) out.push(e)
  }
  const nested = err.response?.data?.error?.errors
  if (Array.isArray(nested)) {
    for (const e of nested) out.push(e)
  }
  return out
}

function httpStatus(err: GoogleApiErrLike): number | undefined {
  return err.status ?? err.code ?? err.response?.status
}

/** True bei Google-Nutzungslimits (z. B. Queries/min), die mit Warten sinnvoll wiederholt werden koennen. */
export function isGoogleApiUsageLimitError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as GoogleApiErrLike
  const status = httpStatus(e)
  if (status !== 403 && status !== 429) return false
  for (const sub of collectGoogleErrors(e)) {
    if (sub.reason === 'accessNotConfigured') return false
    const r = sub.reason
    if (
      r === 'rateLimitExceeded' ||
      r === 'userRateLimitExceeded' ||
      r === 'quotaExceeded' ||
      r === 'dailyLimitExceeded'
    ) {
      return true
    }
  }
  const msg = typeof e.message === 'string' ? e.message : ''
  if (/quota exceeded|rate limit|usageLimits|resource has been exhausted/i.test(msg)) {
    return true
  }
  return false
}

function retryAfterMsFromError(err: unknown): number | null {
  if (!err || typeof err !== 'object') return null
  const headers = (err as GoogleApiErrLike).response?.headers
  if (!headers) return null
  const raw = headers['retry-after'] ?? headers['Retry-After']
  const s = Array.isArray(raw) ? raw[0] : raw
  if (s == null) return null
  const n = parseInt(String(s).trim(), 10)
  if (!Number.isFinite(n) || n <= 0) return null
  return n * 1000
}

/**
 * Wiederholt bei Google-Nutzungslimits mit exponentiellem Backoff (optional Retry-After).
 */
export async function withGoogleUsageLimitRetry<T>(
  opLabel: string,
  fn: () => Promise<T>,
  options?: { maxAttempts?: number; initialDelayMs?: number; maxDelayMs?: number }
): Promise<T> {
  const maxAttempts = Math.max(1, options?.maxAttempts ?? 6)
  const initialDelayMs = options?.initialDelayMs ?? 2000
  const maxDelayMs = options?.maxDelayMs ?? 60_000
  let delayMs = initialDelayMs
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (e) {
      if (!isGoogleApiUsageLimitError(e) || attempt === maxAttempts) {
        throw e
      }
      const fromHeader = retryAfterMsFromError(e)
      const waitMs = Math.min(maxDelayMs, Math.max(delayMs, fromHeader ?? delayMs))
      console.warn(
        `[google-api] ${opLabel}: Nutzungslimit, Versuch ${attempt}/${maxAttempts} — warte ${waitMs}ms …`
      )
      await sleepMs(waitMs)
      delayMs = Math.min(maxDelayMs, delayMs * 2)
    }
  }
  throw new Error('withGoogleUsageLimitRetry: unreachable')
}
