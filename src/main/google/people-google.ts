import type { people_v1 } from 'googleapis'
import type { PeopleContactInsertRow } from '../db/people-repo'
import type { PeopleCreateContactPayload, PeopleUpdateContactPatch } from '@shared/types'
import { getFreshGoogleAccessToken, getGoogleApis } from './google-auth-client'
import { saveContactPhotoBytes } from '../contact-photo'

const PEOPLE_GOOGLE_APIS = { requireContactsScope: true as const }

function rethrowIfGooglePeopleInsufficientPermission(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err)
  if (/insufficient permission/i.test(msg)) {
    throw new Error(
      'Google-Kontakte: Zugriff verweigert (Insufficient Permission). ' +
        'Bitte das Google-Konto in den Einstellungen entfernen und erneut verbinden (Kontakte-Berechtigung). ' +
        'In der Google Cloud Console die People API aktivieren.'
    )
  }
  throw err instanceof Error ? err : new Error(msg)
}

function pickPrimaryEmail(
  emails: people_v1.Schema$EmailAddress[] | null | undefined
): string | null {
  if (!Array.isArray(emails) || emails.length === 0) return null
  const primary = emails.find((e) => e.metadata?.primary && e.value?.trim())
  const addr = (primary?.value ?? emails[0]?.value)?.trim()
  return addr || null
}

function personResourceId(resourceName: string | null | undefined): string | null {
  if (!resourceName || typeof resourceName !== 'string') return null
  const t = resourceName.trim()
  return t || null
}

function birthdayIsoFromGoogle(p: people_v1.Schema$Person): string | null {
  const b = p.birthdays?.find((x) => x.date) ?? p.birthdays?.[0]
  const d = b?.date
  if (!d) return null
  const y = d.year != null ? String(d.year).padStart(4, '0') : null
  const m = d.month != null ? String(d.month).padStart(2, '0') : null
  const day = d.day != null ? String(d.day).padStart(2, '0') : null
  if (y && m && day) return `${y}-${m}-${day}`
  if (m && day) return `${m}-${day}`
  return null
}

function webPageFromGoogle(p: people_v1.Schema$Person): string | null {
  const u = p.urls?.find((x) => x.metadata?.primary)?.value?.trim() || p.urls?.[0]?.value?.trim()
  return u || null
}

export function rowFromGooglePerson(accountId: string, p: people_v1.Schema$Person): PeopleContactInsertRow | null {
  const resourceName = personResourceId(p.resourceName ?? undefined)
  if (!resourceName) return null
  const names = p.names ?? []
  const n0 = names[0]
  const displayName =
    (n0?.displayName?.trim() ||
      [n0?.givenName, n0?.familyName].filter(Boolean).join(' ').trim()) ||
    null
  const orgs = p.organizations ?? []
  const o0 = orgs[0]
  const emails = p.emailAddresses ?? undefined
  const phones = p.phoneNumbers ?? []
  const addresses = p.addresses ?? []
  const bio = p.biographies?.[0]?.value?.trim() || null
  const dept = o0?.department?.trim() || null

  const emailsJson = emails && emails.length > 0 ? JSON.stringify(emails) : null
  const phonesJson =
    phones.length > 0
      ? JSON.stringify(
          phones.map((ph) => ({
            type: ph.type ?? ph.formattedType ?? 'other',
            value: ph.value?.trim() ?? ''
          }))
        )
      : null
  const addressesJson =
    addresses.length > 0
      ? JSON.stringify(
          addresses.map((a) => ({
            type: a.type ?? a.formattedType ?? 'other',
            street: a.streetAddress ?? null,
            city: a.city ?? null,
            region: a.region ?? null,
            country: a.country ?? null,
            postalCode: a.postalCode ?? null
          }))
        )
      : null

  const updated =
    p.metadata?.sources?.find((s) => s.updateTime)?.updateTime ??
    p.metadata?.sources?.[0]?.updateTime ??
    null

  return {
    accountId,
    provider: 'google',
    remoteId: resourceName,
    changeKey: p.etag ?? null,
    displayName,
    givenName: n0?.givenName?.trim() || null,
    surname: n0?.familyName?.trim() || null,
    company: o0?.name?.trim() || null,
    jobTitle: o0?.title?.trim() || null,
    department: dept,
    officeLocation: o0?.location?.trim() || null,
    birthdayIso: birthdayIsoFromGoogle(p),
    webPage: webPageFromGoogle(p),
    primaryEmail: pickPrimaryEmail(emails),
    emailsJson,
    phonesJson,
    addressesJson,
    categoriesJson: null,
    notes: bio,
    photoLocalPath: null,
    rawJson: JSON.stringify(p),
    updatedRemote: updated ?? null
  }
}

