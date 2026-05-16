import { DateTime } from 'luxon'
import type {
  CalendarGraphCalendarRow,
  CalendarM365GroupCalendarsPage,
  CalendarSaveEventRecurrence
} from '@shared/types'
import { buildMicrosoftGraphRecurrencePayload } from '../calendar-recurrence'
import {
  m365GroupCalendarRef,
  parseM365GroupIdFromCalendarRef
} from '@shared/microsoft-m365-group-calendar'
import { createGraphClient } from './client'
import { loadConfig } from '../config'
import { graphWindowsZoneToIana, ianaToWindowsTimeZone } from '@shared/microsoft-timezones'
import { graphCalendarColorToDisplayHex, isGraphCalendarColorPreset } from '@shared/graph-calendar-colors'

async function getClientFor(accountId: string): Promise<ReturnType<typeof createGraphClient>> {
  const config = await loadConfig()
  if (!config.microsoftClientId) {
    throw new Error('Keine Azure Client-ID konfiguriert.')
  }
  const homeAccountId = accountId.replace(/^ms:/, '')
  return createGraphClient(config.microsoftClientId, homeAccountId)
}

interface GraphDateTimeTimeZone {
  dateTime: string
  timeZone: string
}

interface GraphEvent {
  id: string
  subject?: string | null
  start?: GraphDateTimeTimeZone | null
  end?: GraphDateTimeTimeZone | null
  isAllDay?: boolean | null
  location?: { displayName?: string | null } | null
  webLink?: string | null
  onlineMeeting?: { joinUrl?: string | null } | null
  isOnlineMeeting?: boolean | null
  onlineMeetingProvider?: string | null
  organizer?: { emailAddress?: { name?: string | null; address?: string | null } } | null
  categories?: string[] | null
  attendees?: GraphAttendee[] | null
  body?: { contentType?: string | null; content?: string | null } | null
  /** Nur mit `$expand=calendar(...)` in calendarView. */
  calendar?: { id?: string | null; color?: string | null; hexColor?: string | null } | null
}

interface GraphAttendee {
  type?: string | null
  emailAddress?: { name?: string | null; address?: string | null } | null
}

interface GraphEventCollection {
  value: GraphEvent[]
  '@odata.nextLink'?: string
}

export interface GraphCalendarEventRow {
  id: string
  subject: string | null
  startIso: string
  endIso: string
  isAllDay: boolean
  location: string | null
  webLink: string | null
  joinUrl: string | null
  organizer: string | null
  categories: string[]
  /** Aus `calendar.hexColor` / `calendar.color` (MS365), sonst null. */
  displayColorHex: string | null
  /** Graph-Kalender-ID, falls per `$expand=calendar` geliefert. */
  graphCalendarId: string | null
  /** false: Kalender/Konto erlaubt keine Aenderungen am Termin. */
  calendarCanEdit?: boolean
}

function trimFractionalSeconds(isoLike: string): string {
  return isoLike.replace(/(\.\d{3})\d+/, '$1').trim()
}

/**
 * Graph liefert dateTime oft ohne Offset; die Bedeutung ist dann in `timeZone`
 * (Windows- oder IANA-Name). Wandelt in UTC-ISO fuer FullCalendar.
 * Ganztaegig: `YYYY-MM-DD` (Ende bei Graph exklusiv, wie bei FullCalendar).
 */
function graphDateTimeToIso(
  dateTime: string,
  graphTimeZone: string | null | undefined,
  isAllDay: boolean
): string | null {
  if (!dateTime) return null
  const trimmed = dateTime.trim()
  if (isAllDay) {
    const d = trimmed.slice(0, 10)
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null
  }
  const norm = trimFractionalSeconds(trimmed)
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(norm)) {
    const dt = DateTime.fromISO(norm, { setZone: true })
    return dt.isValid ? dt.toUTC().toISO() : null
  }
  const iana = graphWindowsZoneToIana(graphTimeZone)
  const dt = DateTime.fromISO(norm, { zone: iana })
  return dt.isValid ? dt.toUTC().toISO() : null
}

