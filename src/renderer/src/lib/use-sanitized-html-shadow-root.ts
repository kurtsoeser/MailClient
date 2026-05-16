import { type RefObject, useEffect } from 'react'
import { hrefForExternalOpen, openExternalUrl } from '@/lib/open-external'

function linkFromComposedPath(e: Event): Element | null {
  for (const n of e.composedPath()) {
    if (n instanceof Element && n.tagName.toLowerCase() === 'a') {
      return n
    }
  }
  return null
}

/**
 * Sanitisiertes HTML im offenen Shadow-Root des Hosts; externe Links per IPC.
 * Gleiches Muster wie die Mail-Leseansicht (zuverlaessiger als srcdoc-Iframe in Electron).
 */
export function useSanitizedHtmlShadowRoot(
  hostRef: RefObject<HTMLElement | null>,
  shadowInnerHtml: string,
  logPrefix: 'mail' | 'calendar' | 'task'
): void {
  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    if (!host.shadowRoot) {
      host.attachShadow({ mode: 'open' })
    }
    const shadow = host.shadowRoot!
    shadow.innerHTML = shadowInnerHtml

    const openFromEvent = (e: MouseEvent): void => {
      if (e.defaultPrevented) return
      if (e.type === 'auxclick' && e.button !== 1) return
      if (e.type === 'click' && e.button !== 0) return
      const linkEl = linkFromComposedPath(e)
      if (!linkEl) return
      if (!shadow.contains(linkEl)) return

      const rawHref =
        linkEl.getAttribute('data-mail-external')?.trim() ||
        linkEl.getAttribute('href') ||
        linkEl.getAttribute('xlink:href')
      const url = hrefForExternalOpen(rawHref)

      e.preventDefault()
      e.stopPropagation()

      if (!url) return
      void openExternalUrl(url).catch((err) => {
        console.warn(`[${logPrefix}] Link konnte nicht geoeffnet werden:`, err)
      })
    }

    const keyOpen = (e: KeyboardEvent): void => {
      if (e.defaultPrevented) return
      if (e.key !== 'Enter') return
      const linkEl = linkFromComposedPath(e)
      if (!linkEl) return
      if (!shadow.contains(linkEl)) return
      const ae = document.activeElement
      if (ae && ae !== linkEl && !linkEl.contains(ae)) return

      const rawHref =
        linkEl.getAttribute('data-mail-external')?.trim() ||
        linkEl.getAttribute('href') ||
        linkEl.getAttribute('xlink:href')
      const url = hrefForExternalOpen(rawHref)
      e.preventDefault()
      e.stopPropagation()
      if (!url) return
      void openExternalUrl(url).catch((err) => {
        console.warn(`[${logPrefix}] Link (Tastatur) konnte nicht geoeffnet werden:`, err)
      })
    }

    host.addEventListener('click', openFromEvent, false)
    host.addEventListener('auxclick', openFromEvent, false)
    host.addEventListener('keydown', keyOpen, false)
    return (): void => {
      host.removeEventListener('click', openFromEvent, false)
      host.removeEventListener('auxclick', openFromEvent, false)
      host.removeEventListener('keydown', keyOpen, false)
    }
  }, [shadowInnerHtml, logPrefix])
}
