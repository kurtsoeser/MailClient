import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, FolderPlus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { NoteSection, UserNoteListItem } from '@shared/types'
import { cn } from '@/lib/utils'
import { showAppConfirm } from '@/stores/app-dialog'
import {
  buildNoteSectionTree,
  type NoteSectionTreeNode
} from '@/lib/notes-section-tree'
import {
  countNotesInSection,
  isSectionNavSelected,
  type NotesNavSelection
} from '@/lib/notes-nav-selection'
import { NOTE_DROP_UNGROUPED, noteSectionDropId } from '@/lib/notes-sidebar-dnd'
import { NotesDropZone } from '@/app/notes/notes-dnd-ui'
import { NoteSectionIconColorFooter } from '@/app/notes/NoteSectionIconColorFooter'
import { CalendarEventIconPicker } from '@/components/CalendarEventIconPicker'
import { resolveNoteSectionIconColor } from '@/lib/note-section-icons'

function SectionNavRow({
  node,
  notes,
  selection,
  onSelect,
  collapsed,
  setCollapsed,
  onRenameSection,
  onDeleteSection,
  onUpdateSectionIcon,
  onAddSubsection,
  addingSubsectionForId,
  newSubsectionName,
  setNewSubsectionName,
  onCreateSubsection,
  onCancelSubsection,
  t
}: {
  node: NoteSectionTreeNode
  notes: UserNoteListItem[]
  selection: NotesNavSelection
  onSelect: (sectionId: number) => void
  collapsed: Partial<Record<string, boolean>>
  setCollapsed: React.Dispatch<React.SetStateAction<Partial<Record<string, boolean>>>>
  onRenameSection: (section: NoteSection, name: string) => void
  onDeleteSection: (section: NoteSection) => void
  onUpdateSectionIcon: (
    section: NoteSection,
    patch: { icon?: string | null; iconColor?: string | null }
  ) => void
  onAddSubsection: (sectionId: number) => void
  addingSubsectionForId: number | null
  newSubsectionName: string
  setNewSubsectionName: (value: string) => void
  onCreateSubsection: (parentId: number) => void
  onCancelSubsection: () => void
  t: (key: string, options?: Record<string, unknown>) => string
}): JSX.Element {
  const key = String(node.section.id)
  const expanded = collapsed[key] !== true
  const selected = isSectionNavSelected(node.section.id, selection)
  const count = countNotesInSection(node.section.id, notes)
  const isAddingHere = addingSubsectionForId === node.section.id
  const iconColor = resolveNoteSectionIconColor(node.section.iconColor)
  const [renaming, setRenaming] = useState(false)
  const [draftName, setDraftName] = useState(node.section.name)
  const renameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!renaming) setDraftName(node.section.name)
  }, [node.section.name, renaming])

  useEffect(() => {
    if (renaming) renameInputRef.current?.focus()
  }, [renaming])

  const commitRename = (): void => {
    const name = draftName.trim()
    if (name) void onRenameSection(node.section, name)
    setRenaming(false)
  }

  return (
    <div className="pb-0.5">
      <NotesDropZone id={noteSectionDropId(node.section.id)}>
        <div
          className={cn(
            'mb-0.5 flex items-center gap-0.5 rounded-md pr-1',
            selected ? 'bg-primary/15' : 'hover:bg-secondary/40'
          )}
          style={{ paddingLeft: node.depth * 12 }}
        >
          <button
            type="button"
            onClick={(): void => setCollapsed((c) => ({ ...c, [key]: expanded }))}
            className="rounded p-0.5 hover:bg-secondary"
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
          <CalendarEventIconPicker
            layout="compact"
            openOn="doubleClick"
            iconId={node.section.icon}
            iconColorHex={iconColor}
            title={node.section.name}
            compactButtonClassName="h-6 w-6 border-0 bg-transparent shadow-none hover:bg-secondary/60"
            onIconChange={(iconId): void =>
              void onUpdateSectionIcon(node.section, { icon: iconId ?? null })
            }
            footer={
              <NoteSectionIconColorFooter
                iconColor={node.section.iconColor}
                onIconColorChange={(iconColor): void =>
                  void onUpdateSectionIcon(node.section, { iconColor })
                }
              />
            }
          />
          {renaming ? (
            <input
              ref={renameInputRef}
              value={draftName}
              onChange={(e): void => setDraftName(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-border bg-background px-1.5 py-0.5 text-xs font-medium text-foreground"
              onKeyDown={(e): void => {
                if (e.key === 'Escape') {
                  setDraftName(node.section.name)
                  setRenaming(false)
                }
                if (e.key === 'Enter') commitRename()
              }}
              onBlur={commitRename}
            />
          ) : (
            <button
              type="button"
              onClick={(): void => onSelect(node.section.id)}
              onDoubleClick={(e): void => {
                e.preventDefault()
                setRenaming(true)
              }}
              className={cn(
                'min-w-0 flex-1 truncate rounded-md px-1 py-0.5 text-left text-xs font-medium',
                selected ? 'text-foreground' : 'text-muted-foreground hover:bg-secondary/30'
              )}
              title={t('notes.sections.renameDoubleClick')}
            >
              {node.section.name}
            </button>
          )}
          <span className="shrink-0 pr-0.5 text-[10px] tabular-nums text-muted-foreground">{count}</span>
          <button
            type="button"
            onClick={(): void => onAddSubsection(node.section.id)}
            className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
            title={t('notes.sections.addSubsection')}
            aria-label={t('notes.sections.addSubsection')}
          >
            <FolderPlus className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={(): void => void onDeleteSection(node.section)}
            className="rounded p-1 text-muted-foreground hover:text-destructive"
            aria-label={t('common.delete')}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </NotesDropZone>

      {expanded ? (
        <>
          {isAddingHere ? (
            <div className="mb-1 flex gap-1 px-2" style={{ paddingLeft: node.depth * 12 + 20 }}>
              <input
                value={newSubsectionName}
                onChange={(e): void => setNewSubsectionName(e.target.value)}
                placeholder={t('notes.sections.subsectionNamePlaceholder')}
                className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs"
                autoFocus
                onKeyDown={(e): void => {
                  if (e.key === 'Enter') void onCreateSubsection(node.section.id)
                  if (e.key === 'Escape') onCancelSubsection()
                }}
              />
              <button
                type="button"
                onClick={(): void => void onCreateSubsection(node.section.id)}
                className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground"
              >
                {t('common.create')}
              </button>
            </div>
          ) : null}
          {node.children.map((child) => (
            <SectionNavRow
              key={child.section.id}
              node={child}
              notes={notes}
              selection={selection}
              onSelect={onSelect}
              collapsed={collapsed}
              setCollapsed={setCollapsed}
              onRenameSection={onRenameSection}
              onDeleteSection={onDeleteSection}
              onUpdateSectionIcon={onUpdateSectionIcon}
              onAddSubsection={onAddSubsection}
              addingSubsectionForId={addingSubsectionForId}
              newSubsectionName={newSubsectionName}
              setNewSubsectionName={setNewSubsectionName}
              onCreateSubsection={onCreateSubsection}
              onCancelSubsection={onCancelSubsection}
              t={t}
            />
          ))}
        </>
      ) : null}
    </div>
  )
}

export function NotesSidebarSections({
  sections,
  notes,
  selection,
  onSelectSection,
  onSectionsChanged,
  embedded = false
}: {
  sections: NoteSection[]
  notes: UserNoteListItem[]
  selection: NotesNavSelection
  onSelectSection: (sectionId: number | null) => void
  onSectionsChanged: () => void
  embedded?: boolean
}): JSX.Element {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useState<Partial<Record<string, boolean>>>({})
  const [newSectionName, setNewSectionName] = useState('')
  const [addingSection, setAddingSection] = useState(false)
  const [addingSubsectionForId, setAddingSubsectionForId] = useState<number | null>(null)
  const [newSubsectionName, setNewSubsectionName] = useState('')

  const tree = useMemo(() => buildNoteSectionTree(sections, notes), [sections, notes])
  const ungroupedCount = tree.ungroupedNotes.length
  const ungroupedSelected = isSectionNavSelected(null, selection)

  const createSection = useCallback(
    async (parentId: number | null, name: string): Promise<void> => {
      const trimmed = name.trim()
      if (!trimmed) return
      await window.mailClient.notes.sections.create({ name: trimmed, parentId })
      onSectionsChanged()
    },
    [onSectionsChanged]
  )

  const renameSection = useCallback(
    async (section: NoteSection, name: string): Promise<void> => {
      const trimmed = name.trim()
      if (!trimmed || trimmed === section.name) return
      await window.mailClient.notes.sections.update({ id: section.id, name: trimmed })
      onSectionsChanged()
    },
    [onSectionsChanged]
  )

  const updateSectionIcon = useCallback(
    async (
      section: NoteSection,
      patch: { icon?: string | null; iconColor?: string | null }
    ): Promise<void> => {
      await window.mailClient.notes.sections.update({ id: section.id, ...patch })
      onSectionsChanged()
    },
    [onSectionsChanged]
  )

  const deleteSection = useCallback(
    async (section: NoteSection): Promise<void> => {
      const ok = await showAppConfirm(t('notes.sections.deleteConfirm', { name: section.name }), {
        title: t('notes.sections.deleteTitle'),
        confirmLabel: t('common.delete'),
        variant: 'danger'
      })
      if (!ok) return
      await window.mailClient.notes.sections.delete(section.id)
      onSectionsChanged()
    },
    [onSectionsChanged, t]
  )

  return (
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col overflow-y-auto',
        !embedded && 'border-b border-border'
      )}
    >
      <div className="space-y-2 px-2 py-2">
        <div className="flex items-center justify-between gap-2 px-1">
          {!embedded ? (
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t('notes.sections.title')}
            </span>
          ) : (
            <span className="text-[11px] text-muted-foreground">{t('notes.sections.manage')}</span>
          )}
          <button
            type="button"
            onClick={(): void => {
              setAddingSection((v) => !v)
              setAddingSubsectionForId(null)
            }}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[10px] hover:bg-secondary"
          >
            <FolderPlus className="h-3 w-3" />
            {t('notes.sections.add')}
          </button>
        </div>
        {addingSection ? (
          <div className="flex gap-1 px-1">
            <input
              value={newSectionName}
              onChange={(e): void => setNewSectionName(e.target.value)}
              placeholder={t('notes.sections.namePlaceholder')}
              className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs"
              onKeyDown={(e): void => {
                if (e.key === 'Enter') {
                  void createSection(null, newSectionName).then(() => {
                    setNewSectionName('')
                    setAddingSection(false)
                  })
                }
              }}
            />
            <button
              type="button"
              onClick={(): void => {
                void createSection(null, newSectionName).then(() => {
                  setNewSectionName('')
                  setAddingSection(false)
                })
              }}
              className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground"
            >
              {t('common.create')}
            </button>
          </div>
        ) : null}
      </div>

      <div className="px-1 pb-2">
        <NotesDropZone id={NOTE_DROP_UNGROUPED}>
          <button
            type="button"
            onClick={(): void => onSelectSection(null)}
            className={cn(
              'mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium',
              ungroupedSelected ? 'bg-primary/15 text-foreground' : 'text-muted-foreground hover:bg-secondary/40'
            )}
          >
            <span className="flex-1 truncate">{t('notes.sections.ungrouped')}</span>
            <span className="shrink-0 text-[10px] tabular-nums">{ungroupedCount}</span>
          </button>
        </NotesDropZone>

        {tree.roots.length === 0 && sections.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">{t('notes.shell.noSectionsYet')}</p>
        ) : (
          tree.roots.map((node) => (
            <SectionNavRow
              key={node.section.id}
              node={node}
              notes={notes}
              selection={selection}
              onSelect={onSelectSection}
              collapsed={collapsed}
              setCollapsed={setCollapsed}
              onRenameSection={renameSection}
              onDeleteSection={deleteSection}
              onUpdateSectionIcon={updateSectionIcon}
              onAddSubsection={(id): void => {
                setAddingSubsectionForId(id)
                setNewSubsectionName('')
                setAddingSection(false)
                setCollapsed((c) => ({ ...c, [String(id)]: false }))
              }}
              addingSubsectionForId={addingSubsectionForId}
              newSubsectionName={newSubsectionName}
              setNewSubsectionName={setNewSubsectionName}
              onCreateSubsection={(parentId): void => {
                void createSection(parentId, newSubsectionName).then(() => {
                  setNewSubsectionName('')
                  setAddingSubsectionForId(null)
                })
              }}
              onCancelSubsection={(): void => {
                setAddingSubsectionForId(null)
                setNewSubsectionName('')
              }}
              t={t}
            />
          ))
        )}
      </div>
    </div>
  )
}
