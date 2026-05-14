import { useCallback, useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { de, enUS } from 'date-fns/locale'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'

import type { ConnectedAccount, MailListItem } from '@shared/types'
import { cn } from '@/lib/utils'
import { resolvedAccountColorCss } from '@/lib/avatar-color'
import { useMailStore } from '@/stores/mail'

import type { DashboardCustomTileStored } from '@/app/home/dashboard-custom-tiles'

const PREVIEW_MAX = 14

export function DashboardCustomTileBody(props: {
  entry: DashboardCustomTileStored
  accountById: Map<string, ConnectedAccount>
  onOpenInApp: () => void
}): JSX.Element {
  const { entry, accountById, onOpenInApp } = props
  const { t, i18n } = useTranslation()
  const dfLocale = i18n.language?.startsWith('de') ? de : enUS
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lines, setLines] = useState<MailListItem[]>([])
  const openMessageInFolder = useMailStore((s) => s.openMessageInFolder)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      if (entry.kind === 'folder' && entry.folderId != null) {
        const list = await window.mailClient.mail.listMessages({
          accountId: entry.accountId,
          folderId: entry.folderId,
          limit: PREVIEW_MAX
        })
        setLines(list)
      } else if (entry.kind === 'mail' && entry.messageId != null) {
        const full = await window.mailClient.mail.getMessage(entry.messageId)
        if (full) {
          setLines([full])
        } else {
          setLines([])
        }
      } else {
        setLines([])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setLines([])
    } finally {
      setLoading(false)
    }
  }, [entry])

  useEffect(() => {
    void load()
  }, [load])

  if (entry.kind === 'calendar_event') {
    const when =
      entry.eventStartIso != null
        ? ((): string => {
            const d = parseISO(entry.eventStartIso)
            return Number.isNaN(d.getTime()) ? entry.eventStartIso : format(d, 'Pp', { locale: dfLocale })
          })()
        : ''
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-3">
        <button
          type="button"
          onClick={onOpenInApp}
          className="rounded-md border border-border/60 bg-muted/20 px-2 py-2 text-left text-xs hover:bg-secondary/50"
        >
          <div className="font-medium text-foreground">{entry.eventTitle || t('dashboard.noTitle')}</div>
          {when ? <div className="mt-1 text-[11px] text-muted-foreground">{when}</div> : null}
          <div className="mt-1 text-[10px] text-muted-foreground">{t('dashboard.customTiles.openInCalendar')}</div>
        </button>
      </div>
    )
  }

  if (entry.kind === 'mail' && entry.messageId != null) {
    const m = lines[0]
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-3">
        {loading ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          </div>
        ) : error ? (
          <div className="text-xs text-destructive">{error}</div>
        ) : m ? (
          <button
            type="button"
            onClick={(): void => {
              void openMessageInFolder(m.id)
            }}
            className="rounded-md border border-border/60 bg-muted/20 px-2 py-2 text-left text-xs hover:bg-secondary/50"
          >
            <div className="font-medium text-foreground">{m.subject || t('common.noSubject')}</div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {m.fromName || m.fromAddr || t('common.unknown')}
            </div>
            {m.snippet ? (
              <div className="mt-2 line-clamp-4 text-[11px] text-muted-foreground/90">{m.snippet}</div>
            ) : null}
          </button>
        ) : (
          <div className="text-xs text-muted-foreground">{t('dashboard.customTiles.mailMissing')}</div>
        )}
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          </div>
        ) : error ? (
          <div className="px-3 py-4 text-xs text-destructive">{error}</div>
        ) : lines.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-muted-foreground">{t('dashboard.inboxEmpty')}</div>
        ) : (
          <ul className="divide-y divide-border/40">
            {lines.map((m) => {
              const account = accountById.get(m.accountId) ?? null
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={(): void => {
                      void openMessageInFolder(m.id)
                    }}
                    className={cn(
                      'flex w-full items-start gap-2 px-3 py-2 text-left text-xs transition-colors',
                      'hover:bg-secondary/50'
                    )}
                  >
                    {account ? (
                      <span
                        className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                        style={{ background: resolvedAccountColorCss(account.color) }}
                        aria-hidden
                      />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className={cn('truncate', m.isRead ? 'text-foreground/90' : 'font-semibold text-foreground')}>
                        {m.fromName || m.fromAddr || t('common.unknown')}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">{m.subject || t('common.noSubject')}</div>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
