import DOMPurify from 'dompurify'

const ALLOWED_TAGS = [
  'a','b','blockquote','br','div','em','figure','figcaption','h1','h2','h3','h4','h5','h6',
  'hr','i','img','li','ol','p','pre','small','span','strong','sub','sup','table','tbody','td',
  'tfoot','th','thead','tr','u','ul','code'
]

const ALLOWED_ATTR = [
  'href',
  'target',
  'rel',
  'src',
  'alt',
  'title',
  'style',
  'class',
  'width',
  'height',
  'colspan',
  'rowspan',
  /** Ziel-URL nach Neutralisierung von `href` (kein Subframe-Load / keine App-CSP). */
  'data-mail-external',
  'xlink:href'
]

let mailAnchorNeutralizeInstalled = false

/**
 * Erzwingt, dass externe Ziele nie als echtes `href` im Iframe landen (sonst CSP
 * ERR_BLOCKED_BY_CSP bevor `preventDefault` zuverlaessig greift). Stattdessen
 * `href="#"` + `data-mail-external` — der Renderer oeffnet per IPC im OS-Browser.
 */
function installMailAnchorNeutralizer(): void {
  if (mailAnchorNeutralizeInstalled) return
  mailAnchorNeutralizeInstalled = true
  DOMPurify.addHook('afterSanitizeAttributes', (node: Node) => {
    if (node.nodeType !== 1) return
    const el = node as Element
    if (el.nodeName.toLowerCase() !== 'a') return
    const raw = (el.getAttribute('href') || el.getAttribute('xlink:href') || '').trim()
    if (!raw || raw === '#' || raw.startsWith('#')) return
    let h = raw
    if (h.startsWith('//')) h = `https:${h}`
    const ok =
      /^https?:\/\//i.test(h) ||
      /^mailto:/i.test(h) ||
      /^tel:/i.test(h) ||
      /^(msteams|ms-teams):\/\//i.test(h)
    if (!ok) return
    el.setAttribute('data-mail-external', h)
    el.setAttribute('href', '#')
    el.removeAttribute('xlink:href')
  })
}

/**
 * Ersetzt im HTML alle `src="cid:..."`-Referenzen durch die passenden
 * Data-URIs aus der uebergebenen Map. ContentIds koennen optional in
 * Spitzklammern stehen (RFC 2392) – diese werden vor dem Lookup entfernt.
 *
 * Faellt das direkte CID-Matching fehl, versuchen wir Fallbacks:
 *  - Lookup nach Inhalt ohne Spitzklammern bzw. mit Decode-URI
 *  - Suffix-/Prefix-Match (z.B. cid:image001@... matcht "image001")
 *
 * Zusaetzlich werden `<img>`-Tags ohne `src` mit `originalsrc="cid:..."`,
 * `data-cid-src="..."` oder `xsrc="..."` rekonstruiert – Outlook strippt
 * die `src` gerne, wenn externe Bilder geblockt sind.
 */
