import { lazy, Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import type { MarkdownNoteEditorLayout } from './MarkdownNoteEditor'

const MarkdownNoteEditor = lazy(async () => {
  const m = await import('./MarkdownNoteEditor')
  return { default: m.MarkdownNoteEditor }
})

type MarkdownPreviewMode = 'live' | 'edit' | 'preview'

interface MarkdownNoteEditorLazyProps {
  value: string
  onChange: (value: string) => void
  placeholder: string
  height: number
  preview?: MarkdownPreviewMode
  layout?: MarkdownNoteEditorLayout
  disabled?: boolean
  className?: string
}

export function MarkdownNoteEditorLazy(props: MarkdownNoteEditorLazyProps): JSX.Element {
  return (
    <Suspense
      fallback={
        <div
          className="flex items-center justify-center rounded-md border border-border bg-muted/20 text-muted-foreground"
          style={{ height: props.height }}
        >
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        </div>
      }
    >
      <MarkdownNoteEditor {...props} />
    </Suspense>
  )
}
