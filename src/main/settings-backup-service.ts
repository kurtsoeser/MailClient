import { app } from 'electron'
import type {
  AppConfig,
  SettingsBackupAccountPreferenceSnapshot,
  SettingsBackupCalendarColorOverrideSnapshot,
  SettingsBackupDatabaseExtras,
  SettingsBackupEntityLinkSnapshot,
  SettingsBackupNoteSectionSnapshot,
  SettingsBackupNotionDestinationsSnapshot,
  SettingsBackupPayload,
  SettingsBackupSecureExtras,
  SettingsBackupUserNoteLinkSnapshot,
  SettingsBackupUserNoteSnapshot,
  WorkflowColumn
} from '@shared/types'
import {
  SETTINGS_BACKUP_FORMAT_VERSION,
  SETTINGS_BACKUP_SUPPORTED_FORMAT_VERSIONS
} from '@shared/types'
import {
  accountPreferencesForBackup,
  listAccounts,
  mergeAccountPreferencesFromBackup
} from './accounts'
import { DEFAULT_APP_CONFIG, loadConfig, saveConfig } from './config'
import { broadcastAccountsChanged } from './ipc/ipc-broadcasts'
import {
  readNotionDestinations,
  writeNotionDestinations,
  type NotionDestinationsConfig
} from './notion/notion-destinations-store'
import {
  listWorkflowBoards,
  replaceAllWorkflowBoardsFromBackup
} from './db/workflow-repo'
import {
  listAllAccountWorkflowMailFolders,
  replaceAllAccountWorkflowMailFolders
} from './db/workflow-folders-repo'
import { listAllVipRows, replaceAllVipSenders } from './db/vip-repo'
import { listMailRules } from './db/rules-repo'
import { replaceAllMailRulesFromBackup } from './rules-service'
import { listAllQuickStepsForBackup, replaceAllQuickStepsFromBackup } from './db/quicksteps-repo'
import {
  listAllTemplatesForBackup,
  replaceAllTemplatesFromBackup
} from './db/templates-repo'
import {
  listAllMetaFoldersRawForBackup,
  replaceAllMetaFoldersFromBackup
} from './db/meta-folders-repo'
import {
  listPendingScheduledComposeForBackup,
  replacePendingScheduledComposeFromBackup
} from './db/compose-scheduled-repo'
import {
  listNoteSectionsForSettingsBackup,
  replaceAllNoteSectionsFromBackup
} from './db/note-sections-repo'
import {
  listEntityLinksForSettingsBackup,
  listUserNoteLinksForSettingsBackup,
  replaceAllEntityLinksFromBackup,
  replaceAllNoteLinksFromBackup
} from './db/user-note-entity-links-repo'
import {
  applyCalendarColorOverridesFromBackup,
  listCalendarColorOverridesForSettingsBackup
} from './db/calendar-folders-repo'
import {
  listUserNoteIdsInBackupOrder,
  listUserNotesForSettingsBackup,
  replaceAllUserNotesFromBackup,
  restoreUserNoteLinksFromSnapshots
} from './db/user-notes-repo'

function isRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v)
}

function isStringRecord(v: unknown): v is Record<string, string> {
  if (!isRecord(v)) return false
  for (const k of Object.keys(v)) {
    if (typeof v[k] !== 'string') return false
  }
  return true
}

function parseWorkflowColumns(raw: unknown): WorkflowColumn[] {
  if (!Array.isArray(raw)) return []
  const out: WorkflowColumn[] = []
  for (const c of raw) {
    if (!isRecord(c)) continue
    const id = typeof c.id === 'string' ? c.id : ''
    const title = typeof c.title === 'string' ? c.title : ''
    const quickStepId =
      typeof c.quickStepId === 'number' && Number.isFinite(c.quickStepId) ? c.quickStepId : null
    if (!id || !title) continue
    const col: WorkflowColumn = { id, title, quickStepId }
    const td = c.todoDueKind
    if (
      td === 'today' ||
      td === 'tomorrow' ||
      td === 'this_week' ||
      td === 'later' ||
      td === 'done' ||
      td === 'overdue'
    ) {
      col.todoDueKind = td
    }
    out.push(col)
  }
  return out
}