function rowFromGraph(e: GraphEvent): GraphCalendarEventRow | null {
  const start = e.start?.dateTime
  const end = e.end?.dateTime
  if (!start || !end) return null
  const allDay = !!e.isAllDay
  const startIso = graphDateTimeToIso(start, e.start?.timeZone, allDay)
  const endIso = graphDateTimeToIso(end, e.end?.timeZone, allDay)
  if (!startIso || !endIso) return null
  const categories = Array.isArray(e.categories)
    ? e.categories.filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
    : []
  const displayColorHex = graphCalendarColorToDisplayHex(
    e.calendar?.hexColor ?? undefined,
    e.calendar?.color ?? undefined
  )
  const graphCalendarId =
    typeof e.calendar?.id === 'string' && e.calendar.id.trim().length > 0 ? e.calendar.id.trim() : null
  return {
    id: e.id,
    subject: e.subject ?? null,
    startIso,
    endIso,
    isAllDay: allDay,
    location: e.location?.displayName ?? null,
    webLink: e.webLink ?? null,
    joinUrl: e.onlineMeeting?.joinUrl ?? null,
    organizer: e.organizer?.emailAddress?.address ?? e.organizer?.emailAddress?.name ?? null,
    categories,
    displayColorHex,
    graphCalendarId
  }
}

const EVENT_SELECT_FIELDS =
  'id,subject,start,end,isAllDay,location,webLink,onlineMeeting,organizer,categories'

async function paginateCalendarViewWithOptionalCalendarExpand(
  accountId: string,
  pathWithDateTimeQuery: string
): Promise<GraphCalendarEventRow[]> {
  const client = await getClientFor(accountId)

  const paginate = async (expandCalendar: boolean): Promise<GraphCalendarEventRow[]> => {
    const expandPart = expandCalendar ? '&$expand=calendar($select=id,color,hexColor)' : ''
    const out: GraphCalendarEventRow[] = []
    let url: string | null =
      `${pathWithDateTimeQuery}&$select=${EVENT_SELECT_FIELDS}${expandPart}&$orderby=start/dateTime&$top=200`
    while (url) {
      const page = (await client.api(url).get()) as GraphEventCollection
      for (const ev of page.value) {
        const row = rowFromGraph(ev)
        if (row) out.push(row)
      }
      const next = page['@odata.nextLink']
      url = next ? next.replace(/^https?:\/\/[^/]+\/v[0-9.]+/, '') : null
    }
    return out
  }

  try {
    return await paginate(true)
  } catch (e) {
    console.warn('[calendar-graph] calendarView with $expand=calendar failed, retrying without expand', e)
    return paginate(false)
  }
}

export async function graphGetCalendar(
  accountId: string,
  calendarId: string
): Promise<{ id: string; color?: string | null; hexColor?: string | null }> {
  if (parseM365GroupIdFromCalendarRef(calendarId)) {
    throw new Error('Gruppenkalender: Metadaten nur ueber Gruppen-Endpunkt.')
  }
  const client = await getClientFor(accountId)
  const enc = encodeURIComponent(calendarId)
  return (await client.api(`/me/calendars/${enc}`).select('id,color,hexColor').get()) as {
    id: string
    color?: string | null
    hexColor?: string | null
  }
}

export async function graphPatchCalendarColor(
  accountId: string,
  graphCalendarId: string,
  color: string
): Promise<void> {
  if (parseM365GroupIdFromCalendarRef(graphCalendarId)) {
    throw new Error('Gruppenkalender: Farbe kann in MailClient nicht geaendert werden.')
  }
  if (!isGraphCalendarColorPreset(color)) {
    throw new Error('Ungueltige Kalenderfarbe (nur Outlook-Presets).')
  }
  const client = await getClientFor(accountId)
  const enc = encodeURIComponent(graphCalendarId)
  await client.api(`/me/calendars/${enc}`).patch({ color })
}

export async function graphListCalendarView(
  accountId: string,
  rangeStart: Date,
  rangeEnd: Date
): Promise<GraphCalendarEventRow[]> {
  const start = rangeStart.toISOString()
  const end = rangeEnd.toISOString()
  const path = `/me/calendarView?startDateTime=${encodeURIComponent(start)}&endDateTime=${encodeURIComponent(end)}`
  return paginateCalendarViewWithOptionalCalendarExpand(accountId, path)
}

