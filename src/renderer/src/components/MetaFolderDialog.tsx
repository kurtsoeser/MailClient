import { Fragment, useEffect, useMemo, useState } from 'react'
import { X, Loader2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MetaFolderExcRowState, MetaFolderUiPreset } from '@/components/meta-folder-ui-types'
import { buildMetaFolderRuleSummaryDe, MetaFolderRuleFlow } from '@/components/MetaFolderRuleVisual'
import type {
  ConnectedAccount,
  MailFolder,
  MetaFolderCriteria,
  MetaFolderCreateInput,
  MetaFolderExceptionClause,
  MetaFolderSummary,
  MetaFolderUpdateInput
} from '@shared/types'

function compactNonEmptyLines(lines: string[]): string[] {
  return lines.map((l) => l.trim()).filter((l) => l.length > 0)
}

function newExcRow(): MetaFolderExcRowState {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    textQuery: '',
    unread: false,
    flagged: false,
    attach: false,
    from: ''
  }
}

function exceptionRowToClause(r: MetaFolderExcRowState): MetaFolderExceptionClause | null {
  const c: MetaFolderExceptionClause = {}
  if (r.unread) c.unreadOnly = true
  if (r.flagged) c.flaggedOnly = true
  if (r.attach) c.hasAttachmentsOnly = true
  const t = r.textQuery.trim()
  if (t.length >= 2) c.textQuery = t
  const f = r.from.trim()
  if (f.length >= 2) c.fromContains = f
  if (!c.unreadOnly && !c.flaggedOnly && !c.hasAttachmentsOnly && !c.textQuery && !c.fromContains) {
    return null
  }
  return c
}

function validateExceptionRows(rows: MetaFolderExcRowState[]): string | null {
  for (const r of rows) {
    const t = r.textQuery.trim()
    const f = r.from.trim()
    const any =
      r.unread || r.flagged || r.attach || t.length > 0 || f.length > 0
    if (!any) continue
    if (t.length === 1) return 'Ausnahme: Volltext braucht mindestens zwei Zeichen.'
    if (f.length === 1) return 'Ausnahme: Absender-Teilstring braucht mindestens zwei Zeichen.'
    if (!r.unread && !r.flagged && !r.attach && t.length < 2 && f.length < 2) {
      return 'Ausnahme: jede befuellte Zeile braucht mindestens einen gueltigen Filter.'
    }
  }
  return null
}

function criteriaToFullTextLines(c: MetaFolderCriteria): string[] {
  const lines: string[] = []
  const t0 = c.textQuery?.trim()
  if (t0) lines.push(t0)
  for (const x of c.textQueryOrAlternatives ?? []) {
    if (typeof x === 'string' && x.trim().length > 0) lines.push(x.trim())
  }
  return lines.length > 0 ? lines : ['']
}

function criteriaToFromLines(c: MetaFolderCriteria): string[] {
  const lines: string[] = []
  const f0 = c.fromContains?.trim()
  if (f0) lines.push(f0)
  for (const x of c.fromContainsOrAlternatives ?? []) {
    if (typeof x === 'string' && x.trim().length > 0) lines.push(x.trim())
  }
  return lines.length > 0 ? lines : ['']
}

function clauseToExcRow(cl: MetaFolderExceptionClause): MetaFolderExcRowState {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    textQuery: cl.textQuery?.trim() ?? '',
    unread: cl.unreadOnly === true,
    flagged: cl.flaggedOnly === true,
    attach: cl.hasAttachmentsOnly === true,
    from: cl.fromContains?.trim() ?? ''
  }
}