function parseQuickStepsBackup(raw: unknown[]): SettingsBackupDatabaseExtras['quickSteps'] {
  const out: NonNullable<SettingsBackupDatabaseExtras['quickSteps']> = []
  for (const q of raw) {
    if (!isRecord(q)) continue
    if (typeof q.id !== 'number' || !Number.isFinite(q.id)) continue
    if (typeof q.name !== 'string' || !q.name.trim()) continue
    if (typeof q.actionsJson !== 'string') continue
    const icon = q.icon == null ? null : typeof q.icon === 'string' ? q.icon : null
    const shortcut = q.shortcut == null ? null : typeof q.shortcut === 'string' ? q.shortcut : null
    if (typeof q.sortOrder !== 'number' || !Number.isFinite(q.sortOrder)) continue
    if (typeof q.enabled !== 'boolean') continue
    if (typeof q.createdAt !== 'string') continue
    if (typeof q.updatedAt !== 'string') continue
    out.push({
      id: q.id,
      name: q.name,
      icon,
      shortcut,
      actionsJson: q.actionsJson,
      sortOrder: q.sortOrder,
      enabled: q.enabled,
      createdAt: q.createdAt,
      updatedAt: q.updatedAt
    })
  }
  return out.length > 0 ? out : undefined
}

function parseTemplatesBackup(raw: unknown[]): SettingsBackupDatabaseExtras['mailTemplates'] {
  const out: NonNullable<SettingsBackupDatabaseExtras['mailTemplates']> = []
  for (const t of raw) {
    if (!isRecord(t)) continue
    if (typeof t.id !== 'number' || !Number.isFinite(t.id)) continue
    if (typeof t.name !== 'string' || !t.name.trim()) continue
    if (typeof t.bodyHtml !== 'string') continue
    const bodyText = t.bodyText == null ? null : typeof t.bodyText === 'string' ? t.bodyText : null
    const variablesJson =
      t.variablesJson == null ? null : typeof t.variablesJson === 'string' ? t.variablesJson : null
    const shortcut = t.shortcut == null ? null : typeof t.shortcut === 'string' ? t.shortcut : null
    if (typeof t.sortOrder !== 'number' || !Number.isFinite(t.sortOrder)) continue
    if (typeof t.createdAt !== 'string') continue
    if (typeof t.updatedAt !== 'string') continue
    out.push({
      id: t.id,
      name: t.name,
      bodyHtml: t.bodyHtml,
      bodyText,
      variablesJson,
      shortcut,
      sortOrder: t.sortOrder,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt
    })
  }
  return out.length > 0 ? out : undefined
}

function parseMetaFoldersBackup(raw: unknown[]): SettingsBackupDatabaseExtras['metaFolders'] {
  const out: NonNullable<SettingsBackupDatabaseExtras['metaFolders']> = []
  for (const m of raw) {
    if (!isRecord(m)) continue
    if (typeof m.id !== 'number' || !Number.isFinite(m.id)) continue
    if (typeof m.name !== 'string' || !m.name.trim()) continue
    if (typeof m.sortOrder !== 'number' || !Number.isFinite(m.sortOrder)) continue
    if (typeof m.criteriaJson !== 'string') continue
    if (typeof m.createdAt !== 'string') continue
    if (typeof m.updatedAt !== 'string') continue
    out.push({
      id: m.id,
      name: m.name,
      sortOrder: m.sortOrder,
      criteriaJson: m.criteriaJson,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt
    })
  }
  return out.length > 0 ? out : undefined
}

function parseComposeScheduledBackup(
  raw: unknown[]
): SettingsBackupDatabaseExtras['composeScheduledPending'] {
  const out: NonNullable<SettingsBackupDatabaseExtras['composeScheduledPending']> = []
  for (const c of raw) {
    if (!isRecord(c)) continue
    if (typeof c.payloadJson !== 'string' || c.payloadJson.length < 2) continue
    if (typeof c.sendAtIso !== 'string' || !c.sendAtIso.trim()) continue
    out.push({ payloadJson: c.payloadJson, sendAtIso: c.sendAtIso.trim() })
  }
  return out
}

