import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Save, StickyNote, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { UserNote, UserNoteCalendarSource } from '@shared/types'
import { cn } from '@/lib/utils'
import { useUndoStore } from '@/stores/undo'
import { MarkdownNoteEditor, type MarkdownNoteEditorLayout } from './MarkdownNoteEditor'

export type ObjectNoteTarget =
  | {
      kind: 'mail'
      messageId: number
      title?: string | null
    }
  | {
      kind: 'calendar'
      accountId: string
      calendarSource: UserNoteCalendarSource
      calendarRemoteId: string
      eventRemoteId: string
      eventTitleSnapshot?: string | null
      eventStartIsoSnapshot?: string | null
      title?: string | null
    }

interface Props {
  target: ObjectNoteTarget
  variant?: 'button' | 'section'
  layout?: MarkdownNoteEditorLayout
  className?: string
}

interface DialogProps {
  target: ObjectNoteTarget | null
  onClose: () => void
}

function targetKey(target: ObjectNoteTarget): string {
  if (target.kind === 'mail') return `mail:${target.messageId}`
  return [
    'calendar',
    target.accountId,
    target.calendarSource,
    target.calendarRemoteId,
    target.eventRemoteId
  ].join(':')
}

function formatUpdatedAt(value: string | null, locale: string): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(locale.startsWith('de') ? 'de-DE' : 'en-GB')
}

