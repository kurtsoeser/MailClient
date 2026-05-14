import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Plus,
  Trash2,
  Play,
  FlaskConical,
  Undo2,
  ListFilter,
  ChevronDown,
  ChevronRight
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  moduleColumnHeaderIconGlyphClass,
  moduleColumnHeaderOutlineSmClass,
  moduleColumnHeaderShellBarClass,
  moduleColumnHeaderTitleClass
} from '@/components/ModuleColumnHeader'
import { useAccountsStore } from '@/stores/accounts'
import { useMailStore } from '@/stores/mail'
import { showAppConfirm } from '@/stores/app-dialog'
import { useAppModeStore } from '@/stores/app-mode'
import type {
  MailRuleDto,
  MailRuleDefinition,
  MailRuleTrigger,
  MailRuleDryRunResult,
  AutomationInboxEntry,
  RuleConditionLeaf,
  RuleConditionGroup,
  RuleAction,
  RuleActionType,
  RuleConditionField,
  RuleConditionOp,
  RuleConditionCombinator,
  RuleSnoozePreset
} from '@shared/mail-rules'
import type { TodoDueKindOpen } from '@shared/types'
import {
  RULE_CONDITION_FIELDS,
  RULE_ACTION_TYPES,
  defaultRuleDefinition
} from '@shared/mail-rules'
import { getRulesClient } from '@/lib/rules-client'

type TabId = 'rules' | 'automation'

const OPS_TEXT: { id: RuleConditionOp; label: string }[] = [
  { id: 'contains', label: 'enthält' },
  { id: 'not_contains', label: 'enthält nicht' },
  { id: 'equals', label: 'ist gleich' },
  { id: 'not_equals', label: 'ist ungleich' },
  { id: 'is_true', label: 'ist wahr' },
  { id: 'is_false', label: 'ist falsch' }
]

function cloneDef(d: MailRuleDefinition): MailRuleDefinition {
  return JSON.parse(JSON.stringify(d)) as MailRuleDefinition
}

