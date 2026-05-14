import { Reply, Forward, Paperclip } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  /** Anzeige-Variante: kompakte greybar mit Hover-Aktionen. */
  onReply: () => void
  onForward: () => void
  /** Anhang-Button rechts (oeffnet Compose mit Anhang-Picker, optional). */
  onAttach?: () => void
  disabled?: boolean
  className?: string
}

/**
 * Inline-Reply-Bar unten am Reading-Pane (vgl. Frank Aguilera, Front,
 * Email-Kit). Klick auf den Hauptbereich loest `Antworten` aus.
 * Hover zeigt zusaetzlich `Weiterleiten` deutlicher hervor.
 */
export function InlineReplyBar({
  onReply,
  onForward,
  onAttach,
  disabled,
  className
}: Props): JSX.Element {
  return (
    <div
      className={cn(
        'group flex shrink-0 items-center gap-2 border-t border-border bg-card/60 px-4 py-2.5 transition-colors',
        disabled ? 'opacity-50' : 'hover:bg-card',
        className
      )}
    >
      <button
        type="button"
        onClick={onReply}
        disabled={disabled}
        className={cn(
          'flex flex-1 items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-left text-xs text-muted-foreground transition-colors',
          !disabled && 'hover:border-ring/60 hover:text-foreground'
        )}
        title="Antworten (R)"
      >
        <Reply className="h-3.5 w-3.5 shrink-0" />
        <span>
          Klicke hier, um zu{' '}
          <span className="font-medium text-foreground/90 underline decoration-dotted underline-offset-2">
            antworten
          </span>{' '}
          oder{' '}
          <button
            type="button"
            onClick={(e): void => {
              e.preventDefault()
              e.stopPropagation()
              if (!disabled) onForward()
            }}
            className="font-medium text-foreground/90 underline decoration-dotted underline-offset-2 hover:text-foreground"
          >
            weiterzuleiten
          </button>
          .
        </span>
      </button>

      {onAttach && (
        <button
          type="button"
          onClick={onAttach}
          disabled={disabled}
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors',
            !disabled && 'hover:bg-secondary hover:text-foreground'
          )}
          aria-label="Antworten mit Anhang"
          title="Antworten mit Anhang"
        >
          <Paperclip className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
