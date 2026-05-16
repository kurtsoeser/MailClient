import type { MailRuleDefinition, MailRuleTrigger } from './mail-rules'

export type Provider = 'microsoft' | 'google'

/** Payload fuer das Renderer-Event `mail:changed`. */
export interface MailChangedPayload {
  accountId: string
  /** `poll` = Hintergrund-Sync; `action` = Nutzeraktion oder Regel. */
  kind?: 'poll' | 'action'
  /** Betroffene lokale Ordner-IDs (optional, fuer gezielte Reloads). */
  folderIds?: number[]
}

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
  /** Notion Public Integration — OAuth Client ID. */
  notionClientId: string | null
  /** Notion Public Integration — OAuth Client secret. */
  notionClientSecret: string | null
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

export type { LocationSearchLanguage, LocationSuggestion } from './location-search'

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
export const SETTINGS_BACKUP_FORMAT_VERSION = 2 as const

/** Unterstuetzte Import-Versionen (aeltere Exporte bleiben lesbar). */
export const SETTINGS_BACKUP_SUPPORTED_FORMAT_VERSIONS = [1, 2] as const

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
  /** Ab Export mit App-Version die Boards voll mitschreibt; fehlt bei aelteren Dateien. */
  name?: string
  sortOrder?: number
}

/** QuickStep-Zeile fuer Sicherung (IDs bleiben erhalten, Workflow-Spalten verweisen darauf). */
export interface SettingsBackupQuickStepSnapshot {
  id: number
  name: string
  icon: string | null
  shortcut: string | null
  actionsJson: string
  sortOrder: number
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface SettingsBackupTemplateSnapshot {
  id: number
  name: string
  bodyHtml: string
  bodyText: string | null
  variablesJson: string | null
  shortcut: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface SettingsBackupMetaFolderSnapshot {
  id: number
  name: string
  sortOrder: number
  criteriaJson: string
  createdAt: string
  updatedAt: string
}

/** Nur ausstehende geplante Sends; beim Import werden bestehende Pending-Eintraege ersetzt. */
export interface SettingsBackupComposeScheduledSnapshot {
  payloadJson: string
  sendAtIso: string
}

/**
 * Notiz exportiert mit stabilen Schluesseln (Mail: Konto + Remote-Message-Id),
 * damit sie nach Import wieder an lokale message_id angebunden werden kann.
 */
export interface SettingsBackupNoteSectionSnapshot {
  name: string
  icon?: string | null
  iconColor?: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
  /** Index in noteSections-Array der Elternsektion; null = Wurzel. */
  parentIndex?: number | null
}

export interface SettingsBackupUserNoteLinkSnapshot {
  fromNoteIndex: number
  toNoteIndex: number
  createdAt: string
}

/** Verknuepfung einer Notiz mit Mail, Kalender, Aufgabe oder anderer Notiz. */
export interface SettingsBackupEntityLinkSnapshot {
  fromNoteIndex: number
  targetKind: 'note' | 'mail' | 'calendar_event' | 'cloud_task'
  toNoteIndex?: number
  mailMessageId?: number
  calendarAccountId?: string
  calendarGraphEventId?: string
  taskAccountId?: string
  taskListId?: string
  taskId?: string
  createdAt: string
}

/** Benutzerdefinierte Kalenderfarbe in der Sidebar (Graph-Kalender-ID). */
export interface SettingsBackupCalendarColorOverrideSnapshot {
  accountId: string
  calendarId: string
  displayColorOverrideHex: string | null
}

/** Kontenbezogene Einstellungen ohne OAuth-Token (Merge per Konto-ID beim Import). */
export interface SettingsBackupAccountPreferenceSnapshot {
  accountId: string
  color?: string
  calendarLoadAheadDays?: number | null
  signatureTemplates?: AccountSignatureTemplate[]
  defaultSignatureTemplateId?: string | null
}

export interface SettingsBackupNotionDestinationSnapshot {
  id: string
  title: string
  icon: string | null
  kind: 'page' | 'database'
  addedAt: string
  lastUsedAt?: string
}

export interface SettingsBackupNotionDestinationsSnapshot {
  favorites: SettingsBackupNotionDestinationSnapshot[]
  defaultMailPageId: string | null
  defaultCalendarPageId: string | null
  lastUsedPageId: string | null
  newPageParentId: string | null
}

export interface SettingsBackupUserNoteSnapshot {
  kind: 'mail' | 'calendar' | 'standalone'
  mailAccountId?: string | null
  mailRemoteId?: string | null
  accountId?: string | null
  calendarSource?: 'microsoft' | 'google' | null
  calendarRemoteId?: string | null
  eventRemoteId?: string | null
  title: string | null
  body: string
  createdAt: string
  updatedAt: string
  eventTitleSnapshot?: string | null
  eventStartIsoSnapshot?: string | null
  scheduledStartIso?: string | null
  scheduledEndIso?: string | null
  scheduledAllDay?: boolean
  sectionIndex?: number | null
  sortOrder?: number
  iconId?: string | null
  iconColor?: string | null
  /** Indizes in userNotes-Array fuer Verknuepfungen (nur ausgehend). */
  linkedToNoteIndices?: number[]
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
  /** Fehlt bei aelteren Exporten: QuickSteps bleiben in der DB unveraendert. */
  quickSteps?: SettingsBackupQuickStepSnapshot[]
  mailTemplates?: SettingsBackupTemplateSnapshot[]
  metaFolders?: SettingsBackupMetaFolderSnapshot[]
  composeScheduledPending?: SettingsBackupComposeScheduledSnapshot[]
  userNotes?: SettingsBackupUserNoteSnapshot[]
  noteSections?: SettingsBackupNoteSectionSnapshot[]
  userNoteLinks?: SettingsBackupUserNoteLinkSnapshot[]
  /** Ab v2: alle Notiz-Verknuepfungen (Mail/Kalender/Aufgabe/Notiz). */
  entityLinks?: SettingsBackupEntityLinkSnapshot[]
  /** Ab v2: benutzerdefinierte Kalenderfarben. */
  calendarColorOverrides?: SettingsBackupCalendarColorOverrideSnapshot[]
}

/**
 * Secure-Store und kontobezogene Praeferenzen (ohne OAuth-Token).
 * Ab Format v2; fehlt in v1-Exporten.
 */
export interface SettingsBackupSecureExtras {
  accountPreferences?: SettingsBackupAccountPreferenceSnapshot[]
  accountOrder?: string[]
  notionDestinations?: SettingsBackupNotionDestinationsSnapshot
}

/**
 * Lokale Einstellungs-Sicherung (ohne Mails, ohne Konten-Token).
 * Enthaelt App-Config, Renderer-localStorage, Mail-Regeln, Workflow (Boards + QuickSteps),
 * Vorlagen, Meta-Ordner, VIP, Triage-Ordner, geplanten Versand (pending), Notizen und ab v2
 * Konten-Praeferenzen, Notion-Ziele sowie Kalenderfarb-Ueberschreibungen.
 */
export interface SettingsBackupPayload {
  formatVersion: typeof SETTINGS_BACKUP_FORMAT_VERSION
  exportedAt: string
  appVersion: string
  config: AppConfig
  localStorage: Record<string, string>
  /** Fehlt bei aelteren Exporten: Datenbank-Teile werden dann nicht geaendert. */
  databaseExtras?: SettingsBackupDatabaseExtras
  /** Fehlt bei v1-Exporten: Secure-Store-Praeferenzen ohne Token. */
  secureExtras?: SettingsBackupSecureExtras
}

export type SettingsBackupExportResult =
  | { ok: true; path: string }
  | { ok: false; cancelled: true }

export type SettingsBackupPickResult =
  | { ok: true; backup: SettingsBackupPayload }
  | { ok: false; cancelled: true }
  | { ok: false; error: string }

/** ZIP-Archiv des userData-Ordners (portable = ohne Chromium-Caches). */
export const LOCAL_DATA_ARCHIVE_FORMAT_VERSION = 1 as const

export type LocalDataArchiveExportMode = 'portable' | 'full'

export interface LocalDataUsageCategory {
  id: string
  /** i18n-Key fuer die Anzeige */
  labelKey: string
  bytes: number
  fileCount: number
  canOptimize: boolean
}

export interface LocalDataUsageBreakdown {
  /** Ordner `data/` inkl. mail.db (+ WAL/SHM). */
  databaseBytes: number
  /** Chromium-Caches, blob_storage, attachment-cache. */
  cacheBytes: number
  /** Konten-Token, Bilder, Notiz-Anhaenge, config, Local Storage, … */
  essentialBytes: number
  /** Dateien in attachment-cache aelter als die Aufbewahrungsfrist. */
  attachmentCacheStaleBytes: number
}

export interface LocalDataUsageReport {
  userDataPath: string
  totalBytes: number
  totalFileCount: number
  reclaimableBytes: number
  breakdown: LocalDataUsageBreakdown
  categories: LocalDataUsageCategory[]
}

export interface LocalDataOptimizeResult {
  freedBytes: number
  beforeTotalBytes: number
  afterTotalBytes: number
  /** Chromium-Ordner waren gesperrt; Rest wird beim naechsten App-Start entfernt. */
  chromiumCacheNeedsRestart?: boolean
  details: {
    cacheAndTempBytes: number
    attachmentCacheStaleBytes: number
    databaseBytes: number
    orphanAvatarsBytes: number
    orphanContactPhotosBytes: number
  }
}

export type LocalDataArchiveExportResult =
  | { ok: true; path: string; mode: LocalDataArchiveExportMode }
  | { ok: false; cancelled: true }

export type LocalDataArchiveImportResult =
  | { ok: true }
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
  /** Lokales Anzeige-Icon (`calendar-event-icons`), nicht mit Graph/Google synchronisiert. */
  icon?: string | null
}

/** Lokales Termin-Icon setzen/entfernen. */
export interface CalendarPatchEventIconInput {
  accountId: string
  graphEventId: string
  /** `calendar-event-icons` ID oder null/leer = Standard (kein Icon). */
  iconId?: string | null
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
  /** Nur MailClient: Anzeigefarbe bei schreibgeschuetzten/abonnierten Kalendern. */
  displayColorOverrideHex?: string | null
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
  /** Cache ignorieren und von der Cloud neu laden (wenn online). */
  forceRefresh?: boolean
}

/** Argumente fuer `calendar.listCalendars` (IPC `calendar:list-calendars`). */
export interface CalendarListCalendarsInput {
  accountId: string
  /** Wenn true: Cache ignorieren und neu von der API laden (nur Google; Microsoft unveraendert). */
  forceRefresh?: boolean
}

/** Lokaler Kalender-Sync-Stand pro Konto (`calendar:get-account-sync-states`). */
export interface CalendarAccountSyncStateRow {
  accountId: string
  hasSynced: boolean
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
  /** Teilnehmer-Einladungen (Graph `attendees` / Google `attendees` + `sendUpdates`). Beim PATCH: gesamte Liste ersetzen. */
  attendeeEmails?: string[] | null
  /** Microsoft 365: Teams-Besprechung (`isOnlineMeeting` / `onlineMeetingProvider`) — nicht fuer Ganztage. Einladungen unabhaengig davon. */
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
  /** Cache ignorieren und von Graph neu laden (wenn online). */
  forceRefresh?: boolean
}

export interface CalendarGetEventResult {
  subject: string | null
  attendeeEmails: string[]
  joinUrl: string | null
  isOnlineMeeting: boolean
  /** Roh-HTML aus Graph (`body.contentType=html`) bzw. Google `description` (oft HTML). */
  bodyHtml: string | null
  location?: string | null
  organizer?: string | null
}

/** Termin in anderen Kalender / anderes Konto kopieren oder verschieben. */
export interface CalendarTransferEventInput {
  source: {
    accountId: string
    graphEventId: string
    graphCalendarId?: string | null
    title: string
    startIso: string
    endIso: string
    isAllDay: boolean
    location?: string | null
    categories?: string[] | null
    /** false bei Abo/Feed oder reinem Lesezugriff — Verschieben nicht moeglich. */
    calendarCanEdit?: boolean
  }
  targetAccountId: string
  targetGraphCalendarId?: string | null
  mode: 'copy' | 'move'
  /** Bei Bearbeiten+Verschieben: aktuelle Formularwerte fuer den Zieltermin. */
  payloadOverride?: Omit<CalendarSaveEventInput, 'accountId' | 'graphCalendarId'>
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
  /** Lokales Anzeige-Icon (`calendar-event-icons`), nicht mit Graph/Google synchronisiert. */
  iconId?: string | null
  /** Hex-Farbe für das Anzeige-Icon. */
  iconColor?: string | null
}

/** Lokales Aufgaben-Icon und Farbe setzen/entfernen. */
export interface TasksPatchTaskDisplayInput {
  accountId: string
  listId: string
  taskId: string
  iconId?: string | null
  iconColor?: string | null
}

export interface TasksListListsInput {
  accountId: string
  /** Cache ignorieren und von der Cloud neu laden (wenn online). */
  forceRefresh?: boolean
  /** Nur lokaler Cache — kein Hintergrund-Sync (z. B. nach tasks-changed-Broadcast). */
  cacheOnly?: boolean
}

export interface TasksListTasksInput {
  accountId: string
  listId: string
  /** Standard: true (wie Google API-Default). */
  showCompleted?: boolean
  showHidden?: boolean
  /** Cache ignorieren und von der Cloud neu laden (wenn online). */
  forceRefresh?: boolean
  /** Nur lokaler Cache — kein Hintergrund-Sync (z. B. nach tasks-changed-Broadcast). */
  cacheOnly?: boolean
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

/** Microsoft 365: alle **erledigten** Aufgaben in der Built-in-Liste `flaggedEmails` (Gekennzeichnete E-Mail) per Graph löschen. */
export interface TasksBulkDeleteCompletedFlaggedEmailInput {
  accountId: string
}

export interface TasksBulkDeleteCompletedFlaggedEmailResult {
  /** `false`, wenn Graph keine Liste `flaggedEmails` liefert. */
  listFound: boolean
  /** Erfolgreich von Graph entfernt und lokal bereinigt. */
  deleted: number
  /** Einzel-Löschungen mit Fehler (z. B. Throttling). */
  failed: number
}

/** Lokale Planungszeit für Cloud-Aufgaben (Kalender-Blöcke). */
export interface TaskPlannedScheduleDto {
  taskKey: string
  plannedStartIso: string
  plannedEndIso: string
}

export interface TasksListPlannedSchedulesInput {
  taskKeys: string[]
}

export interface TasksSetPlannedScheduleInput {
  taskKey: string
  plannedStartIso: string
  plannedEndIso: string
}

export interface TasksClearPlannedScheduleInput {
  taskKey: string
}

export interface MailCloudTaskLinkDto {
  messageId: number
  accountId: string
  listId: string
  taskId: string
}

export interface TasksCreateMailCloudTaskFromMessageInput {
  messageId: number
  accountId: string
  listId: string
  title: string
  notes?: string | null
  dueIso?: string | null
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

export interface GlobalSearchNoteHit {
  id: number
  kind: UserNoteKind
  title: string
  updatedAt: string
}

export interface GlobalSearchTaskHit {
  accountId: string
  listId: string
  taskId: string
  title: string
  notes: string | null
  dueIso: string | null
}

export interface GlobalSearchContactHit {
  id: number
  accountId: string
  displayName: string | null
  primaryEmail: string | null
  company: string | null
}

export interface GlobalSearchResult {
  query: string
  mails: SearchHit[]
  notes: GlobalSearchNoteHit[]
  calendarEvents: CalendarEventView[]
  tasks: GlobalSearchTaskHit[]
  contacts: GlobalSearchContactHit[]
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
 * - Volltext: `textQuery` und jede Zeile in `textQueryOrAlternatives` bilden eine eigene FTS-Suche;
 *   Treffer, wenn mindestens eine Zeile passt (ODER). Innerhalb einer Zeile: Woerter per Leerzeichen
 *   wie bei der globalen Suche (UND).
 * - Absender: `fromContains` und `fromContainsOrAlternatives` bilden eine ODER-Gruppe (eine Zeile reicht).
 * - `matchOp`: Verknuepfung der Positiv-Bedingungen aus der **Volltext-ODER-Gruppe** (falls gesetzt),
 *   der **Absender-ODER-Gruppe** (falls gesetzt) und den Feldern `unreadOnly` / `flaggedOnly` /
 *   `hasAttachmentsOnly`.
 *   Standard ist `and` (kompatibel mit aelteren Eintraegen ohne Feld).
 * - `exceptions`: Mails, die mindestens eine Ausnahme-Zeile voll erfuellen, werden ausgeschlossen:
 *   `AND NOT ( (Zeile0) OR (Zeile1) OR ... )`, innerhalb einer Zeile UND zwischen den Feldern.
 */
export interface MetaFolderCriteria {
  /** FTS-Prefixsuche (Betreff/Absender/Body), gleiche Token-Logik wie globale Suche. */
  textQuery?: string
  /**
   * Weitere Volltextzeilen; zusammen mit `textQuery` per ODER verknuepft (eine Zeile reicht).
   * Jede Zeile einzeln wie `textQuery` tokenisiert.
   */
  textQueryOrAlternatives?: string[]
  unreadOnly?: boolean
  flaggedOnly?: boolean
  hasAttachmentsOnly?: boolean
  /** Teilstring in Absender-Adresse oder -Name (case-insensitive). */
  fromContains?: string
  /**
   * Weitere Absender-Teilstrings; zusammen mit `fromContains` per ODER (eine Zeile reicht).
   */
  fromContainsOrAlternatives?: string[]
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

/** IPC `mail:clear-local-mail-cache` — lokaler Mail-Sync-Cache neu aufbauen. */
export interface ClearLocalMailCacheResult {
  /** True, wenn direkt danach ein vollständiger Erst-Sync lief (Online). */
  resynced: boolean
  folders?: number
  inboxMessages?: number
}

export interface MailBulkUnflagInput {
  accountId: string
  excludeDeletedJunk: boolean
  dryRun: boolean
}

export interface MailBulkUnflagDryRunResult {
  dryRun: true
  count: number
}

export interface MailBulkUnflagExecuteResult {
  dryRun: false
  processed: number
  failed: number
  firstError: string | null
}

export type MailBulkUnflagResult = MailBulkUnflagDryRunResult | MailBulkUnflagExecuteResult

export interface MailBulkUnflagProgressPayload {
  accountId: string
  done: number
  total: number
}

/** Nach `removeMailTodoRecordsForMessage`: lokale `todos`-Zeilen entfernt (Mail bleibt). */
export interface RemoveMailTodoRecordsResult {
  removed: number
}

/** IPC `tasks:clear-local-tasks-cache` — lokaler To-Do-/Aufgaben-Cache neu aufbauen. */
export interface ClearLocalTasksCacheResult {
  /** Online: vollständiger Listen-/Task-Sync wurde im Hintergrund angestoßen (kein Warten bis fertig). Offline: false. */
  resynced: boolean
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

/** Interner Schluessel fuer Teams-Chat-Popout-Fenster (`accountId::chatId`). */
export type TeamsChatPopoutKey = string

export interface TeamsChatPopoutOpenInput {
  accountId: string
  chatId: string
  title?: string
  /** Beim Oeffnen; ohne Angabe wird der gespeicherte Standard aus dem Renderer genutzt. */
  alwaysOnTop?: boolean
}

export interface TeamsChatPopoutRef {
  accountId: string
  chatId: string
}

export interface TeamsChatPopoutListItem extends TeamsChatPopoutRef {
  title: string
  alwaysOnTop: boolean
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
  scheduledStartIso: string | null
  scheduledEndIso: string | null
  scheduledAllDay: boolean
  sectionId: number | null
  sortOrder: number
  /** Lokales Anzeige-Icon (`calendar-event-icons`), nicht mit Mail/Kalender synchronisiert. */
  iconId?: string | null
  iconColor?: string | null
}

/** Lokales Notiz-Icon und Farbe setzen/entfernen. */
export interface UserNotePatchDisplayInput {
  noteId: number
  iconId?: string | null
  iconColor?: string | null
}

export type UserNoteAttachmentKind = 'local' | 'cloud'

export interface UserNoteAttachment {
  id: number
  noteId: number
  kind: UserNoteAttachmentKind
  name: string
  contentType: string | null
  size: number | null
  /** Absoluter Pfad unter userData (nur `local`). */
  localPath: string | null
  /** OneDrive/SharePoint-`webUrl` (nur `cloud`). */
  sourceUrl: string | null
  providerType?: ComposeReferenceAttachment['providerType'] | null
  createdAt: string
}

export interface UserNoteAttachmentAddLocalInput {
  noteId: number
  name: string
  contentType: string
  size: number
  dataBase64: string
}

export interface UserNoteAttachmentAddCloudInput {
  noteId: number
  name: string
  sourceUrl: string
  providerType?: ComposeReferenceAttachment['providerType']
}

export interface NoteSection {
  id: number
  name: string
  icon: string | null
  iconColor: string | null
  parentId: number | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface UserNoteLinkedItem {
  id: number
  kind: UserNoteKind
  title: string | null
  body: string
  scheduledStartIso: string | null
  updatedAt: string
}

export interface UserNoteScheduleInput {
  id: number
  scheduledStartIso: string
  scheduledEndIso?: string | null
  scheduledAllDay?: boolean
}

export interface UserNoteScheduleFields {
  scheduledStartIso?: string | null
  scheduledEndIso?: string | null
  scheduledAllDay?: boolean
}

export interface NoteSectionCreateInput {
  name: string
  icon?: string | null
  iconColor?: string | null
  parentId?: number | null
}

export interface NoteSectionUpdateInput {
  id: number
  name?: string
  icon?: string | null
  iconColor?: string | null
  parentId?: number | null
}

export interface NoteSectionReorderInput {
  /** Geschwister-Gruppe (null = Wurzelebene). */
  parentId?: number | null
  orderedIds: number[]
}

export interface UserNoteMoveToSectionInput {
  noteId: number
  sectionId: number | null
  sortOrder?: number
}

export interface UserNoteLinkInput {
  fromNoteId: number
  toNoteId: number
}

export type {
  NoteEntityLinkTarget,
  NoteEntityLinkTargetKind,
  NoteEntityLinkedItem,
  NoteLinkTargetCandidate,
  NoteLinksBundle
} from '@shared/note-entity-links'

export interface UserNoteLinkAddInput {
  fromNoteId: number
  target: import('@shared/note-entity-links').NoteEntityLinkTarget
}

export interface UserNoteLinkRemoveInput {
  fromNoteId: number
  linkId: number
  /** Ausgehend von dieser Notiz (Standard) oder eingehende Backlink-Verknuepfung. */
  direction?: 'outgoing' | 'incoming'
}

export interface UserNoteListInRangeFilters {
  startIso: string
  endIso: string
  kinds?: UserNoteKind[]
  limit?: number
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
  /** Erste ausgehende Verknuepfung (fuer Standard-Icon bei freien Notizen). */
  primaryLinkKind?:
    | 'note'
    | 'mail'
    | 'calendar_event'
    | 'cloud_task'
    | null
}

export interface UserNoteMailUpsertInput extends UserNoteScheduleFields {
  messageId: number
  title?: string | null
  body: string
  sectionId?: number | null
  sortOrder?: number
}

export interface UserNoteCalendarKey {
  accountId: string
  calendarSource: UserNoteCalendarSource
  calendarRemoteId: string
  eventRemoteId: string
}

export interface UserNoteCalendarUpsertInput extends UserNoteCalendarKey, UserNoteScheduleFields {
  title?: string | null
  body: string
  eventTitleSnapshot?: string | null
  eventStartIsoSnapshot?: string | null
  sectionId?: number | null
  sortOrder?: number
}

export interface UserNoteStandaloneCreateInput extends UserNoteScheduleFields {
  title?: string | null
  body?: string
  sectionId?: number | null
  sortOrder?: number
}

export interface UserNoteStandaloneUpdateInput extends UserNoteScheduleFields {
  id: number
  title?: string | null
  body?: string
  sectionId?: number | null
  sortOrder?: number
  clearSchedule?: boolean
}

export interface UserNoteListFilters {
  kinds?: UserNoteKind[]
  accountIds?: string[]
  dateFrom?: string | null
  dateTo?: string | null
  search?: string | null
  scheduledOnly?: boolean
  sectionId?: number | null
  limit?: number
}

export interface UserNoteSearchFilters {
  query: string
  kinds?: UserNoteKind[]
  limit?: number
}

export interface AppConnectivityState {
  online: boolean
}

export type NotionAuthMode = 'none' | 'oauth' | 'internal'

export interface NotionConnectionStatus {
  connected: boolean
  authMode: NotionAuthMode
  hasCredentials: boolean
  workspaceName: string | null
  workspaceIcon: string | null
  ownerName: string | null
  botId?: string
  workspaceId?: string
}

export interface NotionSearchPageHit {
  id: string
  title: string
  url: string | null
  icon: string | null
  kind: 'page' | 'database'
}

export interface NotionSavedDestination {
  id: string
  title: string
  icon: string | null
  kind: 'page' | 'database'
  addedAt: string
  lastUsedAt?: string
}

export interface NotionDestinationsConfig {
  favorites: NotionSavedDestination[]
  defaultMailPageId: string | null
  defaultCalendarPageId: string | null
  lastUsedPageId: string | null
  /** Optional: neue Seiten werden als Unterseite hier angelegt (sonst Workspace oder Standard). */
  newPageParentId: string | null
}

export interface NotionCreatePageInput {
  title: string
  parentPageId?: string | null
  kind?: 'mail' | 'calendar'
}

export interface NotionCreatePageResult {
  pageId: string
  pageUrl: string
}

export interface NotionAppendResult {
  pageId: string
  pageUrl: string
}

export interface NotionAppendMailInput {
  messageId: number
  pageId?: string | null
  webLink?: string | null
}

export interface NotionCreateMailPageInput {
  messageId: number
  title: string
  parentPageId?: string | null
  webLink?: string | null
}

export interface NotionCreateEventPageInput {
  event: CalendarEventView
  title: string
  parentPageId?: string | null
  localeCode?: 'de' | 'en'
}

/** Ergebnis des Ziel-Pickers: an bestehende Seite anhaengen oder neue Seite bereits befuellt. */
export type NotionPickResult =
  | { mode: 'append'; pageId: string }
  | { mode: 'created'; pageId: string; pageUrl: string }

export interface NotionAppendEventInput {
  event: CalendarEventView
  pageId?: string | null
  localeCode?: 'de' | 'en'
}

export { IPC } from './ipc-channels'


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

/** Server-Entwurf speichern (Ordner «Entwürfe» / Gmail-Drafts). */
export interface ComposeSaveDraftInput {
  accountId: string
  subject: string
  bodyHtml: string
  to: ComposeRecipient[]
  cc?: ComposeRecipient[]
  bcc?: ComposeRecipient[]
  attachments?: ComposeAttachment[]
  referenceAttachments?: ComposeReferenceAttachment[]
  replyToRemoteId?: string
  replyMode?: 'reply' | 'replyAll' | 'forward'
  /**
   * Bereits angelegter Server-Entwurf: PATCH/Update statt neu anlegen.
   * Microsoft: `message.id`; Gmail: Draft-Ressourcen-ID von `drafts.create`.
   */
  remoteDraftId?: string | null
  importance?: MailImportance
  isDeliveryReceiptRequested?: boolean
  isReadReceiptRequested?: boolean
}

export interface ComposeSaveDraftResult {
  remoteDraftId: string
}

/** Vorschlag fuer Empfaenger-Autocomplete (Compose). */
export interface ComposeRecipientSuggestion {
  email: string
  displayName?: string | null
  source: 'people-local' | 'mail-history' | 'graph-people' | 'graph-directory' | 'graph-group'
}

/** OneDrive/SharePoint-Explorer: Bereich und optional aktueller Ordner. */
export type ComposeDriveExplorerScope = 'recent' | 'myfiles' | 'shared' | 'sharepoint'

export interface ComposeListDriveExplorerInput {
  accountId: string
  scope: ComposeDriveExplorerScope
  /** Bei `myfiles`/`shared`: Ordner-Item-ID; `null` = Wurzel. */
  folderId?: string | null
  /** Bei `shared` (und Unterordnern): Ziel-Drive-ID aus Graph `parentReference.driveId`. */
  folderDriveId?: string | null
  /**
   * Nur `sharepoint`: Graph-Site-ID, um Dokumentbibliotheken (`/sites/{id}/drives`) zu listen.
   * Fehlt/leer = Uebersicht (verfolgte Sites + Team-Websites).
   */
  siteId?: string | null
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
  /** Nur SharePoint-Website-Zeilen: Navigation zur Bibliotheken-Liste. */
  siteId?: string | null
}

/** Brotkrumen-Pfad im OneDrive/SharePoint-Explorer (Favoriten + Navigation). */
export interface ComposeDriveExplorerNavCrumb {
  id: string | null
  name: string
  driveId?: string | null
  siteId?: string | null
}

/** Lokal gespeicherter Favorit (userData), optional mit Eintrags-Cache. */
export interface ComposeDriveExplorerFavorite {
  id: string
  accountId: string
  label: string
  scope: ComposeDriveExplorerScope
  crumbs: ComposeDriveExplorerNavCrumb[]
  savedAt: string
  /** Reihenfolge in der Sidebar (kleiner = weiter oben). Fehlt bei Altbestand -> Fallback `savedAt`. */
  sortOrder?: number
  cachedEntries?: ComposeDriveExplorerEntry[] | null
  cachedAt?: string | null
}

export interface ComposeAddDriveExplorerFavoriteInput {
  accountId: string
  scope: ComposeDriveExplorerScope
  crumbs: ComposeDriveExplorerNavCrumb[]
  label?: string | null
  cachedEntries?: ComposeDriveExplorerEntry[] | null
}

export interface ComposeRemoveDriveExplorerFavoriteInput {
  accountId: string
  id: string
}

export interface ComposeUpdateDriveExplorerFavoriteCacheInput {
  accountId: string
  id: string
  entries: ComposeDriveExplorerEntry[]
}

export interface ComposeRenameDriveExplorerFavoriteInput {
  accountId: string
  id: string
  label: string
}

export interface ComposeReorderDriveExplorerFavoritesInput {
  accountId: string
  /** IDs in gewuenschter Reihenfolge (oben -> unten), muss exakt den Favoriten dieses Kontos entsprechen. */
  orderedIds: string[]
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

/** Einheitliche Fehlermeldung bei fehlender Netzwerkverbindung (Main: `assertAppOnline()`). */
export const OFFLINE_APP_ERROR = 'Keine Netzwerkverbindung.'
