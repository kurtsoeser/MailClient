import { ipcMain } from 'electron'
import {
  IPC,
  type WorkflowBoard,
  type WorkflowColumn,
  type UndoResult
} from '@shared/types'
import {
  rulesList,
  rulesGet,
  rulesCreate,
  rulesUpdate,
  rulesDelete,
  rulesDryRun,
  rulesApplyManual,
  rulesListAutomation
} from '../rules-service'
import { listWorkflowBoards, updateWorkflowBoardColumns } from '../db/workflow-repo'
import { addVipSender, removeVipSender, listVipEmailsForAccount } from '../db/vip-repo'
import { getActionById, markUndone } from '../db/message-actions-repo'
import type { MailRuleDefinition, MailRuleTrigger } from '@shared/mail-rules'
import { applyUndo } from './mail-ipc-undo'

export function registerWorkflowVipRulesIpc(): void {
  ipcMain.handle(IPC.workflow.listBoards, (): WorkflowBoard[] => listWorkflowBoards())

  ipcMain.handle(
    IPC.workflow.updateBoardColumns,
    (_event, args: { boardId: number; columns: WorkflowColumn[] }): void => {
      updateWorkflowBoardColumns(args.boardId, args.columns)
    }
  )

  ipcMain.handle(IPC.vip.list, (_event, accountId: string): string[] => listVipEmailsForAccount(accountId))

  ipcMain.handle(
    IPC.vip.add,
    (_event, args: { accountId: string; email: string }): void => {
      addVipSender(args.accountId, args.email)
    }
  )

  ipcMain.handle(
    IPC.vip.remove,
    (_event, args: { accountId: string; email: string }): void => {
      removeVipSender(args.accountId, args.email)
    }
  )

  ipcMain.handle(IPC.rules.list, () => rulesList())

  ipcMain.handle(IPC.rules.get, (_event, id: number) => rulesGet(id))

  ipcMain.handle(
    IPC.rules.create,
    (
      _event,
      input: { name: string; enabled: boolean; trigger: MailRuleTrigger; definition: MailRuleDefinition }
    ) => rulesCreate(input)
  )

  ipcMain.handle(
    IPC.rules.update,
    (
      _event,
      args: {
        id: number
        patch: Partial<{
          name: string
          enabled: boolean
          trigger: MailRuleTrigger
          sortOrder: number
          definition: MailRuleDefinition
        }>
      }
    ) => rulesUpdate(args.id, args.patch)
  )

  ipcMain.handle(IPC.rules.delete, (_event, id: number): void => {
    rulesDelete(id)
  })

  ipcMain.handle(
    IPC.rules.dryRun,
    (
      _event,
      args: { ruleId: number; accountId: string | null; limit?: number }
    ): ReturnType<typeof rulesDryRun> =>
      rulesDryRun(args.ruleId, { accountId: args.accountId, limit: args.limit ?? 400 })
  )

  ipcMain.handle(
    IPC.rules.applyManual,
    (_event, args: { ruleId: number; accountId: string | null; limit?: number }) =>
      rulesApplyManual(args.ruleId, { accountId: args.accountId, limit: args.limit ?? 400 })
  )

  ipcMain.handle(IPC.rules.listAutomation, (_event, limit?: number) =>
    rulesListAutomation(limit ?? 100)
  )

  ipcMain.handle(IPC.rules.undoAutomation, async (_event, actionId: number): Promise<UndoResult> => {
    const action = getActionById(actionId)
    if (!action || action.undone) return { ok: false, error: 'Eintrag nicht gefunden.' }
    if (action.ruleId == null) return { ok: false, error: 'Kein Regel-Audit-Eintrag.' }
    try {
      const label = await applyUndo(action)
      markUndone(actionId)
      return { ok: true, label }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return { ok: false, error: message }
    }
  })
}
