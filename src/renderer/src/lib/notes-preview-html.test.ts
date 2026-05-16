import { describe, expect, it } from 'vitest'
import { notesToPreviewHtml } from './notes-preview-html'

describe('notesToPreviewHtml', () => {
  it('linkifies plain http URLs', () => {
    const html = notesToPreviewHtml('Siehe https://example.com/path\nDanke')
    expect(html).toContain('<a href="https://example.com/path">')
    expect(html).toContain('<br>')
  })

  it('passes through HTML notes', () => {
    const raw = '<p>Link <a href="https://x.test">hier</a></p>'
    expect(notesToPreviewHtml(raw)).toBe(raw)
  })
})
