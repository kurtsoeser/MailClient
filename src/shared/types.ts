import type { MailRuleDefinition, MailRuleTrigger } from './mail-rules'

export type Provider = 'microsoft' | 'google'

/** Gespeicherte Signatur-Vorlage pro Mailkonto (lokal). */
export interface AccountSignatureTemplate {
  id: string
  name: string
  /** HTML im Compose-Subset (Renderer bereinigt vor dem Speichern). */
  html: string
  /** ISO-Zeitstempel der letzten Speicherung (optional). */
  updatedAt?: string
}

export interface ConnectedAccount {
  id: string
  provider: Provider
  email: string
  displayName: string
  tenantId?: string
  /** Kontokennung in der UI: Tailwind `bg-*`-Klasse oder Hex `#rrggbb`. */
  color: string
  initials: string
  addedAt: string
  /**
   * Dateiname unter userData/avatars (Microsoft Graph /me/photo oder Google-Profilbild-URL aus id_token).
   * Renderer laedt die Data-URL per IPC nach.
   */
  profilePhotoFile?: string | null
  /**
   * Kalender-API: maximal wie viele Tage ab heute (Mitternacht lokal) in die Zukunft Termine geladen werden.
   * `null` = keine Begrenzung (bis zum Ende des angefragten Ansichtszeitraums).
   * `undefined` = Standard 365 Tage.
   */
  calendarLoadAheadDays?: number | null
  /** Signatur-Vorlagen fuer dieses Konto (lokal gespeichert). */
  signatureTemplates?: AccountSignatureTemplate[]
  /**
   * ID einer Vorlage aus `signatureTemplates` fuer neue Entwuerfe.
   * `null`/`undefined` = keine automatische Signatur.
   */
  defaultSignatureTemplateId?: string | null
}

/** Kalender-Referenz fuer gefiltertes Laden (Microsoft Graph- oder Google-Kalender-ID). */
export type CalendarIncludeCalendarRef = {
  accountId: string
  graphCalendarId: string
}

/** IPC `auth:patch-account` — mindestens eines der optionalen Felder. */
export interface PatchAccountInput {
  accountId: string
  color?: string
  /**
   * `null` = keine zeitliche Begrenzung nach vorn.
   * `'default'` = Standard-Vorausschau (365 Tage), gespeicherten Wert entfernen.
   */
  calendarLoadAheadDays?: number | null | 'default'
  /** Ersetzt die komplette Vorlagenliste (max. 40 Eintraege). */
  signatureTemplates?: AccountSignatureTemplate[]
  /** Standard-Signatur fuer neue Mails; `null` = leer starten. */
  defaultSignatureTemplateId?: string | null
}

export interface AuthResult {
  account: ConnectedAccount
}

export interface AuthError {
  code: string
  message: string
}

export interface AppConfig {
  microsoftClientId: string | null
  googleClientId: string | null
  /**
   * OAuth-Clientschlüssel aus der Google Cloud Console (Desktop-Client).
   * Optional wenn PKCE ohne Geheimnis (Desktop-Client / verifizierte App); sonst fuer Refresh noetig.
   */
  googleClientSecret: string | null
  /**
   * Wie weit (Tage) zurueck synchronisiert wird. `null` = keine Begrenzung.
   * Bereits lokal vorhandene aeltere Mails bleiben erhalten.
   */
  syncWindowDays: number | null
  /**
   * Externe Bilder in HTML-Mails automatisch laden. Wenn `false` muss der
   * Benutzer pro Mail explizit auf "Bilder laden" klicken.
   */
  autoLoadImages: boolean
  /** Windows: App beim Anmelden starten. */
  launchOnLogin?: boolean
  /**
   * IANA-Zeitzone fuer Kalender-Anzeige und neue Termine (z. B. `Europe/Berlin`).
   * `null` = Systemzeitzone (Browser bzw. Node Intl).
   */
  calendarTimeZone: string | null
  /**
   * Wenn `true`: Hinweisdialog zu Triage-Ordnern (In Bearbeitung / Erledigt) nicht mehr beim Start zeigen.
   */
  workflowMailFoldersIntroDismissed?: boolean
  /**
   * Ersteinrichtungs-Assistent abgeschlossen oder uebersprungen.
   * Fehlt in aelteren config.json: gilt als erledigt (siehe configSchemaVersion).
   */
  firstRunSetupCompleted?: boolean
  /** Ab Version 2: steuert Migration des Ersteinrichtungs-Assistenten. */
  configSchemaVersion?: number
  /**
   * Wetterkachel (Open-Meteo): Koordinaten und Anzeigename nach Geocoding.
   * Alle `null`/`undefined`: Ort nicht gesetzt — Kachel zeigt Hinweis.
   */
  weatherLatitude?: number | null
  weatherLongitude?: number | null
  weatherLocationName?: string | null
  /** Aus MAILCLIENT_PRIVACY_URL (Build); nicht in config.json. */
  publisherPrivacyUrl?: string | null
  /** Aus MAILCLIENT_HELP_URL (Build); nicht in config.json. */
  publisherHelpUrl?: string | null
}

/** Payload fuer `config:set-weather-location` (Speichern oder `null` = loeschen). */
export interface AppConfigWeatherLocation {
  latitude: number
  longitude: number
  /** Kurzbezeichnung (z. B. Stadt, Region). */
  name: string
}

export interface OpenMeteoGeocodeHit {
  latitude: number
  longitude: number
  label: string
}

