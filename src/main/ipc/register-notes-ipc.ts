import { ipcMain } from 'electron'
import {
  IPC,
  type UserNote,
  type UserNoteCalendarKey,
  type UserNoteCalendarUpsertInput,
  type UserNoteListFilters,
  type UserNoteListItem,
  type UserNoteMailUpsertInput,
  type UserNoteStandaloneCreateInput,
  type UserNoteStandaloneUpdateInput
} from '@shared/types'
import {
  createStandaloneNote,
  deleteNote,
  getCalendarNote,
  getMailNote,
  listNotes,
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
}
