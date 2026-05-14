import type { MailRuleDto, RuleAction } from '@shared/mail-rules'
import { BrowserWindow } from 'electron'
import { getMessageById, getMessageRuleContext } from './db/messages-repo'
import {
  applySetReadForMessage,
  applySetFlaggedForMessage,
  applyMoveMessageToFolder,
  applyMoveMessageToWellKnownAlias
} from './message-graph-actions'
import { setMessageCategories as graphSetMessageCategories } from './graph/mail-actions'
import { setTodoForMessage } from './todos-service'
import { routeToWipAfterTodoIfConfigured } from './workflow-mail-folder-routing'
import { snoozeMessage } from './snooze'
import { ruleMatchesMessage } from './rule-evaluator'
import { computeRuleSnoozeWakeAt } from './snooze-presets'
import { addMessageTag, listTagsForMessage, removeMessageTag } from './db/message-tags-repo'
import { recordAction } from './db/message-actions-repo'
import { hasRuleExecuted, listEnabledRulesByTrigger, markRuleExecuted } from './db/rules-repo'
import { listAccounts } from './accounts'

const RULE_SRC = (ruleId: number): string => `rule:${ruleId}`

function broadcastMailChanged(accountId: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('mail:changed', { accountId })
  }
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max - 1) + '...'
}

async function applyAddTag(messageId: number, tag: string, ruleId: number): Promise<void> {
  const msg = getMessageById(messageId)
  if (!msg) return
  const t = tag.trim()
  if (!t) return
  const added = addMessageTag(messageId, msg.accountId, t)
  if (!added) return

  const accounts = await listAccounts()
  if (accounts.find((a) => a.id === msg.accountId)?.provider === 'microsoft') {
    try {
      await graphSetMessageCategories(msg.accountId, msg.remoteId, listTagsForMessage(messageId))
    } catch (e) {
      removeMessageTag(messageId, t)
      broadcastMailChanged(msg.accountId)
      throw e
    }
  }
  broadcastMailChanged(msg.accountId)

  recordAction({
    messageId,
    accountId: msg.accountId,
    actionType: 'add-tag',
    source: RULE_SRC(ruleId),
    ruleId,
    payload: {
      tag: t,
      label: `Regel: Tag „${truncate(t, 40)}“ — ${truncate(msg.subject ?? '(Kein Betreff)', 40)}`
    }
  })
}

export async function executeRuleOnMessage(
  rule: MailRuleDto,
  messageId: number,
  opts: { guardExecution: boolean }
): Promise<{ stopFurtherRules: boolean }> {
  const ctx = getMessageRuleContext(messageId)
  if (!ctx) return { stopFurtherRules: false }

  if (!ruleMatchesMessage(rule.definition, ctx)) {
    return { stopFurtherRules: false }
  }

  if (opts.guardExecution && hasRuleExecuted(rule.id, messageId)) {
    return { stopFurtherRules: false }
  }

  const src = RULE_SRC(rule.id)
  const ruleId = rule.id
  let stopFurtherRules = false

  for (const action of rule.definition.actions) {
    const a = action as RuleAction
    try {
      switch (a.type) {
        case 'mark_read':
          await applySetReadForMessage(messageId, true, { source: src, ruleId })
          break
        case 'mark_flagged':
          await applySetFlaggedForMessage(messageId, true, { source: src, ruleId })
          break
        case 'move_to_folder':
          await applyMoveMessageToFolder(messageId, a.folderId, { source: src, ruleId })
          break
        case 'add_tag':
          await applyAddTag(messageId, a.tag, ruleId)
          break
        case 'add_to_todo':
          setTodoForMessage(messageId, a.dueKind, { source: src, ruleId })
          await routeToWipAfterTodoIfConfigured(messageId)
          break
        case 'snooze': {
          const wake = computeRuleSnoozeWakeAt(a.preset)
          if (wake) {
            await snoozeMessage({
              messageId,
              wakeAt: wake,
              preset: a.preset,
              source: src,
              ruleId
            })
          }
          break
        }
        case 'delete':
          await applyMoveMessageToWellKnownAlias(messageId, 'deleteditems', { source: src, ruleId })
          break
        case 'forward_to':
        case 'auto_reply':
          console.warn(`[rules] Aktion „${a.type}“ ist noch nicht implementiert (Regel ${rule.id}).`)
          break
        case 'stop_processing':
          stopFurtherRules = true
          break
        default:
          break
      }
    } catch (e) {
      console.warn(`[rules] Aktion auf Mail ${messageId} fehlgeschlagen:`, e)
    }

    if (!getMessageById(messageId)) {
      break
    }
  }

  if (opts.guardExecution) {
    markRuleExecuted(rule.id, messageId)
  }

  return { stopFurtherRules }
}

export async function runInboxRulesForNewMessages(
  _accountId: string,
  messageIds: number[]
): Promise<void> {
  const rules = listEnabledRulesByTrigger('on_receive')
  if (rules.length === 0 || messageIds.length === 0) return

  for (const messageId of messageIds) {
    let stopAll = false
    for (const rule of rules) {
      if (stopAll) break
      const { stopFurtherRules } = await executeRuleOnMessage(rule, messageId, {
        guardExecution: true
      })
      if (stopFurtherRules) stopAll = true
    }
  }
}
