/** Visuelle Regel-Engine (Post-MVP A): Bedingungen, Aktionen, Trigger — ohne Skript. */

export type MailRuleTrigger = 'on_receive' | 'manual'

export type RuleConditionCombinator = 'and' | 'or'

export type RuleConditionField =
  | 'from'
  | 'to'
  | 'cc'
  | 'subject'
  | 'body'
  | 'has_attachment'
  | 'list_id'
  | 'account_id'
  | 'folder'
  | 'importance'
  | 'is_read'

/** Textfelder: contains / not_contains / equals. Booleans: is_true / is_false */
export type RuleConditionOp =
  | 'contains'
  | 'not_contains'
  | 'equals'
  | 'not_equals'
  | 'is_true'
  | 'is_false'

export interface RuleConditionLeaf {
  type: 'condition'
  field: RuleConditionField
  op: RuleConditionOp
  /** Freitext oder z. B. Ordner-ID / Konto-ID als String */
  value: string
}

export interface RuleConditionGroup {
  type: 'group'
  combinator: RuleConditionCombinator
  children: Array<RuleConditionLeaf | RuleConditionGroup>
}

export type RuleActionType =
  | 'move_to_folder'
  | 'add_tag'
  | 'mark_read'
  | 'mark_flagged'
  | 'add_to_todo'
  | 'snooze'
  | 'forward_to'
  | 'auto_reply'
  | 'delete'
  | 'stop_processing'

export type RuleSnoozePreset =
  | 'this-evening'
  | 'tomorrow-morning'
  | 'tomorrow-evening'
  | 'next-week'
  | 'next-monday'
  | 'in-1-hour'
  | 'in-3-hours'

export interface RuleActionMoveToFolder {
  type: 'move_to_folder'
  folderId: number
}

export interface RuleActionAddTag {
  type: 'add_tag'
  tag: string
}

export interface RuleActionMarkRead {
  type: 'mark_read'
}

export interface RuleActionMarkFlagged {
  type: 'mark_flagged'
}

export interface RuleActionAddTodo {
  type: 'add_to_todo'
  dueKind: 'today' | 'tomorrow' | 'this_week' | 'later'
}

export interface RuleActionSnooze {
  type: 'snooze'
  preset: RuleSnoozePreset
}

export interface RuleActionForwardTo {
  type: 'forward_to'
  address: string
}

export interface RuleActionAutoReply {
  type: 'auto_reply'
  subject: string
  bodyText: string
}

export interface RuleActionDelete {
  type: 'delete'
}

export interface RuleActionStop {
  type: 'stop_processing'
}

export type RuleAction =
  | RuleActionMoveToFolder
  | RuleActionAddTag
  | RuleActionMarkRead
  | RuleActionMarkFlagged
  | RuleActionAddTodo
  | RuleActionSnooze
  | RuleActionForwardTo
  | RuleActionAutoReply
  | RuleActionDelete
  | RuleActionStop

export interface MailRuleDefinition {
  version: 1
  root: RuleConditionGroup
  actions: RuleAction[]
}

export interface MailRuleDto {
  id: number
  name: string
  enabled: boolean
  trigger: MailRuleTrigger
  sortOrder: number
  definition: MailRuleDefinition
  createdAt: string
  updatedAt: string
}

export interface MailRuleDryRunHit {
  messageId: number
  accountId: string
  subject: string | null
  fromAddr: string | null
  receivedAt: string | null
}

export interface MailRuleDryRunResult {
  hits: MailRuleDryRunHit[]
  totalScanned: number
}

/** Ein Audit-Eintrag fuer die Automation-Inbox (rueckgaengig). */
export interface AutomationInboxEntry {
  id: number
  messageId: number | null
  accountId: string | null
  actionType: string
  label: string
  performedAt: string
  undone: boolean
  ruleId: number | null
}

export const RULE_CONDITION_FIELDS: { id: RuleConditionField; label: string }[] = [
  { id: 'from', label: 'Von' },
  { id: 'to', label: 'An' },
  { id: 'cc', label: 'Cc' },
  { id: 'subject', label: 'Betreff' },
  { id: 'body', label: 'Textkoerper' },
  { id: 'has_attachment', label: 'Hat Anhang' },
  { id: 'list_id', label: 'List-Id' },
  { id: 'account_id', label: 'Konto' },
  { id: 'folder', label: 'Ordner' },
  { id: 'importance', label: 'Wichtigkeit' },
  { id: 'is_read', label: 'Gelesen' }
]

export const RULE_ACTION_TYPES: { id: RuleActionType; label: string; implemented: boolean }[] = [
  { id: 'move_to_folder', label: 'In Ordner verschieben', implemented: true },
  { id: 'add_tag', label: 'Tag hinzufuegen', implemented: true },
  { id: 'mark_read', label: 'Als gelesen', implemented: true },
  { id: 'mark_flagged', label: 'Markieren', implemented: true },
  { id: 'add_to_todo', label: 'Zu ToDo', implemented: true },
  { id: 'snooze', label: 'Snooze', implemented: true },
  { id: 'forward_to', label: 'Weiterleiten an', implemented: false },
  { id: 'auto_reply', label: 'Auto-Antwort', implemented: false },
  { id: 'delete', label: 'Loeschen', implemented: true },
  { id: 'stop_processing', label: 'Weitere Regeln stoppen', implemented: true }
]

export function defaultRuleDefinition(): MailRuleDefinition {
  return {
    version: 1,
    root: {
      type: 'group',
      combinator: 'and',
      children: [
        {
          type: 'condition',
          field: 'from',
          op: 'contains',
          value: ''
        }
      ]
    },
    actions: [{ type: 'mark_read' }]
  }
}