/** Termine in einem bestimmten Kalender (`GET /me/calendars/{id}/calendarView`). */
export async function graphListCalendarViewInCalendar(
  accountId: string,
  graphCalendarId: string,
  rangeStart: Date,
  rangeEnd: Date
): Promise<GraphCalendarEventRow[]> {
  const groupId = parseM365GroupIdFromCalendarRef(graphCalendarId)
  if (groupId) {
    const start = rangeStart.toISOString()
    const end = rangeEnd.toISOString()
    const encG = encodeURIComponent(groupId)
    const path = `/groups/${encG}/calendar/calendarView?startDateTime=${encodeURIComponent(start)}&endDateTime=${encodeURIComponent(end)}`
    const synthetic = m365GroupCalendarRef(groupId)
    let rows = await paginateCalendarViewWithOptionalCalendarExpand(accountId, path)
    try {
      const client = await getClientFor(accountId)
      const cal = (await client
        .api(`/groups/${encG}/calendar`)
        .select('id,color,hexColor')
        .get()) as { id?: string; color?: string | null; hexColor?: string | null }
      const overlayHex = graphCalendarColorToDisplayHex(cal.hexColor ?? undefined, cal.color ?? undefined)
      rows = rows.map((r) => ({
        ...r,
        graphCalendarId: synthetic,
        displayColorHex: r.displayColorHex ?? overlayHex ?? null
      }))
    } catch {
      rows = rows.map((r) => ({
        ...r,
        graphCalendarId: synthetic
      }))
    }
    return rows
  }

  const start = rangeStart.toISOString()
  const end = rangeEnd.toISOString()
  const encId = encodeURIComponent(graphCalendarId)
  const path = `/me/calendars/${encId}/calendarView?startDateTime=${encodeURIComponent(start)}&endDateTime=${encodeURIComponent(end)}`

  let rows = await paginateCalendarViewWithOptionalCalendarExpand(accountId, path)
  try {
    const cal = await graphGetCalendar(accountId, graphCalendarId)
    const overlayHex = graphCalendarColorToDisplayHex(cal.hexColor, cal.color)
    rows = rows.map((r) => ({
      ...r,
      graphCalendarId: r.graphCalendarId ?? graphCalendarId,
      displayColorHex: r.displayColorHex ?? overlayHex ?? null
    }))
  } catch {
    rows = rows.map((r) => ({
      ...r,
      graphCalendarId: r.graphCalendarId ?? graphCalendarId
    }))
  }
  return rows
}

interface GraphCalendarListItem {
  id: string
  name?: string | null
  isDefaultCalendar?: boolean | null
  canEdit?: boolean | null
  color?: string | null
  hexColor?: string | null
}

interface GraphCalendarListResponse {
  value: GraphCalendarListItem[]
}

interface GraphDirectoryObject {
  id?: string
  displayName?: string | null
  ['@odata.type']?: string
  groupTypes?: string[]
}

interface GraphDirectoryCollection {
  value: GraphDirectoryObject[]
  '@odata.nextLink'?: string
}

const MAX_M365_GROUP_CALENDARS_LIST = 280

/** Kurzzeit-Cache: `transitiveMemberOf` bei jeder Seite neu zu holen waere langsam. */
const m365UnifiedGroupListCache = new Map<string, { at: number; groups: GraphDirectoryObject[] }>()
const M365_UNIFIED_GROUP_LIST_CACHE_MS = 5 * 60 * 1000

function isUnifiedMicrosoft365Group(o: GraphDirectoryObject): boolean {
  if (o['@odata.type'] !== '#microsoft.graph.group') return false
  return Array.isArray(o.groupTypes) && o.groupTypes.includes('Unified')
}

/**
 * Alle Unified Groups des Nutzers (sortiert), Kalender-Metadaten noch nicht geladen.
 */