function parseNoteSectionsBackup(raw: unknown[]): SettingsBackupNoteSectionSnapshot[] {
  const out: SettingsBackupNoteSectionSnapshot[] = []
  for (const s of raw) {
    if (!isRecord(s)) continue
    if (typeof s.name !== 'string' || !s.name.trim()) continue
    if (typeof s.createdAt !== 'string' || typeof s.updatedAt !== 'string') continue
    const parentIndex =
      s.parentIndex == null
        ? null
        : typeof s.parentIndex === 'number'
          ? Math.floor(s.parentIndex)
          : null
    out.push({
      name: s.name.trim(),
      icon: s.icon == null ? null : typeof s.icon === 'string' ? s.icon : null,
      iconColor: s.iconColor == null ? null : typeof s.iconColor === 'string' ? s.iconColor : null,
      sortOrder: typeof s.sortOrder === 'number' ? s.sortOrder : 0,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      parentIndex
    })
  }
  return out
}

function parseUserNoteLinksBackup(raw: unknown[]): SettingsBackupUserNoteLinkSnapshot[] {
  const out: SettingsBackupUserNoteLinkSnapshot[] = []
  for (const l of raw) {
    if (!isRecord(l)) continue
    if (typeof l.fromNoteIndex !== 'number' || typeof l.toNoteIndex !== 'number') continue
    if (typeof l.createdAt !== 'string') continue
    out.push({
      fromNoteIndex: Math.floor(l.fromNoteIndex),
      toNoteIndex: Math.floor(l.toNoteIndex),
      createdAt: l.createdAt
    })
  }
  return out
}

function parseScheduleExtras(n: Record<string, unknown>): {
  scheduledStartIso?: string | null
  scheduledEndIso?: string | null
  scheduledAllDay?: boolean
  sectionIndex?: number | null
  sortOrder?: number
  iconId?: string | null
  iconColor?: string | null
  linkedToNoteIndices?: number[]
} {
  const scheduledStartIso =
    n.scheduledStartIso == null ? null : typeof n.scheduledStartIso === 'string' ? n.scheduledStartIso : null
  const scheduledEndIso =
    n.scheduledEndIso == null ? null : typeof n.scheduledEndIso === 'string' ? n.scheduledEndIso : null
  const scheduledAllDay = n.scheduledAllDay === true
  const sectionIndex =
    n.sectionIndex == null ? null : typeof n.sectionIndex === 'number' ? Math.floor(n.sectionIndex) : null
  const sortOrder = typeof n.sortOrder === 'number' ? Math.floor(n.sortOrder) : 0
  const iconId = n.iconId == null ? null : typeof n.iconId === 'string' ? n.iconId : null
  const iconColor = n.iconColor == null ? null : typeof n.iconColor === 'string' ? n.iconColor : null
  const linkedToNoteIndices = Array.isArray(n.linkedToNoteIndices)
    ? n.linkedToNoteIndices.filter((x): x is number => typeof x === 'number').map((x) => Math.floor(x))
    : []
  return {
    scheduledStartIso,
    scheduledEndIso,
    scheduledAllDay,
    sectionIndex,
    sortOrder,
    iconId,
    iconColor,
    linkedToNoteIndices
  }
}

function parseEntityLinksBackup(raw: unknown[]): SettingsBackupEntityLinkSnapshot[] {
  const out: SettingsBackupEntityLinkSnapshot[] = []
  for (const l of raw) {
    if (!isRecord(l)) continue
    if (typeof l.fromNoteIndex !== 'number' || typeof l.createdAt !== 'string') continue
    const targetKind = l.targetKind
    if (
      targetKind !== 'note' &&
      targetKind !== 'mail' &&
      targetKind !== 'calendar_event' &&
      targetKind !== 'cloud_task'
    ) {
      continue
    }
    const base: SettingsBackupEntityLinkSnapshot = {
      fromNoteIndex: Math.floor(l.fromNoteIndex),
      targetKind,
      createdAt: l.createdAt
    }
    if (targetKind === 'note') {
      if (typeof l.toNoteIndex !== 'number') continue
      out.push({ ...base, toNoteIndex: Math.floor(l.toNoteIndex) })
    } else if (targetKind === 'mail') {
      if (typeof l.mailMessageId !== 'number') continue
      out.push({ ...base, mailMessageId: Math.floor(l.mailMessageId) })
    } else if (targetKind === 'calendar_event') {
      if (typeof l.calendarAccountId !== 'string' || typeof l.calendarGraphEventId !== 'string') {
        continue
      }
      out.push({
        ...base,
        calendarAccountId: l.calendarAccountId,
        calendarGraphEventId: l.calendarGraphEventId
      })
    } else {
      if (
        typeof l.taskAccountId !== 'string' ||
        typeof l.taskListId !== 'string' ||
        typeof l.taskId !== 'string'
      ) {
        continue
      }
      out.push({
        ...base,
        taskAccountId: l.taskAccountId,
        taskListId: l.taskListId,
        taskId: l.taskId
      })
    }
  }
  return out
}

