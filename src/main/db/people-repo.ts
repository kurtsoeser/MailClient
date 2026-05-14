import { getDb } from './index'
import type { PeopleContactView, PeopleListInput, PeopleListSort, PeopleNavCounts, Provider } from '@shared/types'

export interface PeopleContactInsertRow {
  accountId: string
  provider: Provider
  remoteId: string
  changeKey: string | null
  displayName: string | null
  givenName: string | null
  surname: string | null
  company: string | null
  jobTitle: string | null
  department: string | null
  officeLocation: string | null
  birthdayIso: string | null
  webPage: string | null
  primaryEmail: string | null
  emailsJson: string | null
  phonesJson: string | null
  addressesJson: string | null
  categoriesJson: string | null
  notes: string | null
  photoLocalPath: string | null
  rawJson: string | null
  updatedRemote: string | null
}

interface DbRow {
  id: number
  account_id: string
  provider: string
  remote_id: string
  change_key: string | null
  display_name: string | null
  given_name: string | null
  surname: string | null
  company: string | null
  job_title: string | null
  department: string | null
  office_location: string | null
  birthday_iso: string | null
  web_page: string | null
  primary_email: string | null
  emails_json: string | null
  phones_json: string | null
  addresses_json: string | null
  categories_json: string | null
  notes: string | null
  photo_local_path: string | null
  raw_json: string | null
  updated_remote: string | null
  updated_local: string | null
  is_favorite: number
}

function rowToView(r: DbRow): PeopleContactView {
  return {
    id: r.id,
    accountId: r.account_id,
    provider: r.provider as Provider,
    remoteId: r.remote_id,
    changeKey: r.change_key,
    displayName: r.display_name,
    givenName: r.given_name,
    surname: r.surname,
    company: r.company,
    jobTitle: r.job_title,
    department: r.department ?? null,
    officeLocation: r.office_location ?? null,
    birthdayIso: r.birthday_iso ?? null,
    webPage: r.web_page ?? null,
    primaryEmail: r.primary_email,
    emailsJson: r.emails_json,
    phonesJson: r.phones_json,
    addressesJson: r.addresses_json,
    categoriesJson: r.categories_json,
    notes: r.notes,
    photoLocalPath: r.photo_local_path,
    rawJson: r.raw_json,
    updatedRemote: r.updated_remote,
    updatedLocal: r.updated_local,
    isFavorite: r.is_favorite === 1
  }
}

export function deletePeopleDataForAccount(accountId: string): void {
  const db = getDb()
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM people_contacts WHERE account_id = ?').run(accountId)
    db.prepare('DELETE FROM people_sync_state WHERE account_id = ?').run(accountId)
  })
  tx()
}