async function loadUnifiedGroupsSorted(accountId: string): Promise<GraphDirectoryObject[]> {
  const client = await getClientFor(accountId)
  const members: GraphDirectoryObject[] = []
  let url: string | null =
    '/me/transitiveMemberOf?$select=id,displayName,groupTypes&$top=100'
  try {
    while (url) {
      const page = (await client.api(url).get()) as GraphDirectoryCollection
      for (const v of page.value ?? []) {
        if (isUnifiedMicrosoft365Group(v) && v.id) members.push(v)
      }
      const next = page['@odata.nextLink']
      url = next ? next.replace(/^https?:\/\/[^/]+\/v[0-9.]+/, '') : null
    }
  } catch (e) {
    console.warn('[calendar-graph] transitiveMemberOf (Gruppenkalender) fehlgeschlagen:', e)
    return []
  }

  const unique = new Map<string, GraphDirectoryObject>()
  for (const m of members) {
    if (m.id) unique.set(m.id, m)
  }
  let groups = [...unique.values()].sort((a, b) =>
    (a.displayName ?? '').localeCompare(b.displayName ?? '', 'de')
  )
  if (groups.length > MAX_M365_GROUP_CALENDARS_LIST) {
    console.warn(
      `[calendar-graph] ${groups.length} Unified Groups — limitiere auf ${MAX_M365_GROUP_CALENDARS_LIST} Eintraege.`
    )
    groups = groups.slice(0, MAX_M365_GROUP_CALENDARS_LIST)
  }
  m365UnifiedGroupListCache.set(accountId, { at: Date.now(), groups })
  return groups
}

async function loadUnifiedGroupsSortedCached(accountId: string): Promise<GraphDirectoryObject[]> {
  const hit = m365UnifiedGroupListCache.get(accountId)
  const now = Date.now()
  if (hit && now - hit.at < M365_UNIFIED_GROUP_LIST_CACHE_MS) {
    return hit.groups
  }
  return loadUnifiedGroupsSorted(accountId)
}

async function fetchM365GroupCalendarRowsForSlice(
  accountId: string,
  slice: GraphDirectoryObject[]
): Promise<CalendarGraphCalendarRow[]> {
  if (slice.length === 0) return []
  const client = await getClientFor(accountId)
  const chunk = 8
  const rows: CalendarGraphCalendarRow[] = []
  for (let i = 0; i < slice.length; i += chunk) {
    const partSlice = slice.slice(i, i + chunk)
    const part = await Promise.all(
      partSlice.map(async (g) => {
        const gid = g.id as string
        try {
          const cal = (await client
            .api(`/groups/${encodeURIComponent(gid)}/calendar`)
            .select('id,name,color,hexColor')
            .get()) as {
            id?: string
            name?: string | null
            color?: string | null
            hexColor?: string | null
          }
          const name = displayNameForM365GroupCalendar(g.displayName, cal.name)
          return {
            id: m365GroupCalendarRef(gid),
            name,
            isDefaultCalendar: false,
            canEdit: true,
            color: cal.color ?? undefined,
            hexColor: cal.hexColor ?? undefined,
            calendarKind: 'm365Group' as const
          } satisfies CalendarGraphCalendarRow
        } catch {
          return null
        }
      })
    )
    for (const r of part) {
      if (r) rows.push(r)
    }
  }
  return rows
}

/**
 * Microsoft-365-Gruppenkalender (Unified Groups), nur eine Seite — weniger Graph-Aufrufe.
 */
export async function graphListM365GroupCalendarPage(
  accountId: string,
  offset: number,
  limit: number
): Promise<CalendarM365GroupCalendarsPage> {
  const groups = await loadUnifiedGroupsSortedCached(accountId)
  const totalGroups = groups.length
  const o = Math.max(0, Math.floor(offset))
  const lim = Math.max(1, Math.floor(limit))
  const slice = groups.slice(o, o + lim)
  const calendars = await fetchM365GroupCalendarRowsForSlice(accountId, slice)
  return {
    calendars,
    totalGroups,
    offset: o,
    limit: lim,
    hasMore: o + lim < totalGroups
  }
}

/** Graph liefert fuer Gruppenkalender oft `name` = «Calendar»/«Kalender» — dann Gruppennamen zeigen. */
function displayNameForM365GroupCalendar(
  groupDisplayName: string | null | undefined,
  calendarName: string | null | undefined
): string {
  const g = groupDisplayName?.trim() ?? ''
  const cRaw = calendarName?.trim() ?? ''
  const cLower = cRaw.toLowerCase()
  const genericCal =
    cLower === 'calendar' ||
    cLower === 'kalender' ||
    cLower === 'calendrier' ||
    cLower === 'calendario' ||
    cLower === 'agenda'
  if (g.length > 0) {
    if (cRaw.length > 0 && !genericCal && cRaw !== g) {
      return `${g} — ${cRaw}`
    }
    return g
  }
  if (cRaw.length > 0) return cRaw
  return 'Gruppenkalender'
}

