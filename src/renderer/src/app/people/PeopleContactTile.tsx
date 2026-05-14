import { Star } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { PeopleContactView, PeopleListSort } from '@shared/types'
import { cn } from '@/lib/utils'
import { resolvedAccountColorCss } from '@/lib/avatar-color'
import { PeopleContactListAvatar } from '@/app/people/PeopleContactListAvatar'
import { peopleListPrimaryLabel } from '@/app/people/people-display-label'

export function PeopleContactTile({
  contact,
  sortBy,
  accountColor,
  selected,
  onSelect
}: {
  contact: PeopleContactView
  sortBy: PeopleListSort
  accountColor?: string | null
  selected: boolean
  onSelect: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const label = peopleListPrimaryLabel(contact, sortBy)
  const company = contact.company?.trim()

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'relative flex min-h-[6.75rem] w-full flex-col overflow-hidden rounded-xl border border-border bg-card text-left shadow-md',
        'transition-[box-shadow,border-color] hover:border-primary/25 hover:shadow-lg',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        selected && 'border-primary/40 ring-2 ring-primary ring-offset-2 ring-offset-background'
      )}
    >
      <div className="flex shrink-0 items-center border-b border-border bg-secondary/35 px-2 py-1">
        <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {contact.provider === 'microsoft'
            ? t('people.shell.tileProviderMicrosoft')
            : t('people.shell.tileProviderGoogle')}
        </span>
      </div>
      <div
        className="flex min-h-0 flex-1 gap-3 p-3"
        style={{ borderLeft: `3px solid ${resolvedAccountColorCss(accountColor)}` }}
      >
        <PeopleContactListAvatar
          contact={contact}
          displayName={label}
          accountColor={accountColor ?? null}
          variant="tile"
        />
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex items-start justify-between gap-1">
            <span className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">{label}</span>
            {contact.isFavorite ? (
              <Star className="mt-0.5 h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" aria-hidden />
            ) : null}
          </div>
          {contact.primaryEmail ? (
            <p className="mt-1 truncate text-xs text-muted-foreground">{contact.primaryEmail}</p>
          ) : (
            <p className="mt-1 text-xs italic text-muted-foreground/80">—</p>
          )}
          {company ? (
            <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">{company}</p>
          ) : null}
        </div>
      </div>
    </button>
  )
}
