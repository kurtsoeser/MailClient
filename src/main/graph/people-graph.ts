import { ResponseType } from '@microsoft/microsoft-graph-client'
import { createGraphClient } from './client'
import { loadConfig } from '../config'
import type { PeopleContactInsertRow } from '../db/people-repo'
import type { PeopleCreateContactPayload, PeopleUpdateContactPatch } from '@shared/types'
import { saveContactPhotoBytes } from '../contact-photo'

async function getClientFor(accountId: string): Promise<ReturnType<typeof createGraphClient>> {
  const config = await loadConfig()
  if (!config.microsoftClientId) {
    throw new Error('Keine Azure Client-ID konfiguriert.')
  }
  const homeAccountId = accountId.replace(/^ms:/, '')
  return createGraphClient(config.microsoftClientId, homeAccountId)
}

interface GraphPhysicalAddress {
  street?: string | null
  city?: string | null
  state?: string | null
  countryOrRegion?: string | null
  postalCode?: string | null
}

interface GraphEmailAddress {
  name?: string | null
  address?: string | null
}

interface GraphContact {
  id: string
  displayName?: string | null
  givenName?: string | null
  surname?: string | null
  companyName?: string | null
  jobTitle?: string | null
  department?: string | null
  officeLocation?: string | null
  businessHomePage?: string | null
  birthday?: string | null
  emailAddresses?: GraphEmailAddress[] | null
  businessPhones?: string[] | null
  homePhones?: string[] | null
  mobilePhone?: string | null
  businessAddress?: GraphPhysicalAddress | null
  homeAddress?: GraphPhysicalAddress | null
  otherAddress?: GraphPhysicalAddress | null
  categories?: string[] | null
  personalNotes?: string | null
  lastModifiedDateTime?: string | null
  /** OData, falls in der Antwort enthalten. */
  '@odata.etag'?: string | null
}

interface ODataCollection<T> {
  value: T[]
  '@odata.nextLink'?: string
}

function primaryEmailFromGraph(emails: GraphEmailAddress[] | null | undefined): string | null {
  if (!Array.isArray(emails) || emails.length === 0) return null
  const first = emails.find((e) => typeof e.address === 'string' && e.address.trim() !== '')
  const addr = first?.address?.trim()
  return addr || null
}

function phonesJsonFromGraph(c: GraphContact): string | null {
  const phones: Array<{ type: string; value: string }> = []
  for (const p of c.businessPhones ?? []) {
    const v = typeof p === 'string' ? p.trim() : ''
    if (v) phones.push({ type: 'business', value: v })
  }
  for (const p of c.homePhones ?? []) {
    const v = typeof p === 'string' ? p.trim() : ''
    if (v) phones.push({ type: 'home', value: v })
  }
  const m = typeof c.mobilePhone === 'string' ? c.mobilePhone.trim() : ''
  if (m) phones.push({ type: 'mobile', value: m })
  return phones.length > 0 ? JSON.stringify(phones) : null
}

function addressesJsonFromGraph(c: GraphContact): string | null {
  const list: Array<{ type: string; raw: GraphPhysicalAddress }> = []
  if (c.businessAddress) list.push({ type: 'business', raw: c.businessAddress })
  if (c.homeAddress) list.push({ type: 'home', raw: c.homeAddress })
  if (c.otherAddress) list.push({ type: 'other', raw: c.otherAddress })
  if (list.length === 0) return null
  const simplified = list.map(({ type, raw }) => ({
    type,
    street: raw.street ?? null,
    city: raw.city ?? null,
    state: raw.state ?? null,
    countryOrRegion: raw.countryOrRegion ?? null,
    postalCode: raw.postalCode ?? null
  }))
  return JSON.stringify(simplified)
}

export function rowFromGraph(accountId: string, c: GraphContact): PeopleContactInsertRow | null {
  if (!c.id) return null
  const emails = Array.isArray(c.emailAddresses) ? c.emailAddresses : []
  const categories = Array.isArray(c.categories)
    ? c.categories.filter((x): x is string => typeof x === 'string' && x.trim() !== '')
    : []
  const notes =
    typeof c.personalNotes === 'string' && c.personalNotes.trim() !== ''
      ? c.personalNotes.trim()
      : null
  const birthdayIso =
    typeof c.birthday === 'string' && c.birthday.trim() !== '' ? c.birthday.trim() : null
  const web =
    typeof c.businessHomePage === 'string' && c.businessHomePage.trim() !== ''
      ? c.businessHomePage.trim()
      : null
  const dept = typeof c.department === 'string' && c.department.trim() !== '' ? c.department.trim() : null
  const office =
    typeof c.officeLocation === 'string' && c.officeLocation.trim() !== ''
      ? c.officeLocation.trim()
      : null
  return {
    accountId,
    provider: 'microsoft',
    remoteId: c.id,
    changeKey: typeof c['@odata.etag'] === 'string' ? c['@odata.etag'] : null,
    displayName: c.displayName?.trim() || null,
    givenName: c.givenName?.trim() || null,
    surname: c.surname?.trim() || null,
    company: c.companyName?.trim() || null,
    jobTitle: c.jobTitle?.trim() || null,
    department: dept,
    officeLocation: office,
    birthdayIso,
    webPage: web,
    primaryEmail: primaryEmailFromGraph(emails),
    emailsJson: emails.length > 0 ? JSON.stringify(emails) : null,
    phonesJson: phonesJsonFromGraph(c),
    addressesJson: addressesJsonFromGraph(c),
    categoriesJson: categories.length > 0 ? JSON.stringify(categories) : null,
    notes,
    photoLocalPath: null,
    rawJson: JSON.stringify(c),
    updatedRemote: c.lastModifiedDateTime?.trim() || null
  }
}

