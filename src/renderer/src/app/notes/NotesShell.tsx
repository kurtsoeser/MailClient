import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react'
import { CalendarDays, Loader2, Mail, Paperclip, Plus, Search, StickyNote, Trash2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { CalendarEventView, ConnectedAccount, UserNote, UserNoteKind, UserNoteListItem } from '@shared/types'
import { useAccountsStore } from '@/stores/accounts'
import { useMailStore } from '@/stores/mail'
import { useUndoStore } from '@/stores/undo'
import { cn } from '@/lib/utils'
import { MarkdownNoteEditor } from '@/components/MarkdownNoteEditor'
import { CalendarEventPreview } from '@/app/calendar/CalendarEventPreview'
import { ReadingPane } from '@/app/layout/ReadingPane'
import {
  ModuleColumnHeaderIconButton,
  moduleColumnHeaderIconGlyphClass,
  moduleColumnHeaderPrimarySmClass,
  moduleColumnHeaderShellBarClass,
  moduleColumnHeaderSubToolbarClass,
  moduleColumnHeaderTitleClass
} from '@/components/ModuleColumnHeader'

const ALL_KINDS: UserNoteKind[] = ['mail', 'calendar', 'standalone']

function kindIcon(kind: UserNoteKind): ComponentType<{ className?: string }> {
  if (kind === 'mail') return Mail
  if (kind === 'calendar') return CalendarDays
  return StickyNote
}

function formatDate(value: string, locale: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString(locale.startsWith('de') ? 'de-DE' : 'en-GB')
}

function noteTitle(
  note: Pick<UserNote, 'kind' | 'title' | 'eventTitleSnapshot'> &
    Partial<Pick<UserNoteListItem, 'mailSubject'>>,
  fallback: string
): string {
  if (note.title?.trim()) return note.title.trim()
  if (note.kind === 'mail' && note.mailSubject?.trim()) return note.mailSubject.trim()
  if (note.kind === 'calendar' && note.eventTitleSnapshot?.trim()) return note.eventTitleSnapshot.trim()
  return fallback
}

function markdownPreviewText(value: string): string {
  return value
    .slice(0, 1200)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|[-*+]\s+|\d+\.\s+|>\s?)/gm, '')
    .replace(/[*_~>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function addMinutesIso(value: string, minutes: number): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  d.setMinutes(d.getMinutes() + minutes)
  return d.toISOString()
}

function calendarPreviewEvent(
  note: Pick<
    UserNote,
    | 'id'
    | 'accountId'
    | 'calendarSource'
    | 'calendarRemoteId'
    | 'eventRemoteId'
    | 'eventTitleSnapshot'
    | 'eventStartIsoSnapshot'
    | 'updatedAt'
  >,
  account: ConnectedAccount | null,
  fallbackTitle: string
): CalendarEventView | null {
  if (note.accountId == null || note.calendarSource == null) return null
  const startIso = note.eventStartIsoSnapshot ?? note.updatedAt
  const title = note.eventTitleSnapshot?.trim() || fallbackTitle
  return {
    id: `note:${note.id}:event`,
    source: note.calendarSource,
    accountId: note.accountId,
    accountEmail: account?.email ?? note.accountId,
    accountColorClass: account?.color ?? 'bg-primary',
    graphCalendarId: note.calendarRemoteId,
    graphEventId: note.eventRemoteId ?? undefined,
    title,
    startIso,
    endIso: addMinutesIso(startIso, 30),
    isAllDay: false,
    location: null,
    webLink: null,
    joinUrl: null,
    organizer: null,
    calendarCanEdit: false
  }
}

function ObjectPreviewCard({
  note,
  accountLabel,
  locale,
  compact = false
}: {
  note: UserNoteListItem
  accountLabel: string | null
  locale: string
  compact?: boolean
}): JSX.Element | null {
  const { t } = useTranslation()
  if (note.kind === 'standalone') return null

  if (note.kind === 'mail') {
    const subject = note.mailSubject?.trim() || t('common.noSubject')
    const sender = note.mailFromName?.trim() || note.mailFromAddr?.trim() || accountLabel || t('common.unknown')
    const date = note.mailReceivedAt ?? note.mailSentAt
    return (
      <div className={cn('rounded-lg border border-border bg-background/70 p-3', compact && 'p-2.5')}>
        <div className="flex items-start gap-2">
          <Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <div className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">{subject}</div>
              {note.mailHasAttachments ? <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" /> : null}
            </div>
            <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{sender}</div>
            {note.mailSnippet?.trim() ? (
              <div className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                {note.mailSnippet.trim()}
              </div>
            ) : null}
            <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
              {accountLabel ? <span>{accountLabel}</span> : null}
              {date ? <span>{formatDate(date, locale)}</span> : null}
              {note.mailIsRead === false ? <span>{t('notes.shell.unreadMail')}</span> : null}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const title = note.eventTitleSnapshot?.trim() || t('calendar.eventPreview.noTitle')
  return (
    <div className={cn('rounded-lg border border-border bg-background/70 p-3', compact && 'p-2.5')}>
      <div className="flex items-start gap-2">
        <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-foreground">{title}</div>
          <div className="mt-0.5 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            {note.eventStartIsoSnapshot ? <span>{formatDate(note.eventStartIsoSnapshot, locale)}</span> : null}
            {accountLabel ? <span>{accountLabel}</span> : null}
          </div>
        </div>
      </div>
    </div>
  )
}

export function NotesShell(): JSX.Element {
  const { t, i18n } = useTranslation()
  const accounts = useAccountsStore((s) => s.accounts)
  const selectMessageWithThreadPreview = useMailStore((s) => s.selectMessageWithThreadPreview)
  const clearSelectedMessage = useMailStore((s) => s.clearSelectedMessage)
  const pushToast = useUndoStore((s) => s.pushToast)
  const [notes, setNotes] = useState<UserNoteListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [kinds, setKinds] = useState<UserNoteKind[]>(ALL_KINDS)
  const [accountId, setAccountId] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [editing, setEditing] = useState<UserNote | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editBody, setEditBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.mailClient.notes.list({
        kinds,
        accountIds: accountId ? [accountId] : [],
        dateFrom: dateFrom ? new Date(`${dateFrom}T00:00:00`).toISOString() : null,
        dateTo: dateTo ? new Date(`${dateTo}T23:59:59`).toISOString() : null,
        search: search.trim() || null,
        limit: 500
      })
      setNotes(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setNotes([])
    } finally {
      setLoading(false)
    }
  }, [accountId, dateFrom, dateTo, kinds, search])

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void load()
    }, 150)
    return (): void => window.clearTimeout(handle)
  }, [load])

  useEffect(() => {
    const off = window.mailClient.events.onNotesChanged(() => {
      void load()
    })
    return off
  }, [load])

  const accountLabelById = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.displayName || a.email] as const)),
    [accounts]
  )

  function toggleKind(kind: UserNoteKind): void {
    setKinds((prev) => {
      const next = prev.includes(kind) ? prev.filter((x) => x !== kind) : [...prev, kind]
      return next.length === 0 ? ALL_KINDS : next
    })
  }

  async function createStandalone(): Promise<void> {
    setSaving(true)
    setError(null)
    try {
      const note = await window.mailClient.notes.createStandalone({
        title: t('notes.shell.newStandaloneTitle'),
        body: ''
      })
      clearSelectedMessage()
      setEditing(note)
      setEditTitle(note.title ?? '')
      setEditBody(note.body)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  function openEdit(note: UserNoteListItem): void {
    setEditing(note)
    setEditTitle(note.title ?? '')
    setEditBody(note.body)
    if (note.kind === 'mail' && note.messageId != null) {
      void selectMessageWithThreadPreview(note.messageId)
    } else {
      clearSelectedMessage()
    }
  }

  async function saveEditing(): Promise<void> {
    if (!editing) return
    setSaving(true)
    setError(null)
    try {
      let saved: UserNote
      if (editing.kind === 'standalone') {
        saved = await window.mailClient.notes.updateStandalone({
          id: editing.id,
          title: editTitle,
          body: editBody
        })
      } else if (editing.kind === 'mail' && editing.messageId != null) {
        saved = await window.mailClient.notes.upsertMail({
          messageId: editing.messageId,
          title: editTitle,
          body: editBody
        })
      } else if (
        editing.kind === 'calendar' &&
        editing.accountId &&
        editing.calendarSource &&
        editing.calendarRemoteId &&
        editing.eventRemoteId
      ) {
        saved = await window.mailClient.notes.upsertCalendar({
          accountId: editing.accountId,
          calendarSource: editing.calendarSource,
          calendarRemoteId: editing.calendarRemoteId,
          eventRemoteId: editing.eventRemoteId,
          title: editTitle,
          body: editBody,
          eventTitleSnapshot: editing.eventTitleSnapshot,
          eventStartIsoSnapshot: editing.eventStartIsoSnapshot
        })
      } else {
        throw new Error(t('notes.shell.invalidNote'))
      }
      setEditing({ ...editing, ...saved })
      pushToast({ label: t('notes.editor.saved'), variant: 'success' })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  async function deleteNote(note: UserNoteListItem): Promise<void> {
    const ok = window.confirm(t('notes.shell.deleteConfirm'))
    if (!ok) return
    setSaving(true)
    try {
      await window.mailClient.notes.delete(note.id)
      if (editing?.id === note.id) setEditing(null)
      pushToast({ label: t('notes.shell.deleted'), variant: 'success' })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const selectedNoteListItem = editing as UserNoteListItem | null
  const selectedAccount =
    editing?.accountId != null ? accounts.find((a) => a.id === editing.accountId) ?? null : null
  const selectedAccountLabel =
    editing?.kind === 'mail'
      ? selectedNoteListItem?.mailAccountId
        ? accountLabelById.get(selectedNoteListItem.mailAccountId) ?? selectedNoteListItem.mailAccountId
        : null
      : editing?.accountId
        ? accountLabelById.get(editing.accountId) ?? editing.accountId
        : null
  const selectedCalendarEvent =
    editing?.kind === 'calendar'
      ? calendarPreviewEvent(editing, selectedAccount, t('calendar.eventPreview.noTitle'))
      : null
  const selectedObjectPreview =
    editing?.kind === 'mail' ? (
      <ReadingPane
        emptySelectionTitle={t('notes.shell.linkedMailTitle')}
        emptySelectionBody={t('notes.shell.linkedMailEmpty')}
      />
    ) : selectedCalendarEvent ? (
      <CalendarEventPreview event={selectedCalendarEvent} onEdit={(): void => undefined} />
    ) : null

  return (
    <section className="flex min-h-0 flex-1 bg-background">
      <aside className="flex w-[340px] shrink-0 flex-col border-r border-border bg-card">
        <header className="border-b border-border bg-card">
          <div className={moduleColumnHeaderShellBarClass}>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-0.5 py-0.5">
              <div className="truncate text-xs font-semibold leading-tight text-foreground">{t('notes.shell.title')}</div>
              <div className="truncate text-[10px] leading-tight text-muted-foreground">{t('notes.shell.subtitle')}</div>
            </div>
            <button
              type="button"
              onClick={(): void => void createStandalone()}
              disabled={saving}
              className={cn(moduleColumnHeaderPrimarySmClass, 'shrink-0')}
            >
              <Plus className={moduleColumnHeaderIconGlyphClass} />
              {t('notes.shell.newStandalone')}
            </button>
          </div>
          <div className={moduleColumnHeaderSubToolbarClass}>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(e): void => setSearch(e.target.value)}
              placeholder={t('notes.shell.searchPlaceholder')}
              className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-2 text-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring/40"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ALL_KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={(): void => toggleKind(kind)}
                className={cn(
                  'rounded-full border px-2 py-0.5 text-[11px] font-medium',
                  kinds.includes(kind)
                    ? 'border-primary/40 bg-primary/15 text-foreground'
                    : 'border-border text-muted-foreground hover:bg-secondary'
                )}
              >
                {t(`notes.kind.${kind}`)}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e): void => setDateFrom(e.target.value)}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs"
              title={t('notes.shell.dateFrom')}
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e): void => setDateTo(e.target.value)}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs"
              title={t('notes.shell.dateTo')}
            />
          </div>
          <select
            value={accountId}
            onChange={(e): void => setAccountId(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
          >
            <option value="">{t('notes.shell.allAccounts')}</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.displayName || a.email}
              </option>
            ))}
          </select>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading && notes.length === 0 ? (
            <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t('common.loading')}
            </div>
          ) : notes.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">{t('notes.shell.empty')}</div>
          ) : (
            notes.map((note) => {
              const Icon = kindIcon(note.kind)
              const active = editing?.id === note.id
              return (
                <button
                  key={note.id}
                  type="button"
                  onClick={(): void => openEdit(note)}
                  className={cn(
                    'flex w-full items-start gap-3 border-b border-border/60 px-4 py-3 text-left transition-colors hover:bg-secondary/50',
                    active && 'bg-secondary'
                  )}
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">
                      {noteTitle(note, t('notes.shell.untitled'))}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {markdownPreviewText(note.body) || t('notes.shell.emptyBody')}
                    </div>
                    <div className="mt-2">
                      <ObjectPreviewCard
                        note={note}
                        accountLabel={
                          note.kind === 'mail'
                            ? note.mailAccountId
                              ? accountLabelById.get(note.mailAccountId) ?? note.mailAccountId
                              : null
                            : note.accountId
                              ? accountLabelById.get(note.accountId) ?? note.accountId
                              : null
                        }
                        locale={i18n.language}
                        compact
                      />
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span>{t(`notes.kind.${note.kind}`)}</span>
                      <span>{formatDate(note.updatedAt, i18n.language)}</span>
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </aside>

      <main className="flex min-h-0 flex-1 flex-col">
        <header className={cn(moduleColumnHeaderShellBarClass, 'min-w-0')}>
          <div className={cn(moduleColumnHeaderTitleClass, 'min-w-0 truncate text-left')}>
            {editing ? noteTitle(editing as UserNoteListItem, t('notes.shell.untitled')) : t('notes.shell.selectNote')}
          </div>
          {editing ? (
            <ModuleColumnHeaderIconButton
              type="button"
              onClick={(): void => {
                setEditing(null)
                clearSelectedMessage()
              }}
              aria-label={t('common.close')}
            >
              <X className={moduleColumnHeaderIconGlyphClass} />
            </ModuleColumnHeaderIconButton>
          ) : null}
        </header>
        {error ? <div className="border-b border-border px-4 py-2 text-xs text-destructive">{error}</div> : null}
        {!editing ? (
          <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
            {t('notes.shell.selectNoteHint')}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1">
            <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {(() => {
                  const Icon = kindIcon(editing.kind)
                  return <Icon className="h-4 w-4" />
                })()}
                <span>{t(`notes.kind.${editing.kind}`)}</span>
                {selectedAccountLabel ? <span>{selectedAccountLabel}</span> : null}
                <span>{formatDate(editing.updatedAt, i18n.language)}</span>
              </div>
              {selectedNoteListItem && selectedNoteListItem.kind !== 'standalone' ? (
                <ObjectPreviewCard
                  note={selectedNoteListItem}
                  accountLabel={selectedAccountLabel}
                  locale={i18n.language}
                />
              ) : null}
              <input
                type="text"
                value={editTitle}
                onChange={(e): void => setEditTitle(e.target.value)}
                placeholder={t('notes.shell.titlePlaceholder')}
                className="rounded-md border border-border bg-background px-3 py-2 text-base font-semibold outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
              />
              <MarkdownNoteEditor
                value={editBody}
                onChange={setEditBody}
                placeholder={t('notes.editor.placeholder')}
                height={420}
                className="min-h-0 flex-1"
              />
              <div className="-mt-1 text-xs text-muted-foreground">{t('notes.editor.markdownHint')}</div>
              <footer className="flex justify-between gap-3">
                <button
                  type="button"
                  onClick={(): void => void deleteNote(editing as UserNoteListItem)}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                  {t('common.delete')}
                </button>
                <button
                  type="button"
                  onClick={(): void => void saveEditing()}
                  disabled={saving}
                  className="inline-flex min-w-28 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {t('common.save')}
                </button>
              </footer>
            </div>
            {selectedObjectPreview ? (
              <aside className="hidden w-[420px] shrink-0 flex-col border-l border-border bg-card lg:flex">
                <div className="flex h-9 shrink-0 items-center border-b border-border px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('notes.shell.linkedObject')}
                </div>
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{selectedObjectPreview}</div>
              </aside>
            ) : null}
          </div>
        )}
      </main>
    </section>
  )
}