export async function graphListCalendars(accountId: string): Promise<CalendarGraphCalendarRow[]> {
  const client = await getClientFor(accountId)
  const res = (await client
    .api('/me/calendars')
    .select('id,name,isDefaultCalendar,canEdit,color,hexColor')
    .get()) as GraphCalendarListResponse
  const rows: CalendarGraphCalendarRow[] = []
  for (const c of res.value ?? []) {
    if (!c.id) continue
    /** Auch rein freigegebene Kalender (`canEdit: false`) — Termine kommen ueber `/me/calendars/{id}/calendarView`. */
    rows.push({
      id: c.id,
      name: (c.name?.trim() || 'Kalender') as string,
      isDefaultCalendar: !!c.isDefaultCalendar,
      canEdit: c.canEdit !== false,
      color: c.color ?? undefined,
      hexColor: c.hexColor ?? undefined
    })
  }
  rows.sort((a, b) => {
    if (a.isDefaultCalendar !== b.isDefaultCalendar) return a.isDefaultCalendar ? -1 : 1
    return a.name.localeCompare(b.name, 'de')
  })
  return rows
}

export interface CreateTeamsCalendarEventInput {
  subject: string
  startIso: string
  endIso: string
  bodyHtml?: string
  /** Windows-Zeitzonen-ID fuer Graph; optional, sonst aus App-Konfiguration. */
  timeZone?: string
  /** Graph-Kalender-ID; optional = Standardkalender (`POST /me/events`). */
  graphCalendarId?: string | null
  /** Einladungen (Graph `attendees`, max. ca. 40). */
  attendeeEmails?: string[] | null
}

export interface CreateTeamsCalendarEventResult {
  id: string
  webLink: string | null
  joinUrl: string | null
}

type GraphEventWriteFields = {
  subject: string
  startIso: string
  endIso: string
  isAllDay: boolean
  location?: string | null
  bodyHtml?: string | null
  /** Wenn gesetzt: `POST /me/calendars/{id}/events`, sonst `POST /me/events`. */
  graphCalendarId?: string | null
  /** Outlook-Kategorien (max. 25); `undefined` = Feld beim Schreiben weglassen. */
  categories?: string[] | null
  /** Microsoft: Einladungen; beim PATCH nur mitsenden, wenn definiert (ersetzt gesamte Sammlung). */
  attendeeEmails?: string[] | null
  /** Microsoft: Teams-Besprechung (nur sinnvoll bei nicht ganztaegig). */
  teamsMeeting?: boolean | null
  /** Serientermin (nur POST). */
  recurrence?: CalendarSaveEventRecurrence | null
}

const MAX_GRAPH_EVENT_ATTENDEES = 40

const SIMPLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i

/**
 * Graph `attendees` mit Typ `required`, dedupliziert (Lowercase), max. {@link MAX_GRAPH_EVENT_ATTENDEES}.
 */
export function buildGraphAttendees(emails: string[] | null | undefined): {
  emailAddress: { address: string; name: string }
  type: 'required'
}[] {
  if (!emails?.length) return []
  const seen = new Set<string>()
  const out: { emailAddress: { address: string; name: string }; type: 'required' }[] = []
  for (const raw of emails) {
    const a = raw.trim().toLowerCase()
    if (!a || !SIMPLE_EMAIL.test(a) || seen.has(a)) continue
    seen.add(a)
    out.push({
      emailAddress: { address: a, name: a },
      type: 'required'
    })
    if (out.length >= MAX_GRAPH_EVENT_ATTENDEES) break
  }
  return out
}

export interface GraphCalendarEventDetail {
  subject: string | null
  attendeeEmails: string[]
  joinUrl: string | null
  isOnlineMeeting: boolean
  bodyHtml: string | null
}