function detectPresetFromCriteria(c: MetaFolderCriteria): MetaFolderUiPreset {
  const hasText =
    Boolean(c.textQuery?.trim()) ||
    (c.textQueryOrAlternatives?.some((x) => typeof x === 'string' && x.trim().length > 0) ?? false)
  const hasFrom =
    Boolean(c.fromContains?.trim()) ||
    (c.fromContainsOrAlternatives?.some((x) => typeof x === 'string' && x.trim().length > 0) ?? false)
  const hasScope = (c.scopeFolderIds?.length ?? 0) > 0
  const nBool = (c.unreadOnly ? 1 : 0) + (c.flaggedOnly ? 1 : 0) + (c.hasAttachmentsOnly ? 1 : 0)

  if (nBool === 1 && !hasText && !hasFrom && !hasScope) {
    if (c.unreadOnly) return 'unread'
    if (c.flaggedOnly) return 'flagged'
    if (c.hasAttachmentsOnly) return 'attachments'
  }
  if (hasText && !hasFrom && nBool === 0 && !hasScope) return 'fulltext'
  return 'custom'
}

interface Props {
  open: boolean
  /** Bearbeitungsmodus; `null` = neuer Meta-Ordner. */
  editing: MetaFolderSummary | null
  accounts: ConnectedAccount[]
  foldersByAccount: Record<string, MailFolder[]>
  onClose: () => void
  onCreate: (input: MetaFolderCreateInput) => Promise<void>
  onUpdate: (input: MetaFolderUpdateInput) => Promise<void>
}

function buildCriteria(
  preset: MetaFolderUiPreset,
  fullTextLines: string[],
  customUnread: boolean,
  customFlagged: boolean,
  customAttach: boolean,
  fromLines: string[],
  useScope: boolean,
  scopeFolderIds: number[]
): MetaFolderCriteria {
  const compact = compactNonEmptyLines(fullTextLines)
  const fromCompact = compactNonEmptyLines(fromLines)
  if (preset === 'unread') return { unreadOnly: true }
  if (preset === 'flagged') return { flaggedOnly: true }
  if (preset === 'attachments') return { hasAttachmentsOnly: true }
  if (preset === 'fulltext') {
    const c: MetaFolderCriteria = {}
    if (compact[0]) c.textQuery = compact[0]
    if (compact.length > 1) c.textQueryOrAlternatives = compact.slice(1)
    return c
  }
  const c: MetaFolderCriteria = {}
  if (customUnread) c.unreadOnly = true
  if (customFlagged) c.flaggedOnly = true
  if (customAttach) c.hasAttachmentsOnly = true
  if (compact[0]) c.textQuery = compact[0]
  if (compact.length > 1) c.textQueryOrAlternatives = compact.slice(1)
  if (fromCompact[0]) c.fromContains = fromCompact[0]
  if (fromCompact.length > 1) c.fromContainsOrAlternatives = fromCompact.slice(1)
  if (useScope && scopeFolderIds.length > 0) c.scopeFolderIds = scopeFolderIds
  return c
}

function fullTextLinesValidationError(lines: string[]): string | null {
  for (const raw of lines) {
    const t = raw.trim()
    if (t.length === 1) return 'Volltext: pro Zeile mindestens zwei Zeichen (oder Zeile leeren).'
  }
  return null
}

function fullTextLinesHaveFilter(lines: string[]): boolean {
  return compactNonEmptyLines(lines).some((l) => l.length >= 2)
}

function fromLinesValidationError(lines: string[]): string | null {
  for (const raw of lines) {
    const t = raw.trim()
    if (t.length === 1) return 'Absender: pro Zeile mindestens zwei Zeichen (oder Zeile leeren).'
  }
  return null
}

function fromLinesHaveFilter(lines: string[]): boolean {
  return compactNonEmptyLines(lines).some((l) => l.length >= 2)
}