export function RulesShell(): JSX.Element {
  const setMode = useAppModeStore((s) => s.setMode)
  const accounts = useAccountsStore((s) => s.accounts)
  const foldersByAccount = useMailStore((s) => s.foldersByAccount)
  const [tab, setTab] = useState<TabId>('rules')
  const [rules, setRules] = useState<MailRuleDto[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [draft, setDraft] = useState<MailRuleDefinition | null>(null)
  const [name, setName] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [trigger, setTrigger] = useState<MailRuleTrigger>('manual')
  const [accountFilter, setAccountFilter] = useState<string | null>(null)
  const [dryResult, setDryResult] = useState<MailRuleDryRunResult | null>(null)
  const [automation, setAutomation] = useState<AutomationInboxEntry[]>([])
  const [expanded, setExpanded] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)

  const rulesClient = useMemo(() => getRulesClient(), [])

  const selected = rules.find((r) => r.id === selectedId) ?? null
  const folders = accountFilter ? foldersByAccount[accountFilter] ?? [] : []

  const loadRules = useCallback(async (): Promise<void> => {
    const list = await rulesClient.list()
    setRules(list)
    if (selectedId != null && !list.some((r) => r.id === selectedId)) {
      setSelectedId(null)
      setDraft(null)
    }
  }, [selectedId, rulesClient])

  const loadAutomation = useCallback(async (): Promise<void> => {
    const rows = await rulesClient.listAutomation(80)
    setAutomation(rows)
  }, [rulesClient])

  useEffect(() => {
    if (!accountFilter) return
    void window.mailClient.mail.listFolders(accountFilter).then((folders) => {
      useMailStore.setState((s) => ({
        foldersByAccount: { ...s.foldersByAccount, [accountFilter]: folders }
      }))
    })
  }, [accountFilter])

  useEffect(() => {
    void loadRules()
    void loadAutomation()
  }, [loadRules, loadAutomation])

  useEffect(() => {
    const unsub = window.mailClient.events.onMailChanged(() => {
      void loadAutomation()
    })
    return unsub
  }, [loadAutomation])

  useEffect(() => {
    if (!selected) {
      setDraft(null)
      setName('')
      setEnabled(false)
      setTrigger('manual')
      return
    }
    setName(selected.name)
    setEnabled(selected.enabled)
    setTrigger(selected.trigger)
    setDraft(cloneDef(selected.definition))
  }, [selected])

  async function saveRule(): Promise<void> {
    if (!selected || !draft) return
    setMsg(null)
    try {
      const updated = await rulesClient.update({
        id: selected.id,
        patch: { name, enabled, trigger, definition: draft }
      })
      setRules((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
      setMsg('Gespeichert.')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    }
  }

  async function createRule(): Promise<void> {
    setMsg(null)
    try {
      const r = await rulesClient.create({
        name: 'Neue Regel',
        enabled: false,
        trigger: 'manual',
        definition: defaultRuleDefinition()
      })
      setRules((prev) => [...prev, r])
      setSelectedId(r.id)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    }
  }

  async function deleteRule(): Promise<void> {
    if (!selected) return
    const ok = await showAppConfirm('Regel wirklich loeschen?', {
      title: 'Regel loeschen',
      variant: 'danger',
      confirmLabel: 'Loeschen'
    })
    if (!ok) return
    await rulesClient.delete(selected.id)
    setSelectedId(null)
    void loadRules()
  }

  async function runDry(): Promise<void> {
    if (!selected) return
    setMsg(null)
    try {
      const res = await rulesClient.dryRun({
        ruleId: selected.id,
        accountId: accountFilter,
        limit: 500
      })
      setDryResult(res)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    }
  }

  async function runManual(): Promise<void> {
    if (!selected) return
    const ok = await showAppConfirm(
      'Regel jetzt auf passende Mails anwenden (bis zum konfigurierten Limit)?',
      {
        title: 'Regel anwenden',
        confirmLabel: 'Anwenden'
      }
    )
    if (!ok) return
    setMsg(null)
    try {
      const { applied } = await rulesClient.applyManual({
        ruleId: selected.id,
        accountId: accountFilter,
        limit: 400
      })
      setMsg(`${applied} Mails verarbeitet.`)
      void loadAutomation()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    }
  }

  async function undoEntry(id: number): Promise<void> {
    const res = await rulesClient.undoAutomation(id)
    if (!res.ok) setMsg(res.error ?? 'Undo fehlgeschlagen')
    else setMsg(res.label ?? 'Rueckgaengig gemacht.')
    void loadAutomation()
  }

  function updateRoot(updater: (g: RuleConditionGroup) => void): void {
    if (!draft) return
    const next = cloneDef(draft)
    updater(next.root)
    setDraft(next)
  }

  function addCondition(): void {
    updateRoot((g) => {
      g.children.push({
        type: 'condition',
        field: 'from',
        op: 'contains',
        value: ''
      })
    })
  }

  function patchCondition(i: number, patch: Partial<RuleConditionLeaf>): void {
    updateRoot((g) => {
      const ch = g.children[i]
      if (ch && ch.type === 'condition') Object.assign(ch, patch)
    })
  }

  function removeCondition(i: number): void {
    updateRoot((g) => {
      g.children.splice(i, 1)
    })
  }

  function addAction(type: RuleActionType): void {
    if (!draft) return
    const next = cloneDef(draft)
    let a: RuleAction
    switch (type) {
      case 'move_to_folder':
        a = { type: 'move_to_folder', folderId: folders[0]?.id ?? 0 }
        break
      case 'add_tag':
        a = { type: 'add_tag', tag: '' }
        break
      case 'add_to_todo':
        a = { type: 'add_to_todo', dueKind: 'today' }
        break
      case 'snooze':
        a = { type: 'snooze', preset: 'tomorrow-morning' }
        break
      case 'forward_to':
        a = { type: 'forward_to', address: '' }
        break
      case 'auto_reply':
        a = { type: 'auto_reply', subject: '', bodyText: '' }
        break
      default:
        a = { type }
    }
    next.actions.push(a)
    setDraft(next)
  }

  function patchAction(i: number, patch: Partial<RuleAction>): void {
    if (!draft) return
    const next = cloneDef(draft)
    Object.assign(next.actions[i] as object, patch)
    setDraft(next)
  }

  function removeAction(i: number): void {
    if (!draft) return
    const next = cloneDef(draft)
    next.actions.splice(i, 1)
    setDraft(next)
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-background">
      <header className={cn(moduleColumnHeaderShellBarClass, 'gap-3')}>
        <div className="flex min-w-0 items-center gap-2">
          <ListFilter className={cn(moduleColumnHeaderIconGlyphClass, 'text-muted-foreground')} />
          <h1 className={cn(moduleColumnHeaderTitleClass, 'truncate')}>Regeln &amp; Automation</h1>
        </div>
        <button
          type="button"
          className={moduleColumnHeaderOutlineSmClass}
          onClick={(): void => setMode('mail')}
        >
          Zur Inbox
        </button>
      </header>

      <div className="flex border-b border-border text-xs">
        <button
          type="button"
          className={cn(
            'px-4 py-2 font-medium',
            tab === 'rules' ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground'
          )}
          onClick={(): void => setTab('rules')}
        >
          Regeln
        </button>
        <button
          type="button"
          className={cn(
            'px-4 py-2 font-medium',
            tab === 'automation'
              ? 'border-b-2 border-primary text-foreground'
              : 'text-muted-foreground'
          )}
          onClick={(): void => setTab('automation')}
        >
          Automation-Inbox
        </button>
      </div>

      {msg && <div className="border-b border-border bg-muted/50 px-4 py-1 text-xs">{msg}</div>}

      {tab === 'automation' && (
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <p className="mb-3 text-xs text-muted-foreground">
            Aktionen, die Regeln automatisch ausgefuehrt haben (Audit-Log). Nur Eintraege mit Regelbezug.
          </p>
          <ul className="space-y-1">
            {automation.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{row.label}</div>
                  <div className="text-muted-foreground">
                    {row.actionType} · {new Date(row.performedAt).toLocaleString()}
                    {row.ruleId != null ? ` · Regel #${row.ruleId}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  className="inline-flex shrink-0 items-center gap-1 rounded border border-border px-2 py-1 hover:bg-muted"
                  onClick={(): void => void undoEntry(row.id)}
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  Rueckgaengig
                </button>
              </li>
            ))}
          </ul>
          {automation.length === 0 && (
            <p className="text-xs text-muted-foreground">Noch keine Automation-Eintraege.</p>
          )}
        </div>
      )}

      {tab === 'rules' && (
        <div className="flex min-h-0 flex-1">
          <aside className="w-52 shrink-0 border-r border-border p-2">
            <button
              type="button"
              className="mb-2 flex w-full items-center justify-center gap-1 rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground"
              onClick={(): void => void createRule()}
            >
              <Plus className="h-3.5 w-3.5" />
              Neue Regel
            </button>
            <ul className="space-y-0.5">
              {rules.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={(): void => setSelectedId(r.id)}
                    className={cn(
                      'w-full rounded px-2 py-1.5 text-left text-xs',
                      selectedId === r.id ? 'bg-primary/15 font-medium' : 'hover:bg-muted'
                    )}
                  >
                    {r.enabled ? '' : '○ '}
                    {r.name}
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <main className="min-h-0 flex-1 overflow-auto p-4">
            {!selected || !draft ? (
              <p className="text-sm text-muted-foreground">Waehlen oder erstellen Sie eine Regel.</p>
            ) : (
              <div className="mx-auto max-w-3xl space-y-4">
                <div className="flex flex-wrap items-end gap-3">
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-muted-foreground">Name</span>
                    <input
                      className="rounded border border-border bg-background px-2 py-1 text-sm"
                      value={name}
                      onChange={(e): void => setName(e.target.value)}
                    />
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e): void => setEnabled(e.target.checked)}
                    />
                    Aktiv
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-muted-foreground">Trigger</span>
                    <select
                      className="rounded border border-border bg-background px-2 py-1 text-sm"
                      value={trigger}
                      onChange={(e): void => setTrigger(e.target.value as MailRuleTrigger)}
                    >
                      <option value="on_receive">Bei Empfang (Posteingang)</option>
                      <option value="manual">Nur manuell</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-muted-foreground">Dry-Run Konto</span>
                    <select
                      className="max-w-[200px] rounded border border-border bg-background px-2 py-1 text-sm"
                      value={accountFilter ?? ''}
                      onChange={(e): void =>
                        setAccountFilter(e.target.value === '' ? null : e.target.value)
                      }
                    >
                      <option value="">Alle Konten</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.email}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <section className="rounded-lg border border-border bg-card p-3">
                  <button
                    type="button"
                    className="mb-2 flex w-full items-center gap-1 text-left text-xs font-semibold"
                    onClick={(): void => setExpanded((x) => !x)}
                  >
                    {expanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    Bedingungen (UND / ODER)
                  </button>
                  {expanded && (
                    <>
                      <div className="mb-2 flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground">Kombinator</span>
                        <select
                          className="rounded border border-border bg-background px-2 py-1"
                          value={draft.root.combinator}
                          onChange={(e): void =>
                            setDraft((d) => {
                              if (!d) return d
                              const n = cloneDef(d)
                              n.root.combinator = e.target.value as RuleConditionCombinator
                              return n
                            })
                          }
                        >
                          <option value="and">Alle (UND)</option>
                          <option value="or">Mindestens eine (ODER)</option>
                        </select>
                        <button
                          type="button"
                          className="ml-auto rounded border border-border px-2 py-0.5 hover:bg-muted"
                          onClick={addCondition}
                        >
                          + Bedingung
                        </button>
                      </div>
                      <div className="space-y-2">
                        {draft.root.children.map((c, i) => {
                          if (c.type !== 'condition') return null
                          return (
                            <div
                              key={i}
                              className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2 border-b border-border/60 pb-2 text-xs last:border-0"
                            >
                              <select
                                className="rounded border border-border bg-background px-1 py-1"
                                value={c.field}
                                onChange={(e): void =>
                                  patchCondition(i, { field: e.target.value as RuleConditionField })
                                }
                              >
                                {RULE_CONDITION_FIELDS.map((f) => (
                                  <option key={f.id} value={f.id}>
                                    {f.label}
                                  </option>
                                ))}
                              </select>
                              <select
                                className="rounded border border-border bg-background px-1 py-1"
                                value={c.op}
                                onChange={(e): void =>
                                  patchCondition(i, { op: e.target.value as RuleConditionOp })
                                }
                              >
                                {OPS_TEXT.map((o) => (
                                  <option key={o.id} value={o.id}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                              <input
                                className="rounded border border-border bg-background px-2 py-1"
                                placeholder="Wert"
                                value={c.value}
                                onChange={(e): void => patchCondition(i, { value: e.target.value })}
                              />
                              <button
                                type="button"
                                className="text-destructive hover:underline"
                                onClick={(): void => removeCondition(i)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}
                </section>

                <section className="rounded-lg border border-border bg-card p-3">
                  <div className="mb-2 text-xs font-semibold">Aktionen</div>
                  <div className="mb-2 flex flex-wrap gap-1">
                    {RULE_ACTION_TYPES.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        disabled={!t.implemented}
                        title={!t.implemented ? 'Noch nicht implementiert' : undefined}
                        className="rounded border border-border px-2 py-0.5 text-[11px] hover:bg-muted disabled:opacity-40"
                        onClick={(): void => addAction(t.id)}
                      >
                        + {t.label}
                      </button>
                    ))}
                  </div>
                  <ol className="list-decimal space-y-2 pl-4 text-xs">
                    {draft.actions.map((a, i) => (
                      <li key={i} className="rounded border border-border/80 bg-background/50 p-2">
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-medium">{a.type}</span>
                          <button type="button" onClick={(): void => removeAction(i)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </button>
                        </div>
                        {a.type === 'move_to_folder' && (
                          <select
                            className="mt-1 w-full rounded border border-border px-2 py-1"
                            value={a.folderId}
                            onChange={(e): void =>
                              patchAction(i, { folderId: Number(e.target.value) })
                            }
                          >
                            {folders.length === 0 ? (
                              <option value={0}>Ordner waehlen (Konto filtern)</option>
                            ) : (
                              folders.map((f) => (
                                <option key={f.id} value={f.id}>
                                  {f.name}
                                </option>
                              ))
                            )}
                          </select>
                        )}
                        {a.type === 'add_tag' && (
                          <input
                            className="mt-1 w-full rounded border border-border px-2 py-1"
                            value={a.tag}
                            onChange={(e): void => patchAction(i, { tag: e.target.value })}
                          />
                        )}
                        {a.type === 'add_to_todo' && (
                          <select
                            className="mt-1 w-full rounded border border-border px-2 py-1"
                            value={a.dueKind}
                            onChange={(e): void =>
                              patchAction(i, { dueKind: e.target.value as TodoDueKindOpen })
                            }
                          >
                            <option value="today">Heute</option>
                            <option value="tomorrow">Morgen</option>
                            <option value="this_week">Diese Woche</option>
                            <option value="later">Spaeter</option>
                          </select>
                        )}
                        {a.type === 'snooze' && (
                          <select
                            className="mt-1 w-full rounded border border-border px-2 py-1"
                            value={a.preset}
                            onChange={(e): void =>
                              patchAction(i, { preset: e.target.value as RuleSnoozePreset })
                            }
                          >
                            <option value="in-1-hour">In 1 Std.</option>
                            <option value="in-3-hours">In 3 Std.</option>
                            <option value="this-evening">Heute Abend</option>
                            <option value="tomorrow-morning">Morgen frueh</option>
                            <option value="tomorrow-evening">Morgen Abend</option>
                            <option value="next-monday">Naechster Montag</option>
                          </select>
                        )}
                      </li>
                    ))}
                  </ol>
                </section>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                    onClick={(): void => void saveRule()}
                  >
                    Speichern
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs"
                    onClick={(): void => void runDry()}
                  >
                    <FlaskConical className="h-3.5 w-3.5" />
                    Dry-Run
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs"
                    onClick={(): void => void runManual()}
                  >
                    <Play className="h-3.5 w-3.5" />
                    Manuell anwenden
                  </button>
                  <button
                    type="button"
                    className="ml-auto text-xs text-destructive hover:underline"
                    onClick={(): void => void deleteRule()}
                  >
                    Regel loeschen
                  </button>
                </div>

                {dryResult && (
                  <section className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
                    <div className="mb-1 font-semibold">
                      Dry-Run: {dryResult.hits.length} Treffer (von {dryResult.totalScanned} geprueft)
                    </div>
                    <ul className="max-h-40 space-y-0.5 overflow-auto">
                      {dryResult.hits.slice(0, 40).map((h) => (
                        <li key={h.messageId} className="truncate">
                          #{h.messageId} {h.fromAddr} — {h.subject}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            )}
          </main>
        </div>
      )}
    </div>
  )
}
