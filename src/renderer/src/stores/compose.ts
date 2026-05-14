import { create } from 'zustand'
import type {
  ComposeAttachment,
  ComposeRecipient,
  ComposeReferenceAttachment,
  MailFull,
  MailImportance
} from '@shared/types'
import {
  buildForwardBody,
  buildReplyBody,
  parseRecipients,
  withForwardPrefix,
  withReplyPrefix
} from '@/lib/compose-helpers'
import { sanitizeComposeHtmlFragment } from '@/lib/sanitize-compose-html'
import { useAccountsStore } from '@/stores/accounts'

export type ComposeMode = 'new' | 'reply' | 'replyAll' | 'forward'

/** Lokaler Datei-Anhang im Compose-Fenster (vor dem Senden). */
export interface ComposeAttachmentFile {
  /** Lokale ID nur fuer die UI (Listen-Key, Entfernen). */
  id: string
  name: string
  size: number
  contentType: string
  /** Reines Base64 (ohne `data:`-Prefix). */
  dataBase64: string
}

export interface ComposeWindowState {
  x: number
  y: number
  width: number
  height: number
}

/** Cloud-Anhang (OneDrive/SharePoint) vor dem Senden. */
export interface ComposeReferenceAttachmentDraft {
  id: string
  name: string
  webUrl: string
}

export interface ComposeDraft {
  id: string
  accountId: string
  mode: ComposeMode
  to: string
  cc: string
  bcc: string
  showCcBcc: boolean
  subject: string
  /** Rich-Text (TipTap HTML) fuer den Nutzer-Teil vor dem Zitat. */
  prependRichHtml: string
  /** Fallback Plain-Text (aeltere Pfade); wird ignoriert wenn `prependRichHtml` gesetzt ist. */
  prependPlain: string
  /** Signatur/Footer (HTML), wird zwischen Nutzer-Text und Zitat eingefuegt. */
  signatureRichHtml: string
  /** Quoted-Body unterhalb des User-Texts. */
  quotedHtml: string
  /** Datei-Anhaenge (nicht-inline). Inline-Bilder werden direkt im HTML als data: gehalten. */
  attachments: ComposeAttachmentFile[]
  /** Microsoft Graph: Cloud-Datei als ReferenceAttachment. */
  referenceAttachments: ComposeReferenceAttachmentDraft[]
  /** Position und Groesse des Compose-Popup-Fensters. */
  windowState?: ComposeWindowState
  /** Original-Mail (fuer Threading via createReply/createForward). */
  replyToRemoteId?: string
  /** Original-Mail-ID (lokal) – nuetzlich fuer UI-Anzeige. */
  replyToMessageId?: number
  /** Nach erfolgreichem Senden: Waiting-for auf Ursprungs-Mail. */
  expectReply?: boolean
  expectReplyDays?: number
  /** Microsoft Graph (Gmail: ignoriert). */
  importance: MailImportance
  isDeliveryReceiptRequested: boolean
  isReadReceiptRequested: boolean
  /** `datetime-local` Wert oder ISO; wenn in Zukunft -> lokale Planung. */
  scheduledSendAt: string | null
  busy?: boolean
  error?: string | null
  /** Wenn true: nur in der Startseiten-Kachel, nicht als schwebendes Composer-Fenster. */
  embedInDashboard?: boolean
  /**
   * Nach erfolgreichem Speichern in «Entwürfe» am Server (Graph: Message-Id,
   * Gmail: Draft-Ressourcen-ID). Bei Konto-Wechsel im Composer zuruecksetzen.
   */
  savedRemoteDraftId?: string | null
}

interface ComposeState {
  drafts: ComposeDraft[]
  activeId: string | null

  openNew: (accountId: string) => void
  /** Neuer Entwurf mit vorausgefuelltem An-Feld (E-Mail-Adresse). */
  openNewTo: (accountId: string, to: string) => void
  openReply: (mode: 'reply' | 'replyAll', message: MailFull) => void
  openForward: (message: MailFull) => void
  close: (id: string) => void
  focus: (id: string) => void
  update: (id: string, patch: Partial<ComposeDraft>) => void
  addAttachments: (id: string, files: ComposeAttachmentFile[]) => void
  removeAttachment: (id: string, attachmentId: string) => void
  send: (id: string) => Promise<void>
  /** Entwurf in den Server-Ordner «Entwürfe» schreiben (oder aktualisieren). */
  saveRemoteDraft: (id: string) => Promise<void>
  /** Ein eingebetteter Entwurf fuer die Startseite (hoechstens einer). */
  ensureDashboardEmbedDraft: (accountId: string) => string
}

