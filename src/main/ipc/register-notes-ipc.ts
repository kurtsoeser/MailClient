import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import fs from 'node:fs/promises'
import {
  IPC,
  type NoteSection,
  type NoteSectionCreateInput,
  type NoteSectionReorderInput,
  type NoteSectionUpdateInput,
  type UserNote,
  type UserNoteCalendarKey,
  type UserNoteCalendarUpsertInput,
  type NoteLinksBundle,
  type UserNoteLinkAddInput,
  type UserNoteLinkRemoveInput,
  type NoteLinkTargetCandidate,
  type UserNoteListFilters,
  type UserNoteListInRangeFilters,
  type UserNoteListItem,
  type UserNoteSearchFilters,
  type UserNoteMailUpsertInput,
  type UserNoteMoveToSectionInput,
  type UserNoteScheduleInput,
  type UserNoteStandaloneCreateInput,
  type UserNotePatchDisplayInput,
  type UserNoteStandaloneUpdateInput,
  type UserNoteAttachment,
  type UserNoteAttachmentAddCloudInput,
  type UserNoteAttachmentAddLocalInput
} from '@shared/types'
import {
  addCloudNoteAttachment,
  addLocalNoteAttachment,
  getNoteAttachmentById,
  listNoteAttachments,
  removeNoteAttachment
} from '../db/user-note-attachments-repo'
import { sanitizeFileName } from './ipc-helpers'
import {
  createNoteSection,
  deleteNoteSection,
  listNoteSections,
  reorderNoteSections,
  updateNoteSection
} from '../db/note-sections-repo'
import {
  addNoteEntityLink,
  listNoteLinksBundle,
  removeNoteEntityLink,
  removeNoteEntityLinkIncoming
} from '../db/user-note-entity-links-repo'
import { searchNoteLinkTargets } from '../note-link-target-search'
import {
  clearNoteSchedule,
  createStandaloneNote,
  deleteNote,
  getCalendarNote,
  getMailNote,
  getNoteById,
  listNotes,
  listNotesInRange,
  searchNotes,
  moveNoteToSection,
  patchNoteDisplay,
  setNoteSchedule,
  updateStandaloneNote,
  upsertCalendarNote,
  upsertMailNote
} from '../db/user-notes-repo'
import { broadcastNotesChanged } from './ipc-broadcasts'

