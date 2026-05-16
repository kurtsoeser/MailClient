import { cn } from '@/lib/utils'
import type { TeamsChatMessageView } from '@shared/types'
import { dayKey, formatDay, formatTime, initialsFromName, isOwnMessage } from './teams-chat-helpers'

export interface TeamsChatMessageRowCtx {
  myGraphUserId: string | null
  accountLabel: string
}

export function TeamsChatMessageRow({
  m,
  prev,
  ctx
}: {
  m: TeamsChatMessageView
  prev?: TeamsChatMessageView
  ctx: TeamsChatMessageRowCtx
}): JSX.Element {
  const showDay =
    !prev || (m.createdDateTime && dayKey(m.createdDateTime) !== dayKey(prev.createdDateTime))
  const text = m.bodyPreview?.trim() || ''

  if (m.messageKind === 'system') {
    return (
      <div>
        {showDay && m.createdDateTime ? (
          <div className="mb-3 flex justify-center">
            <span className="rounded-full bg-muted px-3 py-0.5 text-[10px] font-medium text-muted-foreground">
              {formatDay(m.createdDateTime)}
            </span>
          </div>
        ) : null}
        <div className="flex justify-center px-4 py-1">
          <div className="max-w-xl rounded-lg border border-dashed border-border/80 bg-muted/30 px-3 py-2 text-center shadow-sm">
            <p className="text-xs leading-relaxed text-foreground/90">{text}</p>
            <p className="mt-0.5 text-[10px] tabular-nums text-muted-foreground">{formatTime(m.createdDateTime)}</p>
          </div>
        </div>
      </div>
    )
  }

  const own = isOwnMessage(m, ctx.myGraphUserId, ctx.accountLabel || null)
  const label = m.fromDisplayName?.trim() || 'Unbekannt'

  return (
    <div>
      {showDay && m.createdDateTime ? (
        <div className="mb-3 flex justify-center">
          <span className="rounded-full bg-muted px-3 py-0.5 text-[10px] font-medium text-muted-foreground">
            {formatDay(m.createdDateTime)}
          </span>
        </div>
      ) : null}
      <div className={cn('flex w-full gap-2', own ? 'justify-end' : 'justify-start')}>
        {!own && (
              <div
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-secondary-foreground shadow-inner"
            aria-hidden
          >
            {initialsFromName(label)}
          </div>
        )}
        <div
          className={cn(
            'max-w-[min(85%,28rem)] rounded-2xl px-3 py-2 shadow-sm',
            own
              ? 'rounded-tr-sm bg-primary text-primary-foreground'
              : 'rounded-tl-sm border border-border/80 bg-card text-card-foreground'
          )}
        >
          {!own && (
            <div className="mb-0.5 flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-semibold text-foreground/90">{label}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">{formatTime(m.createdDateTime)}</span>
            </div>
          )}
          {own && (
            <div className="mb-0.5 flex justify-end">
              <span className="text-[10px] text-primary-foreground/80">{formatTime(m.createdDateTime)}</span>
            </div>
          )}
          <p
            className={cn(
              'whitespace-pre-wrap break-words text-sm leading-relaxed',
              own ? 'text-primary-foreground' : 'text-foreground',
              !text && 'italic text-muted-foreground'
            )}
          >
            {text || '(Inhalt nicht als Vorschau verfuegbar)'}
          </p>
        </div>
        {own && (
          <div
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[11px] font-semibold text-primary"
            aria-hidden
          >
            {initialsFromName(ctx.accountLabel)}
          </div>
        )}
      </div>
    </div>
  )
}
