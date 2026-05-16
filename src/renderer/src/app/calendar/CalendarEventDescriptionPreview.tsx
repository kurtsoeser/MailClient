import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  buildMailShadowRootInnerHtml,
  isEffectivelyEmptyDescriptionHtml,
  sanitizeMailHtml,
  type MailViewerTheme
} from '@/lib/sanitize'
import { useSanitizedHtmlShadowRoot } from '@/lib/use-sanitized-html-shadow-root'
import { cn } from '@/lib/utils'

const DESCRIPTION_MAX_HEIGHT_PX = Math.min(
  typeof window !== 'undefined' ? window.innerHeight * 0.7 : 720,
  1040
)

export interface CalendarEventDescriptionPreviewProps {
  /** Rohes HTML (wird angezeigeseitig bereinigt). */
  html: string
  viewerTheme: MailViewerTheme
  className?: string
}

/**
 * Kalenderbeschreibung: kompakt ohne Inhalt, sonst Shadow-DOM mit inhaltsgerechter Hoehe.
 * Externe Links oeffnen im Systembrowser (wie Mail-Leseansicht).
 */
export function CalendarEventDescriptionPreview({
  html,
  viewerTheme,
  className
}: CalendarEventDescriptionPreviewProps): JSX.Element {
  const { t } = useTranslation()
  const shadowHostRef = useRef<HTMLDivElement>(null)
  const [contentHeight, setContentHeight] = useState(48)

  const isEmpty = useMemo(() => isEffectivelyEmptyDescriptionHtml(html), [html])

  const safeHtml = useMemo(() => {
    if (isEmpty) return ''
    return sanitizeMailHtml(html.trim(), { loadImages: true })
  }, [html, isEmpty])

  const shadowInnerHtml = useMemo(
    () => (isEmpty ? '' : buildMailShadowRootInnerHtml(safeHtml, viewerTheme)),
    [isEmpty, safeHtml, viewerTheme]
  )

  useSanitizedHtmlShadowRoot(shadowHostRef, shadowInnerHtml, 'calendar', viewerTheme)

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

  if (isEmpty) {
    return (
      <p
        className={cn(
          'text-[13px] italic leading-snug text-muted-foreground',
          className
        )}
      >
        {t('calendar.eventDialog.descriptionEmptyReadonly')}
      </p>
    )
  }

  const capped = contentHeight > DESCRIPTION_MAX_HEIGHT_PX
  const frameHeight = capped ? DESCRIPTION_MAX_HEIGHT_PX : contentHeight

  return (
    <div
      className={cn(
        'rounded-md border border-border bg-background',
        capped && 'calendar-description-scroll overflow-y-auto overflow-x-hidden',
        className
      )}
      style={capped ? { maxHeight: DESCRIPTION_MAX_HEIGHT_PX } : undefined}
    >
      <div
        ref={shadowHostRef}
        className="mail-reading-shadow-host block w-full border-0"
        data-mail-viewer-theme={viewerTheme}
        style={{ height: frameHeight }}
        role="document"
        aria-label={t('calendar.eventDialog.description')}
      />
    </div>
  )
}