export function registerNotesIpc(): void {
  ipcMain.handle(IPC.notes.getMail, (_event, messageId: number): UserNote | null =>
    getMailNote(messageId)
  )

  ipcMain.handle(IPC.notes.upsertMail, (_event, input: UserNoteMailUpsertInput): UserNote => {
    const note = upsertMailNote(input)
    broadcastNotesChanged({ kind: 'mail', noteId: note.id, messageId: note.messageId })
    return note
  })

  ipcMain.handle(IPC.notes.getCalendar, (_event, key: UserNoteCalendarKey): UserNote | null =>
    getCalendarNote(key)
  )

  ipcMain.handle(
    IPC.notes.upsertCalendar,
    (_event, input: UserNoteCalendarUpsertInput): UserNote => {
      const note = upsertCalendarNote(input)
      broadcastNotesChanged({ kind: 'calendar', noteId: note.id, accountId: note.accountId })
      return note
    }
  )

  ipcMain.handle(
    IPC.notes.createStandalone,
    (_event, input: UserNoteStandaloneCreateInput): UserNote => {
      const note = createStandaloneNote(input)
      broadcastNotesChanged({ kind: 'standalone', noteId: note.id })
      return note
    }
  )

  ipcMain.handle(
    IPC.notes.updateStandalone,
    (_event, input: UserNoteStandaloneUpdateInput): UserNote => {
      const note = updateStandaloneNote(input)
      broadcastNotesChanged({ kind: 'standalone', noteId: note.id })
      return note
    }
  )

  ipcMain.handle(IPC.notes.delete, (_event, id: number): void => {
    deleteNote(id)
    broadcastNotesChanged({ noteId: id })
  })

  ipcMain.handle(IPC.notes.list, (_event, filters?: UserNoteListFilters): UserNoteListItem[] =>
    listNotes(filters ?? {})
  )

  ipcMain.handle(
    IPC.notes.search,
    (_event, filters: UserNoteSearchFilters): UserNoteListItem[] => searchNotes(filters)
  )

  ipcMain.handle(IPC.notes.getById, (_event, id: number): UserNote | null => getNoteById(id))

  ipcMain.handle(IPC.notes.patchDisplay, (_event, input: UserNotePatchDisplayInput): UserNote => {
    const noteId = typeof input?.noteId === 'number' ? input.noteId : 0
    if (!noteId) throw new Error('Notiz-ID fehlt.')
    const note = patchNoteDisplay(noteId, {
      iconId: input.iconId,
      iconColor: input.iconColor
    })
    broadcastNotesChanged({ noteId: note.id })
    return note
  })

  ipcMain.handle(
    IPC.notes.listInRange,
    (_event, filters: UserNoteListInRangeFilters): UserNoteListItem[] => listNotesInRange(filters)
  )

  ipcMain.handle(IPC.notes.setSchedule, (_event, input: UserNoteScheduleInput): UserNote => {
    const note = setNoteSchedule(input)
    broadcastNotesChanged({ noteId: note.id, kind: note.kind })
    return note
  })

  ipcMain.handle(IPC.notes.clearSchedule, (_event, id: number): UserNote => {
    const note = clearNoteSchedule(id)
    broadcastNotesChanged({ noteId: note.id, kind: note.kind })
    return note
  })

  ipcMain.handle(IPC.notes.moveToSection, (_event, input: UserNoteMoveToSectionInput): UserNote => {
    const note = moveNoteToSection(input)
    broadcastNotesChanged({ noteId: note.id, kind: note.kind })
    return note
  })

  ipcMain.handle(IPC.notes.sectionsList, (): NoteSection[] => listNoteSections())

  ipcMain.handle(IPC.notes.sectionsCreate, (_event, input: NoteSectionCreateInput): NoteSection => {
    const section = createNoteSection(input)
    broadcastNotesChanged({})
    return section
  })

  ipcMain.handle(IPC.notes.sectionsUpdate, (_event, input: NoteSectionUpdateInput): NoteSection => {
    const section = updateNoteSection(input)
    broadcastNotesChanged({})
    return section
  })

  ipcMain.handle(IPC.notes.sectionsDelete, (_event, id: number): void => {
    deleteNoteSection(id)
    broadcastNotesChanged({})
  })

  ipcMain.handle(IPC.notes.sectionsReorder, (_event, input: NoteSectionReorderInput): void => {
    reorderNoteSections(input)
    broadcastNotesChanged({})
  })

  ipcMain.handle(IPC.notes.linksList, (_event, fromNoteId: number): NoteLinksBundle => {
    const id = typeof fromNoteId === 'number' ? fromNoteId : 0
    if (!id) return { outgoing: [], incoming: [] }
    return listNoteLinksBundle(id)
  })

  ipcMain.handle(IPC.notes.linksAdd, (_event, input: UserNoteLinkAddInput): void => {
    const fromNoteId = typeof input?.fromNoteId === 'number' ? input.fromNoteId : 0
    const target = input?.target
    if (!fromNoteId || !target || typeof target !== 'object' || !('kind' in target)) {
      throw new Error('Verknuepfung ungueltig.')
    }
    addNoteEntityLink(fromNoteId, target)
    broadcastNotesChanged({ noteId: fromNoteId })
  })

  ipcMain.handle(IPC.notes.linksRemove, (_event, input: UserNoteLinkRemoveInput): void => {
    const fromNoteId = typeof input?.fromNoteId === 'number' ? input.fromNoteId : 0
    const linkId = typeof input?.linkId === 'number' ? input.linkId : 0
    if (!fromNoteId || !linkId) throw new Error('Verknuepfung fehlt.')
    if (input?.direction === 'incoming') {
      removeNoteEntityLinkIncoming(linkId, fromNoteId)
    } else {
      removeNoteEntityLink(linkId, fromNoteId)
    }
    broadcastNotesChanged({ noteId: fromNoteId })
  })

  ipcMain.handle(
    IPC.notes.linksSearchTargets,
    (
      _event,
      args: { query?: string; excludeNoteId?: number; limit?: number }
    ): NoteLinkTargetCandidate[] => {
      return searchNoteLinkTargets(typeof args?.query === 'string' ? args.query : '', {
        excludeNoteId: args?.excludeNoteId,
        limit: args?.limit
      })
    }
  )

  ipcMain.handle(
    IPC.notes.attachmentsList,
    (_event, noteId: number): UserNoteAttachment[] => {
      const id = typeof noteId === 'number' ? noteId : 0
      if (!id) return []
      return listNoteAttachments(id)
    }
  )

  ipcMain.handle(
    IPC.notes.attachmentsAddLocal,
    async (_event, input: UserNoteAttachmentAddLocalInput): Promise<UserNoteAttachment> => {
      const att = await addLocalNoteAttachment(input)
      broadcastNotesChanged({ noteId: input.noteId })
      return att
    }
  )

  ipcMain.handle(
    IPC.notes.attachmentsAddCloud,
    (_event, input: UserNoteAttachmentAddCloudInput): UserNoteAttachment => {
      const att = addCloudNoteAttachment(input)
      broadcastNotesChanged({ noteId: input.noteId })
      return att
    }
  )

  ipcMain.handle(
    IPC.notes.attachmentsRemove,
    async (_event, args: { noteId: number; attachmentId: number }): Promise<void> => {
      const noteId = typeof args?.noteId === 'number' ? args.noteId : 0
      const attachmentId = typeof args?.attachmentId === 'number' ? args.attachmentId : 0
      if (!noteId || !attachmentId) throw new Error('Anhang fehlt.')
      await removeNoteAttachment(attachmentId, noteId)
      broadcastNotesChanged({ noteId })
    }
  )

  ipcMain.handle(
    IPC.notes.attachmentsOpen,
    async (
      _event,
      args: { noteId: number; attachmentId: number }
    ): Promise<{ ok: boolean; error?: string }> => {
      const noteId = typeof args?.noteId === 'number' ? args.noteId : 0
      const attachmentId = typeof args?.attachmentId === 'number' ? args.attachmentId : 0
      const att = noteId && attachmentId ? getNoteAttachmentById(attachmentId, noteId) : null
      if (!att) return { ok: false, error: 'Anhang nicht gefunden.' }
      try {
        if (att.kind === 'cloud') {
          if (!att.sourceUrl) return { ok: false, error: 'Cloud-Link fehlt.' }
          await shell.openExternal(att.sourceUrl)
          return { ok: true }
        }
        if (!att.localPath) return { ok: false, error: 'Dateipfad fehlt.' }
        const err = await shell.openPath(att.localPath)
        if (err) return { ok: false, error: err }
        return { ok: true }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) }
      }
    }
  )

  ipcMain.handle(
    IPC.notes.attachmentsSaveAs,
    async (
      event,
      args: { noteId: number; attachmentId: number; suggestedName?: string }
    ): Promise<{ ok: boolean; path?: string; error?: string; cancelled?: boolean }> => {
      const noteId = typeof args?.noteId === 'number' ? args.noteId : 0
      const attachmentId = typeof args?.attachmentId === 'number' ? args.attachmentId : 0
      const att = noteId && attachmentId ? getNoteAttachmentById(attachmentId, noteId) : null
      if (!att) return { ok: false, error: 'Anhang nicht gefunden.' }

      if (att.kind === 'cloud') {
        if (!att.sourceUrl) return { ok: false, error: 'Cloud-Link fehlt.' }
        await shell.openExternal(att.sourceUrl)
        return { ok: true }
      }

      if (!att.localPath) return { ok: false, error: 'Dateipfad fehlt.' }

      const win = BrowserWindow.fromWebContents(event.sender) ?? undefined
      const suggested = sanitizeFileName(args.suggestedName ?? att.name)
      const result = await dialog.showSaveDialog(win!, {
        defaultPath: suggested,
        title: 'Anhang speichern unter'
      })
      if (result.canceled || !result.filePath) {
        return { ok: false, cancelled: true }
      }
      try {
        await fs.copyFile(att.localPath, result.filePath)
        return { ok: true, path: result.filePath }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) }
      }
    }
  )
}
