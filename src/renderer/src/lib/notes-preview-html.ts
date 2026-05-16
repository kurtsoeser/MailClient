/**
 * Aufgaben-Notizen (Graph/Google): oft Klartext, manchmal HTML aus Outlook.
 * Fuer die Vorschau: HTML durchreichen oder Klartext mit klickbaren http(s)-Links.
 */
export function notesToPreviewHtml(notes: string): string {
  const trimmed = notes.trim()
  if (!trimmed) return ''

  if (/<\s*(a|p|div|br|ul|ol|li|span|strong|em|table|h[1-6])\b/i.test(trimmed)) {
    return trimmed
  }

  const escaped = trimmed
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

  return escaped
    .replace(/(https?:\/\/[^\s<>"']+)/gi, (url) => `<a href="${url}">${url}</a>`)
    .replace(/\n/g, '<br>')
}
