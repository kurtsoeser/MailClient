export const NOTE_ENTITY_LINK_TARGET_KINDS = [
  'note',
  'mail',
  'calendar_event',
  'cloud_task'
] as const

export type NoteEntityLinkTargetKind = (typeof NOTE_ENTITY_LINK_TARGET_KINDS)[number]

export type NoteEntityLinkTarget =
  | { kind: 'note'; noteId: number }
  | { kind: 'mail'; messageId: number }
  | { kind: 'calendar_event'; accountId: string; graphEventId: string }
  | { kind: 'cloud_task'; accountId: string; listId: string; taskId: string }

export interface NoteEntityLinkedItem {
  linkId: number
  target: NoteEntityLinkTarget
  title: string
  subtitle: string | null
  createdAt: string
}

export interface NoteLinksBundle {
  outgoing: NoteEntityLinkedItem[]
  incoming: NoteEntityLinkedItem[]
}

export interface NoteLinkTargetCandidate {
  target: NoteEntityLinkTarget
  title: string
  subtitle: string | null
}

export function isNoteEntityLinkTargetKind(value: string): value is NoteEntityLinkTargetKind {
  return (NOTE_ENTITY_LINK_TARGET_KINDS as readonly string[]).includes(value)
}

export function noteEntityLinkTargetKey(target: NoteEntityLinkTarget): string {
  switch (target.kind) {
    case 'note':
      return `note:${target.noteId}`
    case 'mail':
      return `mail:${target.messageId}`
    case 'calendar_event':
      return `calendar:${target.accountId}:${target.graphEventId}`
    case 'cloud_task':
      return `task:${target.accountId}:${target.listId}:${target.taskId}`
    default:
      return 'unknown'
  }
}

export function noteEntityLinkTargetsEqual(a: NoteEntityLinkTarget, b: NoteEntityLinkTarget): boolean {
  return noteEntityLinkTargetKey(a) === noteEntityLinkTargetKey(b)
}
