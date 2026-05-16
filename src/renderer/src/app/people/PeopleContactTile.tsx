import { useMemo, type ReactNode } from 'react'
import { Star } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { PeopleContactView, PeopleListSort } from '@shared/types'
import { cn } from '@/lib/utils'
import { resolvedAccountColorCss } from '@/lib/avatar-color'
import { PeopleContactListAvatar } from '@/app/people/PeopleContactListAvatar'
import { peopleListPrimaryLabel } from '@/app/people/people-display-label'
import {
  formatAddressLines,
  parseAddressesJson,
  parseEmailsJson,
  parsePhonesJson
} from '@/app/people/people-contact-json'

function TileDetailRow({
  label,
  children,
  className
}: {
  label: string
  children: ReactNode
  className?: string
}): JSX.Element | null {
  if (children == null || children === false) return null
  if (typeof children === 'string' && !children.trim()) return null
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm leading-snug text-foreground">{children}</dd>
    </div>
  )
}

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

  const phones = useMemo(() => parsePhonesJson(contact.phonesJson), [contact.phonesJson])
  const extraEmails = useMemo(() => {
    const all = parseEmailsJson(contact.emailsJson)
    const primary = contact.primaryEmail?.trim().toLowerCase()
    if (!primary) return all
    return all.filter((e) => e.address.toLowerCase() !== primary)
  }, [contact.emailsJson, contact.primaryEmail])
  const addresses = useMemo(() => parseAddressesJson(contact.addressesJson), [contact.addressesJson])

  const given = contact.givenName?.trim()
  const surname = contact.surname?.trim()
  const nameParts = given || surname ? [given, surname].filter(Boolean).join(' ') : null

  const company = contact.company?.trim()
  const jobTitle = contact.jobTitle?.trim()
  const department = contact.department?.trim()
  const office = contact.officeLocation?.trim()
  const birthday = contact.birthdayIso?.trim()
  const webPage = contact.webPage?.trim()
  const notes = contact.notes?.trim()

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'relative flex w-full flex-col overflow-hidden rounded-2xl border border-border bg-card text-left shadow-md',
        'transition-[box-shadow,border-color] hover:border-primary/25 hover:shadow-lg',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        selected && 'border-primary/40 ring-2 ring-primary ring-offset-2 ring-offset-background'
      )}
      style={{ borderTop: `3px solid ${resolvedAccountColorCss(accountColor)}` }}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-secondary/35 px-2.5 py-1.5">
        <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {contact.provider === 'microsoft'
            ? t('people.shell.tileProviderMicrosoft')
            : t('people.shell.tileProviderGoogle')}
        </span>
        {contact.isFavorite ? (
          <Star className="h-4 w-4 shrink-0 fill-amber-400 text-amber-400" aria-hidden />
        ) : null}
      </div>

      <div className="flex min-h-[8rem] gap-4 p-4">
        <div className="flex w-[8rem] shrink-0 flex-col items-center gap-2.5 pt-0.5 sm:w-[9rem]">
          <PeopleContactListAvatar
            contact={contact}
            displayName={label}
            accountColor={accountColor ?? null}
            variant="tile"
          />
          <div className="w-full min-w-0 text-center">
            <p className="text-base font-semibold leading-snug text-foreground">{label}</p>
            {nameParts && nameParts !== label ? (
              <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{nameParts}</p>
            ) : null}
          </div>
        </div>

        <dl className="grid min-w-0 flex-1 content-start gap-2.5 border-l border-border/70 pl-4 sm:grid-cols-2 sm:gap-x-6">
          <TileDetailRow label={t('people.shell.email')} className="sm:col-span-2">
            {contact.primaryEmail || extraEmails.length > 0 ? (
              <ul className="space-y-0.5">
                {contact.primaryEmail ? (
                  <li className="break-all">{contact.primaryEmail}</li>
                ) : null}
                {extraEmails.map((e) => (
                  <li key={e.address} className="break-all">
                    {e.name ? (
                      <>
                        <span className="text-muted-foreground">{e.name}: </span>
                        {e.address}
                      </>
                    ) : (
                      e.address
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <span className="italic text-muted-foreground/80">{t('people.shell.noEmail')}</span>
            )}
          </TileDetailRow>
          <TileDetailRow label={t('people.shell.company')}>{company}</TileDetailRow>
          <TileDetailRow label={t('people.shell.jobTitle')}>{jobTitle}</TileDetailRow>
          <TileDetailRow label={t('people.shell.fieldDepartment')}>{department}</TileDetailRow>
          <TileDetailRow label={t('people.shell.fieldOffice')}>{office}</TileDetailRow>
          <TileDetailRow label={t('people.shell.fieldBirthday')}>{birthday}</TileDetailRow>
          <TileDetailRow label={t('people.shell.fieldWeb')}>
            {webPage ? <span className="break-all">{webPage}</span> : null}
          </TileDetailRow>
          {phones.length > 0 ? (
            <TileDetailRow label={t('people.shell.phone')}>
              <ul className="space-y-0.5">
                {phones.map((p) => (
                  <li key={`${p.type}:${p.value}`}>
                    <span className="text-muted-foreground">{p.type}: </span>
                    {p.value}
                  </li>
                ))}
              </ul>
            </TileDetailRow>
          ) : null}
          {addresses.length > 0 ? (
            <TileDetailRow label={t('people.shell.fieldAddress')} className="sm:col-span-2">
              <ul className="space-y-2">
                {addresses.map((addr) => {
                  const lines = formatAddressLines(addr)
                  if (lines.length === 0) return null
                  return (
                    <li key={`${addr.type}:${lines.join('|')}`}>
                      <span className="text-muted-foreground">{addr.type}: </span>
                      {lines.map((line) => (
                        <span key={line} className="block">
                          {line}
                        </span>
                      ))}
                    </li>
                  )
                })}
              </ul>
            </TileDetailRow>
          ) : null}
          {notes ? (
            <TileDetailRow label={t('people.shell.notes')} className="sm:col-span-2">
              <p className="line-clamp-6 whitespace-pre-wrap rounded-md border border-border/60 bg-muted/15 p-2.5 text-sm">
                {notes}
              </p>
            </TileDetailRow>
          ) : null}
        </dl>
      </div>
    </button>
  )
}