function escapeHtmlPlain(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Graph-Body (HTML oder Text) fuer Editor / Anzeige. */
export function normalizeGraphEventBodyHtml(
  body: { contentType?: string | null; content?: string | null } | null | undefined
): string | null {
  const raw = body?.content?.trim()
  if (!raw) return null
  const ct = (body?.contentType || '').toLowerCase()
  if (ct === 'html' || raw.includes('<')) {
    return raw
  }
  return `<p>${escapeHtmlPlain(raw).replace(/\n/g, '<br>')}</p>`
}

async function graphEventDateFields(input: GraphEventWriteFields): Promise<{
  isAllDay: boolean
  start: GraphDateTimeTimeZone
  end: GraphDateTimeTimeZone
}> {
  if (input.isAllDay) {
    const sd = input.startIso.trim().slice(0, 10)
    const ed = input.endIso.trim().slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sd) || !/^\d{4}-\d{2}-\d{2}$/.test(ed)) {
      throw new Error('Ganztaegig: Start und Ende als JJJJ-MM-TT (Ende exklusiv) erwartet.')
    }
    return {
      isAllDay: true,
      start: { dateTime: `${sd}T00:00:00`, timeZone: 'UTC' },
      end: { dateTime: `${ed}T00:00:00`, timeZone: 'UTC' }
    }
  }
  const appCfg = await loadConfig()
  const iana =
    appCfg.calendarTimeZone?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone
  const graphWindowsTz = ianaToWindowsTimeZone(iana)
  const startUtc = DateTime.fromISO(input.startIso, { zone: 'utc' })
  const endUtc = DateTime.fromISO(input.endIso, { zone: 'utc' })
  if (!startUtc.isValid || !endUtc.isValid) {
    throw new Error('Ungueltige Start- oder Endzeit.')
  }
  const startLocal = startUtc.setZone(iana).toFormat("yyyy-MM-dd'T'HH:mm:ss")
  const endLocal = endUtc.setZone(iana).toFormat("yyyy-MM-dd'T'HH:mm:ss")
  return {
    isAllDay: false,
    start: { dateTime: startLocal, timeZone: graphWindowsTz },
    end: { dateTime: endLocal, timeZone: graphWindowsTz }
  }
}

function normalizeGraphEventCategories(c: string[] | null | undefined): string[] | undefined {
  if (c === undefined) return undefined
  if (c === null) return []
  const u = Array.from(new Set(c.map((x) => x.trim()).filter((x) => x.length > 0)))
  return u.slice(0, 25)
}

function eventWritePayload(input: GraphEventWriteFields): Promise<{
  isAllDay: boolean
  start: GraphDateTimeTimeZone
  end: GraphDateTimeTimeZone
  subject: string
  body: { contentType: 'HTML'; content: string }
  location?: { displayName: string }
  categories?: string[]
}> {
  return graphEventDateFields(input).then((dates) => {
    const cats = normalizeGraphEventCategories(input.categories)
    return {
      subject: input.subject.trim() || '(Ohne Titel)',
      body: {
        contentType: 'HTML' as const,
        content: input.bodyHtml?.trim() ? input.bodyHtml.trim() : '<p></p>'
      },
      ...dates,
      ...(input.location?.trim()
        ? { location: { displayName: input.location.trim() } }
        : {}),
      ...(cats !== undefined ? { categories: cats } : {})
    }
  })
}

function eventPostPath(graphCalendarId?: string | null): string {
  const calId = graphCalendarId?.trim() ?? ''
  const groupId = parseM365GroupIdFromCalendarRef(calId)
  if (groupId) {
    return `/groups/${encodeURIComponent(groupId)}/events`
  }
  return calId ? `/me/calendars/${encodeURIComponent(calId)}/events` : '/me/events'
}

/**
 * GET/PATCH/DELETE fuer Termine.
 * Mit `graphCalendarId`: kalenderbezogener Pfad (wichtig fuer Abos, freigegebene und Group-Kalender).
 */
function graphEventInstancePath(graphEventId: string, graphCalendarId?: string | null): string {
  const calId = graphCalendarId?.trim() ?? ''
  const gid = parseM365GroupIdFromCalendarRef(calId)
  if (gid) {
    return `/groups/${encodeURIComponent(gid)}/events/${encodeURIComponent(graphEventId)}`
  }
  if (calId) {
    return `/me/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(graphEventId)}`
  }
  return `/me/events/${encodeURIComponent(graphEventId)}`
}