function parseAccountPreferencesBackup(raw: unknown[]): SettingsBackupAccountPreferenceSnapshot[] {
  const out: SettingsBackupAccountPreferenceSnapshot[] = []
  for (const row of raw) {
    if (!isRecord(row)) continue
    if (typeof row.accountId !== 'string' || !row.accountId.trim()) continue
    const pref: SettingsBackupAccountPreferenceSnapshot = { accountId: row.accountId.trim() }
    if (typeof row.color === 'string' && row.color.trim()) {
      pref.color = row.color.trim()
    }
    if ('calendarLoadAheadDays' in row) {
      pref.calendarLoadAheadDays =
        row.calendarLoadAheadDays == null
          ? null
          : typeof row.calendarLoadAheadDays === 'number'
            ? Math.floor(row.calendarLoadAheadDays)
            : null
    }
    if (Array.isArray(row.signatureTemplates)) {
      pref.signatureTemplates = row.signatureTemplates as SettingsBackupAccountPreferenceSnapshot['signatureTemplates']
    }
    if ('defaultSignatureTemplateId' in row) {
      pref.defaultSignatureTemplateId =
        row.defaultSignatureTemplateId == null
          ? null
          : typeof row.defaultSignatureTemplateId === 'string'
            ? row.defaultSignatureTemplateId
            : null
    }
    out.push(pref)
  }
  return out
}

function parseNotionDestinationsBackup(raw: unknown): SettingsBackupNotionDestinationsSnapshot | undefined {
  if (!isRecord(raw)) return undefined
  const favoritesRaw = Array.isArray(raw.favorites) ? raw.favorites : []
  const favorites: SettingsBackupNotionDestinationsSnapshot['favorites'] = []
  for (const f of favoritesRaw) {
    if (!isRecord(f)) continue
    if (typeof f.id !== 'string' || typeof f.title !== 'string' || typeof f.addedAt !== 'string') {
      continue
    }
    const kind = f.kind === 'database' ? 'database' : f.kind === 'page' ? 'page' : null
    if (!kind) continue
    favorites.push({
      id: f.id,
      title: f.title,
      icon: f.icon == null ? null : typeof f.icon === 'string' ? f.icon : null,
      kind,
      addedAt: f.addedAt,
      ...(typeof f.lastUsedAt === 'string' ? { lastUsedAt: f.lastUsedAt } : {})
    })
  }
  return {
    favorites,
    defaultMailPageId:
      raw.defaultMailPageId == null
        ? null
        : typeof raw.defaultMailPageId === 'string'
          ? raw.defaultMailPageId
          : null,
    defaultCalendarPageId:
      raw.defaultCalendarPageId == null
        ? null
        : typeof raw.defaultCalendarPageId === 'string'
          ? raw.defaultCalendarPageId
          : null,
    lastUsedPageId:
      raw.lastUsedPageId == null
        ? null
        : typeof raw.lastUsedPageId === 'string'
          ? raw.lastUsedPageId
          : null,
    newPageParentId:
      raw.newPageParentId == null
        ? null
        : typeof raw.newPageParentId === 'string'
          ? raw.newPageParentId
          : null
  }
}

function notionDestinationsToBackup(
  cfg: NotionDestinationsConfig
): SettingsBackupNotionDestinationsSnapshot {
  return {
    favorites: cfg.favorites.map((f) => ({
      id: f.id,
      title: f.title,
      icon: f.icon,
      kind: f.kind,
      addedAt: f.addedAt,
      ...(f.lastUsedAt ? { lastUsedAt: f.lastUsedAt } : {})
    })),
    defaultMailPageId: cfg.defaultMailPageId,
    defaultCalendarPageId: cfg.defaultCalendarPageId,
    lastUsedPageId: cfg.lastUsedPageId,
    newPageParentId: cfg.newPageParentId
  }
}