const PERSON_FIELDS = [
  'names',
  'emailAddresses',
  'phoneNumbers',
  'addresses',
  'organizations',
  'biographies',
  'metadata',
  'photos',
  'urls',
  'birthdays'
].join(',')

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

export async function attachGoogleContactPhotos(accountId: string, rows: PeopleContactInsertRow[]): Promise<void> {
  const token = await getFreshGoogleAccessToken(accountId)
  if (!token) return
  await forEachLimit(rows, 6, async (row) => {
    try {
      const person = JSON.parse(row.rawJson ?? '{}') as people_v1.Schema$Person
      const photo = person.photos?.find((ph) => ph.metadata?.primary) ?? person.photos?.[0]
      const url = photo?.url?.trim()
      if (!url || !url.startsWith('https://')) return
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'MailClient/1.0 (Electron)' }
      })
      if (!res.ok) return
      const ab = await res.arrayBuffer()
      const buf = Buffer.from(ab)
      if (buf.length === 0 || buf.length > 4 * 1024 * 1024) return
      row.photoLocalPath = await saveContactPhotoBytes(accountId, row.remoteId, buf)
    } catch (e) {
      console.warn('[people-google] Kontaktfoto:', row.remoteId, e)
    }
  })
}

/** Ergebnis von `people.connections.list` inkl. Sync-Token und Loeschungen (inkrementell). */
export interface GoogleContactsSyncFetch {
  mode: 'full' | 'incremental'
  rows: PeopleContactInsertRow[]
  deletedRemoteIds: string[]
  nextSyncToken: string | null
}

function isGoogleExpiredSyncToken(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const o = err as { message?: string; errors?: Array<{ reason?: string }> }
  if (o.errors?.some((e) => e.reason === 'EXPIRED_SYNC_TOKEN')) return true
  const msg = String(o.message ?? '').toLowerCase()
  return msg.includes('expired_sync_token') || msg.includes('expired sync token')
}

async function googleListConnectionsPages(args: {
  accountId: string
  mode: 'full' | 'incremental'
  syncToken?: string
}): Promise<GoogleContactsSyncFetch> {
  try {
    const { people } = await getGoogleApis(args.accountId, PEOPLE_GOOGLE_APIS)
    const rows: PeopleContactInsertRow[] = []
    const deleted = new Set<string>()
    const pushDel = (id: string | null | undefined): void => {
      const t = id?.trim()
      if (t) deleted.add(t)
    }

    let pageToken: string | undefined
    let nextSyncToken: string | null = null

    do {
      const res = await people.people.connections.list({
        resourceName: 'people/me',
        pageSize: 1000,
        personFields: PERSON_FIELDS,
        pageToken,
        requestSyncToken: args.mode === 'full',
        syncToken: args.mode === 'incremental' ? args.syncToken : undefined
      })
      const token = res.data.nextSyncToken?.trim()
      if (token) nextSyncToken = token

      const connections = res.data.connections ?? []
      for (const person of connections) {
        const meta = person.metadata
        if (meta?.deleted) {
          pushDel(person.resourceName)
          for (const prev of meta.previousResourceNames ?? []) {
            pushDel(prev)
          }
          continue
        }
        const row = rowFromGooglePerson(args.accountId, person)
        if (row) {
          for (const prev of meta?.previousResourceNames ?? []) {
            const p = prev.trim()
            if (p && p !== row.remoteId) pushDel(p)
          }
          rows.push(row)
        }
      }
      pageToken = res.data.nextPageToken ?? undefined
    } while (pageToken)

    await attachGoogleContactPhotos(args.accountId, rows)
    return {
      mode: args.mode,
      rows,
      deletedRemoteIds: [...deleted],
      nextSyncToken
    }
  } catch (e) {
    rethrowIfGooglePeopleInsufficientPermission(e)
  }
}

