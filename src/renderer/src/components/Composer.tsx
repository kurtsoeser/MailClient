import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Send,
  Save,
  X,
  Minus,
  Paperclip,
  AlertCircle,
  Loader2,
  ChevronDown,
  File as FileIcon,
  FileImage,
  FileText,
  Cloud,
  Cog
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatBytes } from '@/lib/format-bytes'
import { TipTapBody } from '@/components/TipTapBody'
import { SignatureTemplateControls } from '@/components/SignatureTemplateControls'
import { OneDriveExplorerDialog } from '@/components/OneDriveExplorerDialog'
import { RecipientTokenField } from '@/components/RecipientTokenField'
import {
  useComposeStore,
  type ComposeAttachmentFile,
  type ComposeDraft,
  type ComposeReferenceAttachmentDraft
} from '@/stores/compose'
import { useAccountsStore } from '@/stores/accounts'
import type { MailTemplate } from '@shared/types'
import { sanitizeComposeHtmlFragment } from '@/lib/sanitize-compose-html'
import { applyTemplateVariables } from '@/lib/template-variables'

const MAX_ATTACHMENTS_TOTAL_BYTES = 24 * 1024 * 1024 // 24 MB
const DEFAULT_WINDOW_WIDTH = 760
const DEFAULT_WINDOW_HEIGHT = 680
const MIN_WINDOW_WIDTH = 520
const MIN_WINDOW_HEIGHT = 420
const WINDOW_MARGIN = 16

export function ComposerStack(): JSX.Element | null {
  const drafts = useComposeStore((s) => s.drafts)
  const activeId = useComposeStore((s) => s.activeId)
  const floatingDrafts = useMemo(() => drafts.filter((d) => !d.embedInDashboard), [drafts])
  if (floatingDrafts.length === 0) return null

  return (
    <div className="pointer-events-none fixed inset-0 z-40">
      {floatingDrafts.map((d, idx) => (
        <ComposerWindow
          key={d.id}
          draft={d}
          index={idx}
          active={d.id === activeId}
          minimized={d.id !== activeId && floatingDrafts.length > 1 && idx !== floatingDrafts.length - 1}
        />
      ))}
    </div>
  )
}

