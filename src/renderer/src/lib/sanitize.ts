import DOMPurify from 'dompurify'
import { normalizeExternalOpenUrl } from '@shared/external-open-url'

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
    const normalized = normalizeExternalOpenUrl(raw)
    if (!normalized) return
    el.setAttribute('data-mail-external', normalized)
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
 * Sanitisiert HTML-Mail-Inhalt fuer die sichere Anzeige im srcdoc-Iframe (CSP ohne JS).
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

/** CSP fuer Mail-/Kalender-srcdoc: kein JS, aber inline-Styles und Bilder (DOMPurify bleibt Pflicht). */
const mailIframeCspMeta = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: http: https: blob:; font-src data: http: https:; script-src 'none'; object-src 'none'; base-uri 'none';">`

export function buildIframeSrcDoc(html: string, theme: MailViewerTheme = 'light'): string {
  if (theme === 'dark') {
    return `<!doctype html><html lang="de"><head><meta charset="utf-8">${mailIframeCspMeta}${darkThemeCss}</head><body><div class="mail-html-root">${html}</div></body></html>`
  }
  return `<!doctype html><html lang="de"><head><meta charset="utf-8">${mailIframeCspMeta}${lightThemeCss}</head><body>${html}</body></html>`
}

/**
 * Markup fuer Shadow-Root der Mail-Leseansicht (kein iframe): gleiche Styles wie im srcdoc,
 * aber `html, body` -> `:host`, damit Klicks zuverlässig im Electron-Hauptdokument landen.
 */