/**
 * Google People API: `people.connections.list` mit `requestSyncToken` / `syncToken`.
 * Bei abgelaufenem Sync-Token automatisch Vollsync ohne Token.
 */
export async function googleFetchContactsForSync(
  accountId: string,
  storedSyncToken: string | null
): Promise<GoogleContactsSyncFetch> {
  const t = storedSyncToken?.trim() || null
  if (t) {
    try {
      const pack = await googleListConnectionsPages({
        accountId,
        mode: 'incremental',
        syncToken: t
      })
      return pack
    } catch (e) {
      if (!isGoogleExpiredSyncToken(e)) throw e
      console.warn('[people-google] Sync-Token abgelaufen, Vollsync.')
    }
  }
  return googleListConnectionsPages({ accountId, mode: 'full' })
}

function buildGoogleUpdateBody(patch: PeopleUpdateContactPatch): people_v1.Schema$Person {
  const body: people_v1.Schema$Person = {}
  if (
    patch.displayName !== undefined ||
    patch.givenName !== undefined ||
    patch.surname !== undefined
  ) {
    body.names = [
      {
        givenName: patch.givenName ?? undefined,
        familyName: patch.surname ?? undefined,
        displayName: patch.displayName ?? undefined
      }
    ]
  }
  if (patch.emails !== undefined) {
    body.emailAddresses = (patch.emails ?? []).map((e, i) => ({
      value: e.address.trim(),
      type: 'work',
      metadata: { primary: i === 0 }
    }))
  } else if (patch.primaryEmail !== undefined) {
    const v = patch.primaryEmail?.trim()
    body.emailAddresses = v ? [{ value: v, metadata: { primary: true } }] : []
  }
  if (patch.phones !== undefined) {
    body.phoneNumbers = (patch.phones ?? []).map((p) => ({
      value: p.value.trim(),
      type: p.type || 'mobile'
    }))
  }
  if (
    patch.company !== undefined ||
    patch.jobTitle !== undefined ||
    patch.department !== undefined ||
    patch.officeLocation !== undefined
  ) {
    body.organizations = [
      {
        name: patch.company ?? undefined,
        title: patch.jobTitle ?? undefined,
        department: patch.department ?? undefined,
        location: patch.officeLocation ?? undefined
      }
    ]
  }
  if (patch.notes !== undefined) {
    body.biographies = [{ value: patch.notes ?? '', contentType: 'TEXT_PLAIN' }]
  }
  if (patch.webPage !== undefined) {
    const w = patch.webPage?.trim()
    body.urls = w ? [{ value: w, type: 'homePage' }] : []
  }
  if (patch.birthdayIso !== undefined) {
    const raw = patch.birthdayIso?.trim()
    if (raw) {
      const [y, m, d] = raw.split('-').map((x) => Number.parseInt(x, 10))
      body.birthdays = [{ date: { year: y, month: m, day: d } }]
    } else {
      body.birthdays = []
    }
  }
  return body
}

export async function googleUpdateContact(args: {
  accountId: string
  resourceName: string
  etag: string | null
  patch: PeopleUpdateContactPatch
}): Promise<people_v1.Schema$Person> {
  try {
    const { people } = await getGoogleApis(args.accountId, PEOPLE_GOOGLE_APIS)
    const body = buildGoogleUpdateBody(args.patch)
    if (args.etag?.trim()) {
      body.etag = args.etag.trim()
    }
    const fields: string[] = []
    if (body.names?.length) fields.push('names')
    if (body.emailAddresses) fields.push('emailAddresses')
    if (body.phoneNumbers) fields.push('phoneNumbers')
    if (body.organizations?.length) fields.push('organizations')
    if (body.biographies?.length) fields.push('biographies')
    if (body.urls) fields.push('urls')
    if (body.birthdays) fields.push('birthdays')
    if (fields.length === 0) {
      throw new Error('Keine aenderbaren Felder fuer Google-Kontakt.')
    }
    const res = await people.people.updateContact({
      resourceName: args.resourceName,
      personFields: PERSON_FIELDS,
      updatePersonFields: fields.join(','),
      requestBody: body
    })
    const data = res.data
    if (!data) {
      throw new Error('Google People: leere Antwort.')
    }
    return data
  } catch (e) {
    rethrowIfGooglePeopleInsufficientPermission(e)
  }
}