function notionDestinationsFromBackup(
  snap: SettingsBackupNotionDestinationsSnapshot
): NotionDestinationsConfig {
  return {
    favorites: snap.favorites.map((f) => ({
      id: f.id,
      title: f.title,
      icon: f.icon,
      kind: f.kind,
      addedAt: f.addedAt,
      ...(f.lastUsedAt ? { lastUsedAt: f.lastUsedAt } : {})
    })),
    defaultMailPageId: snap.defaultMailPageId,
    defaultCalendarPageId: snap.defaultCalendarPageId,
    lastUsedPageId: snap.lastUsedPageId,
    newPageParentId: snap.newPageParentId
  }
}

function parseUserNotesBackup(raw: unknown[]): SettingsBackupUserNoteSnapshot[] {
  const out: SettingsBackupUserNoteSnapshot[] = []
  for (const n of raw) {
    if (!isRecord(n)) continue
    const kind = n.kind
    if (kind !== 'mail' && kind !== 'calendar' && kind !== 'standalone') continue
    if (typeof n.body !== 'string') continue
    if (typeof n.createdAt !== 'string' || typeof n.updatedAt !== 'string') continue
    const title = n.title == null ? null : typeof n.title === 'string' ? n.title : null
    const scheduleExtras = parseScheduleExtras(n)
    if (kind === 'mail') {
      const mailAccountId =
        n.mailAccountId == null ? null : typeof n.mailAccountId === 'string' ? n.mailAccountId : null
      const mailRemoteId =
        n.mailRemoteId == null ? null : typeof n.mailRemoteId === 'string' ? n.mailRemoteId : null
      out.push({
        kind: 'mail',
        mailAccountId,
        mailRemoteId,
        title,
        body: n.body,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
        ...scheduleExtras
      })
    } else if (kind === 'calendar') {
      const accountId =
        n.accountId == null ? null : typeof n.accountId === 'string' ? n.accountId : null
      const calendarSource = n.calendarSource
      const calendarRemoteId =
        n.calendarRemoteId == null
          ? null
          : typeof n.calendarRemoteId === 'string'
            ? n.calendarRemoteId
            : null
      const eventRemoteId =
        n.eventRemoteId == null ? null : typeof n.eventRemoteId === 'string' ? n.eventRemoteId : null
      const eventTitleSnapshot =
        n.eventTitleSnapshot == null
          ? null
          : typeof n.eventTitleSnapshot === 'string'
            ? n.eventTitleSnapshot
            : null
      const eventStartIsoSnapshot =
        n.eventStartIsoSnapshot == null
          ? null
          : typeof n.eventStartIsoSnapshot === 'string'
            ? n.eventStartIsoSnapshot
            : null
      out.push({
        kind: 'calendar',
        accountId,
        calendarSource: calendarSource === 'microsoft' || calendarSource === 'google' ? calendarSource : null,
        calendarRemoteId,
        eventRemoteId,
        title,
        body: n.body,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
        eventTitleSnapshot,
        eventStartIsoSnapshot,
        ...scheduleExtras
      })
    } else {
      out.push({
        kind: 'standalone',
        title,
        body: n.body,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
        ...scheduleExtras
      })
    }
  }
  return out
}

