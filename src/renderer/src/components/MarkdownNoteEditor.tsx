import { useEffect, useRef, useState } from 'react'
import MDEditor from '@uiw/react-md-editor'
import { useTranslation } from 'react-i18next'
import '@uiw/react-md-editor/markdown-editor.css'
import '@uiw/react-markdown-preview/markdown.css'
import { cn } from '@/lib/utils'
import { hrefForExternalOpen, openExternalUrl } from '@/lib/open-external'

type MarkdownPreviewMode = 'live' | 'edit' | 'preview'
export type MarkdownNoteEditorLayout = 'live' | 'toggle'

interface MarkdownNoteEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder: string
  height: number
  preview?: MarkdownPreviewMode
  layout?: MarkdownNoteEditorLayout
  disabled?: boolean
  className?: string
}

export function MarkdownNoteEditor({
  value,
  onChange,
  placeholder,
  height,
  preview = 'live',
  layout = 'live',
  disabled,
  className
}: MarkdownNoteEditorProps): JSX.Element {
  const { t } = useTranslation()
  const rootRef = useRef<HTMLDivElement>(null)
  const [colorMode, setColorMode] = useState<'light' | 'dark'>(() =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  )
  const [togglePreview, setTogglePreview] = useState<Extract<MarkdownPreviewMode, 'edit' | 'preview'>>('edit')
  const effectivePreview = layout === 'toggle' ? togglePreview : preview

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setColorMode(document.documentElement.classList.contains('dark') ? 'dark' : 'light')
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const onLinkNav = (e: MouseEvent): void => {
      if (e.defaultPrevented) return
      if (e.type === 'auxclick' && e.button !== 1) return
      if (e.type === 'click' && e.button !== 0) return
      const tEl = e.target
      if (!(tEl instanceof Element)) return
      const a = tEl.closest('a')
      if (!a) return
      const href = hrefForExternalOpen(a.getAttribute('href'))
      if (!href) return
      e.preventDefault()
      e.stopPropagation()
      void openExternalUrl(href).catch((err) => console.warn('[markdown-note] Link extern:', err))
    }
    root.addEventListener('click', onLinkNav, true)
    root.addEventListener('auxclick', onLinkNav, true)
    return (): void => {
      root.removeEventListener('click', onLinkNav, true)
      root.removeEventListener('auxclick', onLinkNav, true)
    }
  }, [])

  return (
    <div ref={rootRef} className={cn('markdown-note-editor', className)} data-color-mode={colorMode}>
      {layout === 'toggle' ? (
        <div className="mb-2 flex justify-end">
          <div
            className="inline-flex rounded-md border border-border bg-secondary/40 p-0.5 text-[11px] font-medium"
            role="tablist"
            aria-label={t('notes.editor.viewSwitcherLabel')}
          >
            <button
              type="button"
              role="tab"
              aria-selected={togglePreview === 'edit'}
              onClick={(): void => setTogglePreview('edit')}
              className={cn(
                'rounded px-2 py-1 transition-colors',
                togglePreview === 'edit'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t('notes.editor.markdownTab')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={togglePreview === 'preview'}
              onClick={(): void => setTogglePreview('preview')}
              className={cn(
                'rounded px-2 py-1 transition-colors',
                togglePreview === 'preview'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t('notes.editor.previewTab')}
            </button>
          </div>
        </div>
      ) : null}
      <MDEditor
        value={value}
        onChange={(nextValue): void => onChange(nextValue ?? '')}
        height={height}
        preview={effectivePreview}
        visibleDragbar={false}
        textareaProps={{
          placeholder,
          disabled,
          spellCheck: true
        }}
      />
    </div>
  )
}