export interface OpenMeteoForecastCurrent {
  temperatureC: number
  apparentTemperatureC: number
  humidityPct: number
  windKmh: number
  weatherCode: number
}

export interface OpenMeteoForecastDay {
  dateIso: string
  weatherCode: number
  tempMaxC: number
  tempMinC: number
}

export interface OpenMeteoForecast {
  current: OpenMeteoForecastCurrent
  daily: OpenMeteoForecastDay[]
}

/** Aktuelle Version der JSON-Datei fuer Einstellungen-Export/-Import. */
export const SETTINGS_BACKUP_FORMAT_VERSION = 1 as const

/** Regel ohne DB-IDs — fuer Sicherungsdatei und Wiederherstellung. */
export interface SettingsBackupMailRuleSnapshot {
  name: string
  enabled: boolean
  trigger: MailRuleTrigger
  sortOrder: number
  definition: MailRuleDefinition
}

export interface SettingsBackupWorkflowBoardSnapshot {
  id: number
  columns: WorkflowColumn[]
}

export interface SettingsBackupDatabaseExtras {
  mailRules: SettingsBackupMailRuleSnapshot[]
  workflowBoards: SettingsBackupWorkflowBoardSnapshot[]
  vipSenders: { accountId: string; emailLower: string }[]
  workflowMailFolders: {
    accountId: string
    wipFolderRemoteId: string | null
    doneFolderRemoteId: string | null
  }[]
}

/**
 * Lokale Einstellungs-Sicherung (ohne Mails, ohne Konten-Token).
 * Enthaelt App-Config, Renderer-localStorage, Mail-Regeln, Workflow-Board-Spalten, VIP und Triage-Ordner-Zuordnungen.
 */
export interface SettingsBackupPayload {
  formatVersion: typeof SETTINGS_BACKUP_FORMAT_VERSION
  exportedAt: string
  appVersion: string
  config: AppConfig
  localStorage: Record<string, string>
  /** Fehlt bei aelteren Exporten: Datenbank-Teile werden dann nicht geaendert. */
  databaseExtras?: SettingsBackupDatabaseExtras
}

export type SettingsBackupExportResult =
  | { ok: true; path: string }
  | { ok: false; cancelled: true }

export type SettingsBackupPickResult =
  | { ok: true; backup: SettingsBackupPayload }
  | { ok: false; cancelled: true }
  | { ok: false; error: string }

/** Einstellungen-UI: gespeicherte Remote-IDs und aufloesbare lokale Ordner-IDs. */
export interface WorkflowMailFolderUiState {
  prefs: {
    wipFolderRemoteId: string | null
    doneFolderRemoteId: string | null
  } | null
  wipFolderId: number | null
  doneFolderId: number | null
}

/** Rueckgabe von `mail:ensure-workflow-mail-folders` (Microsoft). */
export interface EnsureWorkflowMailFoldersResult {
  wipFolderId: number
  doneFolderId: number
  wipFolderRemoteId: string
  doneFolderRemoteId: string
}

/** Kalender-Eintrag fuer die UI (Graph + Google). */
export interface CalendarEventView {
  id: string
  source: 'microsoft' | 'google'
  accountId: string
  accountEmail: string
  accountColorClass: string
  /** Anzeigefarbe aus MS365 (`calendar.hexColor` / Kalenderfarbe), sonst null → Kontenfarbe. */
  displayColorHex?: string | null
  /** Kalender-ID (Graph oder Google), fuer Loeschen/Patchen. */
  graphCalendarId?: string | null
  /** Termin-ID (Graph oder Google). */
  graphEventId?: string
  title: string
  startIso: string
  endIso: string
  isAllDay: boolean
  location: string | null
  webLink: string | null
  joinUrl: string | null
  organizer: string | null
  /** Outlook/Graph `categories` (Masterkategorien-Namen). */
  categories?: string[]
  /** false: Kalender erlaubt keine Aenderungen (z. B. Google `reader`). */
  calendarCanEdit?: boolean
}

/** Kalender-Ordner unter einem Konto (Graph `GET /me/calendars` oder Google `calendarList`). */
export interface CalendarGraphCalendarRow {
  id: string
  name: string
  isDefaultCalendar: boolean
  /** Graph `calendarColor` (z. B. lightBlue), wenn kein hexColor gesetzt. */
  color?: string | null
  /** In Outlook/365 gewaehlte Farbe; Vorrang vor `color`. */
  hexColor?: string | null
  /** Graph `canEdit`; `false` z. B. bei rein freigegebenen Kalendern (Farbe nicht aenderbar). */
  canEdit?: boolean
  /** Standard: Microsoft Graph; `google` fuer Google Calendar API. */
  provider?: 'microsoft' | 'google'
  /** Google Calendar: `owner` / `writer` / `reader` / … */
  accessRole?: string | null
  /** Microsoft 365: Kalender einer Unified Group (`m365g:{groupId}`), lazy geladen. */
  calendarKind?: 'standard' | 'm365Group'
}

/** Paginierte Antwort von `calendar:list-ms365-group-calendars`. */
export interface CalendarM365GroupCalendarsPage {
  calendars: CalendarGraphCalendarRow[]
  /** Anzahl Unified Groups (nach Sortierung, inkl. ohne ladbarer Kalender). */
  totalGroups: number
  offset: number
  limit: number
  hasMore: boolean
}