async function paginateContacts(accountId: string): Promise<GraphContact[]> {
  const client = await getClientFor(accountId)
  const select = [
    'id',
    'displayName',
    'givenName',
    'surname',
    'companyName',
    'jobTitle',
    'department',
    'officeLocation',
    'businessHomePage',
    'birthday',
    'emailAddresses',
    'businessPhones',
    'homePhones',
    'mobilePhone',
    'businessAddress',
    'homeAddress',
    'otherAddress',
    'categories',
    'personalNotes',
    'lastModifiedDateTime'
  ].join(',')
  const initialPath = `/me/contacts?$select=${select}&$top=200`
  const out: GraphContact[] = []
  let url: string | null = initialPath
  while (url) {
    const page = (await client.api(url).get()) as ODataCollection<GraphContact>
    for (const v of page.value) {
      out.push(v)
    }
    const next = page['@odata.nextLink']
    url = next ? next.replace(/^https?:\/\/[^/]+\/v[0-9.]+/, '') : null
  }
  return out
}

async function fetchGraphContactPhotoBytes(accountId: string, contactId: string): Promise<Buffer | null> {
  try {
    const client = await getClientFor(accountId)
    const buf = (await client
      .api(`/me/contacts/${encodeURIComponent(contactId)}/photo/$value`)
      .responseType(ResponseType.ARRAYBUFFER)
      .get()) as ArrayBuffer
    const b = Buffer.from(buf)
    return b.length > 0 ? b : null
  } catch {
    return null
  }
}

async function forEachLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  if (items.length === 0) return
  let next = 0
  const worker = async (): Promise<void> => {
    while (true) {
      const i = next++
      if (i >= items.length) return
      await fn(items[i]!)
    }
  }
  const n = Math.min(Math.max(1, limit), items.length)
  await Promise.all(Array.from({ length: n }, () => worker()))
}

async function attachGraphContactPhotos(accountId: string, rows: PeopleContactInsertRow[]): Promise<void> {
  await forEachLimit(rows, 6, async (row) => {
    const bytes = await fetchGraphContactPhotoBytes(accountId, row.remoteId)
    if (!bytes) return
    try {
      row.photoLocalPath = await saveContactPhotoBytes(accountId, row.remoteId, bytes)
    } catch (e) {
      console.warn('[people-graph] Kontaktfoto speichern fehlgeschlagen:', row.remoteId, e)
    }
  })
}

/**
 * Liest alle Outlook-Kontakte (`/me/contacts`) und liefert Zeilen fuer den lokalen Cache.
 * MVP: vollstaendiger Abruf ohne Delta.
 */
export async function graphFetchContactsForSync(accountId: string): Promise<PeopleContactInsertRow[]> {
  const raw = await paginateContacts(accountId)
  const rows: PeopleContactInsertRow[] = []
  for (const c of raw) {
    const row = rowFromGraph(accountId, c)
    if (row) rows.push(row)
  }
  await attachGraphContactPhotos(accountId, rows)
  return rows
}

function graphBodyFromPatch(patch: PeopleUpdateContactPatch): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (patch.displayName !== undefined) body.displayName = patch.displayName ?? ''
  if (patch.givenName !== undefined) body.givenName = patch.givenName ?? ''
  if (patch.surname !== undefined) body.surname = patch.surname ?? ''
  if (patch.company !== undefined) body.companyName = patch.company ?? ''
  if (patch.jobTitle !== undefined) body.jobTitle = patch.jobTitle ?? ''
  if (patch.department !== undefined) body.department = patch.department ?? ''
  if (patch.officeLocation !== undefined) body.officeLocation = patch.officeLocation ?? ''
  if (patch.webPage !== undefined) body.businessHomePage = patch.webPage ?? ''
  if (patch.birthdayIso !== undefined) body.birthday = patch.birthdayIso ?? null
  if (patch.notes !== undefined) body.personalNotes = patch.notes ?? ''

  if (patch.emails !== undefined) {
    body.emailAddresses = (patch.emails ?? []).map((e) => ({
      name: (e.name ?? e.address).trim() || null,
      address: e.address.trim()
    }))
  }

  if (patch.phones !== undefined) {
    const business: string[] = []
    const home: string[] = []
    let mobile: string | null = null
    for (const p of patch.phones ?? []) {
      const v = p.value.trim()
      if (!v) continue
      const t = p.type.toLowerCase()
      if (t.includes('mobile') || t === 'cell') mobile = v
      else if (t.includes('home')) home.push(v)
      else business.push(v)
    }
    body.businessPhones = business
    body.homePhones = home
    body.mobilePhone = mobile
  }

  if (patch.primaryEmail !== undefined && patch.emails === undefined) {
    const addr = patch.primaryEmail?.trim() || ''
    if (addr) {
      body.emailAddresses = [{ name: addr, address: addr }]
    }
  }

  return body
}