function collectFavoriteRemoteIds(accountId: string, provider: Provider): Set<string> {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT remote_id FROM people_contacts
       WHERE account_id = ? AND provider = ? AND is_favorite = 1`
    )
    .all(accountId, provider) as Array<{ remote_id: string }>
  return new Set(rows.map((x) => x.remote_id))
}

/** Gespeicherter Google-People-`nextSyncToken` (pro Konto, `people_sync_state`). */
export function getPeopleSyncCursor(accountId: string): string | null {
  const db = getDb()
  const row = db
    .prepare(`SELECT sync_cursor FROM people_sync_state WHERE account_id = ?`)
    .get(accountId) as { sync_cursor: string | null } | undefined
  const c = row?.sync_cursor?.trim()
  return c || null
}

/** Inkrementeller Google-Sync: Loeschen, Upsert (Favorit bleibt erhalten), Sync-Token speichern. */
export function applyGoogleContactsDelta(args: {
  accountId: string
  rows: PeopleContactInsertRow[]
  deletedRemoteIds: string[]
  nextSyncToken: string | null
}): void {
  const db = getDb()
  const favoriteRemoteIds = collectFavoriteRemoteIds(args.accountId, 'google')

  const upsert = db.prepare(`
    INSERT INTO people_contacts (
      account_id, provider, remote_id, change_key,
      display_name, given_name, surname, company, job_title,
      department, office_location, birthday_iso, web_page,
      primary_email,
      emails_json, phones_json, addresses_json, categories_json, notes,
      photo_local_path, raw_json, updated_remote, updated_local, is_favorite
    ) VALUES (
      @account_id, @provider, @remote_id, @change_key,
      @display_name, @given_name, @surname, @company, @job_title,
      @department, @office_location, @birthday_iso, @web_page,
      @primary_email,
      @emails_json, @phones_json, @addresses_json, @categories_json, @notes,
      @photo_local_path, @raw_json, @updated_remote, datetime('now'),
      @is_favorite
    )
    ON CONFLICT(account_id, provider, remote_id) DO UPDATE SET
      change_key = excluded.change_key,
      display_name = excluded.display_name,
      given_name = excluded.given_name,
      surname = excluded.surname,
      company = excluded.company,
      job_title = excluded.job_title,
      department = excluded.department,
      office_location = excluded.office_location,
      birthday_iso = excluded.birthday_iso,
      web_page = excluded.web_page,
      primary_email = excluded.primary_email,
      emails_json = excluded.emails_json,
      phones_json = excluded.phones_json,
      addresses_json = excluded.addresses_json,
      categories_json = excluded.categories_json,
      notes = excluded.notes,
      photo_local_path = excluded.photo_local_path,
      raw_json = excluded.raw_json,
      updated_remote = excluded.updated_remote,
      updated_local = datetime('now'),
      is_favorite = MAX(people_contacts.is_favorite, excluded.is_favorite)
  `)

  const del = db.prepare(
    `DELETE FROM people_contacts WHERE account_id = ? AND provider = 'google' AND remote_id = ?`
  )

  const tx = db.transaction(() => {
    for (const rid of args.deletedRemoteIds) {
      const id = rid.trim()
      if (id) del.run(args.accountId, id)
    }
    for (const r of args.rows) {
      upsert.run({
        account_id: r.accountId,
        provider: 'google',
        remote_id: r.remoteId,
        change_key: r.changeKey,
        display_name: r.displayName,
        given_name: r.givenName,
        surname: r.surname,
        company: r.company,
        job_title: r.jobTitle,
        department: r.department,
        office_location: r.officeLocation,
        birthday_iso: r.birthdayIso,
        web_page: r.webPage,
        primary_email: r.primaryEmail,
        emails_json: r.emailsJson,
        phones_json: r.phonesJson,
        addresses_json: r.addressesJson,
        categories_json: r.categoriesJson,
        notes: r.notes,
        photo_local_path: r.photoLocalPath,
        raw_json: r.rawJson,
        updated_remote: r.updatedRemote,
        is_favorite: favoriteRemoteIds.has(r.remoteId) ? 1 : 0
      })
    }
    db.prepare(
      `INSERT INTO people_sync_state (account_id, provider, sync_cursor, last_synced_at)
       VALUES (?, 'google', ?, datetime('now'))
       ON CONFLICT(account_id) DO UPDATE SET
         provider = excluded.provider,
         sync_cursor = excluded.sync_cursor,
         last_synced_at = excluded.last_synced_at`
    ).run(args.accountId, args.nextSyncToken)
  })
  tx()
}

export function replaceContactsForAccount(
  accountId: string,
  provider: Provider,
  rows: PeopleContactInsertRow[],
  syncCursor: string | null
): void {
  const db = getDb()
  const favoriteRemoteIds = collectFavoriteRemoteIds(accountId, provider)

  const insertSql = `
    INSERT INTO people_contacts (
      account_id, provider, remote_id, change_key,
      display_name, given_name, surname, company, job_title,
      department, office_location, birthday_iso, web_page,
      primary_email,
      emails_json, phones_json, addresses_json, categories_json, notes,
      photo_local_path, raw_json, updated_remote, updated_local, is_favorite
    ) VALUES (
      @account_id, @provider, @remote_id, @change_key,
      @display_name, @given_name, @surname, @company, @job_title,
      @department, @office_location, @birthday_iso, @web_page,
      @primary_email,
      @emails_json, @phones_json, @addresses_json, @categories_json, @notes,
      @photo_local_path, @raw_json, @updated_remote, datetime('now'),
      @is_favorite
    )
  `
  const insert = db.prepare(insertSql)

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM people_contacts WHERE account_id = ? AND provider = ?').run(accountId, provider)
    for (const r of rows) {
      insert.run({
        account_id: r.accountId,
        provider: r.provider,
        remote_id: r.remoteId,
        change_key: r.changeKey,
        display_name: r.displayName,
        given_name: r.givenName,
        surname: r.surname,
        company: r.company,
        job_title: r.jobTitle,
        department: r.department,
        office_location: r.officeLocation,
        birthday_iso: r.birthdayIso,
        web_page: r.webPage,
        primary_email: r.primaryEmail,
        emails_json: r.emailsJson,
        phones_json: r.phonesJson,
        addresses_json: r.addressesJson,
        categories_json: r.categoriesJson,
        notes: r.notes,
        photo_local_path: r.photoLocalPath,
        raw_json: r.rawJson,
        updated_remote: r.updatedRemote,
        is_favorite: favoriteRemoteIds.has(r.remoteId) ? 1 : 0
      })
    }
    db.prepare(
      `INSERT INTO people_sync_state (account_id, provider, sync_cursor, last_synced_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(account_id) DO UPDATE SET
         provider = excluded.provider,
         sync_cursor = excluded.sync_cursor,
         last_synced_at = excluded.last_synced_at`
    ).run(accountId, provider, syncCursor)
  })
  tx()
}

function orderByClauseForPeopleList(sortBy: PeopleListSort | undefined): string {
  /** Einheitlicher A–Z-Sortierschlüssel bei „Anzeigename“ (wie UI-Fallback). */
  const keyDisplay = `CASE
      WHEN NULLIF(TRIM(IFNULL(display_name,'')), '') IS NOT NULL THEN TRIM(IFNULL(display_name,''))
      WHEN NULLIF(TRIM(IFNULL(given_name,'') || ' ' || IFNULL(surname,'')), '') IS NOT NULL
        THEN TRIM(IFNULL(given_name,'') || ' ' || IFNULL(surname,''))
      ELSE TRIM(IFNULL(primary_email,''))
    END`

  switch (sortBy) {
    case 'givenName':
      return `CASE WHEN IFNULL(trim(given_name),'') = '' THEN 1 ELSE 0 END,
        trim(given_name) COLLATE NOCASE ASC,
        trim(surname) COLLATE NOCASE ASC,
        trim(display_name) COLLATE NOCASE ASC,
        trim(primary_email) COLLATE NOCASE ASC,
        id ASC`
    case 'surname':
      return `CASE WHEN IFNULL(trim(surname),'') = '' THEN 1 ELSE 0 END,
        trim(surname) COLLATE NOCASE ASC,
        trim(given_name) COLLATE NOCASE ASC,
        trim(display_name) COLLATE NOCASE ASC,
        trim(primary_email) COLLATE NOCASE ASC,
        id ASC`
    case 'displayName':
    default:
      return `CASE WHEN IFNULL(trim((${keyDisplay})), '') = '' THEN 1 ELSE 0 END,
        trim((${keyDisplay})) COLLATE NOCASE ASC,
        trim(ifnull(given_name,'')) COLLATE NOCASE ASC,
        trim(ifnull(surname,'')) COLLATE NOCASE ASC,
        trim(ifnull(display_name,'')) COLLATE NOCASE ASC,
        trim(ifnull(primary_email,'')) COLLATE NOCASE ASC,
        id ASC`
  }
}

export function listPeopleContacts(input: PeopleListInput): PeopleContactView[] {
  const db = getDb()
  const clauses: string[] = ['1=1']
  const params: Record<string, string | number> = {}

  const q = (input.query ?? '').trim()
  if (q.length > 0) {
    clauses.push(`(
      IFNULL(display_name,'') LIKE @q OR
      IFNULL(primary_email,'') LIKE @q OR
      IFNULL(given_name,'') LIKE @q OR
      IFNULL(surname,'') LIKE @q OR
      IFNULL(company,'') LIKE @q OR
      IFNULL(emails_json,'') LIKE @q
    )`)
    params.q = `%${q.replace(/%/g, '\\%')}%`
  }

  const acc = input.accountId?.trim()
  if (acc) {
    clauses.push('account_id = @account_id')
    params.account_id = acc
  }

  switch (input.filter) {
    case 'favorites':
      clauses.push('is_favorite = 1')
      break
    case 'microsoft':
      clauses.push("provider = 'microsoft'")
      break
    case 'google':
      clauses.push("provider = 'google'")
      break
    case 'all':
    default:
      break
  }

  const orderBy = orderByClauseForPeopleList(input.sortBy)

  const sql = `
    SELECT * FROM people_contacts
    WHERE ${clauses.join(' AND ')}
    ORDER BY
      ${orderBy}
    LIMIT @lim
  `
  params.lim = input.limit ?? 5000

  const stmt = db.prepare(sql)
  const rows = stmt.all(params) as DbRow[]
  return rows.map(rowToView)
}

export function getPeopleNavCounts(): PeopleNavCounts {
  const db = getDb()
  const all = (db.prepare('SELECT COUNT(*) as c FROM people_contacts').get() as { c: number }).c
  const favorites = (
    db.prepare('SELECT COUNT(*) as c FROM people_contacts WHERE is_favorite = 1').get() as { c: number }
  ).c
  const microsoftTotal = (
    db
      .prepare(`SELECT COUNT(*) as c FROM people_contacts WHERE provider = 'microsoft'`)
      .get() as { c: number }
  ).c
  const googleTotal = (
    db.prepare(`SELECT COUNT(*) as c FROM people_contacts WHERE provider = 'google'`).get() as { c: number }
  ).c

  const lastRow = db
    .prepare(`SELECT MAX(last_synced_at) as m FROM people_sync_state`)
    .get() as { m: string | null }
  const lastSyncedAt = lastRow.m ?? null

  const byAccountRows = db
    .prepare(
      `SELECT account_id as accountId, provider, COUNT(*) as total
       FROM people_contacts
       GROUP BY account_id, provider`
    )
    .all() as Array<{ accountId: string; provider: string; total: number }>

  const byAccount = byAccountRows.map((r) => ({
    accountId: r.accountId,
    provider: r.provider as Provider,
    total: r.total
  }))

  const syncByAccount = new Map(
    (
      db.prepare(`SELECT account_id as accountId, last_synced_at as lastSyncedAt FROM people_sync_state`).all() as Array<{
        accountId: string
        lastSyncedAt: string | null
      }>
    ).map((r) => [r.accountId, r.lastSyncedAt] as const)
  )

  return {
    all,
    favorites,
    microsoftTotal,
    googleTotal,
    lastSyncedAt,
    byAccount: byAccount.map((row) => ({
      ...row,
      lastSyncedAt: syncByAccount.get(row.accountId) ?? null
    }))
  }
}

export function setPeopleFavorite(args: {
  accountId: string
  provider: Provider
  remoteId: string
  isFavorite: boolean
}): void {
  const db = getDb()
  const res = db
    .prepare(
      `UPDATE people_contacts SET is_favorite = ?, updated_local = datetime('now')
       WHERE account_id = ? AND provider = ? AND remote_id = ?`
    )
    .run(args.isFavorite ? 1 : 0, args.accountId, args.provider, args.remoteId)
  if (res.changes === 0) {
    throw new Error('Kontakt nicht gefunden (Synchronisation erforderlich?).')
  }
}

export function getPeopleContactById(id: number): PeopleContactView | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM people_contacts WHERE id = ?').get(id) as DbRow | undefined
  return row ? rowToView(row) : null
}

export interface PeopleContactLocalPatch {
  changeKey?: string | null
  displayName?: string | null
  givenName?: string | null
  surname?: string | null
  company?: string | null
  jobTitle?: string | null
  department?: string | null
  officeLocation?: string | null
  birthdayIso?: string | null
  webPage?: string | null
  primaryEmail?: string | null
  emailsJson?: string | null
  phonesJson?: string | null
  addressesJson?: string | null
  categoriesJson?: string | null
  notes?: string | null
  photoLocalPath?: string | null
  rawJson?: string | null
  updatedRemote?: string | null
}

export function updatePeopleContactLocal(id: number, patch: PeopleContactLocalPatch): void {
  const db = getDb()
  const cur = db.prepare('SELECT id FROM people_contacts WHERE id = ?').get(id) as { id: number } | undefined
  if (!cur) {
    throw new Error('Kontakt nicht gefunden.')
  }
  const sets: string[] = ['updated_local = datetime(\'now\')']
  const params: Record<string, string | number | null> = { id }

  const add = (key: keyof PeopleContactLocalPatch, dbCol: string): void => {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) return
    sets.push(`${dbCol} = @${String(key)}`)
    params[String(key)] = patch[key] ?? null
  }
  add('changeKey', 'change_key')
  add('displayName', 'display_name')
  add('givenName', 'given_name')
  add('surname', 'surname')
  add('company', 'company')
  add('jobTitle', 'job_title')
  add('department', 'department')
  add('officeLocation', 'office_location')
  add('birthdayIso', 'birthday_iso')
  add('webPage', 'web_page')
  add('primaryEmail', 'primary_email')
  add('emailsJson', 'emails_json')
  add('phonesJson', 'phones_json')
  add('addressesJson', 'addresses_json')
  add('categoriesJson', 'categories_json')
  add('notes', 'notes')
  add('photoLocalPath', 'photo_local_path')
  add('rawJson', 'raw_json')
  add('updatedRemote', 'updated_remote')

  const sql = `UPDATE people_contacts SET ${sets.join(', ')} WHERE id = @id`
  db.prepare(sql).run(params)
}

export function insertPeopleContactRow(row: PeopleContactInsertRow): number {
  const db = getDb()
  const result = db
    .prepare(
      `INSERT INTO people_contacts (
      account_id, provider, remote_id, change_key,
      display_name, given_name, surname, company, job_title,
      department, office_location, birthday_iso, web_page,
      primary_email,
      emails_json, phones_json, addresses_json, categories_json, notes,
      photo_local_path, raw_json, updated_remote, updated_local, is_favorite
    ) VALUES (
      @account_id, @provider, @remote_id, @change_key,
      @display_name, @given_name, @surname, @company, @job_title,
      @department, @office_location, @birthday_iso, @web_page,
      @primary_email,
      @emails_json, @phones_json, @addresses_json, @categories_json, @notes,
      @photo_local_path, @raw_json, @updated_remote, datetime('now'),
      0
    )`
    )
    .run({
      account_id: row.accountId,
      provider: row.provider,
      remote_id: row.remoteId,
      change_key: row.changeKey,
      display_name: row.displayName,
      given_name: row.givenName,
      surname: row.surname,
      company: row.company,
      job_title: row.jobTitle,
      department: row.department,
      office_location: row.officeLocation,
      birthday_iso: row.birthdayIso,
      web_page: row.webPage,
      primary_email: row.primaryEmail,
      emails_json: row.emailsJson,
      phones_json: row.phonesJson,
      addresses_json: row.addressesJson,
      categories_json: row.categoriesJson,
      notes: row.notes,
      photo_local_path: row.photoLocalPath,
      raw_json: row.rawJson,
      updated_remote: row.updatedRemote
    })
  return Number(result.lastInsertRowid)
}

export function deletePeopleContactById(id: number): void {
  const db = getDb()
  const res = db.prepare('DELETE FROM people_contacts WHERE id = ?').run(id)
  if (res.changes === 0) {
    throw new Error('Kontakt nicht gefunden.')
  }
}

/** Lokale Kontakte fuer Compose-Autocomplete (Anzeigename / E-Mail). */
export function searchPeopleContactsForCompose(args: {
  accountId: string
  needle: string
  limit: number
}): Array<{ email: string; displayName: string | null }> {
  const raw = args.needle.trim().replace(/%/g, '').replace(/_/g, '')
  if (raw.length < 1) return []
  const needle = `%${raw}%`
  const lim = Math.min(Math.max(args.limit, 1), 20)
  const db = getDb()
  return db
    .prepare(
      `SELECT primary_email as email, display_name as displayName
       FROM people_contacts
       WHERE account_id = ?
         AND primary_email IS NOT NULL
         AND primary_email != ''
         AND (
           LOWER(display_name) LIKE LOWER(?)
           OR LOWER(primary_email) LIKE LOWER(?)
           OR LOWER(IFNULL(emails_json,'')) LIKE LOWER(?)
         )
       ORDER BY display_name ASC
       LIMIT ?`
    )
    .all(args.accountId, needle, needle, needle, lim) as Array<{
    email: string
    displayName: string | null
  }>
}

/** Favoriten und erste alphabetische Kontakte mit E-Mail (Compose-Feld leer / Fokus). */
export function listBootstrapPeopleContactsForCompose(args: {
  accountId: string
  limit: number
}): Array<{ email: string; displayName: string | null }> {
  const lim = Math.min(Math.max(args.limit, 1), 24)
  const db = getDb()
  return db
    .prepare(
      `SELECT primary_email as email, display_name as displayName
       FROM people_contacts
       WHERE account_id = ?
         AND primary_email IS NOT NULL
         AND primary_email != ''
       ORDER BY is_favorite DESC, display_name ASC
       LIMIT ?`
    )
    .all(args.accountId, lim) as Array<{ email: string; displayName: string | null }>
}