/** Argumente fuer `calendar.listEvents` (IPC `calendar:list-events`). */
export interface CalendarListEventsInput {
  startIso: string
  endIso: string
  /**
   * Wenn gesetzt: nur Termine aus diesem Kalender (Konto + Graph-Kalender-ID).
   * Vorrang vor `includeCalendars`.
   */
  focusCalendar?: { accountId: string; graphCalendarId: string } | null
  /**
   * Wenn gesetzt: nur diese Kalender abfragen (leeres Array = keine Cloud-Termine).
   * Wenn nicht gesetzt: alle Kalender aller verbundenen Konten wie zuvor.
   */
  includeCalendars?: CalendarIncludeCalendarRef[] | null
}

/** Serienfrequenz beim Anlegen (UI + API-Mapping). */
export type CalendarRecurrenceFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly'

/** Ende der Serie: unbegrenzt, bis Datum, oder nach N Vorkommen (inkl. erstem Termin). */
export type CalendarRecurrenceRangeEndMode = 'never' | 'until' | 'count'

/** Serientermin nur beim **Anlegen** (Microsoft Graph `recurrence` / Google `RRULE`). */
export interface CalendarSaveEventRecurrence {
  frequency: CalendarRecurrenceFrequency
  rangeEnd: CalendarRecurrenceRangeEndMode
  /** `YYYY-MM-DD`, wenn `rangeEnd === 'until'` */
  untilDate?: string | null
  /** Wenn `rangeEnd === 'count'`: 1–999 (inkl. erstem Termin). */
  count?: number | null
}

/** Einfacher Termin (ohne Teams) anlegen oder aktualisieren — Microsoft Graph. */
export interface CalendarSaveEventInput {
  accountId: string
  /** Graph-Kalender-ID; `null`/`undefined` = Standard (`POST /me/events`). */
  graphCalendarId?: string | null
  subject: string
  startIso: string
  endIso: string
  isAllDay: boolean
  location?: string | null
  bodyHtml?: string | null
  /** Outlook-Kategorien (max. 25 Namen). */
  categories?: string[] | null
  /** Microsoft 365: Einladungen (Graph `attendees`, Typ `required`). Beim PATCH: gesamte Liste ersetzen. */
  attendeeEmails?: string[] | null
  /** Microsoft 365: Teams-Besprechung (`isOnlineMeeting` / `onlineMeetingProvider`) — nicht fuer Ganztage. */
  teamsMeeting?: boolean | null
  /** Serientermin (nur Anlegen; Bearbeiten der Serie ist nicht implementiert). */
  recurrence?: CalendarSaveEventRecurrence | null
}

export interface CalendarSaveEventResult {
  id: string
  webLink: string | null
}

export interface CalendarUpdateEventInput extends CalendarSaveEventInput {
  graphEventId: string
}

/** Microsoft 365: Einzeltermin fuer Dialog (Teilnehmer, Teams-Link). */
export interface CalendarGetEventInput {
  accountId: string
  graphEventId: string
  graphCalendarId?: string | null
}

export interface CalendarGetEventResult {
  subject: string | null
  attendeeEmails: string[]
  joinUrl: string | null
  isOnlineMeeting: boolean
}

/** Termin loeschen (Graph oder Google). */
export interface CalendarDeleteEventInput {
  accountId: string
  graphEventId: string
  /** Google: Kalender-ID (`primary` oder Kalender-E-Mail); bei Microsoft optional. */
  graphCalendarId?: string | null
}

/** Nur Zeitraum aendern (Drag & Drop / Resize) — `PATCH` ohne Body. */
export interface CalendarPatchScheduleInput {
  accountId: string
  graphEventId: string
  /** Google: Kalender-ID; bei Microsoft aus Event ableitbar. */
  graphCalendarId?: string | null
  startIso: string
  endIso: string
  isAllDay: boolean
}

/** Nur Kalenderfarbe (Outlook-Preset) — `PATCH /me/calendars/{id}`. */
export interface CalendarPatchCalendarColorInput {
  accountId: string
  graphCalendarId: string
  /** Microsoft Graph `calendar.color`, z. B. `lightTeal` oder `auto`. */
  color: string
}

/** Vorschlag fuer „Termin aus Mail“ (Kalender-Dialog). */
export interface CalendarSuggestionFromMail {
  accountId: string
  messageId: number
  subject: string
  startIso: string
  endIso: string
  bodyHtml: string
  attendeeEmails: string[]
}

/** Cloud-Aufgabenliste (Microsoft To Do oder Google Tasks). */
export interface TaskListRow {
  id: string
  name: string
  /** Microsoft: `wellKnownListName === defaultList`; Google: `@default`. */
  isDefault?: boolean
  provider: 'microsoft' | 'google'
}

/** Einzelne Cloud-Aufgabe (nicht Mail-Triage-ToDos). */
export interface TaskItemRow {
  id: string
  listId: string
  title: string
  completed: boolean
  /** Faelligkeit als ISO-Datum (`YYYY-MM-DD`) oder UTC-ISO mit Uhrzeit, sonst null. */
  dueIso: string | null
  notes: string | null
}

export interface TasksListListsInput {
  accountId: string
}

export interface TasksListTasksInput {
  accountId: string
  listId: string
  /** Standard: true (wie Google API-Default). */
  showCompleted?: boolean
  showHidden?: boolean
}