export function buildMailShadowRootInnerHtml(html: string, theme: MailViewerTheme): string {
  const adapt = (css: string): string => css.replace(':root', ':host').replace(/html,\s*body/g, ':host')
  if (theme === 'dark') {
    return `${mailReadingShadowDarkThemeCss}<div class="mail-html-root">${html}</div>`
  }
  return `${adapt(lightThemeCss)}${html}`
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
 * Dunkelmodus: grauer Rahmen ueber body-Padding (`MAIL_DARK_SURFACE`).
 * Unter `.mail-html-root` liegt eine undurchsichtige helle Flaeche, dann invertieren wir sie.
 * Reines Weiss wuerde nach invert() zu Schwarz (#000); stattdessen `#d5d5d5` (= invert(#2a2a2a)),
 * damit „leere“ Flaechen nach dem Filter dasselbe Dunkelgrau wie der Rahmen haben.
 * Bilder/SVG/Video doppelt invertieren (wieder naturgetreu).
 * Im iframe `color-scheme: light`, damit keine UA-Dunkel-Anpassungen mit invert() kollidieren.
 */
const MAIL_DARK_SURFACE_HEX = '#2a2a2a'
/** Vor invert(): Komplement zu MAIL_DARK_SURFACE (gleiches Grau nach invert+hue fuer Achromaten). */
const MAIL_DARK_PAPER_BEFORE_INVERT_HEX = '#d5d5d5'

const darkThemeCss = `
  <style>
    :root { color-scheme: light; }
    html, body {
      margin: 0;
      padding: 14px 18px;
      box-sizing: border-box;
      min-height: 100%;
      background: ${MAIL_DARK_SURFACE_HEX};
      font: 14px/1.55 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
      word-wrap: break-word;
      color-scheme: light;
    }
    *, *::before, *::after { box-sizing: inherit; }
    .mail-html-root {
      isolation: isolate;
      forced-color-adjust: none;
      min-height: calc(100vh - 28px);
      padding: 0;
      margin: 0;
      border-radius: 2px;
      background: ${MAIL_DARK_PAPER_BEFORE_INVERT_HEX};
      color: #1f1f23;
      filter: invert(1) hue-rotate(180deg);
    }
    .mail-html-root img,
    .mail-html-root svg,
    .mail-html-root video {
      filter: invert(1) hue-rotate(180deg);
      forced-color-adjust: none;
    }
    img { max-width: 100%; height: auto; }
    table { max-width: 100%; }
  </style>
`

/** Shadow-Root Mail-Leseansicht: kein 100vh-Mindestmaß (iframe-Überbleibsel), sonst kein Scroll im Panel. */
const mailReadingShadowDarkThemeCss = `
  <style>
    :host {
      color-scheme: light;
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      display: block;
      background: ${MAIL_DARK_SURFACE_HEX};
      font: 14px/1.55 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
      word-wrap: break-word;
    }
    *, *::before, *::after { box-sizing: inherit; }
    .mail-html-root {
      isolation: isolate;
      forced-color-adjust: none;
      min-height: 0;
      padding: 14px 18px;
      margin: 0;
      border-radius: 2px;
      background: ${MAIL_DARK_PAPER_BEFORE_INVERT_HEX};
      color: #1f1f23;
      filter: invert(1) hue-rotate(180deg);
    }
    .mail-html-root img,
    .mail-html-root svg,
    .mail-html-root video {
      filter: invert(1) hue-rotate(180deg);
      forced-color-adjust: none;
    }
    img { max-width: 100%; height: auto; }
    table { max-width: 100%; }
  </style>
`

/** Kalender-Beschreibung: kein Vollbild-Mindestmaß wie bei Mail (vermeidet leere Scrollbars). */
export function isEffectivelyEmptyDescriptionHtml(html: string): boolean {
  const t = html.replace(/<[^>]+>/gi, '').replace(/\u00a0/g, ' ').trim()
  return t.length === 0
}

const calendarDescriptionDarkThemeCss = `
  <style>
    :root { color-scheme: light; }
    html, body {
      margin: 0;
      padding: 14px 18px;
      box-sizing: border-box;
      background: ${MAIL_DARK_SURFACE_HEX};
      font: 14px/1.55 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
      word-wrap: break-word;
      color-scheme: light;
      overflow: hidden;
    }
    *, *::before, *::after { box-sizing: inherit; }
    .mail-html-root {
      isolation: isolate;
      forced-color-adjust: none;
      min-height: 0;
      padding: 0;
      margin: 0;
      border-radius: 2px;
      background: ${MAIL_DARK_PAPER_BEFORE_INVERT_HEX};
      color: #1f1f23;
      filter: invert(1) hue-rotate(180deg);
    }
    .mail-html-root img,
    .mail-html-root svg,
    .mail-html-root video {
      filter: invert(1) hue-rotate(180deg);
      forced-color-adjust: none;
    }
    img { max-width: 100%; height: auto; }
    table { max-width: 100%; }
    pre { padding: 8px 12px; overflow: auto; scrollbar-width: thin; }
  </style>
`

const calendarDescriptionLightThemeCss = `
  <style>
    :root { color-scheme: light; }
    html, body {
      margin: 0;
      padding: 14px 18px;
      background: #ffffff;
      color: #1f1f23;
      font: 14px/1.55 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
      word-wrap: break-word;
      overflow: hidden;
    }
    a { color: #0b66c2; }
    img { max-width: 100%; height: auto; }
    blockquote { border-left: 3px solid #d6d6db; margin: 0 0 0 4px; padding: 4px 12px; color: #555; }
    table { max-width: 100%; }
    pre, code { background: #f4f4f6; padding: 2px 4px; border-radius: 3px; font-size: 12px; color: #1f1f23; }
    pre { padding: 8px 12px; overflow: auto; scrollbar-width: thin; }
    hr { border: 0; border-top: 1px solid #e5e5ea; margin: 12px 0; }
  </style>
`

export function buildCalendarDescriptionIframeSrcDoc(
  html: string,
  theme: MailViewerTheme = 'light'
): string {
  if (theme === 'dark') {
    return `<!doctype html><html lang="de"><head><meta charset="utf-8">${mailIframeCspMeta}${calendarDescriptionDarkThemeCss}</head><body><div class="mail-html-root">${html}</div></body></html>`
  }
  return `<!doctype html><html lang="de"><head><meta charset="utf-8">${mailIframeCspMeta}${calendarDescriptionLightThemeCss}</head><body>${html}</body></html>`
}
