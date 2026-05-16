import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  buildMailShadowRootInnerHtml,
  isEffectivelyEmptyDescriptionHtml,
  sanitizeMailHtml,
  type MailViewerTheme
} from '@/lib/sanitize'
import { notesToPreviewHtml } from '@/lib/notes-preview-html'
import { useSanitizedHtmlShadowRoot } from '@/lib/use-sanitized-html-shadow-root'
import { cn } from '@/lib/utils'

const NOTES_MAX_HEIGHT_PX = Math.min(
  typeof window !== 'undefined' ? window.innerHeight * 0.5 : 480,
  720
)

export interface RichTextNotesPreviewProps {
  notes: string
  viewerTheme: MailViewerTheme
  className?: string
}

/** Aufgaben-Notizen (HTML oder Klartext mit URLs) — Links oeffnen im Systembrowser. */
export function RichTextNotesPreview({
  notes,
  viewerTheme,
  className
}: RichTextNotesPreviewProps): JSX.Element {
  const shadowHostRef = useRef<HTMLDivElement>(null)
  const [contentHeight, setContentHeight] = useState(48)

  const rawHtml = useMemo(() => notesToPreviewHtml(notes), [notes])
  const isEmpty = useMemo(() => isEffectivelyEmptyDescriptionHtml(rawHtml), [rawHtml])

  const safeHtml = useMemo(() => {
    if (isEmpty) return ''
    return sanitizeMailHtml(rawHtml, { loadImages: true })
  }, [rawHtml, isEmpty])

  const shadowInnerHtml = useMemo(
    () => (isEmpty ? '' : buildMailShadowRootInnerHtml(safeHtml, viewerTheme)),
    [isEmpty, safeHtml, viewerTheme]
  )

  useSanitizedHtmlShadowRoot(shadowHostRef, shadowInnerHtml, 'task')

  useLayoutEffect(() => {
    if (isEmpty) return
    const measureHost = (): void => {
      const host = shadowHostRef.current
      if (!host) return
      const h = Math.max(host.scrollHeight, host.offsetHeight)
      setContentHeight(Math.max(48, Math.ceil(h)))
    }
    setContentHeight(48)
    measureHost()
    const tid = window.requestAnimationFrame(measureHost)
    return (): void => window.cancelAnimationFrame(tid)
  }, [isEmpty, shadowInnerHtml])

  const capped = contentHeight > NOTES_MAX_HEIGHT_PX
  const frameHeight = capped ? NOTES_MAX_HEIGHT_PX : contentHeight

  return (
    <div
      className={cn(
        'rounded-md border border-border bg-background',
        capped && 'overflow-y-auto overflow-x-hidden',
        className
      )}
      style={capped ? { maxHeight: NOTES_MAX_HEIGHT_PX } : undefined}
    >
      <div
        ref={shadowHostRef}
        className="block w-full border-0 bg-transparent"
        style={{ height: frameHeight, minHeight: 48 }}
        role="document"
      />
    </div>
  )
}
