import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Calendar, FolderOpen, Loader2, Mail, Search } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { CalendarEventView, MailFolder, SearchHit } from '@shared/types'

import { useAccountsStore } from '@/stores/accounts'
import { useMailStore } from '@/stores/mail'

import {
  DASHBOARD_LAYOUT_LEGACY_REF_WIDTH_PX,
  migrateGridCellPlacementToPixel
} from '@/app/home/dashboard-layout'
import {
  type DashboardCustomTileKind,
  type DashboardCustomTileStored,
  newCustomDashboardTileId
} from '@/app/home/dashboard-custom-tiles'

type Step = 'kind' | 'pick'

export function DashboardCustomTileWizard(props: {
  open: boolean
  onClose: () => void
  calendarEvents: CalendarEventView[]
  onCreate: (entry: DashboardCustomTileStored) => void
}): JSX.Element | null {
  const { open, onClose, calendarEvents, onCreate } = props
  const { t } = useTranslation()
  const accounts = useAccountsStore((s) => s.accounts)
  const foldersByAccount = useMailStore((s) => s.foldersByAccount)
  const [step, setStep] = useState<Step>('kind')
  const [kind, setKind] = useState<DashboardCustomTileKind | null>(null)
  const [mailQuery, setMailQuery] = useState('')
  const [mailHits, setMailHits] = useState<SearchHit[]>([])
  const [mailSearchLoading, setMailSearchLoading] = useState(false)

  const reset = useCallback((): void => {
    setStep('kind')
    setKind(null)
    setMailQuery('')
    setMailHits([])
    setMailSearchLoading(false)
  }, [])

  const handleClose = useCallback((): void => {
    reset()
    onClose()
  }, [onClose, reset])

  const defaultPlacement = useMemo(
    () =>
      migrateGridCellPlacementToPixel(
        { x: 0, y: 38, w: 4, h: 6 },
        DASHBOARD_LAYOUT_LEGACY_REF_WIDTH_PX
      ),
    []
  )

  const finishFolder = useCallback(
    (accountId: string, folder: MailFolder): void => {
      const id = newCustomDashboardTileId()
      onCreate({
        id,
        kind: 'folder',
        accountId,
        folderId: folder.id,
        label: folder.name,
        placement: { ...defaultPlacement }
      })
      handleClose()
    },
    [defaultPlacement, handleClose, onCreate]
  )

  const finishEvent = useCallback(
    (ev: CalendarEventView): void => {
      const id = newCustomDashboardTileId()
      onCreate({
        id,
        kind: 'calendar_event',
        accountId: ev.accountId,
        eventId: ev.id,
        eventTitle: ev.title,
        eventStartIso: ev.startIso,
        label: ev.title || t('dashboard.customTiles.noTitle'),
        placement: { ...defaultPlacement }
      })
      handleClose()
    },
    [defaultPlacement, handleClose, onCreate, t]
  )

  const finishMail = useCallback(
    (hit: SearchHit): void => {
      const id = newCustomDashboardTileId()
      onCreate({
        id,
        kind: 'mail',
        accountId: hit.accountId,
        messageId: hit.id,
        mailSubject: hit.subject ?? undefined,
        label: hit.subject || t('common.noSubject'),
        placement: { ...defaultPlacement }
      })
      handleClose()
    },
    [defaultPlacement, handleClose, onCreate, t]
  )

  const runMailSearch = useCallback(async (): Promise<void> => {
    const q = mailQuery.trim()
    if (q.length < 2) {
      setMailHits([])
      return
    }
    setMailSearchLoading(true)
    try {
      const res = await window.mailClient.mail.search(q, 20)
      setMailHits(res)
    } catch {
      setMailHits([])
    } finally {
      setMailSearchLoading(false)
    }
  }, [mailQuery])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal
      aria-label={t('dashboard.customTiles.wizardTitle')}
    >
      <div className="flex max-h-[min(90vh,32rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">{t('dashboard.customTiles.wizardTitle')}</h2>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            {t('common.cancel')}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
          {step === 'kind' ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{t('dashboard.customTiles.pickKindHint')}</p>
              <div className="grid gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={(): void => {
                    setKind('folder')
                    setStep('pick')
                  }}
                  className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card/60 px-3 py-4 text-center hover:bg-secondary/60"
                >
                  <FolderOpen className="h-8 w-8 text-primary" aria-hidden />
                  <span className="text-xs font-medium">{t('dashboard.customTiles.kindFolder')}</span>
                </button>
                <button
                  type="button"
                  onClick={(): void => {
                    setKind('calendar_event')
                    setStep('pick')
                  }}
                  className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card/60 px-3 py-4 text-center hover:bg-secondary/60"
                >
                  <Calendar className="h-8 w-8 text-primary" aria-hidden />
                  <span className="text-xs font-medium">{t('dashboard.customTiles.kindEvent')}</span>
                </button>
                <button
                  type="button"
                  onClick={(): void => {
                    setKind('mail')
                    setStep('pick')
                  }}
                  className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card/60 px-3 py-4 text-center hover:bg-secondary/60"
                >
                  <Mail className="h-8 w-8 text-primary" aria-hidden />
                  <span className="text-xs font-medium">{t('dashboard.customTiles.kindMail')}</span>
                </button>
              </div>
            </div>
          ) : kind === 'folder' ? (
            <div className="space-y-2">
              <button
                type="button"
                className="text-[11px] text-primary hover:underline"
                onClick={(): void => {
                  setStep('kind')
                  setKind(null)
                }}
              >
                ← {t('dashboard.customTiles.back')}
              </button>
              <p className="text-xs text-muted-foreground">{t('dashboard.customTiles.pickFolderHint')}</p>
              <ul className="max-h-[min(50vh,20rem)] space-y-1 overflow-y-auto pr-1">
                {accounts.map((acc) => {
                  const folders = foldersByAccount[acc.id] ?? []
                  return (
                    <li key={acc.id} className="space-y-0.5">
                      <div className="px-1 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {acc.email}
                      </div>
                      <ul className="space-y-0.5">
                        {folders.map((f) => (
                          <li key={f.id}>
                            <button
                              type="button"
                              onClick={(): void => finishFolder(acc.id, f)}
                              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs hover:bg-secondary/60"
                            >
                              <span className="min-w-0 truncate">{f.name}</span>
                              {(f.unreadCount ?? 0) > 0 ? (
                                <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground">
                                  {f.unreadCount}
                                </span>
                              ) : null}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : kind === 'calendar_event' ? (
            <div className="space-y-2">
              <button
                type="button"
                className="text-[11px] text-primary hover:underline"
                onClick={(): void => {
                  setStep('kind')
                  setKind(null)
                }}
              >
                ← {t('dashboard.customTiles.back')}
              </button>
              <p className="text-xs text-muted-foreground">{t('dashboard.customTiles.pickEventHint')}</p>
              {calendarEvents.length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  {t('dashboard.customTiles.noEvents')}
                </div>
              ) : (
                <ul className="max-h-[min(50vh,20rem)] divide-y divide-border/50 overflow-y-auto">
                  {calendarEvents.map((ev) => (
                    <li key={ev.id}>
                      <button
                        type="button"
                        onClick={(): void => finishEvent(ev)}
                        className="flex w-full flex-col items-start gap-0.5 px-2 py-2 text-left text-xs hover:bg-secondary/60"
                      >
                        <span className="font-medium text-foreground">{ev.title || t('dashboard.noTitle')}</span>
                        <span className="text-[10px] text-muted-foreground">{ev.accountEmail}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : kind === 'mail' ? (
            <div className="space-y-2">
              <button
                type="button"
                className="text-[11px] text-primary hover:underline"
                onClick={(): void => {
                  setStep('kind')
                  setKind(null)
                }}
              >
                ← {t('dashboard.customTiles.back')}
              </button>
              <p className="text-xs text-muted-foreground">{t('dashboard.customTiles.pickMailHint')}</p>
              <div className="flex gap-1.5">
                <input
                  type="search"
                  value={mailQuery}
                  onChange={(e): void => setMailQuery(e.target.value)}
                  onKeyDown={(e): void => {
                    if (e.key === 'Enter') void runMailSearch()
                  }}
                  placeholder={t('dashboard.customTiles.mailSearchPlaceholder')}
                  className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-ring"
                />
                <button
                  type="button"
                  onClick={(): void => void runMailSearch()}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-secondary/50 px-2 py-1.5 text-[11px] hover:bg-secondary"
                >
                  <Search className="h-3.5 w-3.5" aria-hidden />
                  {t('dashboard.searchButton')}
                </button>
              </div>
              {mailSearchLoading ? (
                <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  {t('dashboard.loading.search')}
                </div>
              ) : (
                <ul className="max-h-[min(40vh,16rem)] divide-y divide-border/50 overflow-y-auto">
                  {mailHits.map((hit) => (
                    <li key={hit.id}>
                      <button
                        type="button"
                        onClick={(): void => finishMail(hit)}
                        className="flex w-full flex-col items-start gap-0.5 px-2 py-2 text-left text-[11px] hover:bg-secondary/60"
                      >
                        <span className="font-medium text-foreground">{hit.subject || t('common.noSubject')}</span>
                        <span className="truncate text-[10px] text-muted-foreground">
                          {hit.fromName || hit.fromAddr || ''}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
