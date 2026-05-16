import { app } from 'electron'
import type {
  AppConfig,
  SettingsBackupDatabaseExtras,
  SettingsBackupPayload,
  SettingsBackupNoteSectionSnapshot,
  SettingsBackupUserNoteLinkSnapshot,
  SettingsBackupUserNoteSnapshot,
  WorkflowColumn
} from '@shared/types'
import { SETTINGS_BACKUP_FORMAT_VERSION } from '@shared/types'
import { DEFAULT_APP_CONFIG, loadConfig, saveConfig } from './config'
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
  listUserNoteLinksForSettingsBackup,
  replaceAllNoteLinksFromBackup
} from './db/user-note-entity-links-repo'
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
  const linkedToNoteIndices = Array.isArray(n.linkedToNoteIndices)
    ? n.linkedToNoteIndices.filter((x): x is number => typeof x === 'number').map((x) => Math.floor(x))
    : []
  return { scheduledStartIso, scheduledEndIso, scheduledAllDay, sectionIndex, sortOrder, linkedToNoteIndices }
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
  const userNotes = listUserNotesForSettingsBackup()
  const noteSections = listNoteSectionsForSettingsBackup()
  const userNoteLinks = listUserNoteLinksForSettingsBackup(listUserNoteIdsInBackupOrder())
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
    userNoteLinks
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
    databaseExtras: collectDatabaseExtrasForBackup()
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
  if (parsed.formatVersion !== SETTINGS_BACKUP_FORMAT_VERSION) {
    throw new Error(
      `Unbekannte Format-Version (erwartet ${String(SETTINGS_BACKUP_FORMAT_VERSION)}).`
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
      const qs = parseQuickStepsBackup(de.quickSteps)
      if (qs) databaseExtras.quickSteps = qs
    }
    if (Array.isArray(de.mailTemplates)) {
      const mt = parseTemplatesBackup(de.mailTemplates)
      if (mt) databaseExtras.mailTemplates = mt
    }
    if (Array.isArray(de.metaFolders)) {
      const mf = parseMetaFoldersBackup(de.metaFolders)
      if (mf) databaseExtras.metaFolders = mf
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
  }

  return {
    formatVersion: SETTINGS_BACKUP_FORMAT_VERSION,
    exportedAt: parsed.exportedAt,
    appVersion: parsed.appVersion,
    config,
    localStorage: parsed.localStorage,
    databaseExtras
  }
}

export async function applySettingsBackupPayload(backup: SettingsBackupPayload): Promise<void> {
  const config: AppConfig = { ...DEFAULT_APP_CONFIG, ...backup.config }
  await saveConfig(config)
  app.setLoginItemSettings({ openAtLogin: Boolean(config.launchOnLogin), path: process.execPath })

  if (backup.databaseExtras) {
    const de = backup.databaseExtras
    if (de.quickSteps != null && de.quickSteps.length > 0) {
      replaceAllQuickStepsFromBackup(de.quickSteps)
    }
    if (de.workflowBoards.length > 0) {
      replaceAllWorkflowBoardsFromBackup(de.workflowBoards)
    }
    if (de.mailTemplates != null && de.mailTemplates.length > 0) {
      replaceAllTemplatesFromBackup(de.mailTemplates)
    }
    if (de.metaFolders != null && de.metaFolders.length > 0) {
      replaceAllMetaFoldersFromBackup(de.metaFolders)
    }
    replaceAllMailRulesFromBackup(de.mailRules)
    replaceAllVipSenders(de.vipSenders)
    replaceAllAccountWorkflowMailFolders(de.workflowMailFolders)
    if (de.composeScheduledPending != null) {
      replacePendingScheduledComposeFromBackup(de.composeScheduledPending)
    }
    if (de.userNotes != null) {
      const sectionIds =
        de.noteSections != null ? replaceAllNoteSectionsFromBackup(de.noteSections) : []
      const noteIds = replaceAllUserNotesFromBackup(de.userNotes, sectionIds)
      if (de.userNoteLinks != null && de.userNoteLinks.length > 0) {
        replaceAllNoteLinksFromBackup(de.userNoteLinks, noteIds)
      } else {
        restoreUserNoteLinksFromSnapshots(de.userNotes, noteIds)
      }
    } else if (de.noteSections != null) {
      replaceAllNoteSectionsFromBackup(de.noteSections)
    }
  }
}
