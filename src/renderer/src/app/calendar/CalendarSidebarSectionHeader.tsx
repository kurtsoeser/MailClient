import { useEffect, useRef, useState, type JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronRight, Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SidebarNamedGroup } from '@/lib/calendar-sidebar-layout'
import {
  CALENDAR_SECTION_ICON_IDS,
  isCalendarSectionIconId,
  resolveCalendarSectionIcon
} from '@/lib/calendar-sidebar-section-icons'
import { showAppConfirm } from '@/stores/app-dialog'

export interface CalendarSidebarSectionHeaderProps {
  section: SidebarNamedGroup
  branchOpen: boolean
  onToggleBranch: () => void
  onRename: (name: string) => void
  onDelete: () => void
  onIconChange: (icon: string | undefined) => void
}

export function CalendarSidebarSectionHeader({
  section,
  branchOpen,
  onToggleBranch,
  onRename,
  onDelete,
  onIconChange
}: CalendarSidebarSectionHeaderProps): JSX.Element {
  const { t } = useTranslation()
  const [renaming, setRenaming] = useState(false)
  const [draftName, setDraftName] = useState(section.name)
  const [iconPickerOpen, setIconPickerOpen] = useState(false)
  const [actionsVisible, setActionsVisible] = useState(false)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const iconPickerRef = useRef<HTMLDivElement>(null)
  const SectionIcon = resolveCalendarSectionIcon(section.icon)

  useEffect(() => {
    if (!renaming) setDraftName(section.name)
  }, [section.name, renaming])

  useEffect(() => {
    if (renaming) renameInputRef.current?.focus()
  }, [renaming])

  useEffect(() => {
    if (!iconPickerOpen) return
    function onDocMouseDown(e: MouseEvent): void {
      const el = iconPickerRef.current
      if (!el || el.contains(e.target as Node)) return
      setIconPickerOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return (): void => document.removeEventListener('mousedown', onDocMouseDown)
  }, [iconPickerOpen])

  const commitRename = (): void => {
    const name = draftName.trim()
    if (name) onRename(name)
    setRenaming(false)
  }

  const handleDelete = async (): Promise<void> => {
    const ok = await showAppConfirm(
      t('calendar.shell.sidebarDeleteSectionBody', { name: section.name }),
      {
        title: t('calendar.shell.sidebarDeleteSectionTitle'),
        confirmLabel: t('calendar.shell.sidebarDeleteSectionConfirm'),
        variant: 'danger'
      }
    )
    if (ok) onDelete()
  }

  return (
    <div
      className="mb-1 flex items-center gap-0.5 px-1"
      onMouseEnter={(): void => setActionsVisible(true)}
      onMouseLeave={(): void => setActionsVisible(false)}
    >
      <button
        type="button"
        onClick={onToggleBranch}
        className="flex h-5 w-4 shrink-0 items-center justify-center text-muted-foreground/70 hover:text-foreground"
        aria-label={
          branchOpen
            ? t('calendar.shell.sidebarNamedGroupCollapseAria', { name: section.name })
            : t('calendar.shell.sidebarNamedGroupExpandAria', { name: section.name })
        }
      >
        {branchOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>

      <div className="relative shrink-0">
        <button
          type="button"
          onClick={(): void => setIconPickerOpen((o) => !o)}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
          title={t('calendar.shell.sidebarSectionIconPickerTitle')}
          aria-label={t('calendar.shell.sidebarSectionIconPickerTitle')}
        >
          <SectionIcon className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
        {iconPickerOpen ? (
          <div
            ref={iconPickerRef}
            className="absolute left-0 top-full z-50 mt-1 w-[168px] rounded-lg border border-border bg-popover p-1.5 shadow-lg"
            role="dialog"
            aria-label={t('calendar.shell.sidebarSectionIconPickerTitle')}
          >
            <div className="grid grid-cols-5 gap-0.5">
              {CALENDAR_SECTION_ICON_IDS.map((iconId) => {
                const Icon = resolveCalendarSectionIcon(iconId)
                const selected =
                  (section.icon && isCalendarSectionIconId(section.icon) && section.icon === iconId) ||
                  (!section.icon && iconId === 'folder')
                return (
                  <button
                    key={iconId}
                    type="button"
                    title={t(`calendar.shell.sectionIcon.${iconId}` as 'calendar.shell.sectionIcon.folder')}
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary/80 hover:text-foreground',
                      selected && 'bg-primary/15 text-primary'
                    )}
                    onClick={(): void => {
                      onIconChange(iconId === 'folder' ? undefined : iconId)
                      setIconPickerOpen(false)
                    }}
                  >
                    <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}
      </div>

      {renaming ? (
        <input
          ref={renameInputRef}
          value={draftName}
          onChange={(e): void => setDraftName(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-border bg-background px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground"
          onKeyDown={(e): void => {
            if (e.key === 'Escape') {
              setDraftName(section.name)
              setRenaming(false)
            }
            if (e.key === 'Enter') commitRename()
          }}
          onBlur={commitRename}
        />
      ) : (
        <button
          type="button"
          onClick={onToggleBranch}
          onDoubleClick={(e): void => {
            e.preventDefault()
            setRenaming(true)
          }}
          className="min-w-0 flex-1 rounded-md py-0.5 text-left hover:bg-secondary/40"
          title={section.name}
        >
          <p className="truncate px-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {section.name}
          </p>
        </button>
      )}

      <div
        className={cn(
          'flex shrink-0 items-center gap-0.5 transition-opacity',
          actionsVisible || renaming || iconPickerOpen ? 'opacity-100' : 'opacity-0'
        )}
      >
        <button
          type="button"
          onClick={(): void => setRenaming(true)}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
          title={t('calendar.shell.sidebarRenameSection')}
          aria-label={t('calendar.shell.sidebarRenameSection')}
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={(): void => void handleDelete()}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
          title={t('calendar.shell.sidebarDeleteSection')}
          aria-label={t('calendar.shell.sidebarDeleteSection')}
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}