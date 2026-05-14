import { useEffect } from 'react'
import { CheckCircle2, AlertCircle, Info, X, Undo2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUndoStore } from '@/stores/undo'

/**
 * Globaler Toast-Stack unten rechts. Wird durch `useUndoStore.pushToast()`
 * gefuettert. Zusaetzlich registrieren wir hier den globalen Strg+Z-Shortcut
 * fuer "letzte Aktion zuruecknehmen".
 */
export function ToastStack(): JSX.Element {
  const toasts = useUndoStore((s) => s.toasts)
  const dismissToast = useUndoStore((s) => s.dismissToast)
  const undoLast = useUndoStore((s) => s.undoLast)

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const target = e.target as HTMLElement | null
      if (target) {
        const isInput =
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable
        if (isInput) return
      }
      const isCtrlZ = (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z'
      if (isCtrlZ) {
        e.preventDefault()
        void undoLast()
      }
    }
    window.addEventListener('keydown', onKey)
    return (): void => window.removeEventListener('keydown', onKey)
  }, [undoLast])

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col items-stretch gap-2">
      {toasts.map((t) => {
        const Icon =
          t.variant === 'success' ? CheckCircle2 : t.variant === 'error' ? AlertCircle : Info
        return (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex items-start gap-2 rounded-lg border bg-popover px-3 py-2.5 text-xs shadow-lg backdrop-blur',
              t.variant === 'success' && 'border-emerald-500/30',
              t.variant === 'error' && 'border-destructive/40',
              t.variant === 'info' && 'border-border'
            )}
          >
            <Icon
              className={cn(
                'mt-0.5 h-3.5 w-3.5 shrink-0',
                t.variant === 'success' && 'text-emerald-400',
                t.variant === 'error' && 'text-destructive',
                t.variant === 'info' && 'text-muted-foreground'
              )}
            />
            <span className="flex-1 leading-snug text-foreground">{t.label}</span>
            {t.onUndo && (
              <button
                type="button"
                onClick={(): void => {
                  dismissToast(t.id)
                  void Promise.resolve(t.onUndo?.())
                }}
                className="inline-flex shrink-0 items-center gap-1 rounded border border-border bg-secondary/60 px-2 py-0.5 text-[10px] font-medium text-foreground transition-colors hover:bg-secondary"
                title="Rueckgaengig (Strg+Z)"
              >
                <Undo2 className="h-3 w-3" />
                Undo
              </button>
            )}
            <button
              type="button"
              onClick={(): void => dismissToast(t.id)}
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label="Schliessen"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