function newId(): string {
  return `cmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function initialSignatureHtmlForAccount(accountId: string): string {
  const acc = useAccountsStore.getState().accounts.find((a) => a.id === accountId)
  if (!acc?.signatureTemplates?.length) return ''
  const defId = acc.defaultSignatureTemplateId
  if (defId === null || defId === undefined || defId === '') return ''
  const tpl = acc.signatureTemplates.find((t) => t.id === defId)
  const raw = tpl?.html?.trim() ?? ''
  if (!raw) return ''
  return sanitizeComposeHtmlFragment(raw)
}

function defaultComposeFields(accountId: string): Pick<
  ComposeDraft,
  | 'signatureRichHtml'
  | 'referenceAttachments'
  | 'importance'
  | 'isDeliveryReceiptRequested'
  | 'isReadReceiptRequested'
  | 'scheduledSendAt'
> {
  return {
    signatureRichHtml: initialSignatureHtmlForAccount(accountId),
    referenceAttachments: [],
    importance: 'normal',
    isDeliveryReceiptRequested: false,
    isReadReceiptRequested: false,
    scheduledSendAt: null
  }
}

interface ComposeOutgoingBundle {
  bodyHtml: string
  to: ComposeRecipient[]
  cc: ComposeRecipient[]
  bcc: ComposeRecipient[]
  allAttachments: ComposeAttachment[]
  referenceAttachments: ComposeReferenceAttachment[] | undefined
}

function buildComposeOutgoingBundle(draft: ComposeDraft): ComposeOutgoingBundle {
  const to = parseRecipients(draft.to)
  const cc = parseRecipients(draft.cc)
  const bcc = parseRecipients(draft.bcc)

  const userHtml = draft.prependRichHtml.trim()
    ? draft.prependRichHtml
    : draft.prependPlain
      ? `<p>${draft.prependPlain
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/\n/g, '<br>')}</p>`
      : ''
  const sigRaw = draft.signatureRichHtml.trim()
  const sigHtml = sigRaw ? sanitizeComposeHtmlFragment(sigRaw) : ''
  const sigBlock = sigHtml ? `<p></p>${sigHtml}` : ''
  const rawBodyHtml = userHtml + sigBlock + draft.quotedHtml

  const inline: ComposeAttachment[] = []
  const bodyHtml = rawBodyHtml.replace(
    /<img\b([^>]*?)\bsrc\s*=\s*"data:([^;"]+);base64,([A-Za-z0-9+/=]+)"([^>]*)>/gi,
    (_match, pre: string, mime: string, b64: string, post: string) => {
      const cid = `inline-${Date.now().toString(36)}-${inline.length}@mailclient.local`
      const name = guessFileName(mime, inline.length)
      inline.push({
        name,
        contentType: mime,
        size: Math.round((b64.length * 3) / 4),
        dataBase64: b64,
        isInline: true,
        contentId: cid
      })
      return `<img${pre}src="cid:${cid}"${post}>`
    }
  )

  const fileAttachments: ComposeAttachment[] = draft.attachments.map((a) => ({
    name: a.name,
    contentType: a.contentType,
    size: a.size,
    dataBase64: a.dataBase64,
    isInline: false
  }))

  const allAttachments = [...inline, ...fileAttachments]

  const referenceAttachments: ComposeReferenceAttachment[] | undefined =
    draft.referenceAttachments.length > 0
      ? draft.referenceAttachments.map((r) => ({
          name: r.name,
          sourceUrl: r.webUrl,
          providerType: 'oneDriveBusiness'
        }))
      : undefined

  return {
    bodyHtml,
    to,
    cc,
    bcc,
    allAttachments,
    referenceAttachments
  }
}

export const useComposeStore = create<ComposeState>((set, get) => ({
  drafts: [],
  activeId: null,

  openNew(accountId: string): void {
    const draft: ComposeDraft = {
      id: newId(),
      accountId,
      mode: 'new',
      to: '',
      cc: '',
      bcc: '',
      showCcBcc: false,
      subject: '',
      prependRichHtml: '',
      prependPlain: '',
      quotedHtml: '',
      attachments: [],
      expectReply: false,
      expectReplyDays: 7,
      ...defaultComposeFields(accountId)
    }
    set((s) => ({ drafts: [...s.drafts, draft], activeId: draft.id }))
  },

  openNewTo(accountId: string, to: string): void {
    const draft: ComposeDraft = {
      id: newId(),
      accountId,
      mode: 'new',
      to: to.trim(),
      cc: '',
      bcc: '',
      showCcBcc: false,
      subject: '',
      prependRichHtml: '',
      prependPlain: '',
      quotedHtml: '',
      attachments: [],
      expectReply: false,
      expectReplyDays: 7,
      ...defaultComposeFields(accountId)
    }
    set((s) => ({ drafts: [...s.drafts, draft], activeId: draft.id }))
  },

  ensureDashboardEmbedDraft(accountId: string): string {
    const existing = get().drafts.find((d) => d.embedInDashboard)
    if (existing) return existing.id
    const draft: ComposeDraft = {
      id: newId(),
      accountId,
      mode: 'new',
      to: '',
      cc: '',
      bcc: '',
      showCcBcc: false,
      subject: '',
      prependRichHtml: '',
      prependPlain: '',
      quotedHtml: '',
      attachments: [],
      expectReply: false,
      expectReplyDays: 7,
      embedInDashboard: true,
      ...defaultComposeFields(accountId)
    }
    set((s) => ({ drafts: [...s.drafts, draft], activeId: draft.id }))
    return draft.id
  },

  openReply(mode: 'reply' | 'replyAll', message: MailFull): void {
    const cc =
      mode === 'replyAll' ? [message.ccAddrs, message.toAddrs].filter(Boolean).join(', ') : ''

    const draft: ComposeDraft = {
      id: newId(),
      accountId: message.accountId,
      mode,
      to: message.fromAddr
        ? message.fromName
          ? `${message.fromName} <${message.fromAddr}>`
          : message.fromAddr
        : '',
      cc,
      bcc: '',
      showCcBcc: cc.length > 0,
      subject: withReplyPrefix(message.subject),
      prependRichHtml: '',
      prependPlain: '',
      quotedHtml: buildReplyBody(message),
      attachments: [],
      replyToRemoteId: message.remoteId,
      replyToMessageId: message.id,
      expectReply: false,
      expectReplyDays: 7,
      ...defaultComposeFields(message.accountId)
    }
    set((s) => ({ drafts: [...s.drafts, draft], activeId: draft.id }))
  },

  openForward(message: MailFull): void {
    const draft: ComposeDraft = {
      id: newId(),
      accountId: message.accountId,
      mode: 'forward',
      to: '',
      cc: '',
      bcc: '',
      showCcBcc: false,
      subject: withForwardPrefix(message.subject),
      prependRichHtml: '',
      prependPlain: '',
      quotedHtml: buildForwardBody(message),
      attachments: [],
      replyToRemoteId: message.remoteId,
      replyToMessageId: message.id,
      expectReply: false,
      expectReplyDays: 7,
      ...defaultComposeFields(message.accountId)
    }
    set((s) => ({ drafts: [...s.drafts, draft], activeId: draft.id }))
  },

  close(id: string): void {
    set((s) => {
      const next = s.drafts.filter((d) => d.id !== id)
      const activeId = s.activeId === id ? (next[next.length - 1]?.id ?? null) : s.activeId
      return { drafts: next, activeId }
    })
  },

  focus(id: string): void {
    set({ activeId: id })
  },

  update(id: string, patch: Partial<ComposeDraft>): void {
    set((s) => ({
      drafts: s.drafts.map((d) => (d.id === id ? { ...d, ...patch } : d))
    }))
  },

  addAttachments(id: string, files: ComposeAttachmentFile[]): void {
    set((s) => ({
      drafts: s.drafts.map((d) =>
        d.id === id ? { ...d, attachments: [...d.attachments, ...files] } : d
      )
    }))
  },

  removeAttachment(id: string, attachmentId: string): void {
    set((s) => ({
      drafts: s.drafts.map((d) =>
        d.id === id
          ? { ...d, attachments: d.attachments.filter((a) => a.id !== attachmentId) }
          : d
      )
    }))
  },

  async saveRemoteDraft(id: string): Promise<void> {
    const draft = get().drafts.find((d) => d.id === id)
    if (!draft) return

    const bundle = buildComposeOutgoingBundle(draft)

    const acc = useAccountsStore.getState().accounts.find((a) => a.id === draft.accountId)
    if (acc?.provider === 'google' && (draft.referenceAttachments?.length ?? 0) > 0) {
      get().update(id, {
        error: 'Cloud-Anhaenge (OneDrive) sind nur fuer Microsoft 365 verfuegbar.'
      })
      return
    }

    get().update(id, { busy: true, error: null })
    try {
      const result = await window.mailClient.compose.saveDraft({
        accountId: draft.accountId,
        subject: draft.subject || '(Kein Betreff)',
        bodyHtml: bundle.bodyHtml,
        to: bundle.to,
        cc: bundle.cc.length ? bundle.cc : undefined,
        bcc: bundle.bcc.length ? bundle.bcc : undefined,
        attachments: bundle.allAttachments.length ? bundle.allAttachments : undefined,
        referenceAttachments: bundle.referenceAttachments,
        replyToRemoteId: draft.replyToRemoteId,
        replyMode: draft.mode === 'new' ? undefined : draft.mode,
        remoteDraftId: draft.savedRemoteDraftId ?? undefined,
        importance: draft.importance,
        isDeliveryReceiptRequested: draft.isDeliveryReceiptRequested,
        isReadReceiptRequested: draft.isReadReceiptRequested
      })
      get().update(id, { busy: false, savedRemoteDraftId: result.remoteDraftId, error: null })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      get().update(id, { busy: false, error: msg })
    }
  },

  async send(id: string): Promise<void> {
    const state = get()
    const draft = state.drafts.find((d) => d.id === id)
    if (!draft) return

    const bundle = buildComposeOutgoingBundle(draft)
    const { bodyHtml, to, cc, bcc, allAttachments, referenceAttachments } = bundle

    if (to.length === 0) {
      get().update(id, { error: 'Bitte mindestens einen Empfaenger angeben.' })
      return
    }

    const scheduledRaw = draft.scheduledSendAt?.trim()
    let scheduledSendAt: string | null | undefined
    if (scheduledRaw) {
      const ms = Date.parse(scheduledRaw)
      if (!Number.isNaN(ms) && ms > Date.now() + 15_000) {
        if (draft.attachments.length > 0) {
          get().update(id, {
            error: 'Geplanter Versand: bitte Dateianhaenge entfernen oder sofort senden.'
          })
          return
        }
        scheduledSendAt = new Date(ms).toISOString()
      }
    }

    get().update(id, { busy: true, error: null })

    try {
      await window.mailClient.compose.send({
        accountId: draft.accountId,
        subject: draft.subject || '(Kein Betreff)',
        bodyHtml,
        to,
        cc: cc.length ? cc : undefined,
        bcc: bcc.length ? bcc : undefined,
        attachments: allAttachments.length ? allAttachments : undefined,
        referenceAttachments,
        replyToRemoteId: draft.replyToRemoteId,
        replyMode: draft.mode === 'new' ? undefined : draft.mode,
        trackWaitingOnMessageId:
          draft.expectReply && draft.replyToMessageId != null
            ? draft.replyToMessageId
            : undefined,
        expectReplyInDays:
          draft.expectReply && draft.replyToMessageId != null
            ? (draft.expectReplyDays ?? 7)
            : undefined,
        importance: draft.importance,
        isDeliveryReceiptRequested: draft.isDeliveryReceiptRequested,
        isReadReceiptRequested: draft.isReadReceiptRequested,
        scheduledSendAt: scheduledSendAt ?? undefined
      })

      get().close(id)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      get().update(id, { busy: false, error: msg })
    }
  }
}))

function guessFileName(mime: string, idx: number): string {
  const ext = mime.split('/')[1]?.split('+')[0] ?? 'bin'
  return `image-${idx + 1}.${ext}`
}
