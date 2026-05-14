import DOMPurify from 'dompurify'

const SANITIZE: DOMPurify.Config = {
  ALLOWED_TAGS: [
    'a',
    'b',
    'br',
    'div',
    'em',
    'h1',
    'h2',
    'h3',
    'hr',
    'i',
    'img',
    'li',
    'ol',
    'p',
    's',
    'span',
    'strong',
    'sub',
    'sup',
    'table',
    'tbody',
    'td',
    'th',
    'thead',
    'tr',
    'u',
    'ul',
    'blockquote',
    'colgroup',
    'col'
  ],
  ALLOWED_ATTR: [
    'href',
    'target',
    'rel',
    'style',
    'class',
    'colspan',
    'rowspan',
    'src',
    'alt',
    'width',
    'height',
    'align',
    'border',
    'cellpadding',
    'cellspacing',
    'valign',
    'bgcolor',
    'color',
    'face',
    'size'
  ],
  ALLOW_DATA_ATTR: false,
  ALLOW_UNKNOWN_PROTOCOLS: false,
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'style'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover']
}

/**
 * HTML fuer Compose (Vorlagen, eingefuegte Fragmente) bereinigen.
 * Kein Ersatz fuer serverseitige Pruefung, reduziert aber XSS-Risiken im Renderer.
 */
export function sanitizeComposeHtmlFragment(html: string): string {
  const trimmed = html.trim()
  if (!trimmed) return ''
  return DOMPurify.sanitize(trimmed, SANITIZE as import('dompurify').Config)
}
