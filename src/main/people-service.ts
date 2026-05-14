import type {
  PeopleContactView,
  PeopleCreateContactInput,
  PeopleListInput,
  PeopleNavCounts,
  PeopleSyncAccountResult,
  PeopleUpdateContactInput
} from '@shared/types'
import { listAccounts } from './accounts'
import { deleteContactPhotoFileIfExists, saveContactPhotoBytes } from './contact-photo'
import {
  graphCreateContactRow,
  graphDeleteContact,
  graphFetchContactsForSync,
  graphGetContact,
  graphPatchContact,
  graphPutContactPhoto,
  rowFromGraph
} from './graph/people-graph'
import {
  attachGoogleContactPhotos,
  googleCreateContactRow,
  googleDeleteContact,
  googleFetchContactsForSync,
  googleUpdateContact,
  googleUpdateContactPhoto,
  rowFromGooglePerson
} from './google/people-google'
import {
  applyGoogleContactsDelta,
  deletePeopleContactById,
  getPeopleContactById,
  getPeopleNavCounts as repoGetPeopleNavCounts,
  getPeopleSyncCursor,
  insertPeopleContactRow,
  listPeopleContacts,
  replaceContactsForAccount,
  setPeopleFavorite as repoSetPeopleFavorite,
  updatePeopleContactLocal,
  type PeopleContactInsertRow,
  type PeopleContactLocalPatch
} from './db/people-repo'

export function listPeopleForUi(input: PeopleListInput) {
  return listPeopleContacts(input)
}

export async function getPeopleNavCounts(): Promise<PeopleNavCounts> {
  const base = repoGetPeopleNavCounts()
  const accounts = await listAccounts()
  const meta = new Map(accounts.map((a) => [a.id, a] as const))
  return {
    ...base,
    byAccount: base.byAccount.map((row) => {
      const acc = meta.get(row.accountId)
      return {
        ...row,
        email: acc?.email,
        displayName: acc?.displayName
      }
    })
  }
}

export async function syncPeopleForAccount(accountId: string): Promise<PeopleSyncAccountResult> {
  const accounts = await listAccounts()
  const acc = accounts.find((a) => a.id === accountId)
  if (!acc) {
    throw new Error('Konto nicht gefunden.')
  }
  if (acc.provider === 'microsoft') {
    const rows = await graphFetchContactsForSync(accountId)
    replaceContactsForAccount(accountId, 'microsoft', rows, null)
    return { accountId, provider: 'microsoft', imported: rows.length }
  }
  if (acc.provider !== 'google') {
    throw new Error('Kontakte: Anbieter nicht unterstuetzt.')
  }
  const cursorBefore = getPeopleSyncCursor(accountId)
  const pack = await googleFetchContactsForSync(accountId, cursorBefore)
  if (pack.mode === 'full') {
    replaceContactsForAccount(accountId, 'google', pack.rows, pack.nextSyncToken)
  } else {
    applyGoogleContactsDelta({
      accountId,
      rows: pack.rows,
      deletedRemoteIds: pack.deletedRemoteIds,
      nextSyncToken: pack.nextSyncToken ?? cursorBefore
    })
  }
  return {
    accountId,
    provider: 'google',
    imported: pack.rows.length + pack.deletedRemoteIds.length
  }
}

export async function syncPeopleForAllAccounts(): Promise<PeopleSyncAccountResult[]> {
  const accounts = await listAccounts()
  const results: PeopleSyncAccountResult[] = []
  for (const a of accounts) {
    if (a.provider !== 'microsoft' && a.provider !== 'google') continue
    try {
      results.push(await syncPeopleForAccount(a.id))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.warn(`[people] Sync fuer ${a.id} fehlgeschlagen:`, msg)
      results.push({
        accountId: a.id,
        provider: a.provider,
        imported: 0,
        error: msg
      })
    }
  }
  return results
}

function createPayloadFromInput(
  input: PeopleCreateContactInput
): Omit<PeopleCreateContactInput, 'accountId'> {
  return {
    displayName: input.displayName,
    givenName: input.givenName,
    surname: input.surname,
    primaryEmail: input.primaryEmail,
    company: input.company,
    jobTitle: input.jobTitle,
    mobilePhone: input.mobilePhone,
    notes: input.notes
  }
}

export async function createPeopleContact(input: PeopleCreateContactInput): Promise<PeopleContactView> {
  const accounts = await listAccounts()
  const acc = accounts.find((a) => a.id === input.accountId)
  if (!acc) {
    throw new Error('Konto nicht gefunden.')
  }
  if (acc.provider !== 'microsoft' && acc.provider !== 'google') {
    throw new Error('Nur Microsoft- oder Google-Konten unterstuetzt.')
  }
  const payload = createPayloadFromInput(input)
  let row: PeopleContactInsertRow
  if (acc.provider === 'microsoft') {
    row = await graphCreateContactRow(input.accountId, payload)
  } else {
    row = await googleCreateContactRow(input.accountId, payload)
  }
  const id = insertPeopleContactRow(row)
  const view = getPeopleContactById(id)
  if (!view) {
    throw new Error('Kontakt konnte lokal nicht gelesen werden.')
  }
  return view
}

export async function deletePeopleContact(id: number): Promise<void> {
  const cur = getPeopleContactById(id)
  if (!cur) {
    throw new Error('Kontakt nicht gefunden.')
  }
  const photoPath = cur.photoLocalPath
  if (cur.provider === 'microsoft') {
    await graphDeleteContact({ accountId: cur.accountId, remoteId: cur.remoteId })
  } else if (cur.provider === 'google') {
    await googleDeleteContact(cur.accountId, cur.remoteId)
  } else {
    throw new Error('Anbieter nicht unterstuetzt.')
  }
  await deleteContactPhotoFileIfExists(photoPath)
  deletePeopleContactById(id)
}