export function collectDatabaseExtrasForBackup(): SettingsBackupDatabaseExtras {
  const boards = listWorkflowBoards()
  const rules = listMailRules().map((r) => ({
    name: r.name,
    enabled: r.enabled,
    trigger: r.trigger,
    sortOrder: r.sortOrder,
    definition: r.definition
  }))
  const vipSenders = listAllVipRows().map((row) => ({
    accountId: row.accountId,
    emailLower: row.emailLower
  }))
  const workflowMailFolders = listAllAccountWorkflowMailFolders().map((row) => ({
    accountId: row.accountId,
    wipFolderRemoteId: row.wipFolderRemoteId,
    doneFolderRemoteId: row.doneFolderRemoteId
  }))
  const quickSteps = listAllQuickStepsForBackup().map((r) => ({
    id: r.id,
    name: r.name,
    icon: r.icon,
    shortcut: r.shortcut,
    actionsJson: r.actionsJson,
    sortOrder: r.sortOrder,
    enabled: r.enabled,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt
  }))
  const mailTemplates = listAllTemplatesForBackup().map((r) => ({
    id: r.id,
    name: r.name,
    bodyHtml: r.bodyHtml,
    bodyText: r.bodyText,
    variablesJson: r.variablesJson,
    shortcut: r.shortcut,
    sortOrder: r.sortOrder,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt
  }))
  const metaFolders = listAllMetaFoldersRawForBackup().map((r) => ({
    id: r.id,
    name: r.name,
    sortOrder: r.sortOrder,
    criteriaJson: r.criteriaJson,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt
  }))
  const composeScheduledPending = listPendingScheduledComposeForBackup()
  const noteIdsInOrder = listUserNoteIdsInBackupOrder()
  const userNotes = listUserNotesForSettingsBackup()
  const noteSections = listNoteSectionsForSettingsBackup()
  const userNoteLinks = listUserNoteLinksForSettingsBackup(noteIdsInOrder)
  const entityLinks = listEntityLinksForSettingsBackup(noteIdsInOrder)
  const calendarColorOverrides = listCalendarColorOverridesForSettingsBackup()
  return {
    mailRules: rules,
    workflowBoards: boards.map((b) => ({
      id: b.id,
      name: b.name,
      sortOrder: b.sortOrder,
      columns: b.columns
    })),
    vipSenders,
    workflowMailFolders,
    quickSteps,
    mailTemplates,
    metaFolders,
    composeScheduledPending,
    userNotes,
    noteSections,
    userNoteLinks,
    entityLinks,
    calendarColorOverrides
  }
}

export async function collectSecureExtrasForBackup(): Promise<SettingsBackupSecureExtras> {
  const accounts = await listAccounts()
  const notion = await readNotionDestinations()
  return {
    accountPreferences: accountPreferencesForBackup(accounts),
    accountOrder: accounts.map((a) => a.id),
    notionDestinations: notionDestinationsToBackup(notion)
  }
}

