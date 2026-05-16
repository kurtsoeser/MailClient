import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, Cloud, Download, Loader2, Paperclip } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { UserNoteAttachment } from '@shared/types'
import { cn } from '@/lib/utils'
import { useAccountsStore } from '@/stores/accounts'
import { OneDriveExplorerDialog } from '@/components/OneDriveExplorerDialog'
import { CloudAttachmentChip, LocalAttachmentChip } from '@/components/AttachmentChips'
import { readFilesAsAttachmentPayload } from '@/lib/attachment-files'

export function NotesAttachmentsPanel({
  noteId,
  className
}: {
  noteId: number
  className?: string
}): JSX.Element {
  const { t } = useTranslation()
  const accounts = useAccountsStore((s) => s.accounts)
  const microsoftAccount = accounts.find((a) => a.provider === 'microsoft')

  const [items, setItems] = useState<UserNoteAttachment[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [driveOpen, setDriveOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      setItems(await window.mailClient.notes.attachments.list(noteId))
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [noteId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const unsub = window.mailClient.events.onNotesChanged((detail) => {
      if (detail.noteId == null || detail.noteId === noteId) void load()
    })
    return unsub
  }, [load, noteId])

  const handleFiles = async (files: File[]): Promise<void> => {
    if (files.length === 0) return
    setError(null)
    setBusy(true)
    try {
      const parsed = await readFilesAsAttachmentPayload(files)
      if (!parsed.ok) {
        setError(parsed.error)
        return
      }
      for (const item of parsed.items) {
        await window.mailClient.notes.attachments.addLocal({
          noteId,
          name: item.name,
          contentType: item.contentType,
          size: item.size,
          dataBase64: item.dataBase64
        })
      }
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const handleRemove = async (attachmentId: number): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await window.mailClient.notes.attachments.remove({ noteId, attachmentId })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const handleOpen = async (att: UserNoteAttachment): Promise<void> => {
    const res = await window.mailClient.notes.attachments.open({
      noteId,
      attachmentId: att.id
    })
    if (!res.ok && res.error) setError(res.error)
  }

  const handleSaveAs = async (att: UserNoteAttachment): Promise<void> => {
    const res = await window.mailClient.notes.attachments.saveAs({
      noteId,
      attachmentId: att.id,
      suggestedName: att.name
    })
    if (!res.ok && !res.cancelled && res.error) setError(res.error)
  }

  const handleCloudPick = async (file: { name: string; webUrl: string }): Promise<void> => {
    setDriveOpen(false)
    setBusy(true)
    setError(null)
    try {
      await window.mailClient.notes.attachments.addCloud({
        noteId,
        name: file.name,
        sourceUrl: file.webUrl,
        providerType: 'oneDriveBusiness'
      })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={cn('rounded-lg border border-border bg-card/40 px-3 py-2.5', className)}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
          {t('notes.attachments.title')}
          {loading ? <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" /> : null}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            disabled={busy}
            onClick={(): void => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] font-medium text-foreground hover:bg-secondary disabled:opacity-50"
          >
            <Paperclip className="h-3 w-3" />
            {t('notes.attachments.addFile')}
          </button>
          {microsoftAccount ? (
            <button
              type="button"
              disabled={busy}
              onClick={(): void => setDriveOpen(true)}
              className="inline-flex items-center gap-1 rounded-md border border-sky-500/30 bg-sky-500/5 px-2 py-1 text-[10px] font-medium text-foreground hover:bg-sky-500/10 disabled:opacity-50"
            >
              <Cloud className="h-3 w-3 text-sky-600 dark:text-sky-400" />
              {t('notes.attachments.addCloud')}
            </button>
          ) : null}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e): void => {
          const list = e.target.files
          if (list?.length) void handleFiles(Array.from(list))
          e.target.value = ''
        }}
      />

      {error ? (
        <div className="mb-2 flex items-start gap-1.5 text-[11px] text-destructive">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {!loading && items.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">{t('notes.attachments.empty')}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map((att) =>
            att.kind === 'cloud' ? (
              <div key={att.id} className="flex flex-col gap-0.5">
                <CloudAttachmentChip
                  name={att.name}
                  onOpen={(): void => void handleOpen(att)}
                  onRemove={(): void => void handleRemove(att.id)}
                  removeAriaLabel={t('notes.attachments.remove')}
                />
                <button
                  type="button"
                  onClick={(): void => void handleOpen(att)}
                  className="self-start px-1 text-[10px] text-primary hover:underline"
                >
                  {t('notes.attachments.openLink')}
                </button>
              </div>
            ) : (
              <div key={att.id} className="flex flex-col gap-0.5">
                <LocalAttachmentChip
                  name={att.name}
                  contentType={att.contentType ?? 'application/octet-stream'}
                  size={att.size}
                  onOpen={(): void => void handleOpen(att)}
                  onRemove={(): void => void handleRemove(att.id)}
                  removeAriaLabel={t('notes.attachments.remove')}
                />
                <button
                  type="button"
                  onClick={(): void => void handleSaveAs(att)}
                  className="inline-flex items-center gap-0.5 self-start px-1 text-[10px] text-primary hover:underline"
                >
                  <Download className="h-2.5 w-2.5" />
                  {t('notes.attachments.saveAs')}
                </button>
              </div>
            )
          )}
        </div>
      )}

      {microsoftAccount ? (
        <OneDriveExplorerDialog
          open={driveOpen}
          accountId={microsoftAccount.id}
          onClose={(): void => setDriveOpen(false)}
          onPickFile={(file): void => void handleCloudPick(file)}
        />
      ) : null}

      {!microsoftAccount && items.length === 0 ? (
        <p className="mt-1 text-[10px] text-muted-foreground">{t('notes.attachments.cloudRequiresM365')}</p>
      ) : null}
    </section>
  )
}
