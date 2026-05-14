import type { EnsureWorkflowMailFoldersResult, WorkflowMailFolderUiState } from '@shared/types'
import { listAccounts } from './accounts'
import { getMessageById } from './db/messages-repo'
import {
  findFolderById,
  findFolderByRemoteId,
  findFolderByWellKnown,
  insertFolderLocal,
  setFolderWellKnownLocal
} from './db/folders-repo'
import {
  deleteAccountWorkflowMailFolders,
  getAccountWorkflowMailFolders,
  upsertAccountWorkflowMailFolders
} from './db/workflow-folders-repo'
import { applyMoveMessageToFolder } from './message-graph-actions'
import { createFolder as graphCreateFolder } from './graph/folder-actions'
import { findOrCreateGmailUserLabelByDisplayName } from './google/gmail-actions'
import { syncGoogleFolders } from './google/gmail-sync'
import { withTimeout } from './async-timeout'

/** Anzeigenamen wie beim Snooze-Ordner; erscheinen auch in Outlook im Web. */
const WIP_FOLDER_DISPLAY = 'MailClient – In Bearbeitung'
const DONE_FOLDER_DISPLAY = 'MailClient – Erledigt'

const WELL_KNOWN_WIP = 'mailclient_wip'
const WELL_KNOWN_DONE = 'mailclient_done'

/** Pro Graph-Ordneranlage; zwei Aufrufe hintereinander → ausreichend Puffer. */
const ENSURE_WORKFLOW_GRAPH_TIMEOUT_MS = 90_000

/**
 * Legt die beiden Triage-Ordner per Microsoft Graph an (falls noch nicht vorhanden),
 * traegt sie lokal mit well_known ein und speichert die Remote-IDs in
 * `account_workflow_mail_folders`.
 */
export async function ensureMicrosoftWorkflowMailFolders(
  accountId: string
): Promise<EnsureWorkflowMailFoldersResult> {
  return withTimeout(
    ensureMicrosoftWorkflowMailFoldersCore(accountId),
    ENSURE_WORKFLOW_GRAPH_TIMEOUT_MS * 2 + 15_000,
    'Triage-Ordner anlegen'
  )
}

async function ensureMicrosoftWorkflowMailFoldersCore(
  accountId: string
): Promise<EnsureWorkflowMailFoldersResult> {
  let wip = findFolderByWellKnown(accountId, WELL_KNOWN_WIP)
  let done = findFolderByWellKnown(accountId, WELL_KNOWN_DONE)

  if (!wip) {
    const created = await withTimeout(
      graphCreateFolder(accountId, WIP_FOLDER_DISPLAY, null),
      ENSURE_WORKFLOW_GRAPH_TIMEOUT_MS,
      'Ordner «In Bearbeitung» (Graph)'
    )
    const localId = insertFolderLocal({
      accountId,
      remoteId: created.id,
      name: created.displayName,
      parentRemoteId: created.parentFolderId ?? null,
      wellKnown: WELL_KNOWN_WIP,
      unreadCount: created.unreadItemCount ?? 0,
      totalCount: created.totalItemCount ?? 0
    })
    setFolderWellKnownLocal(localId, WELL_KNOWN_WIP)
    wip = findFolderById(localId)
  }
  if (!done) {
    const created = await withTimeout(
      graphCreateFolder(accountId, DONE_FOLDER_DISPLAY, null),
      ENSURE_WORKFLOW_GRAPH_TIMEOUT_MS,
      'Ordner «Erledigt» (Graph)'
    )
    const localId = insertFolderLocal({
      accountId,
      remoteId: created.id,
      name: created.displayName,
      parentRemoteId: created.parentFolderId ?? null,
      wellKnown: WELL_KNOWN_DONE,
      unreadCount: created.unreadItemCount ?? 0,
      totalCount: created.totalItemCount ?? 0
    })
    setFolderWellKnownLocal(localId, WELL_KNOWN_DONE)
    done = findFolderById(localId)
  }

  if (!wip || !done) {
    throw new Error('Triage-Ordner konnten nicht angelegt oder gelesen werden.')
  }

  upsertAccountWorkflowMailFolders(accountId, wip.remoteId, done.remoteId)

  return {
    wipFolderId: wip.id,
    doneFolderId: done.id,
    wipFolderRemoteId: wip.remoteId,
    doneFolderRemoteId: done.remoteId
  }
}

/**
 * Legt die beiden Triage-Labels per Gmail API an (falls noch nicht vorhanden),
 * traegt sie lokal mit well_known ein und speichert die Remote-IDs in
 * `account_workflow_mail_folders`.
 */
export async function ensureGoogleWorkflowMailFolders(
  accountId: string
): Promise<EnsureWorkflowMailFoldersResult> {
  return withTimeout(
    ensureGoogleWorkflowMailFoldersCore(accountId),
    ENSURE_WORKFLOW_GRAPH_TIMEOUT_MS * 2 + 15_000,
    'Triage-Ordner anlegen (Gmail)'
  )
}

