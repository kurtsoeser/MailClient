/** @vitest-environment jsdom */

import { describe, expect, it } from 'vitest'
import { replaceInlineCidImages, sanitizeMailHtml } from './sanitize'

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

  it('entfernt target am Link (kein Electron-Popup / kein _blank)', () => {
    const dirty = '<a href="https://example.com/path" target="_blank">go</a>'
    const clean = sanitizeMailHtml(dirty, { loadImages: true })
    expect(clean).toContain('data-mail-external="https://example.com/path"')
    expect(clean).toMatch(/href\s*=\s*["']#["']/i)
    expect(clean).not.toMatch(/\btarget\s*=/i)
  })
})
