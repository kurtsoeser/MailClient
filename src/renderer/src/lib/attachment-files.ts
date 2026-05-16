/** Maximale Groesse pro lokaler Datei (wie Mail-Compose). */
export const MAX_ATTACHMENT_FILE_BYTES = 24 * 1024 * 1024

export function formatAttachmentBytes(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = bytes
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`
}

export function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  const chunkSize = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode.apply(null, Array.from(sub) as unknown as number[])
  }
  return btoa(binary)
}

export async function readFilesAsAttachmentPayload(
  files: File[],
  maxBytes: number = MAX_ATTACHMENT_FILE_BYTES
): Promise<
  | { ok: true; items: { name: string; contentType: string; size: number; dataBase64: string }[] }
  | { ok: false; error: string }
> {
  const items: { name: string; contentType: string; size: number; dataBase64: string }[] = []
  for (const f of files) {
    if (f.size > maxBytes) {
      return {
        ok: false,
        error: `„${f.name}“ überschreitet ${(maxBytes / (1024 * 1024)).toFixed(0)} MB.`
      }
    }
    const buf = await f.arrayBuffer()
    items.push({
      name: f.name,
      contentType: f.type || 'application/octet-stream',
      size: f.size,
      dataBase64: arrayBufferToBase64(buf)
    })
  }
  return { ok: true, items }
}
