import { useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppDialogStore } from '@/stores/app-dialog'

/**
 * Einheitliche modale Dialoge (Alert / Confirm / Prompt) im App-Look,
 * statt nativer Browser- oder OS-Dialoge.
 */
export function AppDialogHost(): JSX.Element | null {
  const open = useAppDialogStore((s) => s.open)
  const kind = useAppDialogStore((s) => s.kind)
  const title = useAppDialogStore((s) => s.title)
  const message = useAppDialogStore((s) => s.message)
  const variant = useAppDialogStore((s) => s.variant)
  const confirmLabel = useAppDialogStore((s) => s.confirmLabel)
  const cancelLabel = useAppDialogStore((s) => s.cancelLabel)
  const okLabel = useAppDialogStore((s) => s.okLabel)
  const inputValue = useAppDialogStore((s) => s.inputValue)
  const placeholder = useAppDialogStore((s) => s.placeholder)
  const setInputValue = useAppDialogStore((s) => s.setInputValue)
  const resolveAndClose = useAppDialogStore((s) => s._resolveAndClose)

  const panelRef = useRef<HTMLDivElement>(null)
  const confirmBtnRef = useRef<HTMLButtonElement>(null)
  const okBtnRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => {
      if (kind === 'prompt') {
        inputRef.current?.focus()
        inputRef.current?.select()
      } else if (kind === 'confirm' && variant === 'danger') {
        confirmBtnRef.current?.focus()
      } else if (kind === 'confirm') {
        confirmBtnRef.current?.focus()
      } else {
        okBtnRef.current?.focus()
      }
    }, 0)
    return (): void => window.clearTimeout(t)
  }, [open, kind, variant])

  const onKeyDown = useCallback(
    (e: KeyboardEvent): void => {
      if (!open) return
      if (e.key === 'Escape') {
        e.preventDefault()
        if (kind === 'alert') resolveAndClose(undefined)
        else if (kind === 'confirm') resolveAndClose(false)
        else if (kind === 'prompt') resolveAndClose(null)
      }
    },
    [open, kind, resolveAndClose]
  )

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown)
    return (): void => window.removeEventListener('keydown', onKeyDown)
  }, [onKeyDown])

  if (!open || kind == null || typeof document === 'undefined') return null

  const Icon = variant === 'danger' ? AlertTriangle : Info

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={(): void => {
        if (kind === 'alert') resolveAndClose(undefined)
        else if (kind === 'confirm') resolveAndClose(false)
        else resolveAndClose(null)
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'app-dialog-title' : undefined}
        aria-describedby="app-dialog-desc"
        className={cn(
          'w-full max-w-md rounded-xl border border-border bg-card text-foreground shadow-2xl',
          'animate-in fade-in zoom-in-95 duration-150'
        )}
        onClick={(e): void => e.stopPropagation()}
      >
        <div className="flex gap-3 border-b border-border px-5 py-4">
          <div
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border',
              variant === 'danger'
                ? 'border-destructive/35 bg-destructive/10 text-destructive'
                : 'border-border bg-muted/50 text-muted-foreground'
            )}
          >
            <Icon className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            {title ? (
              <h2 id="app-dialog-title" className="text-sm font-semibold leading-tight text-foreground">
                {title}
              </h2>
            ) : null}
            <p
              id="app-dialog-desc"
              className={cn(
                'whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground',
                title && 'mt-1.5'
              )}
            >
              {message}
            </p>
          </div>
        </div>

        {kind === 'prompt' ? (
          <div className="border-b border-border px-5 py-3">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              placeholder={placeholder || undefined}
              onChange={(e): void => setInputValue(e.target.value)}
              onKeyDown={(e): void => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  resolveAndClose(inputValue)
                }
              }}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none ring-0 placeholder:text-muted-foreground focus:border-ring"
            />
          </div>
        ) : null}

        <div className="flex justify-end gap-2 px-5 py-3">
          {kind === 'alert' ? (
            <button
              ref={okBtnRef}
              type="button"
              onClick={(): void => resolveAndClose(undefined)}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {okLabel}
            </button>
          ) : kind === 'confirm' ? (
            <>
              <button
                type="button"
                onClick={(): void => resolveAndClose(false)}
                className="rounded-lg border border-border bg-secondary/80 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
              >
                {cancelLabel}
              </button>
              <button
                ref={confirmBtnRef}
                type="button"
                onClick={(): void => resolveAndClose(true)}
                className={cn(
                  'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                  variant === 'danger'
                    ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90'
                )}
              >
                {confirmLabel}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={(): void => resolveAndClose(null)}
                className="rounded-lg border border-border bg-secondary/80 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={(): void => resolveAndClose(inputValue)}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {confirmLabel}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
