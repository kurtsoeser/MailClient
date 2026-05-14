import type { MouseEvent } from 'react'
import type { ConnectedAccount, MailListItem } from '@shared/types'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MIME_THREAD_IDS } from '@/lib/workflow-dnd'
import { AccountColorStripe } from '@/components/AccountColorStripe'
import type { ThreadGroup } from '@/lib/thread-group'

export const WORKFLOW_INBOX_STRIPE_BAR =
  'pointer-events-none absolute left-0 top-0 bottom-0 z-[1] w-[3px] rounded-r opacity-90'

export function WorkflowThreadBlock({
  thread,
  threadMessages,
  conversationDragIds,
  expanded,
  onToggleExpand,
  accounts,
  selectedMessageId,
  onSelectMessage,
  onOpenConversationContext,
  onOpenMessageContext
}: {
  thread: ThreadGroup
  threadMessages: MailListItem[]
  conversationDragIds: number[]
  expanded: boolean
  onToggleExpand: () => void
  accounts: ConnectedAccount[]
  selectedMessageId: number | null
  onSelectMessage: (id: number) => void
  onOpenConversationContext: (
    e: MouseEvent,
    latest: MailListItem,
    ids: number[],
    ctxMsgs: MailListItem[]
  ) => void
  onOpenMessageContext: (e: MouseEvent, m: MailListItem) => void
}): JSX.Element {
  const latest = thread.latestMessage
  const root = thread.rootMessage
  const acc = accounts.find((a) => a.id === latest.accountId)
  const threadSelected = threadMessages.some((m) => m.id === selectedMessageId)
  const multi = thread.messageCount > 1

  return (
    <div className="space-y-0.5">
      <div
        draggable
        onDragStart={(e): void => {
          const payload = JSON.stringify(conversationDragIds)
          e.dataTransfer.setData(MIME_THREAD_IDS, payload)
          e.dataTransfer.setData('text/plain', conversationDragIds.join(','))
          e.dataTransfer.setData('text/mailclient-message-id', String(latest.id))
          e.dataTransfer.setData('application/x-mailclient-message-id', String(latest.id))
          e.dataTransfer.effectAllowed = 'move'
        }}
        role="button"
        tabIndex={0}
        onClick={(e): void => {
          e.stopPropagation()
          onSelectMessage(latest.id)
        }}
        onKeyDown={(e): void => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onSelectMessage(latest.id)
          }
        }}
        onContextMenu={(e): void => {
          onOpenConversationContext(e, latest, conversationDragIds, threadMessages)
        }}
        title={acc ? `Posteingang: ${acc.displayName} (${acc.email})` : undefined}
        className={cn(
          'relative cursor-grab rounded border py-1 pl-2 pr-1.5 text-xs active:cursor-grabbing',
          threadSelected || latest.id === selectedMessageId
            ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
            : 'border-border/60 bg-background hover:bg-secondary/40',
          latest.isVipSender && 'border-amber-500/60 ring-1 ring-amber-500/30'
        )}
      >
        {acc && <AccountColorStripe color={acc.color} className={WORKFLOW_INBOX_STRIPE_BAR} />}
        <div className="flex items-start gap-1">
          {multi ? (
            <button
              type="button"
              className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
              title={expanded ? 'Konversation zuklappen' : 'Konversation aufklappen'}
              onClick={(e): void => {
                e.stopPropagation()
                onToggleExpand()
              }}
            >
              {expanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </button>
          ) : (
            <span className="w-4 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <span className="truncate font-medium">{root.subject ?? '(Kein Betreff)'}</span>
              {multi && (
                <span className="shrink-0 rounded bg-secondary px-1 py-px text-[9px] font-medium text-muted-foreground">
                  {thread.messageCount}
                </span>
              )}
            </div>
            <div className="truncate text-[10px] text-muted-foreground">
              {root.fromAddr ?? ''} {acc ? `· ${acc.email}` : ''}
            </div>
          </div>
        </div>
      </div>
      {multi &&
        expanded &&
        [...threadMessages]
          .sort((a, b) => {
            const ad = a.receivedAt ?? a.sentAt ?? ''
            const bd = b.receivedAt ?? b.sentAt ?? ''
            if (ad !== bd) return ad < bd ? -1 : 1
            return a.id - b.id
          })
          .map((m) => (
            <WorkflowSubMessageRow
              key={m.id}
              message={m}
              accounts={accounts}
              selected={selectedMessageId === m.id}
              onSelect={(): void => onSelectMessage(m.id)}
              onContextMenu={(e): void => onOpenMessageContext(e, m)}
            />
          ))}
    </div>
  )
}

/** Einzelne Nachricht in aufgeklappter Konversation (z. B. Kalender-Spalte „ToDo · Alle“). */
export function WorkflowSubMessageRow({
  message,
  accounts,
  selected,
  onSelect,
  onContextMenu
}: {
  message: MailListItem
  accounts: ConnectedAccount[]
  selected: boolean
  onSelect: () => void
  onContextMenu: (e: MouseEvent) => void
}): JSX.Element {
  const acc = accounts.find((a) => a.id === message.accountId)
  return (
    <div
      draggable
      onDragStart={(e): void => {
        const id = String(message.id)
        e.dataTransfer.setData(MIME_THREAD_IDS, JSON.stringify([message.id]))
        e.dataTransfer.setData('text/plain', id)
        e.dataTransfer.setData('text/mailclient-message-id', id)
        e.dataTransfer.setData('application/x-mailclient-message-id', id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      role="button"
      tabIndex={0}
      onClick={(e): void => {
        e.stopPropagation()
        onSelect()
      }}
      onKeyDown={(e): void => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      onContextMenu={onContextMenu}
      title={acc ? `Posteingang: ${acc.displayName} (${acc.email})` : undefined}
      className={cn(
        'relative ml-5 cursor-grab rounded border border-border/40 bg-secondary/20 py-0.5 pl-2 pr-1.5 text-[10px] active:cursor-grabbing',
        selected ? 'border-primary/60 ring-1 ring-primary/25' : 'hover:bg-secondary/50',
        message.isVipSender && 'border-amber-500/40'
      )}
    >
      {acc && <AccountColorStripe color={acc.color} className={WORKFLOW_INBOX_STRIPE_BAR} />}
      <div className="truncate font-medium">{message.subject ?? '(Kein Betreff)'}</div>
      <div className="truncate text-[9px] text-muted-foreground">
        {message.fromAddr ?? ''} {acc ? `· ${acc.email}` : ''}
      </div>
    </div>
  )
}