export async function buildSettingsBackupPayload(
  localStorage: Record<string, string>
): Promise<SettingsBackupPayload> {
  return {
    formatVersion: SETTINGS_BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: app.getVersion(),
    config: await loadConfig(),
    localStorage: { ...localStorage },
    databaseExtras: collectDatabaseExtrasForBackup(),
    secureExtras: await collectSecureExtrasForBackup()
  }
}
export function parseSettingsBackupJson(raw: string): SettingsBackupPayload {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    throw new Error('Datei ist kein gueltiges JSON.')
  }
  if (!isRecord(parsed)) {
    throw new Error('Ungueltiges Sicherungsformat.')
  }
  const formatVersion = parsed.formatVersion
  if (
    typeof formatVersion !== 'number' ||
    !(SETTINGS_BACKUP_SUPPORTED_FORMAT_VERSIONS as readonly number[]).includes(formatVersion)
  ) {
    throw new Error(
      `Unbekannte Format-Version (unterstuetzt: ${SETTINGS_BACKUP_SUPPORTED_FORMAT_VERSIONS.join(', ')}).`
    )
  }
  if (typeof parsed.exportedAt !== 'string' || typeof parsed.appVersion !== 'string') {
    throw new Error('Sicherungsdatei ist unvollstaendig.')
  }
  if (!isRecord(parsed.config)) {
    throw new Error('Konfiguration in der Sicherung fehlt oder ist ungueltig.')
  }
  if (!isStringRecord(parsed.localStorage)) {
    throw new Error('localStorage-Abschnitt fehlt oder ist ungueltig.')
  }

  const config: AppConfig = {
    ...DEFAULT_APP_CONFIG,
    ...(parsed.config as Partial<AppConfig>)
  }

  let databaseExtras: SettingsBackupDatabaseExtras | undefined
  if (parsed.databaseExtras != null && isRecord(parsed.databaseExtras)) {
    const de = parsed.databaseExtras
    const mailRulesRaw = Array.isArray(de.mailRules) ? de.mailRules : []
    const mailRules = mailRulesRaw.filter((r): r is SettingsBackupDatabaseExtras['mailRules'][0] => {
      if (!isRecord(r)) return false
      if (typeof r.name !== 'string') return false
      if (typeof r.enabled !== 'boolean') return false
      if (r.trigger !== 'on_receive' && r.trigger !== 'manual') return false
      if (typeof r.sortOrder !== 'number' || !Number.isFinite(r.sortOrder)) return false
      return r.definition != null && typeof r.definition === 'object'
    }) as SettingsBackupDatabaseExtras['mailRules']

    const boardsRaw = Array.isArray(de.workflowBoards) ? de.workflowBoards : []
    const workflowBoards = boardsRaw
      .filter((b): b is Record<string, unknown> & { id: number } => {
        if (!isRecord(b)) return false
        return typeof b.id === 'number' && Number.isFinite(b.id)
      })
      .map((b) => {
        const name = typeof b.name === 'string' ? b.name : undefined
        const sortOrder =
          typeof b.sortOrder === 'number' && Number.isFinite(b.sortOrder) ? b.sortOrder : undefined
        return {
          id: b.id,
          ...(name !== undefined ? { name } : {}),
          ...(sortOrder !== undefined ? { sortOrder } : {}),
          columns: parseWorkflowColumns(b.columns)
        }
      })

    const vipRaw = Array.isArray(de.vipSenders) ? de.vipSenders : []
    const vipSenders = vipRaw
      .filter((v): v is { accountId: string; emailLower: string } => {
        if (!isRecord(v)) return false
        return typeof v.accountId === 'string' && typeof v.emailLower === 'string'
      })
      .map((v) => ({
        accountId: v.accountId.trim(),
        emailLower: v.emailLower.trim().toLowerCase()
      }))

    const wfRaw = Array.isArray(de.workflowMailFolders) ? de.workflowMailFolders : []
    const workflowMailFolders = wfRaw
      .filter((w): w is SettingsBackupDatabaseExtras['workflowMailFolders'][0] => {
        if (!isRecord(w)) return false
        if (typeof w.accountId !== 'string') return false
        const wip = w.wipFolderRemoteId
        const done = w.doneFolderRemoteId
        if (wip != null && typeof wip !== 'string') return false
        if (done != null && typeof done !== 'string') return false
        return true
      })
      .map((w) => ({
        accountId: w.accountId.trim(),
        wipFolderRemoteId:
          w.wipFolderRemoteId == null || w.wipFolderRemoteId === ''
            ? null
            : String(w.wipFolderRemoteId),
        doneFolderRemoteId:
          w.doneFolderRemoteId == null || w.doneFolderRemoteId === ''
            ? null
            : String(w.doneFolderRemoteId)
      }))

    databaseExtras = {
      mailRules,
      workflowBoards,
      vipSenders,
      workflowMailFolders
    }
    if (Array.isArray(de.quickSteps)) {
      databaseExtras.quickSteps = parseQuickStepsBackup(de.quickSteps) ?? []
    }
    if (Array.isArray(de.mailTemplates)) {
      databaseExtras.mailTemplates = parseTemplatesBackup(de.mailTemplates) ?? []
    }
    if (Array.isArray(de.metaFolders)) {
      databaseExtras.metaFolders = parseMetaFoldersBackup(de.metaFolders) ?? []
    }
    if ('composeScheduledPending' in de && Array.isArray(de.composeScheduledPending)) {
      databaseExtras.composeScheduledPending = parseComposeScheduledBackup(de.composeScheduledPending)
    }
    if ('userNotes' in de && Array.isArray(de.userNotes)) {
      databaseExtras.userNotes = parseUserNotesBackup(de.userNotes)
    }
    if ('noteSections' in de && Array.isArray(de.noteSections)) {
      databaseExtras.noteSections = parseNoteSectionsBackup(de.noteSections)
    }
    if ('userNoteLinks' in de && Array.isArray(de.userNoteLinks)) {
      databaseExtras.userNoteLinks = parseUserNoteLinksBackup(de.userNoteLinks)
    }
    if ('entityLinks' in de && Array.isArray(de.entityLinks)) {
      databaseExtras.entityLinks = parseEntityLinksBackup(de.entityLinks)
    }
    if ('calendarColorOverrides' in de && Array.isArray(de.calendarColorOverrides)) {
      databaseExtras.calendarColorOverrides = de.calendarColorOverrides
        .filter((row): row is SettingsBackupCalendarColorOverrideSnapshot => {
          if (!isRecord(row)) return false
          return (
            typeof row.accountId === 'string' &&
            typeof row.calendarId === 'string' &&
            (row.displayColorOverrideHex == null || typeof row.displayColorOverrideHex === 'string')
          )
        })
        .map((row) => ({
          accountId: row.accountId.trim(),
          calendarId: row.calendarId.trim(),
          displayColorOverrideHex:
            row.displayColorOverrideHex == null || row.displayColorOverrideHex === ''
              ? null
              : String(row.displayColorOverrideHex)
        }))
    }
  }

  let secureExtras: SettingsBackupSecureExtras | undefined
  if (parsed.secureExtras != null && isRecord(parsed.secureExtras)) {
    const se = parsed.secureExtras
    secureExtras = {}
    if (Array.isArray(se.accountPreferences)) {
      secureExtras.accountPreferences = parseAccountPreferencesBackup(se.accountPreferences)
    }
    if (Array.isArray(se.accountOrder)) {
      secureExtras.accountOrder = se.accountOrder.filter((id): id is string => typeof id === 'string')
    }
    if (se.notionDestinations != null) {
      const notion = parseNotionDestinationsBackup(se.notionDestinations)
      if (notion) secureExtras.notionDestinations = notion
    }
  }

  return {
    formatVersion: formatVersion as SettingsBackupPayload['formatVersion'],
    exportedAt: parsed.exportedAt,
    appVersion: parsed.appVersion,
    config,
    localStorage: parsed.localStorage,
    databaseExtras,
    secureExtras
  }
}

