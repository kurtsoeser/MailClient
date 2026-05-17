import { useCallback, useEffect, useState } from 'react'
import {
  CalendarDays,
  CheckSquare,
  ExternalLink,
  Eye,
  Link2,
  Loader2,
  Mail,
  Plus,
  StickyNote,
  X
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type {
  NoteEntityLinkTarget,
  NoteEntityLinkedItem,
  NoteLinkTargetCandidate,
  NoteLinksBundle,
  NoteEntityLinkTargetKind
} from '@shared/note-entity-links'
import { cn } from '@/lib/utils'
import { noteEntityLinkTargetKey } from '@shared/note-entity-links'
import { openNoteEntityLinkTarget } from '@/lib/note-entity-link-nav'
import { useAppModeStore } from '@/stores/app-mode'

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

export function NotesLinkedObjectsPanel({
  noteId,
  onOpenNote,
  selectedPreviewKey,
  onSelectForPreview,
  onLinksLoaded,
  previewOpen,
  onTogglePreview
}: {
  noteId: number
  onOpenNote: (id: number) => void
  selectedPreviewKey?: string | null
  onSelectForPreview?: (item: NoteEntityLinkedItem, direction: 'outgoing' | 'incoming') => void
  onLinksLoaded?: (bundle: NoteLinksBundle) => void
  previewOpen?: boolean
  onTogglePreview?: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const setAppMode = useAppModeStore((s) => s.setMode)
  const [bundle, setBundle] = useState<NoteLinksBundle>({ outgoing: [], incoming: [] })
  const [loading, setLoading] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerKind, setPickerKind] = useState<NoteEntityLinkTargetKind | 'all'>('all')
  const [search, setSearch] = useState('')
  const [candidates, setCandidates] = useState<NoteLinkTargetCandidate[]>([])
  const [busy, setBusy] = useState(false)

  const loadLinks = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const next = await window.mailClient.notes.links.list(noteId)
      setBundle(next)
      onLinksLoaded?.(next)
    } catch {
      const empty = { outgoing: [], incoming: [] }
      setBundle(empty)
      onLinksLoaded?.(empty)
    } finally {
      setLoading(false)
    }
  }, [noteId, onLinksLoaded])

  useEffect(() => {
    void loadLinks()
  }, [loadLinks])

  useEffect(() => {
    if (!pickerOpen) return
    const handle = window.setTimeout(() => {
      void window.mailClient.notes.links
        .searchTargets({ query: search.trim(), excludeNoteId: noteId, limit: 40 })
        .then((rows) => {
          const linkedKeys = new Set(
            bundle.outgoing.map((item) => JSON.stringify(item.target))
          )
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
  }, [pickerOpen, search, noteId, pickerKind, bundle.outgoing])

  async function addLink(target: NoteEntityLinkTarget): Promise<void> {
    setBusy(true)
    try {
      await window.mailClient.notes.links.add({ fromNoteId: noteId, target })
      setPickerOpen(false)
      setSearch('')
      await loadLinks()
    } finally {
      setBusy(false)
    }
  }

  async function removeOutgoing(linkId: number): Promise<void> {
    setBusy(true)
    try {
      await window.mailClient.notes.links.remove({ fromNoteId: noteId, linkId, direction: 'outgoing' })
      await loadLinks()
    } finally {
      setBusy(false)
    }
  }

  async function removeIncoming(linkId: number): Promise<void> {
    setBusy(true)
    try {
      await window.mailClient.notes.links.remove({ fromNoteId: noteId, linkId, direction: 'incoming' })
      await loadLinks()
    } finally {
      setBusy(false)
    }
  }

  async function openLink(item: NoteEntityLinkedItem): Promise<void> {
    if (item.target.kind === 'note') {
      onOpenNote(item.target.noteId)
      return
    }
    await openNoteEntityLinkTarget(item.target, setAppMode)
  }

  function renderLinkRow(
    item: NoteEntityLinkedItem,
    direction: 'outgoing' | 'incoming',
    onRemove: (linkId: number) => void
  ): JSX.Element {
    const kind = item.target.kind
    const Icon = kindIcon(kind)
    const key = noteEntityLinkTargetKey(item.target)
    const selected = selectedPreviewKey === key
    return (
      <div
        key={item.linkId}
        className={cn(
          'flex items-center gap-1 rounded-md px-1 py-0.5',
          selected ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-secondary/40'
        )}
      >
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <button
          type="button"
          onClick={(): void => onSelectForPreview?.(item, direction)}
          className="min-w-0 flex-1 text-left"
          title={t('notes.preview.showInPane')}
        >
          <span className="block truncate text-xs text-foreground">{item.title}</span>
          {item.subtitle ? (
            <span className="block truncate text-[10px] text-muted-foreground">
              {t(`notes.links.kind.${kind}`)}
              {kind === 'note' ? '' : ` · ${item.subtitle}`}
            </span>
          ) : (
            <span className="block text-[10px] text-muted-foreground">
              {t(`notes.links.kind.${kind}`)}
            </span>
          )}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={(): void => void openLink(item)}
          className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label={t('notes.preview.openExternal')}
          title={t('notes.preview.openExternal')}
        >
          <ExternalLink className="h-3 w-3" />
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={(): void => void onRemove(item.linkId)}
          className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label={t('notes.links.remove')}
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-background/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-medium text-foreground">
          <Link2 className="h-3.5 w-3.5" />
          {t('notes.links.title')}
        </div>
        <div className="flex items-center gap-1">
          {onTogglePreview ? (
            <button
              type="button"
              onClick={onTogglePreview}
              className={cn(
                'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px]',
                previewOpen
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border hover:bg-secondary'
              )}
              title={t('notes.preview.togglePane')}
            >
              <Eye className="h-3 w-3" />
              {t('notes.preview.togglePaneShort')}
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={(): void => setPickerOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-secondary"
          >
            <Plus className="h-3 w-3" />
            {t('notes.links.add')}
          </button>
        </div>
      </div>

      {pickerOpen ? (
        <div className="mt-2 space-y-2">
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
          />
          <div className="max-h-44 overflow-y-auto rounded-md border border-border">
            {candidates.length === 0 ? (
              <div className="p-2 text-xs text-muted-foreground">{t('notes.links.noCandidates')}</div>
            ) : (
              candidates.map((c) => {
                const Icon = kindIcon(c.target.kind)
                return (
                  <button
                    key={JSON.stringify(c.target)}
                    type="button"
                    disabled={busy}
                    onClick={(): void => void addLink(c.target)}
                    className="flex w-full items-center gap-2 border-b border-border/50 px-2 py-1.5 text-left text-xs hover:bg-secondary/50 last:border-0"
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
      ) : null}

      <div className="mt-2 space-y-2">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            {t('common.loading')}
          </div>
        ) : (
          <>
            <div>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {t('notes.links.outgoing')}
              </p>
              {bundle.outgoing.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t('notes.links.emptyOutgoing')}</p>
              ) : (
                <div className="space-y-0.5">
                  {bundle.outgoing.map((item) => renderLinkRow(item, 'outgoing', removeOutgoing))}
                </div>
              )}
            </div>
            {bundle.incoming.length > 0 ? (
              <div>
                <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t('notes.links.incoming')}
                </p>
                <div className="space-y-0.5">
                  {bundle.incoming.map((item) => renderLinkRow(item, 'incoming', removeIncoming))}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