export async function graphGetCalendarEvent(
  accountId: string,
  graphEventId: string,
  graphCalendarId?: string | null
): Promise<GraphCalendarEventDetail> {
  const client = await getClientFor(accountId)
  const path = graphEventInstancePath(graphEventId, graphCalendarId)
  const sel = encodeURIComponent(
    'id,subject,body,attendees,isOnlineMeeting,onlineMeeting,onlineMeetingProvider,start,end,isAllDay'
  )
  const ev = (await client.api(`${path}?$select=${sel}`).get()) as GraphEvent
  const emails: string[] = []
  const seen = new Set<string>()
  for (const at of ev.attendees ?? []) {
    const addr = at.emailAddress?.address?.trim().toLowerCase()
    if (!addr || !SIMPLE_EMAIL.test(addr) || seen.has(addr)) continue
    seen.add(addr)
    emails.push(addr)
  }
  return {
    subject: ev.subject ?? null,
    attendeeEmails: emails.slice(0, MAX_GRAPH_EVENT_ATTENDEES),
    joinUrl: ev.onlineMeeting?.joinUrl?.trim() || null,
    isOnlineMeeting: !!ev.isOnlineMeeting,
    bodyHtml: normalizeGraphEventBodyHtml(ev.body ?? null)
  }
}

/**
 * Kalendereintrag anlegen (optional Teams-Besprechung und Teilnehmer).
 */
export async function graphCreateSimpleCalendarEvent(
  accountId: string,
  input: GraphEventWriteFields
): Promise<CreateTeamsCalendarEventResult> {
  const client = await getClientFor(accountId)
  const core = await eventWritePayload(input)
  const payload: Record<string, unknown> = {
    subject: core.subject,
    body: core.body,
    start: core.start,
    end: core.end,
    isAllDay: core.isAllDay,
    ...(core.location ? { location: core.location } : {}),
    ...(core.categories !== undefined ? { categories: core.categories } : {})
  }
  const wantTeams = !!input.teamsMeeting && !core.isAllDay
  if (wantTeams) {
    payload.isOnlineMeeting = true
    payload.onlineMeetingProvider = 'teamsForBusiness'
  }
  const att = buildGraphAttendees(input.attendeeEmails)
  if (att.length > 0) {
    payload.attendees = att
  }
  if (input.recurrence) {
    const appCfg = await loadConfig()
    const iana =
      appCfg.calendarTimeZone?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone
    const graphWindowsTz = ianaToWindowsTimeZone(iana)
    const startLocal = input.isAllDay
      ? DateTime.fromISO(input.startIso.trim().slice(0, 10), { zone: iana })
      : DateTime.fromISO(input.startIso, { zone: 'utc' }).setZone(iana)
    if (!startLocal.isValid) {
      throw new Error('Serientermin: Startdatum fuer Wiederholung ungueltig.')
    }
    const recPayload = buildMicrosoftGraphRecurrencePayload(
      input.recurrence,
      startLocal,
      graphWindowsTz
    )
    Object.assign(payload, recPayload)
  }
  const created = (await client.api(eventPostPath(input.graphCalendarId)).post(payload)) as GraphEvent
  return {
    id: created.id,
    webLink: created.webLink ?? null,
    joinUrl: created.onlineMeeting?.joinUrl ?? null
  }
}

export async function graphUpdateCalendarEvent(
  accountId: string,
  graphEventId: string,
  input: GraphEventWriteFields
): Promise<void> {
  const client = await getClientFor(accountId)
  const core = await eventWritePayload(input)
  const payload: Record<string, unknown> = {
    subject: core.subject,
    body: core.body,
    start: core.start,
    end: core.end,
    isAllDay: core.isAllDay
  }
  if (core.location) {
    payload.location = core.location
  }
  if (core.categories !== undefined) {
    payload.categories = core.categories
  }
  if (input.attendeeEmails !== undefined) {
    payload.attendees = buildGraphAttendees(input.attendeeEmails ?? [])
  }
  if (typeof input.teamsMeeting === 'boolean' && !core.isAllDay) {
    if (input.teamsMeeting) {
      payload.isOnlineMeeting = true
      payload.onlineMeetingProvider = 'teamsForBusiness'
    } else {
      payload.isOnlineMeeting = false
      payload.onlineMeetingProvider = 'unknown'
    }
  } else if (typeof input.teamsMeeting === 'boolean' && core.isAllDay && !input.teamsMeeting) {
    payload.isOnlineMeeting = false
    payload.onlineMeetingProvider = 'unknown'
  }
  const path = graphEventInstancePath(graphEventId, input.graphCalendarId)
  await client.api(path).patch(payload)
}

