import type {
  AutomationInboxEntry,
  MailRuleDryRunHit,
  MailRuleDryRunResult,
  MailRuleDto,
  MailRuleDefinition,
  MailRuleTrigger
} from '@shared/mail-rules'
import {
  deleteMailRule,
  getMailRule,
  insertMailRule,
  listMailRules,
  updateMailRule
} from './db/rules-repo'
import { listMessagesForRuleDryRun } from './db/messages-repo'
import { ruleMatchesMessage } from './rule-evaluator'
import { executeRuleOnMessage } from './rule-runner'
import type { MailActionRecord } from './db/message-actions-repo'
import { listAutomationInbox } from './db/message-actions-repo'

export function rulesList(): MailRuleDto[] {
  return listMailRules()
}

export function rulesGet(id: number): MailRuleDto | null {
  return getMailRule(id)
}

export function rulesCreate(input: {
  name: string
  enabled: boolean
  trigger: MailRuleTrigger
  definition: MailRuleDefinition
}): MailRuleDto {
  const all = listMailRules()
  const maxSort = all.reduce((m, r) => Math.max(m, r.sortOrder), 0)
  const id = insertMailRule({
    name: input.name,
    enabled: input.enabled,
    trigger: input.trigger,
    sortOrder: maxSort + 1,
    definition: input.definition
  })
  return getMailRule(id)!
}

export function rulesUpdate(
  id: number,
  patch: Partial<{
    name: string
    enabled: boolean
    trigger: MailRuleTrigger
    sortOrder: number
    definition: MailRuleDefinition
  }>
): MailRuleDto {
  updateMailRule(id, patch)
  return getMailRule(id)!
}

export function rulesDelete(id: number): void {
  deleteMailRule(id)
}

export function replaceAllMailRulesFromBackup(
  snapshots: Array<{
    name: string
    enabled: boolean
    trigger: MailRuleTrigger
    sortOrder: number
    definition: MailRuleDefinition
  }>
): void {
  const existing = listMailRules()
  for (const r of existing) {
    deleteMailRule(r.id)
  }
  const sorted = [...snapshots].sort((a, b) => a.sortOrder - b.sortOrder)
  for (const s of sorted) {
    rulesCreate({
      name: s.name,
      enabled: s.enabled,
      trigger: s.trigger,
      definition: s.definition
    })
  }
}

export function rulesDryRun(
  ruleId: number,
  opts: { accountId: string | null; limit: number }
): MailRuleDryRunResult {
  const rule = getMailRule(ruleId)
  if (!rule) throw new Error('Regel nicht gefunden.')
  const rows = listMessagesForRuleDryRun(opts.accountId, opts.limit)
  const hits: MailRuleDryRunHit[] = []
  for (const r of rows) {
    if (ruleMatchesMessage(rule.definition, r)) {
      hits.push({
        messageId: r.id,
        accountId: r.accountId,
        subject: r.subject,
        fromAddr: r.fromAddr,
        receivedAt: r.receivedAt
      })
    }
  }
  return { hits, totalScanned: rows.length }
}

export async function rulesApplyManual(
  ruleId: number,
  opts: { accountId: string | null; limit: number }
): Promise<{ applied: number }> {
  const rule = getMailRule(ruleId)
  if (!rule) throw new Error('Regel nicht gefunden.')
  const rows = listMessagesForRuleDryRun(opts.accountId, opts.limit)
  let applied = 0
  for (const r of rows) {
    if (!ruleMatchesMessage(rule.definition, r)) continue
    await executeRuleOnMessage(rule, r.id, { guardExecution: false })
    applied += 1
  }
  return { applied }
}

function mapAutomationRow(a: MailActionRecord): AutomationInboxEntry {
  return {
    id: a.id,
    messageId: a.messageId,
    accountId: a.accountId,
    actionType: a.actionType,
    label: a.payload.label ?? a.actionType,
    performedAt: a.performedAt,
    undone: a.undone,
    ruleId: a.ruleId
  }
}

export function rulesListAutomation(limit: number): AutomationInboxEntry[] {
  return listAutomationInbox(limit).map(mapAutomationRow)
}