export interface TasksCreateTaskInput {
  accountId: string
  listId: string
  title: string
  notes?: string | null
  dueIso?: string | null
  completed?: boolean
}

export interface TasksPatchTaskInput {
  accountId: string
  listId: string
  taskId: string
  title?: string | null
  notes?: string | null
  /** `null` loescht die Faelligkeit; `undefined` = keine Aenderung. */
  dueIso?: string | null
  completed?: boolean
}

export interface TasksUpdateTaskInput extends TasksCreateTaskInput {
  taskId: string
}

export interface TasksDeleteTaskInput {
  accountId: string
  listId: string
  taskId: string
}

/** Kontakte-Modul: Navigations-/Listenfilter. */
export type PeopleListFilter = 'all' | 'favorites' | 'microsoft' | 'google'

/** Sortierung der Kontaktliste (serverseitig in SQLite). */
export type PeopleListSort = 'displayName' | 'givenName' | 'surname'

export interface PeopleListInput {
  filter: PeopleListFilter
  /** Optional: nur Kontakte dieses Kontos (z. B. Untermenue pro Konto). */
  accountId?: string | null
  query?: string
  limit?: number
  /** Standard: `displayName`. */
  sortBy?: PeopleListSort
}

/** Lokaler Kontakt (Cache), fuer Liste und Detailansicht. */
export interface PeopleContactView {
  id: number
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
  updatedLocal: string | null
  isFavorite: boolean
}

export interface PeopleNavAccountCount {
  accountId: string
  provider: Provider
  total: number
  email?: string
  displayName?: string
  /** Aus `people_sync_state` fuer dieses Konto. */
  lastSyncedAt?: string | null
}

export interface PeopleNavCounts {
  all: number
  favorites: number
  microsoftTotal: number
  googleTotal: number
  /** Neuestes `last_synced_at` ueber alle Konten (Kontakte). */
  lastSyncedAt: string | null
  byAccount: PeopleNavAccountCount[]
}

export interface PeopleSyncAccountResult {
  accountId: string
  provider: Provider
  imported: number
  /** Nur bei `syncAll`, wenn ein Konto fehlschlaegt. */
  error?: string
}

export interface PeopleSetFavoriteInput {
  accountId: string
  provider: Provider
  remoteId: string
  isFavorite: boolean
}

/** Felder fuer `people:update-contact` (MVP: Kernfelder). */
export interface PeopleUpdateContactPatch {
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
  /** Ersetzt gesamte strukturierte Telefonliste (type/value). */
  phones?: Array<{ type: string; value: string }>
  /** Ersetzt E-Mail-Adressen (Graph: name+address; Google wird serverseitig gemappt). */
  emails?: Array<{ address: string; name?: string | null }>
  notes?: string | null
}

export interface PeopleUpdateContactInput {
  id: number
  patch: PeopleUpdateContactPatch
}

/** JPEG/PNG als Base64 (ohne oder mit `data:…;base64,`-Prefix) — Microsoft 365 Kontakte. */
export interface PeopleSetContactPhotoInput {
  id: number
  imageBase64: string
}

/** Neuer Kontakt im verbundenen Konto (Microsoft oder Google). */
export interface PeopleCreateContactInput {
  accountId: string
  displayName?: string | null
  givenName?: string | null
  surname?: string | null
  primaryEmail?: string | null
  company?: string | null
  jobTitle?: string | null
  mobilePhone?: string | null
  notes?: string | null
}

export type PeopleCreateContactPayload = Omit<PeopleCreateContactInput, 'accountId'>

export interface MailFolder {
  id: number
  accountId: string
  remoteId: string
  name: string
  parentRemoteId: string | null
  path: string | null
  wellKnown: string | null
  isFavorite: boolean
  unreadCount: number
  totalCount: number
}

export type TodoDueKindOpen = 'today' | 'tomorrow' | 'this_week' | 'later'

export type TodoDueKindList = TodoDueKindOpen | 'done' | 'overdue'

/** Workflow-Kanban: eine Spalte mit optionaler QuickStep-ID und optionalem ToDo-Bucket. */
export interface WorkflowColumn {
  id: string
  title: string
  quickStepId: number | null
  /** Offene ToDos dieses Buckets in der Spalte anzeigen (today, tomorrow, …). */
  todoDueKind?: TodoDueKindList | null
}

export interface WorkflowBoard {
  id: number
  name: string
  columns: WorkflowColumn[]
  sortOrder: number
}

export interface TodoOpenCounts {
  /** Fälligkeit vor heute (Kalendertag), nur mit gesetztem `due_at`. */
  overdue: number
  today: number
  tomorrow: number
  this_week: number
  later: number
}

export interface TodoCountsAll extends TodoOpenCounts {
  done: number
  /** Mails mit gesetztem `waiting_for_reply_until`. */
  waiting: number
}

