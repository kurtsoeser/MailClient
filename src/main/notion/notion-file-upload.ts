import { NOTION_API_BASE } from './notion-constants'
import { ensureNotionAccessToken } from './notion-client'

/** File-Upload-API (Direct Upload); aelter als Block-API-Version. */
export const NOTION_FILE_UPLOAD_API_VERSION = '2025-09-03'

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024

interface FileUploadCreateResponse {
  id: string
  upload_url?: string
  status?: string
}

export async function uploadBufferToNotion(
  bytes: Buffer,
  filename: string,
  contentType: string | null
): Promise<string> {
  if (bytes.length > MAX_UPLOAD_BYTES) {
    throw new Error(`Datei zu gross fuer Notion (max. 20 MB): ${filename}`)
  }

  const token = await ensureNotionAccessToken()
  const mime = contentType?.trim() || 'application/octet-stream'
  const safeName = filename.trim() || 'attachment'

  const createRes = await fetch(`${NOTION_API_BASE}/file_uploads`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Notion-Version': NOTION_FILE_UPLOAD_API_VERSION
    },
    body: JSON.stringify({
      filename: safeName,
      content_type: mime,
      content_length: bytes.length
    })
  })

  const createBody = (await createRes.json().catch(() => ({}))) as Record<string, unknown>
  if (!createRes.ok) {
    const msg =
      typeof createBody.message === 'string' ? createBody.message : createRes.statusText
    throw new Error(`Notion File-Upload: ${msg}`)
  }

  const created = createBody as unknown as FileUploadCreateResponse
  const uploadId = created.id?.trim()
  if (!uploadId) {
    throw new Error('Notion File-Upload: keine Upload-ID.')
  }

  const sendUrl =
    created.upload_url?.trim() || `${NOTION_API_BASE}/file_uploads/${uploadId}/send`

  const form = new FormData()
  const blob = new Blob([bytes], { type: mime })
  form.append('file', blob, safeName)

  const sendRes = await fetch(sendUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_FILE_UPLOAD_API_VERSION
    },
    body: form
  })

  const sendBody = (await sendRes.json().catch(() => ({}))) as Record<string, unknown>
  if (!sendRes.ok) {
    const msg = typeof sendBody.message === 'string' ? sendBody.message : sendRes.statusText
    throw new Error(`Notion Datei senden: ${msg}`)
  }

  const status =
    typeof sendBody.status === 'string' ? sendBody.status : undefined
  if (status && status !== 'uploaded') {
    throw new Error(`Notion File-Upload Status: ${status}`)
  }

  return uploadId
}
