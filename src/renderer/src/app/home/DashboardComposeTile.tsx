import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, Loader2, Paperclip, Save, Send, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { TipTapBody } from '@/components/TipTapBody'
import { SignatureTemplateControls } from '@/components/SignatureTemplateControls'
import { RecipientTokenField } from '@/components/RecipientTokenField'
import { cn } from '@/lib/utils'
import { useAccountsStore } from '@/stores/accounts'
import { useComposeStore, type ComposeAttachmentFile } from '@/stores/compose'

const MAX_ATTACHMENTS_TOTAL_BYTES = 24 * 1024 * 1024

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  let binary = ''
  const bytes = new Uint8Array(buf)
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export function DashboardComposeTile(): JSX.Element {
  const { t } = useTranslation()
  const accounts = useAccountsStore((s) => s.accounts)
  const embedDraft = useComposeStore((s) => s.drafts.find((d) => d.embedInDashboard) ?? null)
  const ensureDashboardEmbedDraft = useComposeStore((s) => s.ensureDashboardEmbedDraft)
  const update = useComposeStore((s) => s.update)
  const send = useComposeStore((s) => s.send)
  const saveRemoteDraft = useComposeStore((s) => s.saveRemoteDraft)
  const close = useComposeStore((s) => s.close)
  const addAttachments = useComposeStore((s) => s.addAttachments)
  const removeAttachment = useComposeStore((s) => s.removeAttachment)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [attachmentError, setAttachmentError] = useState<string | null>(null)

  useEffect(() => {
    const first = accounts[0]?.id
    if (!first) return
    if (!useComposeStore.getState().drafts.some((d) => d.embedInDashboard)) {
      ensureDashboardEmbedDraft(first)
    }
  }, [accounts, ensureDashboardEmbedDraft])

  const draft = embedDraft
  const attachmentsTotal = draft?.attachments.reduce((s, a) => s + a.size, 0) ?? 0

  const addFiles = useCallback(
    async (files: File[]): Promise<void> => {
      if (!draft || files.length === 0) return
      setAttachmentError(null)
      try {
        const next: ComposeAttachmentFile[] = []
        let running = attachmentsTotal
        for (const f of files) {
          if (running + f.size > MAX_ATTACHMENTS_TOTAL_BYTES) {
            setAttachmentError(
              t('mail.composeTile.attachmentMax', {
                maxMb: (MAX_ATTACHMENTS_TOTAL_BYTES / (1024 * 1024)).toFixed(0),
                file: f.name
              })
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
        setAttachmentError(err instanceof Error ? err.message : String(err))
      }
    },
    [addAttachments, attachmentsTotal, draft, t]
  )

  if (accounts.length === 0 || !draft) {
    return (
      <div className="flex h-full min-h-[120px] items-center justify-center px-3 text-center text-[11px] text-muted-foreground">
        {t('mail.composeTile.needAccount')}
      </div>
    )
  }

  const account = accounts.find((a) => a.id === draft.accountId) ?? accounts[0]

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden bg-card/40"
      onDragOver={(e): void => {
        if (!Array.from(e.dataTransfer.types).includes('Files')) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      }}
      onDrop={(e): void => {
        if (!Array.from(e.dataTransfer.types).includes('Files')) return
        e.preventDefault()
        void addFiles(Array.from(e.dataTransfer.files))
      }}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-2 py-1.5 text-[11px]">
        <span className="text-muted-foreground">{t('mail.composeTile.from')}</span>
        {accounts.length > 1 ? (
          <select
            value={draft.accountId}
            onChange={(e): void =>
              update(draft.id, { accountId: e.target.value, savedRemoteDraftId: undefined })
            }
            className="min-w-0 flex-1 truncate rounded border border-border bg-background px-1.5 py-0.5 text-[11px]"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.email}
              </option>
            ))}
          </select>
        ) : (
          <span className="min-w-0 flex-1 truncate font-medium">{account?.email}</span>
        )}
      </div>

      <RecipientTokenField
        label={t('mail.composeTile.to')}
        accountId={draft.accountId}
        value={draft.to}
        onChange={(v): void => update(draft.id, { to: v })}
        showToggle={!draft.showCcBcc}
        onToggleCcBcc={(): void => update(draft.id, { showCcBcc: true })}
        className="border-b border-border/50 px-2 py-1"
      />
      {draft.showCcBcc && (
        <>
          <RecipientTokenField
            label={t('mail.composeTile.cc')}
            accountId={draft.accountId}
            value={draft.cc}
            onChange={(v): void => update(draft.id, { cc: v })}
            className="border-b border-border/50 px-2 py-1"
          />
          <RecipientTokenField
            label={t('mail.composeTile.bcc')}
            accountId={draft.accountId}
            value={draft.bcc}
            onChange={(v): void => update(draft.id, { bcc: v })}
            className="border-b border-border/50 px-2 py-1"
          />
        </>
      )}

      <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-2 py-1.5">
        <span className="w-9 shrink-0 text-[10px] text-muted-foreground">{t('mail.composeTile.subject')}</span>
        <input
          type="text"
          value={draft.subject}
          onChange={(e): void => update(draft.id, { subject: e.target.value })}
          placeholder={t('mail.composeTile.noSubjectPlaceholder')}
          className="min-w-0 flex-1 bg-transparent text-[11px] text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <TipTapBody
          valueHtml={draft.prependRichHtml}
          onChangeHtml={(v): void => update(draft.id, { prependRichHtml: v })}
          className="min-h-[100px] border-0 bg-transparent px-1 py-1 text-[11px]"
        />
        <div className="border-t border-border/40 bg-secondary/10 px-1 py-0.5">
          <div className="flex flex-wrap items-start justify-between gap-1 px-1 pb-0.5">
            <span className="shrink-0 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
              {t('mail.composeTile.signature', { defaultValue: 'Signatur' })}
            </span>
            <SignatureTemplateControls
              compact
              accountId={draft.accountId}
              signatureRichHtml={draft.signatureRichHtml}
              onSignatureHtmlChange={(html): void => update(draft.id, { signatureRichHtml: html })}
            />
          </div>
          <TipTapBody
            variant="compact"
            valueHtml={draft.signatureRichHtml}
            onChangeHtml={(v): void => update(draft.id, { signatureRichHtml: v })}
            className="border-0 bg-transparent px-0 py-0 text-[11px]"
          />
        </div>
      </div>

      {(draft.attachments.length > 0 ||
        draft.referenceAttachments.length > 0 ||
        attachmentError) && (
        <div className="max-h-[72px] shrink-0 overflow-y-auto border-t border-border/40 bg-secondary/15 px-2 py-1">
          {attachmentError && (
            <div className="mb-1 flex items-start gap-1 text-[10px] text-destructive">
              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{attachmentError}</span>
            </div>
          )}
          <div className="flex flex-wrap gap-1">
            {draft.referenceAttachments.map((r) => (
              <span
                key={r.id}
                className="inline-flex max-w-full items-center gap-1 rounded border border-sky-500/40 bg-sky-500/10 px-1.5 py-0.5 text-[10px]"
              >
                <span className="truncate">{r.name}</span>
                <button
                  type="button"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label="Cloud-Anhang entfernen"
                  onClick={(): void =>
                    update(draft.id, {
                      referenceAttachments: draft.referenceAttachments.filter((x) => x.id !== r.id)
                    })
                  }
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {draft.attachments.map((a) => (
              <span
                key={a.id}
                className="inline-flex max-w-full items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 text-[10px]"
              >
                <span className="truncate">{a.name}</span>
                <button
                  type="button"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label={t('mail.composeTile.removeAttachmentAria')}
                  onClick={(): void => removeAttachment(draft.id, a.id)}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {draft.error && (
        <div className="flex shrink-0 items-start gap-1 border-t border-destructive/30 bg-destructive/10 px-2 py-1 text-[10px] text-destructive">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
          <span className="min-w-0 flex-1">{draft.error}</span>
        </div>
      )}

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border px-2 py-1.5">
        <button
          type="button"
          disabled={draft.busy}
          title={t('mail.composeTile.saveDraft')}
          onClick={(): void => void saveRemoteDraft(draft.id)}
          className={cn(
            'inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground hover:bg-secondary',
            draft.busy && 'pointer-events-none opacity-50'
          )}
        >
          <Save className="h-3.5 w-3.5" />
          {t('mail.composeTile.saveDraft')}
        </button>
        <button
          type="button"
          disabled={draft.busy}
          onClick={(): void => void send(draft.id)}
          className={cn(
            'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold',
            draft.busy
              ? 'bg-secondary text-muted-foreground'
              : 'bg-primary text-primary-foreground hover:bg-primary/90'
          )}
        >
          {draft.busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          {t('mail.composeTile.send')}
        </button>
        <button
          type="button"
          onClick={(): void => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-secondary"
        >
          <Paperclip className="h-3.5 w-3.5" />
          {draft.attachments.length + draft.referenceAttachments.length > 0 ? (
            <span>
              {draft.attachments.length + draft.referenceAttachments.length} ·{' '}
              {formatBytes(attachmentsTotal)}
            </span>
          ) : (
            t('mail.composeTile.attachment')
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e): void => {
            const files = e.target.files
            if (files && files.length > 0) void addFiles(Array.from(files))
            e.target.value = ''
          }}
        />
        <button
          type="button"
          onClick={(): void => {
            close(draft.id)
            const first = useAccountsStore.getState().accounts[0]?.id
            if (first) ensureDashboardEmbedDraft(first)
          }}
          className="ml-auto text-[11px] text-muted-foreground hover:text-foreground"
        >
          {t('mail.composeTile.clear')}
        </button>
      </div>
    </div>
  )
}