export interface MailListItem {
  id: number
  accountId: string
  folderId: number | null
  threadId: number | null
  remoteId: string
  remoteThreadId: string | null
  subject: string | null
  fromAddr: string | null
  fromName: string | null
  snippet: string | null
  sentAt: string | null
  receivedAt: string | null
  isRead: boolean
  isFlagged: boolean
  hasAttachments: boolean
  importance: string | null
  /** ISO 8601, falls die Mail aktuell gesnoozt ist. */
  snoozedUntil: string | null
  /** Gesetzt, wenn die Zeile aus einer ToDo-Ansicht stammt. */
  todoId?: number
  todoDueKind?: string | null
  todoDueAt?: string | null
  /** Kalender-Block: Beginn (ISO 8601), optional zu due_at. */
  todoStartAt?: string | null
  /** Kalender-Block: Ende (ISO 8601). */
  todoEndAt?: string | null
  todoCompletedAt?: string | null
  /** ISO 8601: Antwort bis (Waiting-for), falls gesetzt. */
  waitingForReplyUntil?: string | null
  /** Rohwert des List-Unsubscribe-Headers (mailto/https). */
  listUnsubscribe?: string | null
  /** List-Unsubscribe-Post fuer RFC-8058 One-Click. */
  listUnsubscribePost?: string | null
  /** Absender ist als VIP markiert (lokal). */
  isVipSender?: boolean
  /**
   * Kategorie-Namen (Outlook/Graph `categories`, lokal in `message_tags`).
   * Spaeter auch fuer Kalender-Termine nutzbar.
   */
  categories?: string[]
  /** An: Empfaenger-Rohstring (fuer Gruppierung „An“ in der Liste). */
  toAddrs?: string | null
}

export interface MailFull extends MailListItem {
  bodyHtml: string | null
  bodyText: string | null
  ccAddrs: string | null
  /** Lokale offene ToDo zu dieser Mail, falls vorhanden. */
  openTodoId: number | null
  openTodoDueKind: string | null
  openTodoDueAt: string | null
  openTodoStartAt: string | null
  openTodoEndAt: string | null
}

/** Outlook-Masterkategorie (Microsoft Graph `outlookCategory`). */
export interface MailMasterCategory {
  id: string
  displayName: string
  color: string
}

export interface SearchHit extends MailListItem {
  folderName: string | null
  folderWellKnown: string | null
}

/**
 * Einzelne Ausnahme-Regel (wird mit anderen Ausnahmen per ODER in NOT (...) kombiniert).
 * Innerhalb einer Regel gelten gesetzte Felder per UND.
 */
export interface MetaFolderExceptionClause {
  textQuery?: string
  unreadOnly?: boolean
  flaggedOnly?: boolean
  hasAttachmentsOnly?: boolean
  fromContains?: string
}

/**
 * Filter fuer Meta-Ordner (virtuelle Ansicht, alle Konten, keine Verschiebung).
 *
 * - `matchOp`: Verknuepfung der Positiv-Bedingungen aus den Feldern
 *   `textQuery` / `unreadOnly` / `flaggedOnly` / `hasAttachmentsOnly` / `fromContains`.
 *   Standard ist `and` (kompatibel mit aelteren Eintraegen ohne Feld).
 * - `exceptions`: Mails, die mindestens eine Ausnahme-Zeile voll erfuellen, werden ausgeschlossen:
 *   `AND NOT ( (Zeile0) OR (Zeile1) OR ... )`, innerhalb einer Zeile UND zwischen den Feldern.
 */
export interface MetaFolderCriteria {
  /** FTS-Prefixsuche (Betreff/Absender/Body), gleiche Token-Logik wie globale Suche. */
  textQuery?: string
  unreadOnly?: boolean
  flaggedOnly?: boolean
  hasAttachmentsOnly?: boolean
  /** Teilstring in Absender-Adresse oder -Name (case-insensitive). */
  fromContains?: string
  /**
   * Wenn nicht leer: nur diese Ordner-IDs (ueber alle Konten).
   * Wenn leer/weggelassen: alle synchronisierten Ordner ausser Papierkorb und Junk.
   */
  scopeFolderIds?: number[]
  /** Verknuepfung der Positiv-Filter; Standard `and`. */
  matchOp?: 'and' | 'or'
  /** Ausnahmen (werden mit ODER verknuepft und gesamt negiert). */
  exceptions?: MetaFolderExceptionClause[]
}

export interface MetaFolderSummary {
  id: number
  name: string
  sortOrder: number
  criteria: MetaFolderCriteria
  createdAt: string
  updatedAt: string
}

export interface MetaFolderCreateInput {
  name: string
  criteria: MetaFolderCriteria
}

export interface MetaFolderUpdateInput {
  id: number
  name?: string
  criteria?: MetaFolderCriteria
}

export interface AttachmentMeta {
  /** Graph-Attachment-ID (nur fuer Remote-Operationen) */
  id: string
  name: string
  contentType: string | null
  size: number | null
  isInline: boolean
  contentId: string | null
}

export interface SyncStatus {
  accountId: string
  state: 'idle' | 'syncing-folders' | 'syncing-messages' | 'error'
  message?: string
}

/** Microsoft Graph `/me/chats` — Teams-Chat (1:1 oder Gruppe). */
export interface TeamsChatSummary {
  id: string
  topic: string | null
  chatType: string | null
  lastUpdatedDateTime: string | null
  /** Bei 1:1 ohne Thema: Anzeigename des Gegenuebers aus Chat-Mitgliedern, sonst null. */
  peerDisplayName: string | null
}

/** Microsoft Graph `chatMessage`, fuer die Anzeige reduziert. */
export type TeamsChatMessageKind = 'user' | 'system'

export interface TeamsChatMessageView {
  id: string
  createdDateTime: string
  bodyPreview: string | null
  fromDisplayName: string | null
  /** Graph `from.user.id` — fuer eigene Nachrichten (rechtsbuendig). */
  fromUserId: string | null
  /** `system`: Teams-Systemereignis (`systemEventMessage` / eventDetail). */
  messageKind: TeamsChatMessageKind
}