/** Nur Start/Ende/Ganztaegig patchen (Drag & Drop / Resize), ohne Body zu ueberschreiben. */
export async function graphPatchCalendarEventTimes(
  accountId: string,
  graphEventId: string,
  times: { startIso: string; endIso: string; isAllDay: boolean },
  graphCalendarId?: string | null
): Promise<void> {
  const client = await getClientFor(accountId)
  const dates = await graphEventDateFields({
    subject: '—',
    startIso: times.startIso,
    endIso: times.endIso,
    isAllDay: times.isAllDay,
    bodyHtml: null
  })
  const path = graphEventInstancePath(graphEventId, graphCalendarId)
  await client.api(path).patch({
    start: dates.start,
    end: dates.end,
    isAllDay: dates.isAllDay
  })
}

export async function graphDeleteCalendarEvent(
  accountId: string,
  graphEventId: string,
  graphCalendarId?: string | null
): Promise<void> {
  const client = await getClientFor(accountId)
  const path = graphEventInstancePath(graphEventId, graphCalendarId)
  await client.api(path).delete()
}

/** Nur Outlook-Kategorien setzen (kein vollstaendiger Termin-Body noetig). */
export async function graphPatchEventCategories(
  accountId: string,
  graphEventId: string,
  categories: string[],
  graphCalendarId?: string | null
): Promise<void> {
  const client = await getClientFor(accountId)
  const capped = Array.from(
    new Set(categories.map((c) => c.trim()).filter((c) => c.length > 0))
  ).slice(0, 25)
  const path = graphEventInstancePath(graphEventId, graphCalendarId)
  await client.api(path).patch({ categories: capped })
}

/**
 * Legt einen Kalendereintrag mit Teams-Besprechung an (wie Outlook „Teams-Besprechung“).
 */
export async function graphCreateTeamsCalendarEvent(
  accountId: string,
  input: CreateTeamsCalendarEventInput
): Promise<CreateTeamsCalendarEventResult> {
  const client = await getClientFor(accountId)
  const appCfg = await loadConfig()
  const iana =
    appCfg.calendarTimeZone?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone
  const graphWindowsTz =
    input.timeZone?.trim() && !input.timeZone.includes('/')
      ? input.timeZone.trim()
      : ianaToWindowsTimeZone(iana)

  const startUtc = DateTime.fromISO(input.startIso, { zone: 'utc' })
  const endUtc = DateTime.fromISO(input.endIso, { zone: 'utc' })
  if (!startUtc.isValid || !endUtc.isValid) {
    throw new Error('Ungueltige Start- oder Endzeit (ISO erwartet).')
  }

  const startLocal = startUtc.setZone(iana).toFormat("yyyy-MM-dd'T'HH:mm:ss")
  const endLocal = endUtc.setZone(iana).toFormat("yyyy-MM-dd'T'HH:mm:ss")

  const payload: Record<string, unknown> = {
    subject: input.subject,
    body: {
      contentType: 'HTML',
      content: input.bodyHtml?.trim() ? input.bodyHtml : '<p></p>'
    },
    start: { dateTime: startLocal, timeZone: graphWindowsTz },
    end: { dateTime: endLocal, timeZone: graphWindowsTz },
    isOnlineMeeting: true,
    onlineMeetingProvider: 'teamsForBusiness'
  }
  const att = buildGraphAttendees(input.attendeeEmails)
  if (att.length > 0) {
    payload.attendees = att
  }

  const created = (await client.api(eventPostPath(input.graphCalendarId)).post(payload)) as GraphEvent
  return {
    id: created.id,
    webLink: created.webLink ?? null,
    joinUrl: created.onlineMeeting?.joinUrl ?? null
  }
}
