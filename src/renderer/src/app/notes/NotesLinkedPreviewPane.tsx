import { memo, useMemo } from 'react'
import { PanelRightClose, SquareArrowOutUpRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ConnectedAccount, UserNote } from '@shared/types'
import { CalendarFloatingPanel } from '@/app/calendar/CalendarFloatingPanel'
import { NotesLinkedItemPreview } from '@/app/notes/NotesLinkedItemPreview'
import type { NotesPreviewLinkEntry } from '@/app/notes/notes-link-preview-items'
import type { NotesLinkedPreviewPlacement } from '@/app/notes/notes-shell-storage'
import { NOTES_FLOAT_PREVIEW_SIZE_KEY } from '@/app/notes/notes-shell-storage'
import {
  ModuleColumnHeaderIconButton,
  moduleColumnHeaderDockBarRowClass,
  moduleColumnHeaderIconGlyphClass,
  moduleColumnHeaderUppercaseLabelClass
} from '@/components/ModuleColumnHeader'
import { VerticalSplitter } from '@/components/ResizableSplitter'
import { cn } from '@/lib/utils'

function NotesLinkedPreviewTabs({
  entries,
  selectedKey,
  onSelectKey
}: {
  entries: NotesPreviewLinkEntry[]
  selectedKey: string | null
  onSelectKey: (key: string) => void
}): JSX.Element {
  return (
    <div className="flex min-w-0 gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {entries.map((entry) => {
        const active = entry.key === selectedKey
        return (
          <button
            key={entry.key}
            type="button"
            title={entry.label}
            onClick={(): void => onSelectKey(entry.key)}
            className={cn(
              'max-w-[9.5rem] shrink-0 rounded-md border px-2 py-1 text-left text-[10px] leading-tight transition-colors',
              active
                ? 'border-primary bg-primary/10 text-foreground'
                : 'border-border bg-background/80 text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
            )}
          >
            <span className="block truncate font-medium">{entry.label}</span>
            <span className="block truncate text-[9px] opacity-80">{entry.kindLabel}</span>
          </button>
        )
      })}
    </div>
  )
}

const NotesLinkedPreviewBody = memo(function NotesLinkedPreviewBody({
  entry,
  editing,
  accounts
}: {
  entry: NotesPreviewLinkEntry | null
  editing: UserNote
  accounts: ConnectedAccount[]
}): JSX.Element {
  const { t } = useTranslation()
  if (!entry) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center text-xs text-muted-foreground">
        {t('notes.preview.selectLink')}
      </div>
    )
  }
  return (
    <NotesLinkedItemPreview
      target={entry.target}
      accounts={accounts}
      editingNoteId={editing.id}
      editingMessageId={editing.messageId ?? null}
      editingNoteKind={editing.kind}
    />
  )
})

function NotesLinkedPreviewChrome({
  entries,
  selectedKey,
  onSelectKey,
  editing,
  accounts,
  placement,
  onUndock,
  onClose
}: {
  entries: NotesPreviewLinkEntry[]
  selectedKey: string | null
  onSelectKey: (key: string) => void
  editing: UserNote
  accounts: ConnectedAccount[]
  placement: NotesLinkedPreviewPlacement
  onUndock: () => void
  onClose: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const selectedEntry = useMemo(
    () => entries.find((e) => e.key === selectedKey) ?? entries[0] ?? null,
    [entries, selectedKey]
  )

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border px-2 py-2">
        <div className={moduleColumnHeaderDockBarRowClass}>
          <span
            className={cn(
              moduleColumnHeaderUppercaseLabelClass,
              'min-w-0 shrink-0 text-left'
            )}
          >
            {t('notes.shell.linkedObject')}
          </span>
          <div className="flex shrink-0 items-center gap-0.5">
            {placement === 'dock' ? (
              <ModuleColumnHeaderIconButton
                title={t('notes.preview.undockTitle')}
                onClick={onUndock}
              >
                <SquareArrowOutUpRight className={moduleColumnHeaderIconGlyphClass} />
              </ModuleColumnHeaderIconButton>
            ) : null}
            <ModuleColumnHeaderIconButton title={t('notes.preview.hideTitle')} onClick={onClose}>
              <PanelRightClose className={moduleColumnHeaderIconGlyphClass} />
            </ModuleColumnHeaderIconButton>
          </div>
        </div>
        {entries.length > 0 ? (
          <div className="mt-2">
            <NotesLinkedPreviewTabs
              entries={entries}
              selectedKey={selectedEntry?.key ?? null}
              onSelectKey={onSelectKey}
            />
          </div>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <NotesLinkedPreviewBody entry={selectedEntry} editing={editing} accounts={accounts} />
      </div>
    </div>
  )
}

export function NotesLinkedPreviewPane({
  open,
  placement,
  onPlacementChange,
  onClose,
  entries,
  selectedKey,
  onSelectKey,
  editing,
  accounts,
  dockWidthPx,
  onDockWidthDrag
}: {
  open: boolean
  placement: NotesLinkedPreviewPlacement
  onPlacementChange: (placement: NotesLinkedPreviewPlacement) => void
  onClose: () => void
  entries: NotesPreviewLinkEntry[]
  selectedKey: string | null
  onSelectKey: (key: string) => void
  editing: UserNote
  accounts: ConnectedAccount[]
  dockWidthPx: number
  onDockWidthDrag: (delta: number) => void
}): JSX.Element | null {
  const { t } = useTranslation()

  const chrome = (
    <NotesLinkedPreviewChrome
      entries={entries}
      selectedKey={selectedKey}
      onSelectKey={onSelectKey}
      editing={editing}
      accounts={accounts}
      placement={placement}
      onUndock={(): void => onPlacementChange('float')}
      onClose={onClose}
    />
  )

  const floatWidth = Math.min(900, Math.max(300, Math.round(dockWidthPx)))
  const floatPos = useMemo(() => {
    const x = Math.max(12, window.innerWidth - floatWidth - 20)
    return { x, y: 68 }
  }, [floatWidth])

  if (!open || entries.length === 0) return null

  return (
    <>
      {placement === 'dock' ? (
        <>
          <VerticalSplitter
            ariaLabel={t('notes.shell.splitterPreviewAria')}
            onDrag={onDockWidthDrag}
          />
          <aside
            className="flex min-h-0 shrink-0 flex-col border-l border-border bg-card"
            style={{ width: dockWidthPx }}
          >
            {chrome}
          </aside>
        </>
      ) : null}
      {placement === 'float' ? (
        <CalendarFloatingPanel
          open
          title={t('notes.shell.linkedObject')}
          widthPx={floatWidth}
          minHeightPx={360}
          persistSizeKey={NOTES_FLOAT_PREVIEW_SIZE_KEY}
          defaultPosition={floatPos}
          zIndex={92}
          onClose={onClose}
          onDock={(): void => onPlacementChange('dock')}
        >
          {chrome}
        </CalendarFloatingPanel>
      ) : null}
    </>
  )
}