export type UserNoteKind = 'mail' | 'calendar' | 'standalone'
export type UserNoteCalendarSource = 'microsoft' | 'google'

export interface UserNote {
  id: number
  kind: UserNoteKind
  messageId: number | null
  accountId: string | null
  calendarSource: UserNoteCalendarSource | null
  calendarRemoteId: string | null
  eventRemoteId: string | null
  title: string | null
  body: string
  createdAt: string
  updatedAt: string
  eventTitleSnapshot: string | null
  eventStartIsoSnapshot: string | null
}

export interface UserNoteListItem extends UserNote {
  mailSubject: string | null
  mailAccountId: string | null
  mailFromAddr: string | null
  mailFromName: string | null
  mailSnippet: string | null
  mailSentAt: string | null
  mailReceivedAt: string | null
  mailIsRead: boolean | null
  mailHasAttachments: boolean | null
}

export interface UserNoteMailUpsertInput {
  messageId: number
  title?: string | null
  body: string
}

export interface UserNoteCalendarKey {
  accountId: string
  calendarSource: UserNoteCalendarSource
  calendarRemoteId: string
  eventRemoteId: string
}

export interface UserNoteCalendarUpsertInput extends UserNoteCalendarKey {
  title?: string | null
  body: string
  eventTitleSnapshot?: string | null
  eventStartIsoSnapshot?: string | null
}

export interface UserNoteStandaloneCreateInput {
  title?: string | null
  body?: string
}

export interface UserNoteStandaloneUpdateInput {
  id: number
  title?: string | null
  body?: string
}

export interface UserNoteListFilters {
  kinds?: UserNoteKind[]
  accountIds?: string[]
  dateFrom?: string | null
  dateTo?: string | null
  search?: string | null
  limit?: number
}

