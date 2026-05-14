import type {
  MailRuleDefinition,
  RuleConditionGroup,
  RuleConditionLeaf,
  RuleConditionOp
} from '@shared/mail-rules'
import type { MessageRuleContextRow } from './db/messages-repo'

function norm(s: string | null | undefined): string {
  return (s ?? '').toLowerCase()
}

function textMatch(
  haystack: string | null | undefined,
  needle: string,
  op: RuleConditionOp
): boolean {
  const h = norm(haystack)
  const n = norm(needle).trim()
  if (op === 'is_true' || op === 'is_false') {
    const v = h === 'true' || h === '1' || haystack === '1'
    return op === 'is_true' ? v : !v
  }
  if (n === '' && (op === 'contains' || op === 'equals')) return false
  switch (op) {
    case 'contains':
      return h.includes(n)
    case 'not_contains':
      return !h.includes(n)
    case 'equals':
      return h === n
    case 'not_equals':
      return h !== n
    default:
      return h.includes(n)
  }
}

function boolField(ctx: MessageRuleContextRow, field: string, op: RuleConditionOp, value: string): boolean {
  let current = false
  if (field === 'has_attachment') current = ctx.hasAttachments
  else if (field === 'is_read') current = ctx.isRead
  if (op === 'is_true') return current === true
  if (op === 'is_false') return current === false
  const want = norm(value) === 'true' || value === '1' || norm(value) === 'ja'
  return current === want
}

function evalLeaf(ctx: MessageRuleContextRow, leaf: RuleConditionLeaf): boolean {
  const { field, op, value } = leaf
  if (field === 'has_attachment' || field === 'is_read') {
    return boolField(ctx, field, op, value)
  }
  if (field === 'from') {
    const combined = [ctx.fromAddr, ctx.fromName].filter(Boolean).join(' ')
    return textMatch(combined, value, op)
  }
  if (field === 'to') return textMatch(ctx.toAddrs, value, op)
  if (field === 'cc') return textMatch(ctx.ccAddrs, value, op)
  if (field === 'subject') return textMatch(ctx.subject, value, op)
  if (field === 'body') return textMatch(ctx.bodyText, value, op)
  if (field === 'list_id') return textMatch(ctx.listId, value, op)
  if (field === 'account_id') return textMatch(ctx.accountId, value, op)
  if (field === 'folder') {
    const fid = ctx.folderId != null ? String(ctx.folderId) : ''
    const v = value.trim()
    if (op === 'not_equals' || op === 'not_contains') return fid !== v
    return fid === v
  }
  if (field === 'importance') return textMatch(ctx.importance, value, op)
  return false
}

function evalGroup(ctx: MessageRuleContextRow, g: RuleConditionGroup): boolean {
  const parts = g.children.map((c) => {
    if (c.type === 'group') return evalGroup(ctx, c)
    if (c.type === 'condition') return evalLeaf(ctx, c)
    return false
  })
  if (parts.length === 0) return false
  if (g.combinator === 'or') return parts.some(Boolean)
  return parts.every(Boolean)
}

export function ruleMatchesMessage(def: MailRuleDefinition, ctx: MessageRuleContextRow): boolean {
  try {
    return evalGroup(ctx, def.root)
  } catch {
    return false
  }
}
