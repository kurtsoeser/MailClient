import { ipcMain } from 'electron'
import {
  IPC,
  type PeopleListInput,
  type PeopleListSort,
  type PeopleSetFavoriteInput,
  type PeopleContactView,
  type PeopleCreateContactInput,
  type PeopleNavCounts,
  type PeopleSetContactPhotoInput,
  type PeopleSyncAccountResult,
  type PeopleUpdateContactInput,
  type PeopleUpdateContactPatch
} from '@shared/types'
import {
  getPeopleNavCounts,
  listPeopleForUi,
  setFavoriteForPeopleContact,
  syncPeopleForAccount,
  syncPeopleForAllAccounts,
  updatePeopleContact,
  createPeopleContact,
  deletePeopleContact,
  setPeopleContactPhotoFromUpload
} from '../people-service'
import { readContactPhotoDataUrl } from '../contact-photo'
import { getPeopleContactById } from '../db/people-repo'
import { assertAppOnline } from '../network-status'

function normalizeListInput(raw: unknown): PeopleListInput {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const filterRaw = o.filter
  const filter =
    filterRaw === 'favorites' || filterRaw === 'microsoft' || filterRaw === 'google'
      ? filterRaw
      : 'all'
  const accountId = typeof o.accountId === 'string' ? o.accountId.trim() || null : null
  const query = typeof o.query === 'string' ? o.query : ''
  const limit = typeof o.limit === 'number' && Number.isFinite(o.limit) ? Math.min(10_000, o.limit) : undefined
  const sortRaw = o.sortBy
  const sortBy: PeopleListSort =
    sortRaw === 'givenName' || sortRaw === 'surname' || sortRaw === 'displayName' ? sortRaw : 'displayName'
  return { filter, accountId: accountId ?? undefined, query, limit, sortBy }
}

function normalizeCreateContactInput(raw: unknown): PeopleCreateContactInput {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const accountId = typeof o.accountId === 'string' ? o.accountId.trim() : ''
  if (!accountId) {
    throw new Error('Keine Konto-ID fuer neuen Kontakt.')
  }
  const str = (k: string): string | null | undefined => {
    if (!(k in o)) return undefined
    const v = o[k]
    if (v === null) return null
    if (typeof v !== 'string') return undefined
    return v
  }
  return {
    accountId,
    displayName: str('displayName'),
    givenName: str('givenName'),
    surname: str('surname'),
    primaryEmail: str('primaryEmail'),
    company: str('company'),
    jobTitle: str('jobTitle'),
    mobilePhone: str('mobilePhone'),
    notes: str('notes')
  }
}

export function registerPeopleIpc(): void {
  ipcMain.removeHandler(IPC.people.list)
  ipcMain.handle(IPC.people.list, async (_event, input: unknown): Promise<PeopleContactView[]> => {
    return listPeopleForUi(normalizeListInput(input))
  })

  ipcMain.removeHandler(IPC.people.getNavCounts)
  ipcMain.handle(IPC.people.getNavCounts, async (): Promise<PeopleNavCounts> => {
    return getPeopleNavCounts()
  })

  ipcMain.removeHandler(IPC.people.syncAccount)
  ipcMain.handle(IPC.people.syncAccount, async (_event, accountId: unknown): Promise<PeopleSyncAccountResult> => {
    assertAppOnline()
    if (typeof accountId !== 'string' || !accountId.trim()) {
      throw new Error('Keine Konto-ID fuer Kontakte-Sync.')
    }
    return syncPeopleForAccount(accountId.trim())
  })

  ipcMain.removeHandler(IPC.people.syncAll)
  ipcMain.handle(IPC.people.syncAll, async (): Promise<PeopleSyncAccountResult[]> => {
    assertAppOnline()
    return syncPeopleForAllAccounts()
  })

  ipcMain.removeHandler(IPC.people.setFavorite)
  ipcMain.handle(IPC.people.setFavorite, async (_event, raw: unknown): Promise<void> => {
    const o = raw && typeof raw === 'object' ? (raw as PeopleSetFavoriteInput) : ({} as PeopleSetFavoriteInput)
    const accountId = typeof o.accountId === 'string' ? o.accountId.trim() : ''
    const remoteId = typeof o.remoteId === 'string' ? o.remoteId.trim() : ''
    const provider = o.provider
    if (!accountId || !remoteId) {
      throw new Error('Ungueltige Parameter fuer Favorit.')
    }
    if (provider !== 'microsoft' && provider !== 'google') {
      throw new Error('Ungueltiger Anbieter.')
    }
    await setFavoriteForPeopleContact({
      accountId,
      provider,
      remoteId,
      isFavorite: Boolean(o.isFavorite)
    })
  })

  ipcMain.removeHandler(IPC.people.getPhotoDataUrl)
  ipcMain.handle(IPC.people.getPhotoDataUrl, async (_event, contactId: unknown): Promise<string | null> => {
    if (typeof contactId !== 'number' || !Number.isFinite(contactId)) {
      throw new Error('Ungueltige Kontakt-ID.')
    }
    const row = getPeopleContactById(contactId)
    if (!row?.photoLocalPath) return null
    return readContactPhotoDataUrl(row.photoLocalPath)
  })

  ipcMain.removeHandler(IPC.people.updateContact)
  ipcMain.handle(IPC.people.updateContact, async (_event, raw: unknown): Promise<void> => {
    assertAppOnline()
    const o = raw && typeof raw === 'object' ? (raw as PeopleUpdateContactInput) : ({} as PeopleUpdateContactInput)
    const id = typeof o.id === 'number' && Number.isFinite(o.id) ? o.id : NaN
    const patch = o.patch && typeof o.patch === 'object' ? (o.patch as PeopleUpdateContactPatch) : {}
    if (!Number.isFinite(id)) {
      throw new Error('Ungueltige Kontakt-ID.')
    }
    await updatePeopleContact({ id, patch })
  })

  ipcMain.removeHandler(IPC.people.setContactPhoto)
  ipcMain.handle(IPC.people.setContactPhoto, async (_event, raw: unknown): Promise<PeopleContactView> => {
    assertAppOnline()
    const o = raw && typeof raw === 'object' ? (raw as PeopleSetContactPhotoInput) : ({} as PeopleSetContactPhotoInput)
    const id = typeof o.id === 'number' && Number.isFinite(o.id) ? o.id : NaN
    const imageBase64 = typeof o.imageBase64 === 'string' ? o.imageBase64 : ''
    if (!Number.isFinite(id)) {
      throw new Error('Ungueltige Kontakt-ID.')
    }
    if (!imageBase64.trim()) {
      throw new Error('Kein Bild uebergeben.')
    }
    return setPeopleContactPhotoFromUpload({ id, imageBase64 })
  })

  ipcMain.removeHandler(IPC.people.createContact)
  ipcMain.handle(IPC.people.createContact, async (_event, raw: unknown): Promise<PeopleContactView> => {
    assertAppOnline()
    return createPeopleContact(normalizeCreateContactInput(raw))
  })

  ipcMain.removeHandler(IPC.people.deleteContact)
  ipcMain.handle(IPC.people.deleteContact, async (_event, contactId: unknown): Promise<void> => {
    assertAppOnline()
    if (typeof contactId !== 'number' || !Number.isFinite(contactId)) {
      throw new Error('Ungueltige Kontakt-ID.')
    }
    await deletePeopleContact(contactId)
  })
}
