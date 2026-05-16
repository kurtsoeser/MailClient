export function toggleKeyInSet(keys: Set<string>, key: string): Set<string> {
  const next = new Set(keys)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  return next
}

export function parseMultilineTitles(raw: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const line of raw.split(/\r?\n/)) {
    const title = line.trim()
    if (!title || seen.has(title)) continue
    seen.add(title)
    out.push(title)
  }
  return out
}