export const IPC = {
  app: {
    getVersion: 'app:get-version',
    getPlatform: 'app:get-platform',
    setLaunchOnLogin: 'app:set-launch-on-login',
    showTestNotification: 'app:show-test-notification',
    openExternal: 'app:open-external'
  },
  config: {
    get: 'config:get',
    setMicrosoftClientId: 'config:set-microsoft-client-id',
    setGoogleClientId: 'config:set-google-client-id',
    setSyncWindowDays: 'config:set-sync-window-days',
    setAutoLoadImages: 'config:set-auto-load-images',
    setCalendarTimeZone: 'config:set-calendar-time-zone',
    setWeatherLocation: 'config:set-weather-location',
    setWorkflowMailFoldersIntroDismissed: 'config:set-workflow-mail-folders-intro-dismissed',
    setFirstRunSetupCompleted: 'config:set-first-run-setup-completed'
  },
  auth: {
    addMicrosoft: 'auth:add-microsoft',
    addGoogle: 'auth:add-google',
    refreshMicrosoft: 'auth:refresh-microsoft',
    refreshGoogle: 'auth:refresh-google',
    listAccounts: 'auth:list-accounts',
    remove: 'auth:remove',
    getProfilePhotoDataUrl: 'auth:get-profile-photo-data-url',
    reorderAccounts: 'auth:reorder-accounts',
    patchAccount: 'auth:patch-account'
  },
  graph: {
    getMe: 'graph:get-me',
    listTeamsChats: 'graph:list-teams-chats',
    listTeamsChatMessages: 'graph:list-teams-chat-messages',
    sendTeamsChatMessage: 'graph:send-teams-chat-message'
  },
  notes: {
    getMail: 'notes:get-mail',
    upsertMail: 'notes:upsert-mail',
    getCalendar: 'notes:get-calendar',
    upsertCalendar: 'notes:upsert-calendar',
    createStandalone: 'notes:create-standalone',
    updateStandalone: 'notes:update-standalone',
    delete: 'notes:delete',
    list: 'notes:list'
  },
  mail: {
    listFolders: 'mail:list-folders',
    listMessages: 'mail:list-messages',
    listInboxTriage: 'mail:list-inbox-triage',
    /** Alle lokalen Mails aus allen Posteingaengen (well_known = inbox), ohne LIMIT. */
    listUnifiedInbox: 'mail:list-unified-inbox',
    listThreadMessages: 'mail:list-thread-messages',
    listMessagesByThreads: 'mail:list-messages-by-threads',
    fetchInlineImages: 'mail:fetch-inline-images',
    listAttachments: 'mail:list-attachments',
    openAttachment: 'mail:open-attachment',
    saveAttachmentAs: 'mail:save-attachment-as',
    syncAttachmentsFlag: 'mail:sync-attachments-flag',
    refreshNow: 'mail:refresh-now',
    setActiveFolder: 'mail:set-active-folder',
    search: 'mail:search',
    getMessage: 'mail:get-message',
    syncAccount: 'mail:sync-account',
    syncFolder: 'mail:sync-folder',
    setRead: 'mail:set-read',
    setFlagged: 'mail:set-flagged',
    archive: 'mail:archive',
    moveToTrash: 'mail:move-to-trash',
    /** Mail in einen anderen Ordner desselben Kontos verschieben (Graph/Gmail). */
    moveToFolder: 'mail:move-to-folder',
    permanentDeleteMessage: 'mail:permanent-delete-message',
    emptyTrashFolder: 'mail:empty-trash-folder',
    snooze: 'mail:snooze',
    unsnooze: 'mail:unsnooze',
    listSnoozed: 'mail:list-snoozed',
    listTodoMessages: 'mail:list-todo-messages',
    listTodoMessagesInRange: 'mail:list-todo-messages-in-range',
    listTodoCounts: 'mail:list-todo-counts',
    setTodoForMessage: 'mail:set-todo-for-message',
    setTodoScheduleForMessage: 'mail:set-todo-schedule-for-message',
    completeTodoForMessage: 'mail:complete-todo-for-message',
    listTemplates: 'mail:list-templates',
    listQuickSteps: 'mail:list-quick-steps',
    runQuickStep: 'mail:run-quick-step',
    listWaitingMessages: 'mail:list-waiting-messages',
    setWaitingForMessage: 'mail:set-waiting-for-message',
    clearWaitingForMessage: 'mail:clear-waiting-for-message',
    undoLast: 'mail:undo-last',
    peekUndo: 'mail:peek-undo',
    unsubscribeOneClick: 'mail:unsubscribe-one-click',
    setMessageCategories: 'mail:set-message-categories',
    listMasterCategories: 'mail:list-master-categories',
    createMasterCategory: 'mail:create-master-category',
    updateMasterCategory: 'mail:update-master-category',
    deleteMasterCategory: 'mail:delete-master-category',
    listDistinctMessageTags: 'mail:list-distinct-message-tags',
    getWorkflowMailFolderState: 'mail:get-workflow-mail-folder-state',
    ensureWorkflowMailFolders: 'mail:ensure-workflow-mail-folders',
    setWorkflowMailFolderMapping: 'mail:set-workflow-mail-folder-mapping',
    listMetaFolders: 'mail:list-meta-folders',
    getMetaFolder: 'mail:get-meta-folder',
    createMetaFolder: 'mail:create-meta-folder',
    updateMetaFolder: 'mail:update-meta-folder',
    deleteMetaFolder: 'mail:delete-meta-folder',
    reorderMetaFolders: 'mail:reorder-meta-folders',
    listMetaFolderMessages: 'mail:list-meta-folder-messages'
  },
  folder: {
    create: 'folder:create',
    rename: 'folder:rename',
    delete: 'folder:delete',
    move: 'folder:move',
    toggleFavorite: 'folder:toggle-favorite'
  },
  compose: {
    send: 'compose:send',
    recipientSuggestions: 'compose:recipient-suggestions',
    listDriveExplorer: 'compose:list-drive-explorer'
  },
  calendar: {
    listEvents: 'calendar:list-events',
    listCalendars: 'calendar:list-calendars',
    listMicrosoft365GroupCalendars: 'calendar:list-ms365-group-calendars',
    patchCalendarColor: 'calendar:patch-calendar-color',
    createTeamsMeeting: 'calendar:create-teams-meeting',
    suggestFromMessage: 'calendar:suggest-from-message',
    createEvent: 'calendar:create-event',
    updateEvent: 'calendar:update-event',
    getEvent: 'calendar:get-event',
    deleteEvent: 'calendar:delete-event',
    /** Nur Start/Ende/Ganztaegig (Drag & Drop / Resize). */
    patchEventSchedule: 'calendar:patch-event-schedule',
    /** Nur `categories` am Graph-Termin patchen (ohne Body/Zeiten). */
    patchEventCategories: 'calendar:patch-event-categories'
  },
  tasks: {
    listLists: 'tasks:list-lists',
    listTasks: 'tasks:list-tasks',
    createTask: 'tasks:create-task',
    updateTask: 'tasks:update-task',
    patchTask: 'tasks:patch-task',
    deleteTask: 'tasks:delete-task'
  },
  people: {
    list: 'people:list',
    getNavCounts: 'people:get-nav-counts',
    syncAccount: 'people:sync-account',
    syncAll: 'people:sync-all',
    setFavorite: 'people:set-favorite',
    getPhotoDataUrl: 'people:get-photo-data-url',
    updateContact: 'people:update-contact',
    setContactPhoto: 'people:set-contact-photo',
    createContact: 'people:create-contact',
    deleteContact: 'people:delete-contact'
  },
  workflow: {
    listBoards: 'workflow:list-boards',
    updateBoardColumns: 'workflow:update-board-columns'
  },
  vip: {
    list: 'vip:list',
    add: 'vip:add',
    remove: 'vip:remove'
  },
  rules: {
    list: 'rules:list',
    get: 'rules:get',
    create: 'rules:create',
    update: 'rules:update',
    delete: 'rules:delete',
    dryRun: 'rules:dry-run',
    applyManual: 'rules:apply-manual',
    listAutomation: 'rules:list-automation',
    undoAutomation: 'rules:undo-automation'
  },
  settingsBackup: {
    exportToFile: 'settings-backup:export-to-file',
    pickAndRead: 'settings-backup:pick-and-read',
    applyFull: 'settings-backup:apply-full'
  },
  weather: {
    geocode: 'weather:geocode',
    forecast: 'weather:forecast'
  }
} as const

export interface ComposeRecipient {
  address: string
  name?: string
}

/**
 * Anhang fuer den Compose-Send-Aufruf.
 * `dataBase64` ist der reine Base64-String OHNE Daten-URL-Prefix.
 * Bei `isInline=true` muss `contentId` gesetzt sein (wird im HTML als
 * `<img src="cid:...">` referenziert).
 */
export interface ComposeAttachment {
  name: string
  contentType: string
  size: number
  dataBase64: string
  isInline?: boolean
  contentId?: string
}

