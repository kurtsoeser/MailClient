import { Fragment, useEffect, useRef, useState } from 'react'
import {
  ArrowDown,
  Ban,
  ChevronDown,
  Filter,
  FolderInput,
  Layers,
  MailOpen,
  Paperclip,
  Search,
  Star,
  UserRound,
  X
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MetaFolderExcRowState, MetaFolderUiPreset } from '@/components/meta-folder-ui-types'

function scopeSummaryDe(
  useScope: boolean,
  scopeFolderIds: number[],
  folderOptions: Array<{ id: number; label: string }>
): string {
  if (!useScope || scopeFolderIds.length === 0) {
    return 'Alle synchronisierten Ordner außer Papierkorb und Junk-E-Mail.'
  }
  const labels = scopeFolderIds
    .map((id) => folderOptions.find((o) => o.id === id)?.label ?? `#${id}`)
    .slice(0, 4)
  const more = scopeFolderIds.length > 4 ? ` … (+${scopeFolderIds.length - 4} weitere)` : ''
  return `Nur in ${scopeFolderIds.length} ausgewählten Ordnern: ${labels.join(', ')}${more}.`
}

export function buildMetaFolderRuleSummaryDe(args: {
  preset: MetaFolderUiPreset
  useScope: boolean
  scopeFolderIds: number[]
  folderOptions: Array<{ id: number; label: string }>
  matchCombine: 'and' | 'or'
  customUnread: boolean
  customFlagged: boolean
  customAttach: boolean
  fullText: string
  customFrom: string
  exceptionRows: MetaFolderExcRowState[]
}): string {
  const {
    preset,
    useScope,
    scopeFolderIds,
    folderOptions,
    matchCombine,
    customUnread,
    customFlagged,
    customAttach,
    fullText,
    customFrom,
    exceptionRows
  } = args
  const parts: string[] = []
  parts.push(scopeSummaryDe(useScope, scopeFolderIds, folderOptions))

  const join = matchCombine === 'or' ? ' oder ' : ' und '
  if (preset === 'unread') parts.push('Es erscheinen nur ungelesene Mails.')
  else if (preset === 'flagged') parts.push('Es erscheinen nur markierte Mails.')
  else if (preset === 'attachments') parts.push('Es erscheinen nur Mails mit Anhang.')
  else if (preset === 'fulltext') {
    const q = fullText.trim()
    parts.push(q.length >= 2 ? `Volltext passt auf: „${q}“.` : 'Volltextfilter (noch zu kurz).')
  } else {
    const bits: string[] = []
    if (customUnread) bits.push('ungelesen')
    if (customFlagged) bits.push('markiert')
    if (customAttach) bits.push('mit Anhang')
    const t = fullText.trim()
    if (t.length >= 2) bits.push(`Volltext „${t}“`)
    const f = customFrom.trim()
    if (f.length >= 2) bits.push(`Absender enthält „${f}“`)
    if (bits.length === 0) parts.push('Hauptfilter: (noch nichts gewählt).')
    else
      parts.push(
        `Hauptfilter (${matchCombine === 'or' ? 'mindestens eine Bedingung' : 'alle Bedingungen'}): ${bits.join(join)}.`
      )
  }

  const exBits: string[] = []
  for (const r of exceptionRows) {
    const sub: string[] = []
    if (r.unread) sub.push('ungelesen')
    if (r.flagged) sub.push('markiert')
    if (r.attach) sub.push('mit Anhang')
    const rt = r.textQuery.trim()
    if (rt.length >= 2) sub.push(`Volltext „${rt}“`)
    const rf = r.from.trim()
    if (rf.length >= 2) sub.push(`Absender „${rf}“`)
    if (sub.length > 0) exBits.push(`(${sub.join(' und ')})`)
  }
  if (exBits.length > 0) {
    parts.push(`Ausnahme — ausschließen wenn ${exBits.join(' oder ')} (je Karte: innerhalb UND).`)
  }

  return parts.join(' ')
}

function FlowConnector(): JSX.Element {
  return (
    <div className="flex justify-center py-0.5">
      <ArrowDown className="h-4 w-4 shrink-0 text-muted-foreground/70" aria-hidden />
    </div>
  )
}

function StepBadge({ n, tone }: { n: number; tone: 'emerald' | 'sky' | 'rose' }): JSX.Element {
  const cls =
    tone === 'emerald'
      ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
      : tone === 'sky'
        ? 'border-sky-500/50 bg-sky-500/15 text-sky-800 dark:text-sky-200'
        : 'border-rose-500/50 bg-rose-500/15 text-rose-800 dark:text-rose-200'
  return (
    <span
      className={cn(
        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold',
        cls
      )}
    >
      {n}
    </span>
  )
}