function localValidate(
  name: string,
  preset: MetaFolderUiPreset,
  fullTextLines: string[],
  customUnread: boolean,
  customFlagged: boolean,
  customAttach: boolean,
  fromLines: string[],
  useScope: boolean,
  scopeFolderIds: number[],
  exceptionRows: MetaFolderExcRowState[]
): string | null {
  const n = name.trim()
  if (n.length < 1) return 'Bitte einen Namen eingeben.'
  if (useScope && scopeFolderIds.length === 0) {
    return 'Ordnerfilter: mindestens einen Ordner auswaehlen oder die Option deaktivieren.'
  }
  const ftsLineErr = fullTextLinesValidationError(fullTextLines)
  if (ftsLineErr) return ftsLineErr
  const fromLineErr = fromLinesValidationError(fromLines)
  if (fromLineErr) return fromLineErr
  if (preset === 'fulltext' && !fullTextLinesHaveFilter(fullTextLines)) {
    return 'Volltext: mindestens eine Zeile mit mindestens zwei Zeichen.'
  }
  const exErr = validateExceptionRows(exceptionRows)
  if (exErr) return exErr
  if (preset === 'custom') {
    const c = buildCriteria(
      preset,
      fullTextLines,
      customUnread,
      customFlagged,
      customAttach,
      fromLines,
      useScope,
      scopeFolderIds
    )
    const has =
      !!c.unreadOnly ||
      !!c.flaggedOnly ||
      !!c.hasAttachmentsOnly ||
      fullTextLinesHaveFilter(fullTextLines) ||
      fromLinesHaveFilter(fromLines) ||
      (c.scopeFolderIds?.length ?? 0) > 0
    if (!has) return 'Benutzerdefiniert: mindestens einen Filter setzen.'
  }
  return null
}

