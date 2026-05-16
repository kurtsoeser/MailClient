import { PanelRightOpen, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { moduleColumnHeaderOutlineSmClass } from '@/components/ModuleColumnHeader'
import type { TeamsChatPopoutListItem } from '@shared/types'
import { teamsChatPopoutRefKey } from './teams-chat-helpers'

interface Props {
  accountId: string | null
  selectedChatId: string | null
  openPopouts: TeamsChatPopoutListItem[]
  onFocus: (accountId: string, chatId: string) => void
  onClose: (accountId: string, chatId: string) => void
  onCloseAll: () => void
}

export function TeamsChatPopoutDock({
  accountId,
  selectedChatId,
  openPopouts,
  onFocus,
  onClose,
  onCloseAll
}: Props): JSX.Element | null {
  if (openPopouts.length === 0) return null

  const selectedKey =
    accountId && selectedChatId ? teamsChatPopoutRefKey(accountId, selectedChatId) : null

  return (
    <div className="shrink-0 border-b border-border bg-muted/30 px-2 py-1.5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          <PanelRightOpen className="h-3 w-3 shrink-0" aria-hidden />
          {openPopouts.length === 1 ? '1 Fenster' : `${openPopouts.length} Fenster`}
        </span>
        <button type="button" className={moduleColumnHeaderOutlineSmClass} onClick={onCloseAll}>
          {openPopouts.length > 1 ? 'Alle schliessen' : 'Fenster schliessen'}
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        {openPopouts.map((p) => {
          const key = teamsChatPopoutRefKey(p.accountId, p.chatId)
          const active = key === selectedKey
          return (
            <div
              key={key}
              className={cn(
                'flex max-w-[min(100%,220px)] items-center gap-0.5 rounded-md border border-border bg-background pr-0.5 text-[11px] shadow-sm',
                active && 'border-primary/50 bg-primary/10'
              )}
            >
              <button
                type="button"
                className="min-w-0 flex-1 truncate px-2 py-1 text-left hover:bg-muted/50"
                title={p.title}
                onClick={(): void => onFocus(p.accountId, p.chatId)}
              >
                <span className="truncate">{p.title}</span>
                {p.alwaysOnTop && (
                  <span className="ml-1 text-[9px] text-muted-foreground" title="Immer im Vordergrund">
                    · oben
                  </span>
                )}
              </button>
              <button
                type="button"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                title="Fenster schliessen"
                aria-label={`${p.title} schliessen`}
                onClick={(): void => onClose(p.accountId, p.chatId)}
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