/** Microsoft-365-Cloud-Anhang (ReferenceAttachment), ohne Datei lokal zu laden. */
export interface ComposeReferenceAttachment {
  name: string
  /** `webUrl` der Datei (OneDrive/SharePoint), wird als `sourceUrl` an Graph uebergeben. */
  sourceUrl: string
  /** z.B. `oneDriveBusiness` (Standard fuer M365). */
  providerType?: 'oneDriveBusiness' | 'oneDriveConsumer' | 'documentLibrary'
}

export type MailImportance = 'low' | 'normal' | 'high'

export interface ComposeSendInput {
  accountId: string
  subject: string
  bodyHtml: string
  to: ComposeRecipient[]
  cc?: ComposeRecipient[]
  bcc?: ComposeRecipient[]
  attachments?: ComposeAttachment[]
  /** Nur Microsoft Graph: Cloud-Datei als Link-Anhang. */
  referenceAttachments?: ComposeReferenceAttachment[]
  replyToRemoteId?: string
  replyMode?: 'reply' | 'replyAll' | 'forward'
  /**
   * Lokale Message-ID der Mail, auf die geantwortet/weitergeleitet wird.
   * Wird fuer "Antwort erwarten" nach erfolgreichem Senden benoetigt.
   */
  trackWaitingOnMessageId?: number
  /** Wenn gesetzt: nach Senden Waiting-for auf `trackWaitingOnMessageId` setzen. */
  expectReplyInDays?: number
  /** Microsoft Graph: Wichtigkeit (Gmail: derzeit ignoriert). */
  importance?: MailImportance
  /** Microsoft Graph: Zustellbestaetigung anfordern. */
  isDeliveryReceiptRequested?: boolean
  /** Microsoft Graph: Lesebestaetigung anfordern. */
  isReadReceiptRequested?: boolean
  /**
   * ISO-Zeitpunkt: wenn in der Zukunft, wird die Nachricht lokal eingeplant
   * statt sofort gesendet (Anhaenge-Groesse beachten).
   */
  scheduledSendAt?: string | null
}

/** Vorschlag fuer Empfaenger-Autocomplete (Compose). */
export interface ComposeRecipientSuggestion {
  email: string
  displayName?: string | null
  source: 'people-local' | 'mail-history' | 'graph-people' | 'graph-directory' | 'graph-group'
}

/** OneDrive/SharePoint-Explorer: Bereich und optional aktueller Ordner. */
export type ComposeDriveExplorerScope = 'recent' | 'myfiles' | 'shared'

export interface ComposeListDriveExplorerInput {
  accountId: string
  scope: ComposeDriveExplorerScope
  /** Bei `myfiles`/`shared`: Ordner-Item-ID; `null` = Wurzel. */
  folderId?: string | null
  /** Bei `shared` (und Unterordnern): Ziel-Drive-ID aus Graph `parentReference.driveId`. */
  folderDriveId?: string | null
}

/** Eintrag im OneDrive-Explorer (Datei oder Ordner). */
export interface ComposeDriveExplorerEntry {
  id: string
  name: string
  webUrl: string | null
  size: number | null
  mimeType: string | null
  isFolder: boolean
  /** Nur bei geteilten Drives fuer Navigation zu Kindern. */
  driveId?: string | null
}

export interface ComposeDriveItemRow {
  id: string
  name: string
  webUrl: string
  size: number | null
  mimeType: string | null
}

/** Textbaustein aus der lokalen `templates`-Tabelle (Compose). */
export interface MailTemplate {
  id: number
  name: string
  bodyHtml: string
  bodyText: string | null
  /** JSON-Objekt mit Platzhalter -> Wert, z.B. `{"vorname":"Kurt"}`. */
  variablesJson?: string | null
  shortcut: string | null
  sortOrder: number
}

/** QuickStep-Metadaten (ohne Aktions-JSON) fuer UI-Listen. */
export interface MailQuickStep {
  id: number
  name: string
  icon: string | null
  shortcut: string | null
  sortOrder: number
}

export type MailActionType =
  | 'set-read'
  | 'set-flagged'
  | 'archive'
  | 'move-to-trash'
  | 'move-message'
  | 'add-tag'
  | 'snooze'
  | 'unsnooze'
  | 'add-todo'
  | 'change-todo'
  | 'remove-todo'
  | 'add-waiting-for'
  | 'change-waiting-for'
  | 'remove-waiting-for'
  | 'quickstep'

export interface UndoableActionSummary {
  id: number
  actionType: MailActionType
  /** Anzeige-Label fuer die Toast ("Archiviert: Re: ...") */
  label: string
  performedAt: string
}

export interface UndoResult {
  ok: boolean
  label?: string
  error?: string
}

/** Snooze-Presets fuer den Picker. */
export type SnoozePreset =
  | 'this-evening'
  | 'tomorrow-morning'
  | 'tomorrow-evening'
  | 'next-week'
  | 'next-monday'
  | 'in-1-hour'
  | 'in-3-hours'
  | 'custom'

export interface SnoozeOption {
  preset: SnoozePreset
  /** Berechneter Wake-Zeitpunkt als ISO 8601. */
  wakeAt: string
}

export interface SnoozedMessageItem extends MailListItem {
  snoozedUntil: string | null
  snoozedFromFolderId: number | null
  snoozedFromFolderName: string | null
}
