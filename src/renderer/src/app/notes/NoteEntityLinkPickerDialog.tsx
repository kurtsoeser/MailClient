import { useEffect, useState } from 'react'
import {
  CalendarDays,
  CheckSquare,
  Loader2,
  Mail,
  StickyNote,
  X
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type {
  NoteEntityLinkTarget,
  NoteEntityLinkTargetKind,
  NoteLinkTargetCandidate,
  NoteLinksBundle
} from '@shared/note-entity-links'
import { cn } from '@/lib/utils'

const PICKER_KINDS: NoteEntityLinkTargetKind[] = [
  'note',
  'mail',
  'calendar_event',
  'cloud_task'
]

function kindIcon(kind: NoteEntityLinkTargetKind): typeof StickyNote {
  if (kind === 'mail') return Mail
  if (kind === 'calendar_event') return CalendarDays
  if (kind === 'cloud_task') return CheckSquare
  return StickyNote
}

export function NoteEntityLinkPickerDialog({
  noteId,
  open,
  onClose,
  onLinked
}: {
  noteId: number
  open: boolean
  onClose: () => void
  onLinked?: () => void
}): JSX.Element | null {
  const { t } = useTranslation()
  const [bundle, setBundle] = useState<NoteLinksBundle>({ outgoing: [], incoming: [] })
  const [pickerKind, setPickerKind] = useState<NoteEntityLinkTargetKind | 'all'>('all')
  const [search, setSearch] = useState('')
  const [candidates, setCandidates] = useState<NoteLinkTargetCandidate[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setPickerKind('all')
    setSearch('')
    void window.mailClient.notes.links
      .list(noteId)
      .then(setBundle)
      .catch(() => setBundle({ outgoing: [], incoming: [] }))
  }, [open, noteId])

  useEffect(() => {
    if (!open) return
    const handle = window.setTimeout(() => {
      void window.mailClient.notes.links
        .searchTargets({ query: search.trim(), excludeNoteId: noteId, limit: 40 })
        .then((rows) => {
          const linkedKeys = new Set(bundle.outgoing.map((item) => JSON.stringify(item.target)))
          setCandidates(
            rows.filter((c) => {
              if (pickerKind !== 'all' && c.target.kind !== pickerKind) return false
              return !linkedKeys.has(JSON.stringify(c.target))
            })
          )
        })
        .catch(() => setCandidates([]))
    }, 150)
    return (): void => window.clearTimeout(handle)
  }, [open, search, noteId, pickerKind, bundle.outgoing])

  async function addLink(target: NoteEntityLinkTarget): Promise<void> {
    setBusy(true)
    try {
      await window.mailClient.notes.links.add({ fromNoteId: noteId, target })
      onLinked?.()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[320] flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e): void => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="note-link-picker-title"
        className="flex max-h-[min(520px,90vh)] w-full max-w-md flex-col overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl"
        onMouseDown={(e): void => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 id="note-link-picker-title" className="text-sm font-semibold">
            {t('notes.pagesContextMenu.linkDialogTitle')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label={t('common.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={(): void => setPickerKind('all')}
              className={cn(
                'rounded-md border px-2 py-0.5 text-[10px]',
                pickerKind === 'all'
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border text-muted-foreground hover:bg-secondary/60'
              )}
            >
              {t('notes.links.filterAll')}
            </button>
            {PICKER_KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={(): void => setPickerKind(kind)}
                className={cn(
                  'rounded-md border px-2 py-0.5 text-[10px]',
                  pickerKind === kind
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border text-muted-foreground hover:bg-secondary/60'
                )}
              >
                {t(`notes.links.kind.${kind}`)}
              </button>
            ))}
          </div>

          <input
            type="search"
            value={search}
            onChange={(e): void => setSearch(e.target.value)}
            placeholder={t('notes.links.searchPlaceholder')}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
            autoFocus
          />

          <div className="max-h-56 overflow-y-auto rounded-md border border-border">
            {candidates.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">{t('notes.links.noCandidates')}</p>
            ) : (
              candidates.map((c) => {
                const Icon = kindIcon(c.target.kind)
                return (
                  <button
                    key={JSON.stringify(c.target)}
                    type="button"
                    disabled={busy}
                    onClick={(): void => void addLink(c.target)}
                    className="flex w-full items-center gap-2 border-b border-border/50 px-3 py-2 text-left text-xs hover:bg-secondary/50 last:border-0 disabled:opacity-50"
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{c.title}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {t(`notes.links.kind.${c.target.kind}`)}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {busy ? (
          <footer className="flex shrink-0 items-center gap-2 border-t border-border px-4 py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t('common.loading')}
          </footer>
        ) : null}
      </div>
    </div>
  )
}