async function ensureGoogleWorkflowMailFoldersCore(
  accountId: string
): Promise<EnsureWorkflowMailFoldersResult> {
  let wip = findFolderByWellKnown(accountId, WELL_KNOWN_WIP)
  if (!wip) {
    const labelId = await findOrCreateGmailUserLabelByDisplayName(accountId, WIP_FOLDER_DISPLAY)
    await syncGoogleFolders(accountId)
    wip = findFolderByRemoteId(accountId, labelId)
    if (!wip) throw new Error('Gmail: Ordner «In Bearbeitung» nach Anlage nicht gefunden.')
    setFolderWellKnownLocal(wip.id, WELL_KNOWN_WIP)
    wip = findFolderByWellKnown(accountId, WELL_KNOWN_WIP)
  }

  let done = findFolderByWellKnown(accountId, WELL_KNOWN_DONE)
  if (!done) {
    const labelId = await findOrCreateGmailUserLabelByDisplayName(accountId, DONE_FOLDER_DISPLAY)
    await syncGoogleFolders(accountId)
    done = findFolderByRemoteId(accountId, labelId)
    if (!done) throw new Error('Gmail: Ordner «Erledigt» nach Anlage nicht gefunden.')
    setFolderWellKnownLocal(done.id, WELL_KNOWN_DONE)
    done = findFolderByWellKnown(accountId, WELL_KNOWN_DONE)
  }

  if (!wip || !done) {
    throw new Error('Triage-Ordner (Gmail) konnten nicht angelegt oder gelesen werden.')
  }

  upsertAccountWorkflowMailFolders(accountId, wip.remoteId, done.remoteId)

  return {
    wipFolderId: wip.id,
    doneFolderId: done.id,
    wipFolderRemoteId: wip.remoteId,
    doneFolderRemoteId: done.remoteId
  }
}

/**
 * Ordner-Zuordnung manuell setzen (Dropdowns in den Einstellungen).
 * `null` = Zuordnung entfernen (kein automatisches Verschieben fuer diese Seite).
 */
export function setWorkflowMailFolderMapping(
  accountId: string,
  wipFolderId: number | null,
  doneFolderId: number | null
): void {
  if (wipFolderId != null && doneFolderId != null && wipFolderId === doneFolderId) {
    throw new Error('„In Bearbeitung“ und „Erledigt“ muessen unterschiedliche Ordner sein.')
  }

  let wipRemote: string | null = null
  let doneRemote: string | null = null

  if (wipFolderId != null) {
    const f = findFolderById(wipFolderId)
    if (!f || f.accountId !== accountId) throw new Error('Ordner „In Bearbeitung“ ungueltig.')
    wipRemote = f.remoteId
  }
  if (doneFolderId != null) {
    const f = findFolderById(doneFolderId)
    if (!f || f.accountId !== accountId) throw new Error('Ordner „Erledigt“ ungueltig.')
    doneRemote = f.remoteId
  }

  if (wipRemote == null && doneRemote == null) {
    deleteAccountWorkflowMailFolders(accountId)
    return
  }

  upsertAccountWorkflowMailFolders(accountId, wipRemote, doneRemote)
}

async function supportsServerSideWorkflowMailMoves(accountId: string): Promise<boolean> {
  const accounts = await listAccounts()
  return accounts.some(
    (a) => a.id === accountId && (a.provider === 'microsoft' || a.provider === 'google')
  )
}

/**
 * Nach ToDo-Zuweisung (oder Termin): Mail in den konfigurierten Triage-Ordner
 * „In Bearbeitung“ verschieben — unabhaengig vom aktuellen Ordner (sofern mapping gesetzt).
 */
export async function routeToWipAfterTodoIfConfigured(messageId: number): Promise<void> {
  const msg = getMessageById(messageId)
  if (!msg) return
  if (!(await supportsServerSideWorkflowMailMoves(msg.accountId))) return

  const prefs = getAccountWorkflowMailFolders(msg.accountId)
  const wipRemote = prefs?.wipFolderRemoteId
  if (!wipRemote) return

  const wipFolder = findFolderByRemoteId(msg.accountId, wipRemote)
  if (!wipFolder) {
    console.warn('[workflow-folders] WIP-Ordner nicht in der lokalen DB:', msg.accountId, wipRemote)
    return
  }

  if (msg.folderId != null && msg.folderId === wipFolder.id) return

  await applyMoveMessageToFolder(messageId, wipFolder.id, { source: 'workflow-mail-folders' })
}

/**
 * Nach ToDo-Erledigung: Mail in den Ordner „Erledigt“ verschieben.
 */
export async function routeToDoneFolderAfterCompleteIfConfigured(messageId: number): Promise<void> {
  const msg = getMessageById(messageId)
  if (!msg) return
  if (!(await supportsServerSideWorkflowMailMoves(msg.accountId))) return

  const prefs = getAccountWorkflowMailFolders(msg.accountId)
  const doneRemote = prefs?.doneFolderRemoteId
  if (!doneRemote) return

  const doneFolder = findFolderByRemoteId(msg.accountId, doneRemote)
  if (!doneFolder) {
    console.warn('[workflow-folders] Erledigt-Ordner nicht in der lokalen DB:', msg.accountId, doneRemote)
    return
  }

  if (msg.folderId != null) {
    const cur = findFolderById(msg.folderId)
    if (cur && cur.id === doneFolder.id) return
  }

  await applyMoveMessageToFolder(messageId, doneFolder.id, { source: 'workflow-mail-folders' })
}

export function getWorkflowMailFolderUiState(accountId: string): WorkflowMailFolderUiState {
  const row = getAccountWorkflowMailFolders(accountId)
  if (!row) {
    return { prefs: null, wipFolderId: null, doneFolderId: null }
  }
  const prefs = {
    wipFolderRemoteId: row.wipFolderRemoteId,
    doneFolderRemoteId: row.doneFolderRemoteId
  }
  const wipFolder =
    row.wipFolderRemoteId != null && row.wipFolderRemoteId !== ''
      ? findFolderByRemoteId(accountId, row.wipFolderRemoteId)
      : null
  const doneFolder =
    row.doneFolderRemoteId != null && row.doneFolderRemoteId !== ''
      ? findFolderByRemoteId(accountId, row.doneFolderRemoteId)
      : null
  return {
    prefs,
    wipFolderId: wipFolder?.id ?? null,
    doneFolderId: doneFolder?.id ?? null
  }
}
