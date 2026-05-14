import { app } from 'electron'
import type {
  AppConfig,
  SettingsBackupDatabaseExtras,
  SettingsBackupPayload,
  WorkflowColumn
} from '@shared/types'
import { SETTINGS_BACKUP_FORMAT_VERSION } from '@shared/types'
import { DEFAULT_APP_CONFIG, loadConfig, saveConfig } from './config'
import { listWorkflowBoards, updateWorkflowBoardColumns } from './db/workflow-repo'
import {
  listAllAccountWorkflowMailFolders,
  replaceAllAccountWorkflowMailFolders
} from './db/workflow-folders-repo'
import { listAllVipRows, replaceAllVipSenders } from './db/vip-repo'
import { listMailRules } from './db/rules-repo'
import { replaceAllMailRulesFromBackup } from './rules-service'

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
  return {
    mailRules: rules,
    workflowBoards: boards.map((b) => ({ id: b.id, columns: b.columns })),
    vipSenders,
    workflowMailFolders
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
      .filter((b): b is { id: number; columns: WorkflowColumn[] } => {
        if (!isRecord(b)) return false
        return typeof b.id === 'number' && Number.isFinite(b.id)
      })
      .map((b) => ({
        id: b.id,
        columns: parseWorkflowColumns(b.columns)
      }))

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

    databaseExtras = { mailRules, workflowBoards, vipSenders, workflowMailFolders }
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
    replaceAllMailRulesFromBackup(backup.databaseExtras.mailRules)
    replaceAllVipSenders(backup.databaseExtras.vipSenders)
    replaceAllAccountWorkflowMailFolders(backup.databaseExtras.workflowMailFolders)

    const currentBoardIds = new Set(listWorkflowBoards().map((b) => b.id))
    for (const wb of backup.databaseExtras.workflowBoards) {
      if (!currentBoardIds.has(wb.id)) continue
      updateWorkflowBoardColumns(wb.id, wb.columns)
    }
  }
}