export async function googleUpdateContactPhoto(args: {
  accountId: string
  resourceName: string
  imageBytes: Buffer
}): Promise<people_v1.Schema$Person> {
  try {
    const { people } = await getGoogleApis(args.accountId, PEOPLE_GOOGLE_APIS)
    const name = args.resourceName.trim()
    if (!name) throw new Error('Google: keine Kontakt-Ressource fuer Foto-Update.')
    const res = await people.people.updateContactPhoto({
      resourceName: name,
      requestBody: {
        photoBytes: args.imageBytes.toString('base64'),
        personFields: PERSON_FIELDS
      }
    })
    const person = res.data.person
    if (!person) {
      throw new Error('Google People: keine Person nach Foto-Update.')
    }
    return person
  } catch (e) {
    rethrowIfGooglePeopleInsufficientPermission(e)
  }
}

function googlePersonFromCreatePayload(payload: PeopleCreateContactPayload): people_v1.Schema$Person {
  const dn = payload.displayName?.trim()
  const gn = payload.givenName?.trim()
  const sn = payload.surname?.trim()
  const email = payload.primaryEmail?.trim()
  const display =
    dn || [gn, sn].filter(Boolean).join(' ').trim() || email || ''
  if (!display) {
    throw new Error('Mindestens Anzeigename, Vor-/Nachname oder E-Mail angeben.')
  }
  const person: people_v1.Schema$Person = {
    names: [
      {
        givenName: gn || undefined,
        familyName: sn || undefined,
        displayName: dn || [gn, sn].filter(Boolean).join(' ').trim() || email || undefined
      }
    ]
  }
  if (email) {
    person.emailAddresses = [{ value: email, type: 'home', metadata: { primary: true } }]
  }
  if (payload.company?.trim() || payload.jobTitle?.trim()) {
    person.organizations = [
      {
        name: payload.company?.trim() || undefined,
        title: payload.jobTitle?.trim() || undefined
      }
    ]
  }
  if (payload.mobilePhone?.trim()) {
    person.phoneNumbers = [{ value: payload.mobilePhone.trim(), type: 'mobile' }]
  }
  if (payload.notes?.trim()) {
    person.biographies = [{ value: payload.notes.trim(), contentType: 'TEXT_PLAIN' }]
  }
  return person
}

export async function googleDeleteContact(accountId: string, resourceName: string): Promise<void> {
  try {
    const { people } = await getGoogleApis(accountId, PEOPLE_GOOGLE_APIS)
    const name = resourceName.trim()
    if (!name) throw new Error('Google: keine Kontakt-Ressource.')
    await people.people.deleteContact({ resourceName: name })
  } catch (e) {
    rethrowIfGooglePeopleInsufficientPermission(e)
  }
}

export async function googleCreateContactRow(
  accountId: string,
  payload: PeopleCreateContactPayload
): Promise<PeopleContactInsertRow> {
  try {
    const { people } = await getGoogleApis(accountId, PEOPLE_GOOGLE_APIS)
    const requestBody = googlePersonFromCreatePayload(payload)
    const res = await people.people.createContact({
      personFields: PERSON_FIELDS,
      requestBody
    })
    const data = res.data
    if (!data) {
      throw new Error('Google People: leere Antwort nach Anlage.')
    }
    const row = rowFromGooglePerson(accountId, data)
    if (!row) {
      throw new Error('Google-Kontakt nach Anlage nicht lesbar.')
    }
    await attachGoogleContactPhotos(accountId, [row])
    return row
  } catch (e) {
    rethrowIfGooglePeopleInsufficientPermission(e)
  }
}
