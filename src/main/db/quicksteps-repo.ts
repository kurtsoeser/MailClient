import { getDb } from './index'
import type { MailQuickStep } from '@shared/types'

interface QuickStepListRow {
  id: number
  name: string
  icon: string | null
  shortcut: string | null
  sort_order: number
  enabled: number
}

interface QuickStepRow extends QuickStepListRow {
  actions_json: string
}

function rowToListItem(r: QuickStepListRow): MailQuickStep {
  return {
    id: r.id,
    name: r.name,
    icon: r.icon,
    shortcut: r.shortcut,
    sortOrder: r.sort_order
  }
}

export function listMailQuickSteps(): MailQuickStep[] {
  const db = getDb()
  const rows = db
    .prepare<[], QuickStepListRow>(
      `SELECT id, name, icon, shortcut, sort_order, enabled
       FROM quicksteps
       WHERE enabled = 1
       ORDER BY sort_order ASC, id ASC`
    )
    .all()
  return rows.map(rowToListItem)
}

export interface QuickStepDbRow {
  id: number
  name: string
  actionsJson: string
  enabled: boolean
}

export function getQuickStepById(id: number): QuickStepDbRow | null {
  const db = getDb()
  const r = db
    .prepare<[number], QuickStepRow>(
      `SELECT id, name, icon, shortcut, actions_json, sort_order, enabled
       FROM quicksteps WHERE id = ?`
    )
    .get(id)
  if (!r) return null
  return {
    id: r.id,
    name: r.name,
    actionsJson: r.actions_json,
    enabled: !!r.enabled
  }
}

export interface QuickStepFullBackupRow {
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

export function listAllQuickStepsForBackup(): QuickStepFullBackupRow[] {
  const db = getDb()
  const rows = db
    .prepare<
      [],
      {
        id: number
        name: string
        icon: string | null
        shortcut: string | null
        actions_json: string
        sort_order: number
        enabled: number
        created_at: string
        updated_at: string
      }
    >(
      `SELECT id, name, icon, shortcut, actions_json, sort_order, enabled, created_at, updated_at
       FROM quicksteps
       ORDER BY sort_order ASC, id ASC`
    )
    .all()
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    icon: r.icon,
    shortcut: r.shortcut,
    actionsJson: r.actions_json,
    sortOrder: r.sort_order,
    enabled: !!r.enabled,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }))
}

/** Vollstaendiger Ersatz (Einstellungen-Import); IDs aus der Sicherung bleiben erhalten. */
export function replaceAllQuickStepsFromBackup(
  rows: Array<{
    id: number
    name: string
    icon: string | null
    shortcut: string | null
    actionsJson: string
    sortOrder: number
    enabled: boolean
    createdAt: string
    updatedAt: string
  }>
): void {
  const db = getDb()
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM quicksteps').run()
    const ins = db.prepare(
      `INSERT INTO quicksteps (id, name, icon, shortcut, actions_json, sort_order, enabled, created_at, updated_at)
       VALUES (@id, @name, @icon, @shortcut, @actions_json, @sort_order, @enabled, @created_at, @updated_at)`
    )
    for (const r of rows) {
      ins.run({
        id: r.id,
        name: r.name,
        icon: r.icon,
        shortcut: r.shortcut,
        actions_json: r.actionsJson,
        sort_order: r.sortOrder,
        enabled: r.enabled ? 1 : 0,
        created_at: r.createdAt,
        updated_at: r.updatedAt
      })
    }
  })
  tx()
}