export function replaceInlineCidImages(
  html: string,
  cidMap: Record<string, string>
): string {
  if (!html) return html
  if (Object.keys(cidMap).length === 0) return html

  const keys = Object.keys(cidMap)

  function lookup(rawCid: string): string | null {
    try {
      const decoded = decodeURIComponent(rawCid)
      const stripped = decoded.replace(/^<|>$/g, '')
      const hit =
        cidMap[stripped] ??
        cidMap[decoded] ??
        cidMap[rawCid] ??
        cidMap[rawCid.replace(/^<|>$/g, '')]
      if (hit) return hit

      // Heuristik: Suffix-/Prefix-Match (cid:image001 matcht
      // "image001@01D7...").
      const candidate = stripped.split('@')[0]
      if (candidate) {
        const hit2 = keys.find((k) => k === candidate || k.startsWith(`${candidate}@`))
        if (hit2) return cidMap[hit2]
      }
      return null
    } catch {
      return null
    }
  }

  let out = html.replace(
    /\bsrc\s*=\s*(["'])cid:([^"'>\s]+)\1/gi,
    (full, quote: string, rawCid: string) => {
      const uri = lookup(rawCid)
      return uri ? `src=${quote}${uri}${quote}` : full
    }
  )

  // Outlook setzt manchmal `originalsrc="cid:..."` und entfernt `src`.
  // Wir bauen die `src` zurueck, wenn wir das Bild kennen.
  out = out.replace(
    /<img\b([^>]*)\boriginalsrc\s*=\s*(["'])cid:([^"'>\s]+)\2([^>]*)>/gi,
    (full, pre: string, quote: string, rawCid: string, post: string) => {
      const uri = lookup(rawCid)
      if (!uri) return full
      const hasSrc = /\bsrc\s*=/.test(pre) || /\bsrc\s*=/.test(post)
      if (hasSrc) {
        return full.replace(/\bsrc\s*=\s*["'][^"']*["']/i, `src=${quote}${uri}${quote}`)
      }
      return `<img${pre} src=${quote}${uri}${quote}${post}>`
    }
  )

  return out
}

/**
 * Sanitisiert HTML-Mail-Inhalt fuer die sichere Anzeige im Sandbox-Iframe.
 * Externe Bilder werden standardmaessig blockiert (Privacy: kein Tracker-Pixel-Load).
 */
export function sanitizeMailHtml(html: string, options: { loadImages?: boolean } = {}): string {
  const loadImages = options.loadImages ?? false
  installMailAnchorNeutralizer()

  const cleaned = DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|data):|(?:[a-z\-]+):|#)/i,
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'form'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
    KEEP_CONTENT: true,
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false
  })

  // `target=_blank` oeffnet sonst (mit allow-popups) ein Electron-Fenster unter App-CSP.
  const noBlankTargets = cleaned.replace(
    /<a\b([^>]*)\btarget\s*=\s*(["'])[^"']*\2/gi,
    '<a$1'
  )

  if (loadImages) return noBlankTargets

  return noBlankTargets.replace(
    /<img\b[^>]*\bsrc\s*=\s*["']?(https?:[^"'\s>]+)["']?[^>]*>/gi,
    (match) => match.replace(/\bsrc\s*=\s*["']?https?:[^"'\s>]+["']?/i, 'data-original-src="blocked"')
  )
}

export type MailViewerTheme = 'light' | 'dark'

export function buildIframeSrcDoc(html: string, theme: MailViewerTheme = 'light'): string {
  const css = theme === 'dark' ? darkThemeCss : lightThemeCss
  return `<!doctype html><html lang="de"><head><meta charset="utf-8">${css}</head><body>${html}</body></html>`
}

const lightThemeCss = `
  <style>
    :root { color-scheme: light; }
    html, body { margin: 0; padding: 14px 18px; background: #ffffff; color: #1f1f23;
      font: 14px/1.55 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
      word-wrap: break-word; }
    a { color: #0b66c2; }
    img { max-width: 100%; height: auto; }
    blockquote { border-left: 3px solid #d6d6db; margin: 0 0 0 4px; padding: 4px 12px;
      color: #555; }
    table { max-width: 100%; }
    pre, code { background: #f4f4f6; padding: 2px 4px; border-radius: 3px; font-size: 12px;
      color: #1f1f23; }
    pre { padding: 8px 12px; overflow: auto; }
    hr { border: 0; border-top: 1px solid #e5e5ea; margin: 12px 0; }
  </style>
`

/**
 * Dark-Mode-Anzeige: Wir koennen Inline-Styles aus dem Mail-Markup nicht
 * vollstaendig invertieren. Wir setzen daher nur Defaults, lassen aber
 * Inline-Styles unangetastet. Dadurch sehen "dark-mode-fertige" Mails gut aus,
 * waehrend klassische Mails ggf. besser im Hell-Mode angezeigt werden.
 */
const darkThemeCss = `
  <style>
    :root { color-scheme: dark; }
    html, body { margin: 0; padding: 14px 18px; background: #1c1c20; color: #e6e6e8;
      font: 14px/1.55 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      word-wrap: break-word; }
    a { color: #6aa3ff; }
    img { max-width: 100%; height: auto; }
    blockquote { border-left: 3px solid #2a2a32; margin: 0 0 0 4px; padding: 4px 12px;
      color: #9a9aa3; }
    table { max-width: 100%; }
    pre, code { background: #14141a; padding: 2px 4px; border-radius: 3px; font-size: 12px;
      color: #e6e6e8; }
    pre { padding: 8px 12px; overflow: auto; }
  </style>
`
