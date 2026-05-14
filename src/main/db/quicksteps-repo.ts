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