export function ObjectNoteEditor({
  target,
  variant = 'button',
  layout = 'live',
  className
}: Props): JSX.Element {
  const { t, i18n } = useTranslation()
  const pushToast = useUndoStore((s) => s.pushToast)
  const [open, setOpen] = useState(variant === 'section')
  const [note, setNote] = useState<UserNote | null>(null)
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const lastSavedBody = useRef('')
  const key = useMemo(() => targetKey(target), [target])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setDirty(false)
    const load =
      target.kind === 'mail'
        ? window.mailClient.notes.getMail(target.messageId)
        : window.mailClient.notes.getCalendar({
            accountId: target.accountId,
            calendarSource: target.calendarSource,
            calendarRemoteId: target.calendarRemoteId,
            eventRemoteId: target.eventRemoteId
          })
    void load
      .then((loaded) => {
        if (cancelled) return
        setNote(loaded)
        const nextBody = loaded?.body ?? ''
        setBody(nextBody)
        lastSavedBody.current = nextBody
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return (): void => {
      cancelled = true
    }
    // `key` captures the target identity; the parent often creates target objects inline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => {
    if (!dirty || body === lastSavedBody.current) return
    const handle = window.setTimeout(() => {
      void save(false)
    }, 800)
    return (): void => window.clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, dirty, key])

  useEffect(() => {
    const off = window.mailClient.events.onNotesChanged((payload) => {
      if (target.kind === 'mail' && payload.messageId !== target.messageId) return
      if (target.kind === 'calendar' && payload.kind && payload.kind !== 'calendar') return
      if (dirty) return
      void reload()
    })
    return off
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, dirty])

  async function reload(): Promise<void> {
    try {
      const loaded =
        target.kind === 'mail'
          ? await window.mailClient.notes.getMail(target.messageId)
          : await window.mailClient.notes.getCalendar({
              accountId: target.accountId,
              calendarSource: target.calendarSource,
              calendarRemoteId: target.calendarRemoteId,
              eventRemoteId: target.eventRemoteId
            })
      setNote(loaded)
      const nextBody = loaded?.body ?? ''
      setBody(nextBody)
      lastSavedBody.current = nextBody
      setDirty(false)
    } catch {
      // Der normale Lade-Effect zeigt Fehler; Broadcast-Reloads bleiben still.
    }
  }

  async function save(showToast: boolean): Promise<void> {
    if (saving || body === lastSavedBody.current) return
    setSaving(true)
    setError(null)
    try {
      const saved =
        target.kind === 'mail'
          ? await window.mailClient.notes.upsertMail({
              messageId: target.messageId,
              title: target.title ?? null,
              body
            })
          : await window.mailClient.notes.upsertCalendar({
              accountId: target.accountId,
              calendarSource: target.calendarSource,
              calendarRemoteId: target.calendarRemoteId,
              eventRemoteId: target.eventRemoteId,
              title: target.title ?? null,
              body,
              eventTitleSnapshot: target.eventTitleSnapshot ?? target.title ?? null,
              eventStartIsoSnapshot: target.eventStartIsoSnapshot ?? null
            })
      setNote(saved)
      lastSavedBody.current = saved.body
      setBody(saved.body)
      setDirty(false)
      if (showToast) {
        pushToast({ label: t('notes.editor.saved'), variant: 'success' })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      if (showToast) {
        pushToast({ label: t('notes.editor.saveFailed'), variant: 'error' })
      }
    } finally {
      setSaving(false)
    }
  }

  const hasContent = body.trim().length > 0
  const updatedLabel = formatUpdatedAt(note?.updatedAt ?? null, i18n.language)

  const editor = (
    <div
      className={cn(
        'rounded-lg border border-border bg-card p-3 shadow-lg',
        variant === 'button' ? 'absolute right-0 top-full z-50 mt-2 w-[min(360px,calc(100vw-32px))]' : 'shadow-none',
        className
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <StickyNote className={cn('h-4 w-4', hasContent && 'fill-amber-300 text-amber-500')} />
          {t('notes.editor.title')}
        </div>
        {variant === 'button' ? (
          <button
            type="button"
            onClick={(): void => setOpen(false)}
            className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label={t('common.close')}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      <MarkdownNoteEditor
        value={body}
        onChange={(nextBody): void => {
          setBody(nextBody)
          setDirty(true)
        }}
        disabled={loading}
        height={variant === 'button' ? 220 : 180}
        layout={layout}
        preview={variant === 'button' ? 'edit' : 'live'}
        placeholder={t('notes.editor.placeholder')}
      />
      <div className="mt-1.5 text-[11px] text-muted-foreground">{t('notes.editor.markdownHint')}</div>
      {error ? <div className="mt-1.5 text-[11px] text-destructive">{error}</div> : null}
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>
          {loading
            ? t('common.loading')
            : updatedLabel
              ? t('notes.editor.updatedAt', { date: updatedLabel })
              : t('notes.editor.notSaved')}
        </span>
        <button
          type="button"
          disabled={saving || loading || body === lastSavedBody.current}
          onClick={(): void => void save(true)}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/60 px-2 py-1 font-medium text-foreground hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          {saving ? t('notes.editor.saving') : t('common.save')}
        </button>
      </div>
    </div>
  )

  if (variant === 'section') return editor

  return (
    <div className="relative">
      <button
        type="button"
        onClick={(): void => setOpen((v) => !v)}
        className={cn(
          'inline-flex h-6 shrink-0 items-center gap-1 rounded-md border px-2 text-[10px] font-medium transition-colors',
          hasContent
            ? 'border-amber-400/40 bg-amber-400/10 text-foreground hover:bg-amber-400/15'
            : 'border-dashed border-border text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
        )}
        title={t('notes.editor.open')}
      >
        <StickyNote className={cn('h-3 w-3', hasContent && 'fill-amber-300 text-amber-500')} />
        {t('notes.editor.shortLabel')}
      </button>
      {open ? editor : null}
    </div>
  )
}

export function ObjectNoteDialog({ target, onClose }: DialogProps): JSX.Element | null {
  const { t } = useTranslation()

  useEffect(() => {
    if (!target) return undefined
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return (): void => window.removeEventListener('keydown', onKey)
  }, [onClose, target])

  if (!target) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]"
      onMouseDown={(e): void => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('notes.editor.open')}
        className="w-[min(460px,calc(100vw-32px))] rounded-xl border border-border bg-card shadow-2xl"
      >
        <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <StickyNote className="h-4 w-4 text-amber-500" />
            {t('notes.editor.title')}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label={t('common.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <ObjectNoteEditor
          target={target}
          variant="section"
          layout="toggle"
          className="rounded-t-none border-0 shadow-none"
        />
      </div>
    </div>
  )
}