function JoinPill({ label }: { label: string }): JSX.Element {
  return (
    <span className="rounded-full border border-dashed border-muted-foreground/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      {label}
    </span>
  )
}

export interface MetaFolderRuleFlowProps {
  preset: MetaFolderUiPreset
  interactive: boolean
  useScope: boolean
  scopeFolderIds: number[]
  folderOptions: Array<{ id: number; label: string }>
  matchCombine: 'and' | 'or'
  customUnread: boolean
  customFlagged: boolean
  customAttach: boolean
  fullText: string
  customFrom: string
  exceptionRows: MetaFolderExcRowState[]
  onMatchCombine: (v: 'and' | 'or') => void
  onSetUnread: (v: boolean) => void
  onSetFlagged: (v: boolean) => void
  onSetAttach: (v: boolean) => void
  onFullText: (v: string) => void
  onCustomFrom: (v: string) => void
  onUpdateExc: (id: string, patch: Partial<MetaFolderExcRowState>) => void
  onRemoveExc: (id: string) => void
  onAddExc: () => void
}

export function MetaFolderRuleFlow(props: MetaFolderRuleFlowProps): JSX.Element {
  const {
    preset,
    interactive,
    useScope,
    scopeFolderIds,
    folderOptions,
    matchCombine,
    customUnread,
    customFlagged,
    customAttach,
    fullText,
    customFrom,
    exceptionRows,
    onMatchCombine,
    onSetUnread,
    onSetFlagged,
    onSetAttach,
    onFullText,
    onCustomFrom,
    onUpdateExc,
    onRemoveExc,
    onAddExc
  } = props

  const [addOpen, setAddOpen] = useState(false)
  const addRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!addOpen) return
    function onDoc(e: MouseEvent): void {
      if (addRef.current && !addRef.current.contains(e.target as Node)) setAddOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return (): void => document.removeEventListener('mousedown', onDoc)
  }, [addOpen])

  const scopeText = scopeSummaryDe(useScope, scopeFolderIds, folderOptions)
  const joinLabel = matchCombine === 'or' ? 'ODER' : 'UND'

  function renderPresetMain(): JSX.Element {
    if (preset === 'unread') {
      return (
        <div className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background/80 px-2.5 py-1.5 text-[11px] font-medium shadow-sm">
          <MailOpen className="h-3.5 w-3.5 shrink-0 text-primary" />
          Nur ungelesen
        </div>
      )
    }
    if (preset === 'flagged') {
      return (
        <div className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background/80 px-2.5 py-1.5 text-[11px] font-medium shadow-sm">
          <Star className="h-3.5 w-3.5 shrink-0 text-primary" />
          Nur markiert
        </div>
      )
    }
    if (preset === 'attachments') {
      return (
        <div className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background/80 px-2.5 py-1.5 text-[11px] font-medium shadow-sm">
          <Paperclip className="h-3.5 w-3.5 shrink-0 text-primary" />
          Mit Anhang
        </div>
      )
    }
    if (preset === 'fulltext') {
      const q = fullText.trim()
      return (
        <div className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background/80 px-2.5 py-1.5 text-[11px] font-medium shadow-sm">
          <Search className="h-3.5 w-3.5 shrink-0 text-primary" />
          {q ? `Volltext: „${q}“` : 'Volltextsuche (Suchbegriff unten eintragen)'}
        </div>
      )
    }
    return <div className="text-[11px] text-muted-foreground">—</div>
  }

  function renderCustomMain(): JSX.Element {
    const chips: JSX.Element[] = []
    let n = 0
    const pushJoin = (): void => {
      if (n > 0) chips.push(<JoinPill key={`j-${n}`} label={joinLabel} />)
    }

    if (customUnread) {
      pushJoin()
      chips.push(
        <div
          key="u"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background/90 px-2.5 py-1.5 text-[11px] font-medium shadow-sm"
        >
          <MailOpen className="h-3.5 w-3.5 shrink-0 text-primary" />
          Ungelesen
          <button
            type="button"
            className="rounded p-0.5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
            onClick={(): void => onSetUnread(false)}
            aria-label="Entfernen"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )
      n++
    }
    if (customFlagged) {
      pushJoin()
      chips.push(
        <div
          key="f"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background/90 px-2.5 py-1.5 text-[11px] font-medium shadow-sm"
        >
          <Star className="h-3.5 w-3.5 shrink-0 text-primary" />
          Markiert
          <button
            type="button"
            className="rounded p-0.5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
            onClick={(): void => onSetFlagged(false)}
            aria-label="Entfernen"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )
      n++
    }
    if (customAttach) {
      pushJoin()
      chips.push(
        <div
          key="a"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background/90 px-2.5 py-1.5 text-[11px] font-medium shadow-sm"
        >
          <Paperclip className="h-3.5 w-3.5 shrink-0 text-primary" />
          Mit Anhang
          <button
            type="button"
            className="rounded p-0.5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
            onClick={(): void => onSetAttach(false)}
            aria-label="Entfernen"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )
      n++
    }

    pushJoin()
    chips.push(
      <div
        key="ft"
        className="inline-flex min-w-[160px] max-w-full flex-1 flex-col gap-1 rounded-lg border border-border bg-background/90 px-2 py-1.5 shadow-sm"
      >
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Search className="h-3 w-3 shrink-0" />
          Volltext
          {fullText.trim().length > 0 && (
            <button
              type="button"
              className="ml-auto rounded p-0.5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
              onClick={(): void => onFullText('')}
              aria-label="Volltext leeren"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <input
          type="text"
          value={fullText}
          onChange={(e): void => onFullText(e.target.value)}
          placeholder="Suchbegriff…"
          className="w-full rounded border border-input bg-background px-1.5 py-1 text-[11px] outline-none focus-visible:ring-1 focus-visible:ring-primary"
        />
      </div>
    )
    n += 1

    pushJoin()
    chips.push(
      <div
        key="fr"
        className="inline-flex min-w-[160px] max-w-full flex-1 flex-col gap-1 rounded-lg border border-border bg-background/90 px-2 py-1.5 shadow-sm"
      >
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <UserRound className="h-3 w-3 shrink-0" />
          Absender enthält
          {customFrom.trim().length > 0 && (
            <button
              type="button"
              className="ml-auto rounded p-0.5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
              onClick={(): void => onCustomFrom('')}
              aria-label="Absender leeren"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <input
          type="text"
          value={customFrom}
          onChange={(e): void => onCustomFrom(e.target.value)}
          placeholder="E-Mail oder Name…"
          className="w-full rounded border border-input bg-background px-1.5 py-1 text-[11px] outline-none focus-visible:ring-1 focus-visible:ring-primary"
        />
      </div>
    )

    return (
      <div className="flex flex-wrap items-center gap-2">
        {chips}
        <div className="relative" ref={addRef}>
          <button
            type="button"
            onClick={(): void => setAddOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded-lg border border-dashed border-primary/50 bg-primary/5 px-2 py-1.5 text-[11px] font-medium text-primary hover:bg-primary/10"
          >
            + Bedingung
            <ChevronDown className={cn('h-3 w-3 transition', addOpen && 'rotate-180')} />
          </button>
          {addOpen && (
            <div className="absolute left-0 top-full z-20 mt-1 min-w-[180px] rounded-md border border-border bg-popover py-1 text-[11px] shadow-lg">
              {!customUnread && (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-secondary"
                  onClick={(): void => {
                    onSetUnread(true)
                    setAddOpen(false)
                  }}
                >
                  <MailOpen className="h-3.5 w-3.5" /> Ungelesen
                </button>
              )}
              {!customFlagged && (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-secondary"
                  onClick={(): void => {
                    onSetFlagged(true)
                    setAddOpen(false)
                  }}
                >
                  <Star className="h-3.5 w-3.5" /> Markiert
                </button>
              )}
              {!customAttach && (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-secondary"
                  onClick={(): void => {
                    onSetAttach(true)
                    setAddOpen(false)
                  }}
                >
                  <Paperclip className="h-3.5 w-3.5" /> Mit Anhang
                </button>
              )}
              {customUnread && customFlagged && customAttach && (
                <div className="px-2 py-1.5 text-muted-foreground">Alle Basis-Bedingungen aktiv</div>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  const showExceptionsBlock = interactive || exceptionRows.length > 0

  return (
    <div className="rounded-xl border border-border/80 bg-gradient-to-b from-muted/30 to-card/80 p-3 shadow-inner">
      <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Layers className="h-3.5 w-3.5" />
        Regel grafisch
      </div>

      <div className="flex flex-col">
        <div className="flex gap-2">
          <StepBadge n={1} tone="emerald" />
          <div className="min-w-0 flex-1 rounded-lg border-l-4 border-l-emerald-500 bg-emerald-500/[0.07] px-3 py-2">
            <div className="flex items-center gap-2 text-[11px] font-semibold text-foreground">
              <FolderInput className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              Wo suchen?
            </div>
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{scopeText}</p>
          </div>
        </div>

        <FlowConnector />

        <div className="flex gap-2">
          <StepBadge n={2} tone="sky" />
          <div className="min-w-0 flex-1 space-y-2 rounded-lg border-l-4 border-l-sky-500 bg-sky-500/[0.07] px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[11px] font-semibold text-foreground">
                <Filter className="h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-400" />
                Was soll rein?
              </div>
              {preset === 'custom' && (
                <div className="flex items-center gap-1 rounded-md bg-background/60 px-1 py-0.5 text-[10px]">
                  <span className="px-1 text-muted-foreground">Hauptfilter</span>
                  <button
                    type="button"
                    className={cn(
                      'rounded px-1.5 py-0.5 font-semibold',
                      matchCombine === 'and' ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary'
                    )}
                    onClick={(): void => onMatchCombine('and')}
                  >
                    UND
                  </button>
                  <button
                    type="button"
                    className={cn(
                      'rounded px-1.5 py-0.5 font-semibold',
                      matchCombine === 'or' ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary'
                    )}
                    onClick={(): void => onMatchCombine('or')}
                  >
                    ODER
                  </button>
                </div>
              )}
            </div>
            {preset === 'custom' ? renderCustomMain() : renderPresetMain()}
          </div>
        </div>

        {showExceptionsBlock && (
          <>
            <FlowConnector />
            <div className="flex gap-2">
              <StepBadge n={3} tone="rose" />
              <div className="min-w-0 flex-1 space-y-2 rounded-lg border-l-4 border-l-rose-500 bg-rose-500/[0.06] px-3 py-2">
                <div className="flex items-center gap-2 text-[11px] font-semibold text-foreground">
                  <Ban className="h-3.5 w-3.5 shrink-0 text-rose-600 dark:text-rose-400" />
                  Was soll raus?
                </div>
                <p className="text-[10px] leading-snug text-muted-foreground">
                  Zwischen den Karten gilt <strong>ODER</strong>. Innerhalb einer Karte: <strong>UND</strong>.
                </p>
                <div className="space-y-2">
                  {exceptionRows.map((row, idx) => (
                    <Fragment key={row.id}>
                      {idx > 0 && (
                        <div className="flex items-center gap-2 py-0.5">
                          <div className="h-px flex-1 bg-rose-500/25" />
                          <span className="shrink-0 rounded-full bg-rose-500/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-rose-700 dark:text-rose-300">
                            oder
                          </span>
                          <div className="h-px flex-1 bg-rose-500/25" />
                        </div>
                      )}
                      <div className="relative rounded-lg border border-rose-500/25 bg-background/70 p-2 shadow-sm">
                        {interactive && (
                          <button
                            type="button"
                            className="absolute right-1 top-1 rounded p-0.5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                            onClick={(): void => onRemoveExc(row.id)}
                            aria-label="Ausnahme entfernen"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <div className="flex flex-wrap gap-2 pr-6">
                          <label className="flex cursor-pointer items-center gap-1">
                            <input
                              type="checkbox"
                              checked={row.unread}
                              disabled={!interactive}
                              onChange={(e): void => onUpdateExc(row.id, { unread: e.target.checked })}
                              className="rounded border-input"
                            />
                            <span className="text-[11px]">Ungelesen</span>
                          </label>
                          <label className="flex cursor-pointer items-center gap-1">
                            <input
                              type="checkbox"
                              checked={row.flagged}
                              disabled={!interactive}
                              onChange={(e): void => onUpdateExc(row.id, { flagged: e.target.checked })}
                              className="rounded border-input"
                            />
                            <span className="text-[11px]">Markiert</span>
                          </label>
                          <label className="flex cursor-pointer items-center gap-1">
                            <input
                              type="checkbox"
                              checked={row.attach}
                              disabled={!interactive}
                              onChange={(e): void => onUpdateExc(row.id, { attach: e.target.checked })}
                              className="rounded border-input"
                            />
                            <span className="text-[11px]">Anhang</span>
                          </label>
                        </div>
                        <input
                          type="text"
                          value={row.textQuery}
                          disabled={!interactive}
                          onChange={(e): void => onUpdateExc(row.id, { textQuery: e.target.value })}
                          placeholder="Volltext in dieser Ausnahme"
                          className="mt-2 w-full rounded border border-input bg-background px-2 py-1 text-[11px] disabled:opacity-60"
                        />
                        <input
                          type="text"
                          value={row.from}
                          disabled={!interactive}
                          onChange={(e): void => onUpdateExc(row.id, { from: e.target.value })}
                          placeholder="Absender enthält"
                          className="mt-1 w-full rounded border border-input bg-background px-2 py-1 text-[11px] disabled:opacity-60"
                        />
                      </div>
                    </Fragment>
                  ))}
                </div>
                {interactive && (
                  <button
                    type="button"
                    onClick={onAddExc}
                    className="w-full rounded border border-dashed border-rose-500/40 py-1.5 text-[11px] font-medium text-rose-800/90 hover:bg-rose-500/10 dark:text-rose-200/90"
                  >
                    + Ausnahme-Karte
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
