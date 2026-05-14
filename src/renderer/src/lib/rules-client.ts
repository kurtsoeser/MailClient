import { IPC, type UndoResult } from '@shared/types'
import type {
  AutomationInboxEntry,
  MailRuleDefinition,
  MailRuleDto,
  MailRuleDryRunResult,
  MailRuleTrigger
} from '@shared/mail-rules'

type InvokeFn = (channel: string, payload?: unknown) => Promise<unknown>

export interface RulesClient {
  list: () => Promise<MailRuleDto[]>
  get: (id: number) => Promise<MailRuleDto | null>
  create: (input: {
    name: string
    enabled: boolean
    trigger: MailRuleTrigger
    definition: MailRuleDefinition
  }) => Promise<MailRuleDto>
  update: (args: {
    id: number
    patch: Partial<{
      name: string
      enabled: boolean
      trigger: MailRuleTrigger
      sortOrder: number
      definition: MailRuleDefinition
    }>
  }) => Promise<MailRuleDto>
  delete: (id: number) => Promise<void>
  dryRun: (args: {
    ruleId: number
    accountId: string | null
    limit?: number
  }) => Promise<MailRuleDryRunResult>
  applyManual: (args: {
    ruleId: number
    accountId: string | null
    limit?: number
  }) => Promise<{ applied: number }>
  listAutomation: (limit?: number) => Promise<AutomationInboxEntry[]>
  undoAutomation: (actionId: number) => Promise<UndoResult>
}

/**
 * Nach Vite-HMR kann der Renderer neu sein, das Preload-Script aber noch vom
 * Fensterstart stammen — dann fehlt `mailClient.rules`. Ueber `invoke`
 * (falls vorhanden) gehen die gleichen IPC-Kanaele trotzdem.
 */
export function getRulesClient(): RulesClient {
  const m = window.mailClient as typeof window.mailClient & { invoke?: InvokeFn }
  if (m.rules) return m.rules
  const inv = m.invoke
  if (!inv) {
    throw new Error(
      'Regeln-API nicht geladen. Bitte die App vollstaendig beenden und neu starten (Electron-Preload wird nur beim Fensterstart geladen).'
    )
  }
  return {
    list: () => inv(IPC.rules.list) as Promise<MailRuleDto[]>,
    get: (id: number) => inv(IPC.rules.get, id) as Promise<MailRuleDto | null>,
    create: (input) => inv(IPC.rules.create, input) as Promise<MailRuleDto>,
    update: (args) => inv(IPC.rules.update, args) as Promise<MailRuleDto>,
    delete: (id: number) => inv(IPC.rules.delete, id) as Promise<void>,
    dryRun: (args) => inv(IPC.rules.dryRun, args) as Promise<MailRuleDryRunResult>,
    applyManual: (args) => inv(IPC.rules.applyManual, args) as Promise<{ applied: number }>,
    listAutomation: (limit?: number) => inv(IPC.rules.listAutomation, limit) as Promise<AutomationInboxEntry[]>,
    undoAutomation: (actionId: number) => inv(IPC.rules.undoAutomation, actionId) as Promise<UndoResult>
  }
}