export async function setFavoriteForPeopleContact(args: {
  accountId: string
  provider: 'microsoft' | 'google'
  remoteId: string
  isFavorite: boolean
}): Promise<void> {
  repoSetPeopleFavorite(args)
}

function insertRowToLocalPatch(row: PeopleContactInsertRow, prevPhoto: string | null): PeopleContactLocalPatch {
  return {
    changeKey: row.changeKey,
    displayName: row.displayName,
    givenName: row.givenName,
    surname: row.surname,
    company: row.company,
    jobTitle: row.jobTitle,
    department: row.department,
    officeLocation: row.officeLocation,
    birthdayIso: row.birthdayIso,
    webPage: row.webPage,
    primaryEmail: row.primaryEmail,
    emailsJson: row.emailsJson,
    phonesJson: row.phonesJson,
    addressesJson: row.addressesJson,
    categoriesJson: row.categoriesJson,
    notes: row.notes,
    photoLocalPath: row.photoLocalPath ?? prevPhoto,
    rawJson: row.rawJson,
    updatedRemote: row.updatedRemote
  }
}

function patchHasChanges(p: PeopleUpdateContactInput['patch']): boolean {
  return Object.keys(p).length > 0
}

export async function updatePeopleContact(input: PeopleUpdateContactInput): Promise<void> {
  if (!patchHasChanges(input.patch)) {
    throw new Error('Keine Aenderungen fuer Kontakt-Update.')
  }
  const cur = getPeopleContactById(input.id)
  if (!cur) {
    throw new Error('Kontakt nicht gefunden.')
  }
  const prevPhoto = cur.photoLocalPath
  if (cur.provider === 'microsoft') {
    await graphPatchContact({
      accountId: cur.accountId,
      remoteId: cur.remoteId,
      etag: cur.changeKey,
      patch: input.patch
    })
    const g = await graphGetContact(cur.accountId, cur.remoteId)
    const row = rowFromGraph(cur.accountId, g)
    if (!row) {
      throw new Error('Microsoft-Kontakt nach Update nicht lesbar.')
    }
    row.photoLocalPath = row.photoLocalPath ?? prevPhoto
    updatePeopleContactLocal(cur.id, insertRowToLocalPatch(row, prevPhoto))
    return
  }
  if (cur.provider === 'google') {
    const p = await googleUpdateContact({
      accountId: cur.accountId,
      resourceName: cur.remoteId,
      etag: cur.changeKey,
      patch: input.patch
    })
    const row = rowFromGooglePerson(cur.accountId, p)
    if (!row) {
      throw new Error('Google-Kontakt nach Update nicht lesbar.')
    }
    row.photoLocalPath = row.photoLocalPath ?? prevPhoto
    updatePeopleContactLocal(cur.id, insertRowToLocalPatch(row, prevPhoto))
    return
  }
  throw new Error('Anbieter nicht unterstuetzt.')
}

function stripBase64Payload(s: string): string {
  const t = s.trim().replace(/\s/g, '')
  const m = /^data:[^;]+;base64,(.+)$/i.exec(t)
  return m ? m[1]! : t
}

/** JPEG/PNG zu Microsoft Graph oder Google People hochladen, lokal speichern, DB aktualisieren. */
export async function setPeopleContactPhotoFromUpload(input: {
  id: number
  imageBase64: string
}): Promise<PeopleContactView> {
  const rawB64 = stripBase64Payload(input.imageBase64)
  let buf: Buffer
  try {
    buf = Buffer.from(rawB64, 'base64')
  } catch {
    throw new Error('Kontaktfoto: Base64 ungueltig.')
  }
  const cur = getPeopleContactById(input.id)
  if (!cur) {
    throw new Error('Kontakt nicht gefunden.')
  }
  if (cur.provider === 'microsoft') {
    await graphPutContactPhoto({
      accountId: cur.accountId,
      remoteId: cur.remoteId,
      imageBytes: buf
    })
    const rel = await saveContactPhotoBytes(cur.accountId, cur.remoteId, buf)
    const g = await graphGetContact(cur.accountId, cur.remoteId)
    const row = rowFromGraph(cur.accountId, g)
    if (!row) {
      throw new Error('Microsoft-Kontakt nach Foto-Update nicht lesbar.')
    }
    row.photoLocalPath = rel
    updatePeopleContactLocal(cur.id, insertRowToLocalPatch(row, cur.photoLocalPath))
    const v = getPeopleContactById(cur.id)
    if (!v) {
      throw new Error('Kontakt nach Foto-Update nicht lesbar.')
    }
    return v
  }
  if (cur.provider === 'google') {
    const p = await googleUpdateContactPhoto({
      accountId: cur.accountId,
      resourceName: cur.remoteId,
      imageBytes: buf
    })
    const row = rowFromGooglePerson(cur.accountId, p)
    if (!row) {
      throw new Error('Google-Kontakt nach Foto-Update nicht lesbar.')
    }
    await attachGoogleContactPhotos(cur.accountId, [row])
    updatePeopleContactLocal(cur.id, insertRowToLocalPatch(row, cur.photoLocalPath))
    const v = getPeopleContactById(cur.id)
    if (!v) {
      throw new Error('Kontakt nach Foto-Update nicht lesbar.')
    }
    return v
  }
  throw new Error('Kontaktfoto setzen fuer diesen Anbieter nicht unterstuetzt.')
}
