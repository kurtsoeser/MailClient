export function isoToDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso?.trim()) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function datetimeLocalValueToIso(value: string): string | null {
  const v = value.trim()
  if (!v) return null
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

/** Datum aus UI (`type="date"`) oder ISO in Storage-ISO für Cloud-Tasks. */
export function dueDateInputToStorageIso(value: string | null | undefined): string | null {
  if (!value?.trim()) return null
  const d = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d
  const parsed = new Date(d)
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
  return d
}

export function dueDateInputValue(dueIso: string | null | undefined): string {
  if (!dueIso) return ''
  if (/^\d{4}-\d{2}-\d{2}/.test(dueIso)) return dueIso.slice(0, 10)
  try {
    const d = new Date(dueIso)
    if (Number.isNaN(d.getTime())) return ''
    return d.toISOString().slice(0, 10)
  } catch {
    return ''
  }
}
