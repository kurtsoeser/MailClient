import {
  Cloud,
  File as FileIcon,
  FileImage,
  FileText,
  X
} from 'lucide-react'
import type { ComponentType } from 'react'
import { cn } from '@/lib/utils'
import { formatAttachmentBytes } from '@/lib/attachment-files'

export function CloudAttachmentChip({
  name,
  onRemove,
  onOpen,
  removeAriaLabel = 'Cloud-Anhang entfernen'
}: {
  name: string
  onRemove?: () => void
  onOpen?: () => void
  removeAriaLabel?: string
}): JSX.Element {
  const inner = (
    <>
      <div className="flex items-center gap-2">
        <Cloud className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground">{name}</span>
        {onRemove ? (
          <button
            type="button"
            onClick={(e): void => {
              e.stopPropagation()
              onRemove()
            }}
            className="rounded p-0.5 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
            aria-label={removeAriaLabel}
            title="Entfernen"
          >
            <X className="h-3 w-3" />
          </button>
        ) : null}
      </div>
      <span className="text-[10px] text-muted-foreground">OneDrive / SharePoint</span>
    </>
  )

  const className =
    'flex max-w-[260px] flex-col gap-1 rounded-xl border border-sky-500/30 bg-sky-500/5 px-3 py-2 text-left shadow-sm transition-colors hover:bg-sky-500/10'

  if (onOpen) {
    return (
      <button type="button" onClick={onOpen} className={className} title={name}>
        {inner}
      </button>
    )
  }

  return <div className={className}>{inner}</div>
}

export function LocalAttachmentChip({
  name,
  contentType,
  size,
  onRemove,
  onOpen,
  removeAriaLabel = 'Anhang entfernen'
}: {
  name: string
  contentType: string
  size: number | null
  onRemove?: () => void
  onOpen?: () => void
  removeAriaLabel?: string
}): JSX.Element {
  const Icon = pickAttachmentIcon(contentType, name)
  const inner = (
    <>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
        {onRemove ? (
          <button
            type="button"
            onClick={(e): void => {
              e.stopPropagation()
              onRemove()
            }}
            className="rounded p-0.5 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
            aria-label={removeAriaLabel}
            title="Entfernen"
          >
            <X className="h-3 w-3" />
          </button>
        ) : null}
      </div>
      {size != null ? (
        <span className="text-[10px] text-muted-foreground">{formatAttachmentBytes(size)}</span>
      ) : null}
    </>
  )

  const className = cn(
    'flex max-w-[260px] flex-col gap-1 rounded-xl border border-border/80 bg-card px-3 py-2',
    'text-[11px] text-foreground shadow-sm',
    onOpen && 'text-left transition-colors hover:bg-secondary/30'
  )

  if (onOpen) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className={className}
        title={`${name}${size != null ? ` · ${formatAttachmentBytes(size)}` : ''}`}
      >
        {inner}
      </button>
    )
  }

  return (
    <div
      className={className}
      title={size != null ? `${name} · ${formatAttachmentBytes(size)}` : name}
    >
      {inner}
    </div>
  )
}

function pickAttachmentIcon(
  mime: string,
  name: string
): ComponentType<{ className?: string }> {
  if (mime.startsWith('image/')) return FileImage
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (mime.startsWith('text/') || ['txt', 'md', 'log', 'csv'].includes(ext)) return FileText
  return FileIcon
}