export function MetaFolderDialog({
  open,
  editing,
  accounts,
  foldersByAccount,
  onClose,
  onCreate,
  onUpdate
}: Props): JSX.Element | null {
  const isEdit = editing != null
  const [name, setName] = useState('')
  const [preset, setPreset] = useState<MetaFolderUiPreset>('unread')
  const [fullTextLines, setFullTextLines] = useState<string[]>([''])
  const [customUnread, setCustomUnread] = useState(false)
  const [customFlagged, setCustomFlagged] = useState(false)
  const [customAttach, setCustomAttach] = useState(false)
  const [fromLines, setFromLines] = useState<string[]>([''])
  const [useScope, setUseScope] = useState(false)
  const [scopeFolderIds, setScopeFolderIds] = useState<number[]>([])
  const [matchCombine, setMatchCombine] = useState<'and' | 'or'>('and')
  const [exceptionRows, setExceptionRows] = useState<MetaFolderExcRowState[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    if (editing) {
      setName(editing.name)
      const c = editing.criteria
      setPreset(detectPresetFromCriteria(c))
      setFullTextLines(criteriaToFullTextLines(c))
      setFromLines(criteriaToFromLines(c))
      setCustomUnread(c.unreadOnly === true)
      setCustomFlagged(c.flaggedOnly === true)
      setCustomAttach(c.hasAttachmentsOnly === true)
      const scope = (c.scopeFolderIds ?? []).filter((id) => Number.isFinite(id) && id > 0)
      setUseScope(scope.length > 0)
      setScopeFolderIds(scope)
      setMatchCombine(c.matchOp === 'or' ? 'or' : 'and')
      setExceptionRows((c.exceptions ?? []).map(clauseToExcRow))
      setError(null)
      setBusy(false)
      return
    }
    setName('')
    setPreset('unread')
    setFullTextLines([''])
    setCustomUnread(false)
    setCustomFlagged(false)
    setCustomAttach(false)
    setFromLines([''])
    setUseScope(false)
    setScopeFolderIds([])
    setMatchCombine('and')
    setExceptionRows([])
    setError(null)
    setBusy(false)
  }, [open, editing?.id, editing?.updatedAt])

  const folderOptions = useMemo(() => {
    const out: Array<{ id: number; label: string }> = []
    for (const acc of accounts) {
      const folders = foldersByAccount[acc.id] ?? []
      for (const f of folders) {
        out.push({
          id: f.id,
          label: `${acc.email} — ${f.name}`
        })
      }
    }
    out.sort((a, b) => a.label.localeCompare(b.label, 'de'))
    return out
  }, [accounts, foldersByAccount])

  const ruleSummaryDe = useMemo(
    () =>
      buildMetaFolderRuleSummaryDe({
        preset,
        useScope,
        scopeFolderIds,
        folderOptions,
        matchCombine,
        customUnread,
        customFlagged,
        customAttach,
        fullTextLines,
        fromLines,
        exceptionRows
      }),
    [
      preset,
      useScope,
      scopeFolderIds,
      folderOptions,
      matchCombine,
      customUnread,
      customFlagged,
      customAttach,
      fullTextLines,
      fromLines,
      exceptionRows
    ]
  )

  function changeFullTextLine(index: number, value: string): void {
    setFullTextLines((prev) => prev.map((l, i) => (i === index ? value : l)))
  }

  function addFullTextLine(): void {
    setFullTextLines((prev) => [...prev, ''])
  }

  function removeFullTextLine(index: number): void {
    setFullTextLines((prev) => {
      if (prev.length <= 1) return ['']
      return prev.filter((_, i) => i !== index)
    })
  }

  function clearAllFullTextLines(): void {
    setFullTextLines([''])
  }

  function changeFromLine(index: number, value: string): void {
    setFromLines((prev) => prev.map((l, i) => (i === index ? value : l)))
  }

  function addFromLine(): void {
    setFromLines((prev) => [...prev, ''])
  }

  function removeFromLine(index: number): void {
    setFromLines((prev) => {
      if (prev.length <= 1) return ['']
      return prev.filter((_, i) => i !== index)
    })
  }

  function clearAllFromLines(): void {
    setFromLines([''])
  }

  if (!open) return null

  async function handleSubmit(): Promise<void> {
    const err = localValidate(
      name,
      preset,
      fullTextLines,
      customUnread,
      customFlagged,
      customAttach,
      fromLines,
      useScope,
      scopeFolderIds,
      exceptionRows
    )
    if (err) {
      setError(err)
      return
    }
    const criteriaRaw = buildCriteria(
      preset,
      fullTextLines,
      customUnread,
      customFlagged,
      customAttach,
      fromLines,
      useScope,
      scopeFolderIds
    )
    const exceptions = exceptionRows
      .map(exceptionRowToClause)
      .filter((x): x is MetaFolderExceptionClause => x != null)
    const criteria: MetaFolderCriteria = {
      ...criteriaRaw,
      ...(useScope && scopeFolderIds.length > 0 ? { scopeFolderIds } : {}),
      ...(preset === 'custom' && matchCombine === 'or' ? { matchOp: 'or' as const } : {}),
      ...(exceptions.length > 0 ? { exceptions } : {})
    }
    setBusy(true)
    setError(null)
    try {
      if (isEdit && editing) {
        await onUpdate({ id: editing.id, name: name.trim(), criteria })
      } else {
        await onCreate({ name: name.trim(), criteria })
      }
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  function toggleScopeFolder(id: number): void {
    setScopeFolderIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-[min(520px,94vw)] flex-col overflow-hidden rounded-xl border border-border bg-card text-foreground shadow-2xl"
        onClick={(e): void => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3.5">
          <div>
            <h2 className="text-sm font-semibold">{isEdit ? 'Meta-Ordner bearbeiten' : 'Neuer Meta-Ordner'}</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Virtuelle Ansicht ueber alle Konten — Mails werden nicht verschoben.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Schliessen"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 text-xs">
          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                1
              </span>
              <span className="font-medium text-foreground">Name</span>
            </div>
            <input
              type="text"
              value={name}
              onChange={(e): void => setName(e.target.value)}
              placeholder="Namen des Meta-Ordners eingeben"
              className="w-full rounded-md border border-input bg-background px-2.5 py-2 text-xs outline-none ring-primary focus-visible:ring-2"
              maxLength={120}
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                2
              </span>
              <span className="font-medium text-foreground">Typ</span>
            </div>
            <select
              value={preset}
              onChange={(e): void => setPreset(e.target.value as MetaFolderUiPreset)}
              className="w-full rounded-md border border-input bg-background px-2 py-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <option value="unread">Ungelesen (alle Konten)</option>
              <option value="flagged">Markiert (alle Konten)</option>
              <option value="attachments">Mit Anhang (alle Konten)</option>
              <option value="fulltext">Volltextsuche</option>
              <option value="custom">Benutzerdefiniert</option>
            </select>
          </div>

          {preset === 'fulltext' && (
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                Suchbegriff(e) — Zeilen per ODER verknuepft
              </label>
              <div className="space-y-2 rounded-md border border-input bg-background p-2">
                {fullTextLines.map((line, idx) => (
                  <Fragment key={idx}>
                    {idx > 0 && (
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        oder
                      </div>
                    )}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={line}
                        onChange={(e): void => changeFullTextLine(idx, e.target.value)}
                        placeholder={idx === 0 ? 'z. B. Pädagogische Hochschule' : 'Alternative…'}
                        className="min-w-0 flex-1 rounded-md border border-input bg-background px-2.5 py-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      />
                      {fullTextLines.length > 1 && (
                        <button
                          type="button"
                          onClick={(): void => removeFullTextLine(idx)}
                          className="shrink-0 rounded p-2 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                          aria-label="Zeile entfernen"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </Fragment>
                ))}
                <button
                  type="button"
                  onClick={addFullTextLine}
                  className="w-full rounded border border-dashed border-primary/40 py-1.5 text-[11px] font-medium text-primary hover:bg-primary/10"
                >
                  + Weitere Volltext-Zeile (ODER)
                </button>
              </div>
            </div>
          )}

          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              checked={useScope}
              onChange={(e): void => setUseScope(e.target.checked)}
              className="mt-0.5 rounded border-input"
            />
            <span>
              Nach bestimmten Ordnern filtern (optional){' '}
              <span className="text-muted-foreground">— sonst alle Ordner ausser Papierkorb/Junk</span>
            </span>
          </label>

          {useScope && (
            <div className="max-h-40 overflow-y-auto rounded-md border border-border bg-background/50 p-2">
              {folderOptions.length === 0 ? (
                <div className="py-2 text-center text-[11px] text-muted-foreground">Keine Ordner geladen.</div>
              ) : (
                folderOptions.map((o) => (
                  <label
                    key={o.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-secondary/50"
                  >
                    <input
                      type="checkbox"
                      checked={scopeFolderIds.includes(o.id)}
                      onChange={(): void => toggleScopeFolder(o.id)}
                      className="rounded border-input"
                    />
                    <span className="truncate">{o.label}</span>
                  </label>
                ))
              )}
            </div>
          )}

          <MetaFolderRuleFlow
            preset={preset}
            interactive
            useScope={useScope}
            scopeFolderIds={scopeFolderIds}
            folderOptions={folderOptions}
            matchCombine={matchCombine}
            customUnread={customUnread}
            customFlagged={customFlagged}
            customAttach={customAttach}
            fullTextLines={fullTextLines}
            fromLines={fromLines}
            exceptionRows={exceptionRows}
            onMatchCombine={setMatchCombine}
            onSetUnread={setCustomUnread}
            onSetFlagged={setCustomFlagged}
            onSetAttach={setCustomAttach}
            onChangeFullTextLine={changeFullTextLine}
            onAddFullTextLine={addFullTextLine}
            onRemoveFullTextLine={removeFullTextLine}
            onClearAllFullTextLines={clearAllFullTextLines}
            onChangeFromLine={changeFromLine}
            onAddFromLine={addFromLine}
            onRemoveFromLine={removeFromLine}
            onClearAllFromLines={clearAllFromLines}
            onUpdateExc={(id, patch): void =>
              setExceptionRows((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)))
            }
            onRemoveExc={(id): void => setExceptionRows((prev) => prev.filter((x) => x.id !== id))}
            onAddExc={(): void => setExceptionRows((prev) => [...prev, newExcRow()])}
          />

          <p className="rounded-md border border-border/60 bg-muted/20 px-2.5 py-2 text-[11px] leading-snug text-muted-foreground">
            {ruleSummaryDe}
          </p>

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-2 text-[11px] text-destructive">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary"
          >
            Abbrechen
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={(): void => void handleSubmit()}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground',
              'hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50'
            )}
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {isEdit ? 'Speichern' : 'Anlegen'}
          </button>
        </div>
      </div>
    </div>
  )
}
