import type { DetailedHTMLProps, HTMLAttributes } from 'react'

declare global {
  namespace JSX {
    interface IntrinsicElements {
      /** Electron <webview>; erfordert `webviewTag: true` im BrowserWindow. */
      webview: DetailedHTMLProps<
        HTMLAttributes<HTMLElement> & {
          src?: string
          partition?: string
          allowpopups?: '' | 'true' | 'false' | boolean
          useragent?: string
          webpreferences?: string
        },
        HTMLElement
      >
    }
  }
}

export {}
