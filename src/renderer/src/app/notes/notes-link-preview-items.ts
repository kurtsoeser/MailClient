import type { TFunction } from 'i18next'
import type { NoteEntityLinkTarget, NoteEntityLinkedItem, NoteLinksBundle } from '@shared/note-entity-links'
import { noteEntityLinkTargetKey } from '@shared/note-entity-links'
import type { UserNote } from '@shared/types'
import { noteTitle } from '@/app/notes/notes-display-helpers'

export type NotesPreviewLinkEntry = {
  key: string
  target: NoteEntityLinkTarget
  label: string
  kindLabel: string
  direction: 'primary' | 'outgoing' | 'incoming'
}

export function buildNotesPreviewLinkEntries(
  editing: UserNote,
  bundle: NoteLinksBundle,
  t: TFunction
): NotesPreviewLinkEntry[] {
  const out: NotesPreviewLinkEntry[] = []
  const seen = new Set<string>()

  const push = (
    target: NoteEntityLinkTarget,
    label: string,
    kindLabel: string,
    direction: NotesPreviewLinkEntry['direction']
  ): void => {
    const key = noteEntityLinkTargetKey(target)
    if (seen.has(key)) return
    seen.add(key)
    out.push({ key, target, label, kindLabel, direction })
  }

  if (editing.kind === 'mail' && editing.messageId != null) {
    push(
      { kind: 'mail', messageId: editing.messageId },
      editing.title?.trim() || t('common.noSubject'),
      t('notes.links.kind.mail'),
      'primary'
    )
  }

  if (
    editing.kind === 'calendar' &&
    editing.accountId &&
    editing.eventRemoteId
  ) {
    push(
      {
        kind: 'calendar_event',
        accountId: editing.accountId,
        graphEventId: editing.eventRemoteId
      },
      editing.eventTitleSnapshot?.trim() || editing.title?.trim() || t('calendar.eventPreview.noTitle'),
      t('notes.links.kind.calendar_event'),
      'primary'
    )
  }

  for (const item of bundle.outgoing) {
    push(
      item.target,
      item.title,
      t(`notes.links.kind.${item.target.kind}`),
      'outgoing'
    )
  }

  for (const item of bundle.incoming) {
    push(
      item.target,
      item.title,
      t(`notes.links.kind.${item.target.kind}`),
      'incoming'
    )
  }

  return out
}

export function findPreviewEntryByKey(
  entries: NotesPreviewLinkEntry[],
  key: string | null
): NotesPreviewLinkEntry | null {
  if (!key) return entries[0] ?? null
  return entries.find((e) => e.key === key) ?? entries[0] ?? null
}

export function linkedItemToPreviewEntry(
  item: NoteEntityLinkedItem,
  direction: 'outgoing' | 'incoming',
  t: TFunction
): NotesPreviewLinkEntry {
  return {
    key: noteEntityLinkTargetKey(item.target),
    target: item.target,
    label: item.title,
    kindLabel: t(`notes.links.kind.${item.target.kind}`),
    direction
  }
}