export async function applySettingsBackupPayload(backup: SettingsBackupPayload): Promise<void> {
  const config: AppConfig = { ...DEFAULT_APP_CONFIG, ...backup.config }
  await saveConfig(config)
  app.setLoginItemSettings({ openAtLogin: Boolean(config.launchOnLogin), path: process.execPath })

  if (backup.secureExtras) {
    const se = backup.secureExtras
    if (se.accountPreferences != null && se.accountPreferences.length > 0) {
      const next = await mergeAccountPreferencesFromBackup(
        se.accountPreferences,
        se.accountOrder
      )
      broadcastAccountsChanged(next)
    }
    if (se.notionDestinations != null) {
      await writeNotionDestinations(notionDestinationsFromBackup(se.notionDestinations))
    }
  }

  if (backup.databaseExtras) {
    const de = backup.databaseExtras
    if (de.quickSteps != null) {
      replaceAllQuickStepsFromBackup(de.quickSteps)
    }
    if (de.workflowBoards != null) {
      replaceAllWorkflowBoardsFromBackup(de.workflowBoards)
    }
    if (de.mailTemplates != null) {
      replaceAllTemplatesFromBackup(de.mailTemplates)
    }
    if (de.metaFolders != null) {
      replaceAllMetaFoldersFromBackup(de.metaFolders)
    }
    replaceAllMailRulesFromBackup(de.mailRules)
    replaceAllVipSenders(de.vipSenders)
    replaceAllAccountWorkflowMailFolders(de.workflowMailFolders)
    if (de.composeScheduledPending != null) {
      replacePendingScheduledComposeFromBackup(de.composeScheduledPending)
    }
    if (de.calendarColorOverrides != null) {
      applyCalendarColorOverridesFromBackup(de.calendarColorOverrides)
    }
    if (de.userNotes != null) {
      const sectionIds =
        de.noteSections != null ? replaceAllNoteSectionsFromBackup(de.noteSections) : []
      const noteIds = replaceAllUserNotesFromBackup(de.userNotes, sectionIds)
      if (de.entityLinks != null && de.entityLinks.length > 0) {
        replaceAllEntityLinksFromBackup(de.entityLinks, noteIds)
      } else if (de.userNoteLinks != null && de.userNoteLinks.length > 0) {
        replaceAllNoteLinksFromBackup(de.userNoteLinks, noteIds)
      } else {
        restoreUserNoteLinksFromSnapshots(de.userNotes, noteIds)
      }
    } else if (de.noteSections != null) {
      replaceAllNoteSectionsFromBackup(de.noteSections)
    }
  }
}