function ComposerWindow({
  draft,
  index,
  active,
  minimized
}: {
  draft: ComposeDraft
  index: number
  active: boolean
  minimized: boolean
}): JSX.Element {
  const update = useComposeStore((s) => s.update)
  const close = useComposeStore((s) => s.close)
  const focus = useComposeStore((s) => s.focus)
  const send = useComposeStore((s) => s.send)
  const saveRemoteDraft = useComposeStore((s) => s.saveRemoteDraft)
  const addAttachments = useComposeStore((s) => s.addAttachments)
  const removeAttachment = useComposeStore((s) => s.removeAttachment)
  const accounts = useAccountsStore((s) => s.accounts)

  const [showQuoted, setShowQuoted] = useState(false)
  const [templates, setTemplates] = useState<MailTemplate[]>([])
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const dragDepthRef = useRef(0)
  const [draggingFiles, setDraggingFiles] = useState(false)
  const [driveOpen, setDriveOpen] = useState(false)
  const [sendOptionsOpen, setSendOptionsOpen] = useState(false)
  const sendOptionsRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!sendOptionsOpen) return
    const onDocMouseDown = (e: MouseEvent): void => {
      const el = sendOptionsRef.current
      if (el && !el.contains(e.target as Node)) {
        setSendOptionsOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return (): void => document.removeEventListener('mousedown', onDocMouseDown)
  }, [sendOptionsOpen])

  useEffect(() => {
    if (minimized) return
    void window.mailClient.mail
      .listTemplates()
      .then(setTemplates)
      .catch(() => setTemplates([]))
  }, [minimized, draft.id])
  const account = accounts.find((a) => a.id === draft.accountId) ?? accounts[0]
  const isMicrosoft = account?.provider === 'microsoft'

  const attachmentsTotal = draft.attachments.reduce((s, a) => s + a.size, 0)
  const windowState = draft.windowState ?? getInitialWindowState(index)

  useEffect(() => {
    if (draft.windowState) return
    update(draft.id, { windowState })
  }, [draft.id, draft.windowState, update, windowState])

  const updateWindowState = useCallback(
    (patch: Partial<NonNullable<ComposeDraft['windowState']>>): void => {
      const current = useComposeStore.getState().drafts.find((d) => d.id === draft.id)
      const base = current?.windowState ?? windowState
      update(draft.id, { windowState: clampWindowState({ ...base, ...patch }) })
    },
    [draft.id, update, windowState]
  )

  const handleDragStart = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest('button, input, select, textarea, a')) return
    e.preventDefault()
    focus(draft.id)

    const startX = e.clientX
    const startY = e.clientY
    const startState = useComposeStore.getState().drafts.find((d) => d.id === draft.id)
      ?.windowState ?? windowState

    const onMove = (move: PointerEvent): void => {
      updateWindowState({
        x: startState.x + move.clientX - startX,
        y: startState.y + move.clientY - startY
      })
    }
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
  }

  const handleResizeStart = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    focus(draft.id)

    const startX = e.clientX
    const startY = e.clientY
    const startState = useComposeStore.getState().drafts.find((d) => d.id === draft.id)
      ?.windowState ?? windowState

    const onMove = (move: PointerEvent): void => {
      updateWindowState({
        width: startState.width + move.clientX - startX,
        height: startState.height + move.clientY - startY
      })
    }
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
  }

  const addFilesAsAttachments = async (files: File[]): Promise<void> => {
    if (files.length === 0) return
    setAttachmentError(null)
    try {
      const next: ComposeAttachmentFile[] = []
      let running = attachmentsTotal
      for (const f of files) {
        if (running + f.size > MAX_ATTACHMENTS_TOTAL_BYTES) {
          setAttachmentError(
            `Maximalgröße von ${(MAX_ATTACHMENTS_TOTAL_BYTES / (1024 * 1024)).toFixed(0)} MB überschritten – „${f.name}“ wurde übersprungen.`
          )
          continue
        }
        const buf = await f.arrayBuffer()
        next.push({
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: f.name,
          size: f.size,
          contentType: f.type || 'application/octet-stream',
          dataBase64: arrayBufferToBase64(buf)
        })
        running += f.size
      }
      if (next.length > 0) addAttachments(draft.id, next)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setAttachmentError(`Datei konnte nicht gelesen werden: ${msg}`)
    }
  }

  const handleFilesChosen = async (
    e: React.ChangeEvent<HTMLInputElement>
  ): Promise<void> => {
    const files = e.target.files
    if (!files || files.length === 0) return
    try {
      await addFilesAsAttachments(Array.from(files))
    } finally {
      e.target.value = ''
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>): void => {
    if (!hasDraggedFiles(e)) return
    e.preventDefault()
    e.stopPropagation()
    dragDepthRef.current = 0
    setDraggingFiles(false)
    void addFilesAsAttachments(Array.from(e.dataTransfer.files))
  }

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>): void => {
    if (!hasDraggedFiles(e)) return
    e.preventDefault()
    e.stopPropagation()
    dragDepthRef.current += 1
    setDraggingFiles(true)
    focus(draft.id)
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>): void => {
    if (!hasDraggedFiles(e)) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
  }

  const addCloudAttachment = (file: { name: string; webUrl: string }): void => {
    const next: ComposeReferenceAttachmentDraft = {
      id: `cref-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: file.name,
      webUrl: file.webUrl
    }
    update(draft.id, { referenceAttachments: [...draft.referenceAttachments, next] })
    setDriveOpen(false)
  }

  const removeCloudAttachment = (id: string): void => {
    update(draft.id, {
      referenceAttachments: draft.referenceAttachments.filter((r) => r.id !== id)
    })
  }

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>): void => {
    if (!hasDraggedFiles(e)) return
    e.preventDefault()
    e.stopPropagation()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) setDraggingFiles(false)
  }

  if (minimized) {
    return (
      <button
        type="button"
        onClick={(): void => focus(draft.id)}
        className="pointer-events-auto flex h-9 items-center gap-2 rounded-t-md border border-b-0 border-border bg-card px-3 text-xs font-medium text-foreground shadow-lg hover:bg-card/80"
        style={{
          position: 'fixed',
          right: 24 + index * 18,
          bottom: 16,
          zIndex: active ? 60 : 45 + index
        }}
      >
        <span className="max-w-[180px] truncate">
          {draft.subject || titleForMode(draft.mode)}
        </span>
        <button
          type="button"
          onClick={(e): void => {
            e.stopPropagation()
            close(draft.id)
          }}
          className="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label="Schliessen"
        >
          <X className="h-3 w-3" />
        </button>
      </button>
    )
  }

  return (
    <div
      className="pointer-events-auto fixed flex flex-col overflow-hidden rounded-lg border border-border bg-card text-foreground shadow-2xl"
      onMouseDown={(): void => focus(draft.id)}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        left: windowState.x,
        top: windowState.y,
        width: windowState.width,
        height: windowState.height,
        zIndex: active ? 60 : 45 + index
      }}
    >
      <div
        className="flex h-9 shrink-0 cursor-move select-none items-center gap-1 border-b border-border bg-secondary/40 px-2 text-xs"
        onPointerDown={handleDragStart}
        title="Zum Verschieben ziehen"
      >
        <span className="min-w-0 flex-1 truncate px-1 font-medium">
          {draft.subject || titleForMode(draft.mode)}
        </span>
        <div className="relative shrink-0" ref={sendOptionsRef}>
          <button
            type="button"
            onClick={(e): void => {
              e.stopPropagation()
              setSendOptionsOpen((o) => !o)
            }}
            className={cn(
              'rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground',
              sendOptionsOpen && 'bg-secondary text-foreground'
            )}
            aria-expanded={sendOptionsOpen}
            aria-haspopup="dialog"
            aria-label="Sendeoptionen"
            title="Sendeoptionen (Zustellung, Lesebestätigung, Wichtigkeit, Zeitplan)"
          >
            <Cog className="h-3.5 w-3.5" />
          </button>
          {sendOptionsOpen && (
            <div
              className="absolute right-0 top-full z-[70] mt-1 w-[min(18rem,calc(100vw-2rem))] rounded-lg border border-border bg-card p-3 text-[11px] text-foreground shadow-xl"
              role="dialog"
              aria-label="Sendeoptionen"
              onMouseDown={(e): void => e.stopPropagation()}
            >
              {isMicrosoft ? (
                <div className="flex flex-col gap-3">
                  <label className="flex cursor-pointer items-center gap-2 text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={draft.isDeliveryReceiptRequested}
                      onChange={(e): void =>
                        update(draft.id, { isDeliveryReceiptRequested: e.target.checked })
                      }
                      className="rounded border-border"
                    />
                    <span>Zustellbestätigung</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={draft.isReadReceiptRequested}
                      onChange={(e): void =>
                        update(draft.id, { isReadReceiptRequested: e.target.checked })
                      }
                      className="rounded border-border"
                    />
                    <span>Lesebestätigung</span>
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-muted-foreground">Wichtigkeit:</span>
                    <select
                      className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-[11px] text-foreground"
                      value={draft.importance}
                      onChange={(e): void =>
                        update(draft.id, {
                          importance: e.target.value as ComposeDraft['importance']
                        })
                      }
                    >
                      <option value="normal">Normal</option>
                      <option value="high">Hoch</option>
                      <option value="low">Niedrig</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-muted-foreground">Senden:</span>
                    <input
                      type="datetime-local"
                      value={draft.scheduledSendAt ?? ''}
                      onChange={(e): void =>
                        update(draft.id, {
                          scheduledSendAt: e.target.value ? e.target.value : null
                        })
                      }
                      className="w-full rounded border border-border bg-background px-2 py-1 text-[11px] text-foreground"
                    />
                    <span className="text-[10px] leading-snug text-muted-foreground">
                      Leer = sofort. Geplant nur ohne lokale Dateianhänge.
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  Zustell-/Lesebestätigung, Wichtigkeit und geplanter Versand sind bei
                  Microsoft-Konten verfügbar.
                </p>
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={(): void =>
            focus(
              useComposeStore.getState().drafts.filter((x) => !x.embedInDashboard)[0]?.id ?? draft.id
            )
          }
          className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label="Minimieren"
          title="Minimieren"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={(): void => close(draft.id)}
          className="rounded p-1 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
          aria-label="Schliessen"
          title="Verwerfen"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Account-Auswahl */}
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2 text-xs">
        <span className="text-muted-foreground">Von:</span>
        {accounts.length > 1 ? (
          <AccountPicker
            currentAccountId={draft.accountId}
            onChange={(id): void =>
              update(draft.id, { accountId: id, savedRemoteDraftId: undefined })
            }
          />
        ) : (
          <span className="font-medium">{account?.email ?? '(kein Konto)'}</span>
        )}
      </div>

      <RecipientTokenField
        label="An:"
        accountId={draft.accountId}
        value={draft.to}
        onChange={(v): void => update(draft.id, { to: v })}
        showToggle={!draft.showCcBcc}
        onToggleCcBcc={(): void => update(draft.id, { showCcBcc: true })}
      />
      {draft.showCcBcc && (
        <>
          <RecipientTokenField
            label="Cc:"
            accountId={draft.accountId}
            value={draft.cc}
            onChange={(v): void => update(draft.id, { cc: v })}
          />
          <RecipientTokenField
            label="Bcc:"
            accountId={draft.accountId}
            value={draft.bcc}
            onChange={(v): void => update(draft.id, { bcc: v })}
          />
        </>
      )}

      <div className="flex items-center border-b border-border/60 px-4 py-2">
        <span className="w-12 shrink-0 text-xs text-muted-foreground">Betreff:</span>
        <input
          type="text"
          value={draft.subject}
          onChange={(e): void => update(draft.id, { subject: e.target.value })}
          placeholder="(Kein Betreff)"
          className="flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>

      {(draft.attachments.length > 0 ||
        draft.referenceAttachments.length > 0 ||
        attachmentError) && (
        <div className="shrink-0 border-b border-border/60 bg-secondary/15 px-4 py-2">
          {attachmentError && (
            <div className="mb-1.5 flex items-start gap-1.5 text-[11px] text-destructive">
              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{attachmentError}</span>
            </div>
          )}
          {(draft.attachments.length > 0 || draft.referenceAttachments.length > 0) && (
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {draft.attachments.length + draft.referenceAttachments.length} Anhang
                {draft.attachments.length + draft.referenceAttachments.length === 1 ? '' : 'e'}
                {draft.attachments.length > 0 ? ` · ${formatBytes(attachmentsTotal)}` : ''}
              </span>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {draft.referenceAttachments.map((r) => (
              <CloudAttachmentCard
                key={r.id}
                name={r.name}
                onRemove={(): void => removeCloudAttachment(r.id)}
              />
            ))}
            {draft.attachments.map((a) => (
              <AttachmentChip
                key={a.id}
                file={a}
                onRemove={(): void => removeAttachment(draft.id, a.id)}
              />
            ))}
          </div>
        </div>
      )}

      <TipTapBody
        valueHtml={draft.prependRichHtml}
        onChangeHtml={(v): void => update(draft.id, { prependRichHtml: v })}
        autoFocus
      />

      <div className="shrink-0 border-t border-border/50 bg-secondary/10">
        <div className="flex flex-wrap items-start justify-between gap-2 px-4 pt-2">
          <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Signatur / Footer
          </div>
          <SignatureTemplateControls
            accountId={draft.accountId}
            signatureRichHtml={draft.signatureRichHtml}
            onSignatureHtmlChange={(html): void => update(draft.id, { signatureRichHtml: html })}
          />
        </div>
        <TipTapBody
          variant="compact"
          valueHtml={draft.signatureRichHtml}
          onChangeHtml={(v): void => update(draft.id, { signatureRichHtml: v })}
        />
      </div>

      {draft.quotedHtml && (
        <div className="border-t border-border/60 bg-background/40 px-4 py-2">
          <button
            type="button"
            onClick={(): void => setShowQuoted((v) => !v)}
            className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground"
          >
            <ChevronDown
              className={cn('h-3 w-3 transition-transform', !showQuoted && '-rotate-90')}
            />
            Original-Mail {showQuoted ? 'ausblenden' : 'anzeigen'}
          </button>
          {showQuoted && (
            <div
              className="prose-sm mt-2 max-h-[160px] overflow-y-auto rounded border border-border/40 bg-background p-2 text-[11px] leading-relaxed text-muted-foreground [&_a]:text-primary"
              dangerouslySetInnerHTML={{ __html: draft.quotedHtml }}
            />
          )}
        </div>
      )}

      {draft.replyToMessageId != null && (
        <div className="flex flex-wrap items-center gap-3 border-t border-border/40 px-4 py-2 text-xs text-muted-foreground">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={draft.expectReply ?? false}
              onChange={(e): void => update(draft.id, { expectReply: e.target.checked })}
              className="rounded border-border"
            />
            <span>Antwort erwarten</span>
          </label>
          <select
            className="rounded border border-border bg-background px-2 py-0.5 text-xs text-foreground disabled:opacity-50"
            disabled={!(draft.expectReply ?? false)}
            value={String(draft.expectReplyDays ?? 7)}
            onChange={(e): void =>
              update(draft.id, { expectReplyDays: Number.parseInt(e.target.value, 10) })
            }
          >
            <option value="3">3 Tage</option>
            <option value="7">7 Tage</option>
            <option value="14">14 Tage</option>
          </select>
          <span className="text-[10px] text-muted-foreground/80">
            Waiting-for auf die urspruengliche Mail
          </span>
        </div>
      )}

      {draft.error && (
        <div className="flex items-start gap-2 border-t border-destructive/40 bg-destructive/10 px-4 py-2 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">{draft.error}</span>
        </div>
      )}

      <div className="flex shrink-0 items-center gap-2 border-t border-border px-4 py-2">
        <button
          type="button"
          onClick={(): void => {
            void saveRemoteDraft(draft.id)
          }}
          disabled={draft.busy}
          title={
            draft.savedRemoteDraftId
              ? 'Entwurf am Server aktualisieren (Ordner Entwürfe)'
              : 'Entwurf im Server-Ordner «Entwürfe» speichern'
          }
          className={cn(
            'flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors',
            draft.busy
              ? 'text-muted-foreground opacity-50'
              : 'text-foreground hover:bg-secondary'
          )}
        >
          <Save className="h-3.5 w-3.5" />
          Entwurf speichern
        </button>
        <button
          type="button"
          onClick={(): void => {
            void send(draft.id)
          }}
          disabled={draft.busy}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
            draft.busy
              ? 'bg-secondary text-muted-foreground'
              : 'bg-primary text-primary-foreground hover:bg-primary/90'
          )}
        >
          {draft.busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          Senden
        </button>
        <button
          type="button"
          onClick={(): void => fileInputRef.current?.click()}
          title="Dateien anhängen"
          aria-label="Dateien anhängen"
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <Paperclip className="h-3.5 w-3.5" />
          {draft.attachments.length + draft.referenceAttachments.length > 0 && (
            <span className="rounded bg-secondary px-1 text-[10px] font-semibold text-foreground">
              {draft.attachments.length + draft.referenceAttachments.length}
            </span>
          )}
        </button>
        {isMicrosoft && (
          <button
            type="button"
            title="Aus OneDrive anhängen"
            aria-label="Aus OneDrive anhängen"
            onClick={(): void => {
              setDriveOpen(true)
            }}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <Cloud className="h-3.5 w-3.5" />
            OneDrive
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e): void => {
            void handleFilesChosen(e)
          }}
        />
        {templates.length > 0 && (
          <select
            className="max-w-[130px] rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
            aria-label="Vorlage einfuegen"
            value=""
            onChange={(e): void => {
              const v = e.target.value
              e.currentTarget.selectedIndex = 0
              if (!v) return
              const t = templates.find((x) => String(x.id) === v)
              if (!t) return
              const withVars = applyTemplateVariables(t.bodyHtml, t.variablesJson ?? null)
              const fragment = sanitizeComposeHtmlFragment(withVars)
              if (!fragment) return
              const cur = draft.prependRichHtml.replace(/<p><\/p>\s*$/i, '').trim()
              const next = cur ? `${cur}${fragment}` : fragment
              update(draft.id, { prependRichHtml: next })
            }}
          >
            <option value="">Vorlage…</option>
            {templates.map((tm) => (
              <option key={tm.id} value={String(tm.id)}>
                {tm.name}
              </option>
            ))}
          </select>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={(): void => close(draft.id)}
          className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          Verwerfen
        </button>
      </div>
      <OneDriveExplorerDialog
        open={driveOpen}
        accountId={draft.accountId}
        onClose={(): void => setDriveOpen(false)}
        onPickFile={addCloudAttachment}
      />
      {draggingFiles && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-[1px]">
          <div className="flex flex-col items-center gap-2 rounded-xl border border-primary/50 bg-card px-8 py-6 text-sm font-medium text-foreground shadow-2xl">
            <Paperclip className="h-8 w-8 text-primary" />
            <span>Dateien hier ablegen, um sie anzuhängen</span>
            <span className="text-xs font-normal text-muted-foreground">
              Mehrere Dateien werden automatisch übernommen.
            </span>
          </div>
        </div>
      )}
      <div
        className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize"
        onPointerDown={handleResizeStart}
        title="Fenstergröße ändern"
        aria-label="Fenstergröße ändern"
      >
        <div className="absolute bottom-1 right-1 h-2 w-2 border-b border-r border-muted-foreground/70" />
      </div>
    </div>
  )
}

function AccountPicker({
  currentAccountId,
  onChange
}: {
  currentAccountId: string
  onChange: (id: string) => void
}): JSX.Element {
  const accounts = useAccountsStore((s) => s.accounts)
  const current = useMemo(
    () => accounts.find((a) => a.id === currentAccountId),
    [accounts, currentAccountId]
  )
  return (
    <select
      value={currentAccountId}
      onChange={(e): void => onChange(e.target.value)}
      className="flex-1 truncate rounded border border-border bg-background px-2 py-1 text-xs outline-none focus:border-ring"
    >
      {accounts.map((acc) => (
        <option key={acc.id} value={acc.id}>
          {acc.displayName} ({acc.email})
        </option>
      ))}
      {!current && <option value={currentAccountId}>Konto nicht verfuegbar</option>}
    </select>
  )
}

function titleForMode(mode: ComposeDraft['mode']): string {
  switch (mode) {
    case 'reply':
      return 'Antwort'
    case 'replyAll':
      return 'Allen antworten'
    case 'forward':
      return 'Weiterleitung'
    default:
      return 'Neue Mail'
  }
}

function hasDraggedFiles(e: React.DragEvent): boolean {
  return Array.from(e.dataTransfer.types).includes('Files')
}

function getInitialWindowState(index: number): NonNullable<ComposeDraft['windowState']> {
  const viewportWidth = window.innerWidth || DEFAULT_WINDOW_WIDTH + WINDOW_MARGIN * 2
  const viewportHeight = window.innerHeight || DEFAULT_WINDOW_HEIGHT + WINDOW_MARGIN * 2
  const width = Math.min(DEFAULT_WINDOW_WIDTH, viewportWidth - WINDOW_MARGIN * 2)
  const height = Math.min(DEFAULT_WINDOW_HEIGHT, viewportHeight - WINDOW_MARGIN * 2)
  const offset = Math.min(index * 24, 96)

  return clampWindowState({
    x: viewportWidth - width - 24 - offset,
    y: viewportHeight - height - 24 - offset,
    width,
    height
  })
}

function clampWindowState(
  state: NonNullable<ComposeDraft['windowState']>
): NonNullable<ComposeDraft['windowState']> {
  const viewportWidth = window.innerWidth || state.width + WINDOW_MARGIN * 2
  const viewportHeight = window.innerHeight || state.height + WINDOW_MARGIN * 2
  const width = Math.min(
    Math.max(state.width, MIN_WINDOW_WIDTH),
    Math.max(MIN_WINDOW_WIDTH, viewportWidth - WINDOW_MARGIN * 2)
  )
  const height = Math.min(
    Math.max(state.height, MIN_WINDOW_HEIGHT),
    Math.max(MIN_WINDOW_HEIGHT, viewportHeight - WINDOW_MARGIN * 2)
  )
  const maxX = Math.max(WINDOW_MARGIN, viewportWidth - width - WINDOW_MARGIN)
  const maxY = Math.max(WINDOW_MARGIN, viewportHeight - height - WINDOW_MARGIN)
  return {
    x: Math.min(Math.max(state.x, WINDOW_MARGIN), maxX),
    y: Math.min(Math.max(state.y, WINDOW_MARGIN), maxY),
    width,
    height
  }
}

function CloudAttachmentCard({
  name,
  onRemove
}: {
  name: string
  onRemove: () => void
}): JSX.Element {
  return (
    <div className="flex max-w-[260px] flex-col gap-1 rounded-xl border border-sky-500/30 bg-sky-500/5 px-3 py-2 shadow-sm">
      <div className="flex items-center gap-2">
        <Cloud className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground" title={name}>
          {name}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="rounded p-0.5 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
          aria-label="Cloud-Anhang entfernen"
          title="Entfernen"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      <span className="text-[10px] text-muted-foreground">OneDrive / SharePoint (Link)</span>
    </div>
  )
}

function AttachmentChip({
  file,
  onRemove
}: {
  file: ComposeAttachmentFile
  onRemove: () => void
}): JSX.Element {
  const Icon = pickAttachmentIcon(file.contentType, file.name)
  return (
    <div
      className="group flex max-w-[260px] flex-col gap-1 rounded-xl border border-border/80 bg-card px-3 py-2 text-[11px] text-foreground shadow-sm"
      title={`${file.name} · ${formatBytes(file.size)}`}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-medium">{file.name}</span>
        <button
          type="button"
          onClick={onRemove}
          className="rounded p-0.5 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
          aria-label="Anhang entfernen"
          title="Entfernen"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      <span className="text-[10px] text-muted-foreground">{formatBytes(file.size)}</span>
    </div>
  )
}

function pickAttachmentIcon(
  mime: string,
  name: string
): React.ComponentType<{ className?: string }> {
  if (mime.startsWith('image/')) return FileImage
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (mime.startsWith('text/') || ['txt', 'md', 'log', 'csv'].includes(ext)) return FileText
  return FileIcon
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  const chunkSize = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode.apply(null, Array.from(sub) as unknown as number[])
  }
  return btoa(binary)
}
