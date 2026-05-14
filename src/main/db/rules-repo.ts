import { getDb } from './index'
import type { MailRuleDefinition, MailRuleDto, MailRuleTrigger } from '@shared/mail-rules'

interface RuleRow {
  id: number
  name: string
  enabled: number
  trigger: string
  sort_order: number
  definition_json: string
  created_at: string
  updated_at: string
}

function rowToDto(r: RuleRow): MailRuleDto {
  let definition: MailRuleDefinition
  try {
    definition = JSON.parse(r.definition_json) as MailRuleDefinition
    if (!definition || definition.version !== 1 || !definition.root || !Array.isArray(definition.actions)) {
      throw new Error('invalid')
    }
  } catch {
    definition = {
      version: 1,
      root: { type: 'group', combinator: 'and', children: [] },
      actions: []
    }
  }
  return {
    id: r.id,
    name: r.name,
    enabled: !!r.enabled,
    trigger: (r.trigger === 'on_receive' ? 'on_receive' : 'manual') as MailRuleTrigger,
    sortOrder: r.sort_order,
    definition,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

export function listMailRules(): MailRuleDto[] {
  const db = getDb()
  const rows = db
    .prepare<[], RuleRow>(
      'SELECT * FROM mail_rules ORDER BY sort_order ASC, id ASC'
    )
    .all()
  return rows.map(rowToDto)
}

export function getMailRule(id: number): MailRuleDto | null {
  const db = getDb()
  const row = db.prepare<[number], RuleRow>('SELECT * FROM mail_rules WHERE id = ?').get(id)
  return row ? rowToDto(row) : null
}

export function insertMailRule(input: {
  name: string
  enabled: boolean
  trigger: MailRuleTrigger
  sortOrder: number
  definition: MailRuleDefinition
}): number {
  const db = getDb()
  const res = db
    .prepare(
      `INSERT INTO mail_rules (name, enabled, trigger, sort_order, definition_json, created_at, updated_at)
       VALUES (@name, @enabled, @trigger, @sortOrder, @definitionJson, datetime('now'), datetime('now'))`
    )
    .run({
      name: input.name.trim() || 'Neue Regel',
      enabled: input.enabled ? 1 : 0,
      trigger: input.trigger,
      sortOrder: input.sortOrder,
      definitionJson: JSON.stringify(input.definition)
    })
  return Number(res.lastInsertRowid)
}

export function updateMailRule(
  id: number,
  input: Partial<{
    name: string
    enabled: boolean
    trigger: MailRuleTrigger
    sortOrder: number
    definition: MailRuleDefinition
  }>
): void {
  const existing = getMailRule(id)
  if (!existing) throw new Error('Regel nicht gefunden.')
  const db = getDb()
  const name = input.name !== undefined ? input.name.trim() || 'Regel' : existing.name
  const enabled = input.enabled !== undefined ? (input.enabled ? 1 : 0) : existing.enabled ? 1 : 0
  const trigger = input.trigger ?? existing.trigger
  const sortOrder = input.sortOrder ?? existing.sortOrder
  const definition = input.definition ?? existing.definition
  db.prepare(
    `UPDATE mail_rules SET
       name = ?, enabled = ?, trigger = ?, sort_order = ?,
       definition_json = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(name, enabled, trigger, sortOrder, JSON.stringify(definition), id)
}

export function deleteMailRule(id: number): void {
  const db = getDb()
  db.prepare('DELETE FROM mail_rules WHERE id = ?').run(id)
}

export function listEnabledRulesByTrigger(trigger: MailRuleTrigger): MailRuleDto[] {
  return listMailRules().filter((r) => r.enabled && r.trigger === trigger)
}

export function markRuleExecuted(ruleId: number, messageId: number): void {
  const db = getDb()
  db.prepare(
    `INSERT OR IGNORE INTO mail_rule_executions (rule_id, message_id, executed_at)
     VALUES (?, ?, datetime('now'))`
  ).run(ruleId, messageId)
}

export function hasRuleExecuted(ruleId: number, messageId: number): boolean {
  const db = getDb()
  const row = db
    .prepare<[number, number], { c: number }>(
      'SELECT 1 as c FROM mail_rule_executions WHERE rule_id = ? AND message_id = ? LIMIT 1'
    )
    .get(ruleId, messageId)
  return !!row
}