export async function graphPatchContact(args: {
  accountId: string
  remoteId: string
  etag: string | null
  patch: PeopleUpdateContactPatch
}): Promise<void> {
  const client = await getClientFor(args.accountId)
  const body = graphBodyFromPatch(args.patch)
  let req = client.api(`/me/contacts/${encodeURIComponent(args.remoteId)}`)
  if (args.etag?.trim()) {
    req = req.header('If-Match', args.etag.trim())
  }
  await req.patch(body)
}

/** Kontaktfoto an Outlook (persoenliche Kontakte) senden — nur JPEG/PNG, max. 4 MB. */
export async function graphPutContactPhoto(args: {
  accountId: string
  remoteId: string
  imageBytes: Buffer
}): Promise<void> {
  const b = args.imageBytes
  if (b.length === 0 || b.length > 4 * 1024 * 1024) {
    throw new Error('Kontaktfoto: ungueltige Groesse (max. 4 MB).')
  }
  let contentType = 'image/jpeg'
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    contentType = 'image/jpeg'
  } else if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    contentType = 'image/png'
  } else {
    throw new Error('Kontaktfoto: nur JPEG oder PNG.')
  }
  const client = await getClientFor(args.accountId)
  await client
    .api(`/me/contacts/${encodeURIComponent(args.remoteId)}/photo/$value`)
    .header('Content-Type', contentType)
    .put(b)
}

export async function graphDeleteContact(args: { accountId: string; remoteId: string }): Promise<void> {
  const client = await getClientFor(args.accountId)
  await client
    .api(`/me/contacts/${encodeURIComponent(args.remoteId)}`)
    .header('If-Match', '*')
    .delete()
}

export async function graphGetContact(accountId: string, remoteId: string): Promise<GraphContact> {
  const client = await getClientFor(accountId)
  const select = [
    'id',
    'displayName',
    'givenName',
    'surname',
    'companyName',
    'jobTitle',
    'department',
    'officeLocation',
    'businessHomePage',
    'birthday',
    'emailAddresses',
    'businessPhones',
    'homePhones',
    'mobilePhone',
    'businessAddress',
    'homeAddress',
    'otherAddress',
    'categories',
    'personalNotes',
    'lastModifiedDateTime'
  ].join(',')
  return (await client
    .api(`/me/contacts/${encodeURIComponent(remoteId)}`)
    .select(select)
    .get()) as GraphContact
}

export async function graphCreateContact(
  accountId: string,
  payload: PeopleCreateContactPayload
): Promise<GraphContact> {
  const dn = payload.displayName?.trim()
  const gn = payload.givenName?.trim()
  const sn = payload.surname?.trim()
  const email = payload.primaryEmail?.trim()
  const label = dn || [gn, sn].filter(Boolean).join(' ').trim() || email
  if (!label) {
    throw new Error('Mindestens Anzeigename, Vor-/Nachname oder E-Mail angeben.')
  }
  const client = await getClientFor(accountId)
  const body: Record<string, unknown> = {
    displayName: dn || [gn, sn].filter(Boolean).join(' ').trim() || email || 'Kontakt'
  }
  if (gn) body.givenName = gn
  if (sn) body.surname = sn
  if (payload.company?.trim()) body.companyName = payload.company.trim()
  if (payload.jobTitle?.trim()) body.jobTitle = payload.jobTitle.trim()
  if (email) {
    body.emailAddresses = [{ name: email, address: email }]
  }
  if (payload.mobilePhone?.trim()) {
    body.mobilePhone = payload.mobilePhone.trim()
  }
  if (payload.notes?.trim()) {
    body.personalNotes = payload.notes.trim()
  }
  const created = (await client.api('/me/contacts').post(body)) as GraphContact
  const id = created?.id
  if (!id || typeof id !== 'string') {
    throw new Error('Microsoft Graph: Kontaktanlage lieferte keine ID.')
  }
  return graphGetContact(accountId, id)
}

/** Legt Kontakt beim Server an, laedt optionales Foto, liefert DB-Zeile. */
export async function graphCreateContactRow(
  accountId: string,
  payload: PeopleCreateContactPayload
): Promise<PeopleContactInsertRow> {
  const g = await graphCreateContact(accountId, payload)
  const row = rowFromGraph(accountId, g)
  if (!row) {
    throw new Error('Microsoft-Kontakt nach Anlage nicht lesbar.')
  }
  const rows = [row]
  await attachGraphContactPhotos(accountId, rows)
  return rows[0]!
}
