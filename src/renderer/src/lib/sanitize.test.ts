/** @vitest-environment jsdom */

import { describe, expect, it } from 'vitest'
import { replaceInlineCidImages, sanitizeMailHtml, buildMailShadowRootInnerHtml } from './sanitize'

describe('replaceInlineCidImages', () => {
  it('ersetzt cid-src mit Data-URI', () => {
    const html = '<p><img src="cid:abc123"></p>'
    const out = replaceInlineCidImages(html, { abc123: 'data:image/png;base64,AAA' })
    expect(out).toContain('data:image/png;base64,AAA')
    expect(out).not.toContain('cid:abc123')
  })

  it('laesst unbekannte cid unveraendert', () => {
    const html = '<img src="cid:unknown">'
    expect(replaceInlineCidImages(html, {})).toBe(html)
  })
})

describe('sanitizeMailHtml', () => {
  it('entfernt script und blockiert https-Bilder ohne loadImages', () => {
    const dirty = '<p>Hi</p><script>alert(1)</script><img src="https://x.example/track.png">'
    const clean = sanitizeMailHtml(dirty, { loadImages: false })
    expect(clean).not.toContain('<script')
    expect(clean).toContain('blocked')
    expect(clean).toContain('Hi')
  })

  it('laesst data-URIs zu wenn loadImages true', () => {
    const html = '<img src="data:image/png;base64,AAA">'
    const clean = sanitizeMailHtml(html, { loadImages: true })
    expect(clean).toContain('data:image/png;base64,AAA')
  })

  it('neutralisiert ms-outlook-Link fuer externes Oeffnen', () => {
    const dirty = '<a href="ms-outlook://events/0?itemid=abc">Termin</a>'
    const clean = sanitizeMailHtml(dirty, { loadImages: true })
    expect(clean).toContain('data-mail-external="ms-outlook://events/0?itemid=abc"')
    expect(clean).toMatch(/href\s*=\s*["']#["']/i)
  })

  it('entfernt target am Link (kein Electron-Popup / kein _blank)', () => {
    const dirty = '<a href="https://example.com/path" target="_blank">go</a>'
    const clean = sanitizeMailHtml(dirty, { loadImages: true })
    expect(clean).toContain('data-mail-external="https://example.com/path"')
    expect(clean).toMatch(/href\s*=\s*["']#["']/i)
    expect(clean).not.toMatch(/\btarget\s*=/i)
  })
})

describe('buildMailShadowRootInnerHtml', () => {
  it('nutzt :host statt html/body', () => {
    const inner = buildMailShadowRootInnerHtml('<p>x</p>', 'light')
    expect(inner).toContain(':host')
    expect(inner).not.toMatch(/<html[\s>]/i)
    expect(inner).toContain('<p>x</p>')
  })

  it('dark-Shadow ohne 100vh-Mindesthoehe (Scroll im Lesebereich)', () => {
    const inner = buildMailShadowRootInnerHtml('<p>x</p>', 'dark')
    expect(inner).toContain(':host')
    expect(inner).not.toContain('100vh')
    expect(inner).toContain('min-height: 0')
    expect(inner).toContain('filter: invert(1)')
  })

  it('heller Shadow nutzt mail-html-root--light ohne Invert', () => {
    const inner = buildMailShadowRootInnerHtml('<p>x</p>', 'light')
    expect(inner).toContain('mail-html-root--light')
    expect(inner).not.toContain('filter: invert(1)')
  })
})
