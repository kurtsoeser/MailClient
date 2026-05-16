import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type MouseEvent
} from 'react'
import {
  Building2,
  Briefcase,
  Cake,
  Check,
  Globe,
  ImageUp,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  StickyNote,
  Star,
  Trash2,
  X
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ConnectedAccount, PeopleContactView, PeopleListSort, PeopleUpdateContactPatch } from '@shared/types'
import { useComposeStore } from '@/stores/compose'
import { showAppAlert, showAppConfirm } from '@/stores/app-dialog'
import { Avatar } from '@/components/Avatar'
import { cn } from '@/lib/utils'
import { bgToRingClass, resolvedAccountColorCss } from '@/lib/avatar-color'
import { peopleListPrimaryLabel } from '@/app/people/people-display-label'
import { parsePhonesJson } from '@/app/people/people-contact-json'

export type PeopleContactDetailPanelHandle = {
  /** Speichert offene Bearbeitung am aktuellen Kontakt. `false` bei Fehler — Wechsel dann abbrechen. */
  flushEditBeforeLeave: () => Promise<boolean>
}

type PeopleEditForm = {
  displayName: string
  givenName: string
  surname: string
  company: string
  jobTitle: string
  department: string
  officeLocation: string
  birthdayIso: string
  webPage: string
  primaryEmail: string
  notes: string
}

function buildPatchFromForm(form: PeopleEditForm): PeopleUpdateContactPatch {
  const primary = form.primaryEmail.trim() || null
  return {
    displayName: form.displayName.trim() || null,
    givenName: form.givenName.trim() || null,
    surname: form.surname.trim() || null,
    company: form.company.trim() || null,
    jobTitle: form.jobTitle.trim() || null,
    department: form.department.trim() || null,
    officeLocation: form.officeLocation.trim() || null,
    birthdayIso: form.birthdayIso.trim() || null,
    webPage: form.webPage.trim() || null,
    primaryEmail: primary,
    notes: form.notes.trim() || null
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary)
}

/** Kompakte Icon-Aktionen wie in `ReadingPane` (Mail-Detail). */
function PeopleDetailIconButton({
  icon: Icon,
  title,
  onClick,
  disabled,
  destructive,
  favoriteActive,
  spin
}: {
  icon: ComponentType<{ className?: string }>
  title: string
  onClick: (e: MouseEvent<HTMLButtonElement>) => void
  disabled?: boolean
  destructive?: boolean
  favoriteActive?: boolean
  spin?: boolean
}): JSX.Element {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={title}
      className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors',
        disabled
          ? 'cursor-not-allowed text-muted-foreground/40'
          : destructive
            ? 'text-muted-foreground hover:bg-destructive/20 hover:text-destructive'
            : favoriteActive
              ? 'text-amber-400 hover:bg-secondary hover:text-amber-300'
              : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
      )}
    >
      {spin ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        <Icon className={cn('h-4 w-4', favoriteActive && 'fill-amber-400 text-amber-400')} />
      )}
    </button>
  )
}

interface PeopleContactDetailPanelProps {
  selected: PeopleContactView
  account: ConnectedAccount | undefined
  photoUrl: string | null
  /** Gleiche Namensreihenfolge wie in der Kontaktliste (Sortierung). */
  listSortBy: PeopleListSort
  onUpdated: () => Promise<void>
  onDeleted: () => Promise<void>
}

export const PeopleContactDetailPanel = forwardRef<PeopleContactDetailPanelHandle, PeopleContactDetailPanelProps>(
  function PeopleContactDetailPanel({ selected, account, photoUrl, listSortBy, onUpdated, onDeleted }, ref): JSX.Element {
  const { t } = useTranslation()
  const openNewTo = useComposeStore((s) => s.openNewTo)

  const [editing, setEditing] = useState(false)
  const [saveBusy, setSaveBusy] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const photoFileRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState<PeopleEditForm>({
    displayName: '',
    givenName: '',
    surname: '',
    company: '',
    jobTitle: '',
    department: '',
    officeLocation: '',
    birthdayIso: '',
    webPage: '',
    primaryEmail: '',
    notes: ''
  })

  const editingRef = useRef(editing)
  editingRef.current = editing
  const formRef = useRef(form)
  formRef.current = form
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  const onUpdatedRef = useRef(onUpdated)
  onUpdatedRef.current = onUpdated

  const ringCls = account ? bgToRingClass(account.color) : ''
  const hasLocalPhoto = Boolean(selected.photoLocalPath?.trim())

  const resetForm = useCallback((): void => {
    setForm({
      displayName: selected.displayName ?? '',
      givenName: selected.givenName ?? '',
      surname: selected.surname ?? '',
      company: selected.company ?? '',
      jobTitle: selected.jobTitle ?? '',
      department: selected.department ?? '',
      officeLocation: selected.officeLocation ?? '',
      birthdayIso: selected.birthdayIso ?? '',
      webPage: selected.webPage ?? '',
      primaryEmail: selected.primaryEmail ?? '',
      notes: selected.notes ?? ''
    })
  }, [selected])

  const lastFormBoundIdRef = useRef<number | null>(null)

  useEffect(() => {
    if (!editing) {
      resetForm()
      lastFormBoundIdRef.current = selected.id
      return
    }
    if (lastFormBoundIdRef.current !== selected.id) {
      resetForm()
      lastFormBoundIdRef.current = selected.id
      return
    }
    lastFormBoundIdRef.current = selected.id
  }, [selected.id, editing, resetForm])

  useImperativeHandle(
    ref,
    () => ({
      flushEditBeforeLeave: async (): Promise<boolean> => {
        if (!editingRef.current) return true
        const sel = selectedRef.current
        const patch = buildPatchFromForm(formRef.current)
        setSaveBusy(true)
        try {
          await window.mailClient.people.updateContact({ id: sel.id, patch })
          await onUpdatedRef.current()
          return true
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          await showAppAlert(msg, { title: t('people.shell.saveContactErrorTitle') })
          return false
        } finally {
          setSaveBusy(false)
        }
      }
    }),
    [t]
  )

  const phonesDisplay = useMemo(() => parsePhonesJson(selected.phonesJson), [selected.phonesJson])

  async function saveEdit(): Promise<void> {
    const patch = buildPatchFromForm(form)
    setSaveBusy(true)
    try {
      await window.mailClient.people.updateContact({ id: selected.id, patch })
      setEditing(false)
      await onUpdated()
    } finally {
      setSaveBusy(false)
    }
  }

  async function confirmDelete(): Promise<void> {
    const name = peopleListPrimaryLabel(selected, listSortBy)
    const ok = await showAppConfirm(t('people.shell.deleteContactConfirm', { name }), {
      title: t('people.shell.deleteContactTitle'),
      variant: 'danger',
      confirmLabel: t('people.shell.deleteContact')
    })
    if (!ok) return
    setDeleteBusy(true)
    try {
      await window.mailClient.people.deleteContact(selected.id)
      await onDeleted()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await showAppAlert(msg, { title: t('people.shell.deleteContactErrorTitle') })
    } finally {
      setDeleteBusy(false)
    }
  }

  async function handlePickContactPhoto(file: File): Promise<void> {
    const maxBytes = 4 * 1024 * 1024
    if (file.size > maxBytes) {
      await showAppAlert(t('people.shell.setContactPhotoTooLarge'), {
        title: t('people.shell.setContactPhotoErrorTitle')
      })
      return
    }
    setPhotoBusy(true)
    try {
      const buf = await file.arrayBuffer()
      const imageBase64 = arrayBufferToBase64(buf)
      await window.mailClient.people.setContactPhoto({ id: selected.id, imageBase64 })
      await onUpdated()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await showAppAlert(msg, { title: t('people.shell.setContactPhotoErrorTitle') })
    } finally {
      setPhotoBusy(false)
    }
  }

  const canCloudPhoto = selected.provider === 'microsoft' || selected.provider === 'google'

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-card">
      {canCloudPhoto ? (
        <input
          ref={photoFileRef}
          type="file"
          accept="image/jpeg,image/png,.jpg,.jpeg,.png"
          className="sr-only"
          aria-label={t('people.shell.changeContactPhotoTitle')}
          onChange={(e): void => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) void handlePickContactPhoto(f)
          }}
        />
      ) : null}

      <header className="shrink-0 border-b border-border bg-gradient-to-b from-secondary/25 to-card">
        <div
          className="flex flex-col gap-4 border-l-[3px] border-solid px-4 py-4 sm:px-5 sm:py-5 md:flex-row md:items-start md:gap-6"
          style={{ borderLeftColor: resolvedAccountColorCss(account?.color) }}
        >
          <div className="flex shrink-0 flex-col items-center gap-2 md:items-start">
            <Avatar
              name={peopleListPrimaryLabel(selected, listSortBy)}
              email={selected.primaryEmail}
              imageSrc={photoUrl}
              useGravatar={!hasLocalPhoto}
              accountColor={account?.color ?? null}
              size="xl"
              className={cn(
                '!h-[6.5rem] !w-[6.5rem] ring-[3px] ring-offset-2 ring-offset-card sm:!h-28 sm:!w-28',
                ringCls
              )}
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0 flex-1 text-center sm:text-left">
                <h2 className="text-balance text-xl font-semibold leading-tight tracking-tight text-foreground sm:text-2xl">
                  {peopleListPrimaryLabel(selected, listSortBy)}
                </h2>
                {selected.primaryEmail ? (
                  <p className="mt-1.5 truncate text-sm text-muted-foreground">{selected.primaryEmail}</p>
                ) : null}
                <p className="mt-1 text-xs text-muted-foreground/90">
                  {selected.provider === 'microsoft' ? 'Microsoft 365' : 'Google'}
                </p>
              </div>

              <div className="flex shrink-0 flex-wrap items-center justify-center gap-0.5 sm:justify-end">
            {editing ? (
              <>
                <PeopleDetailIconButton
                  icon={Check}
                  title={t('people.shell.save')}
                  disabled={saveBusy}
                  spin={saveBusy}
                  onClick={(): void => void saveEdit()}
                />
                <PeopleDetailIconButton
                  icon={X}
                  title={t('people.shell.cancel')}
                  disabled={saveBusy}
                  onClick={(): void => {
                    setEditing(false)
                    resetForm()
                  }}
                />
              </>
            ) : (
              <>
                <PeopleDetailIconButton
                  icon={Mail}
                  title={t('people.shell.emailAction')}
                  disabled={!selected.primaryEmail?.trim()}
                  onClick={(): void => {
                    const to = selected.primaryEmail?.trim()
                    if (!to) return
                    openNewTo(selected.accountId, to)
                  }}
                />
                <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden />
                <div className="flex items-center gap-0.5">
                  <PeopleDetailIconButton
                    icon={Pencil}
                    title={t('people.shell.edit')}
                    onClick={(): void => {
                      resetForm()
                      setEditing(true)
                    }}
                  />
                  {canCloudPhoto ? (
                    <PeopleDetailIconButton
                      icon={ImageUp}
                      title={t('people.shell.changeContactPhotoTitle')}
                      disabled={photoBusy}
                      spin={photoBusy}
                      onClick={(): void => photoFileRef.current?.click()}
                    />
                  ) : null}
                </div>
                <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden />
                <PeopleDetailIconButton
                  icon={Star}
                  title={selected.isFavorite ? t('people.shell.unfavorite') : t('people.shell.favorite')}
                  favoriteActive={selected.isFavorite}
                  onClick={(): void =>
                    void window.mailClient.people
                      .setFavorite({
                        accountId: selected.accountId,
                        provider: selected.provider,
                        remoteId: selected.remoteId,
                        isFavorite: !selected.isFavorite
                      })
                      .then(() => onUpdated())
                  }
                />
                <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden />
                <PeopleDetailIconButton
                  icon={Trash2}
                  title={deleteBusy ? t('people.shell.deletingContact') : t('people.shell.deleteContact')}
                  destructive
                  disabled={deleteBusy}
                  spin={deleteBusy}
                  onClick={(): void => void confirmDelete()}
                />
              </>
            )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
        {editing ? (
          <div className="space-y-3 rounded-lg border border-border bg-background/60 p-3 text-sm">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs text-muted-foreground">{t('people.shell.fieldDisplayName')}</span>
                <input
                  className="mt-0.5 w-full rounded border border-border bg-card px-2 py-1.5"
                  value={form.displayName}
                  onChange={(e): void => setForm((f) => ({ ...f, displayName: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="text-xs text-muted-foreground">{t('people.shell.fieldPrimaryEmail')}</span>
                <input
                  className="mt-0.5 w-full rounded border border-border bg-card px-2 py-1.5"
                  value={form.primaryEmail}
                  onChange={(e): void => setForm((f) => ({ ...f, primaryEmail: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="text-xs text-muted-foreground">{t('people.shell.fieldGivenName')}</span>
                <input
                  className="mt-0.5 w-full rounded border border-border bg-card px-2 py-1.5"
                  value={form.givenName}
                  onChange={(e): void => setForm((f) => ({ ...f, givenName: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="text-xs text-muted-foreground">{t('people.shell.fieldSurname')}</span>
                <input
                  className="mt-0.5 w-full rounded border border-border bg-card px-2 py-1.5"
                  value={form.surname}
                  onChange={(e): void => setForm((f) => ({ ...f, surname: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="text-xs text-muted-foreground">{t('people.shell.company')}</span>
                <input
                  className="mt-0.5 w-full rounded border border-border bg-card px-2 py-1.5"
                  value={form.company}
                  onChange={(e): void => setForm((f) => ({ ...f, company: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="text-xs text-muted-foreground">{t('people.shell.jobTitle')}</span>
                <input
                  className="mt-0.5 w-full rounded border border-border bg-card px-2 py-1.5"
                  value={form.jobTitle}
                  onChange={(e): void => setForm((f) => ({ ...f, jobTitle: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="text-xs text-muted-foreground">{t('people.shell.fieldDepartment')}</span>
                <input
                  className="mt-0.5 w-full rounded border border-border bg-card px-2 py-1.5"
                  value={form.department}
                  onChange={(e): void => setForm((f) => ({ ...f, department: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="text-xs text-muted-foreground">{t('people.shell.fieldOffice')}</span>
                <input
                  className="mt-0.5 w-full rounded border border-border bg-card px-2 py-1.5"
                  value={form.officeLocation}
                  onChange={(e): void => setForm((f) => ({ ...f, officeLocation: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="text-xs text-muted-foreground">{t('people.shell.fieldBirthday')}</span>
                <input
                  type="date"
                  className="mt-0.5 w-full rounded border border-border bg-card px-2 py-1.5"
                  value={form.birthdayIso.length >= 10 ? form.birthdayIso.slice(0, 10) : form.birthdayIso}
                  onChange={(e): void => setForm((f) => ({ ...f, birthdayIso: e.target.value }))}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs text-muted-foreground">{t('people.shell.fieldWeb')}</span>
                <input
                  className="mt-0.5 w-full rounded border border-border bg-card px-2 py-1.5"
                  value={form.webPage}
                  onChange={(e): void => setForm((f) => ({ ...f, webPage: e.target.value }))}
                />
              </label>
            </div>
            <label className="block">
              <span className="text-xs text-muted-foreground">{t('people.shell.notes')}</span>
              <textarea
                className="mt-0.5 min-h-[72px] w-full rounded border border-border bg-card px-2 py-1.5"
                value={form.notes}
                onChange={(e): void => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </label>
          </div>
        ) : (
          <>
            {!selected.primaryEmail?.trim() ? (
              <p className="text-xs text-muted-foreground">{t('people.shell.noEmail')}</p>
            ) : null}

            <div className="mt-2 grid gap-x-8 gap-y-5 text-sm sm:grid-cols-2">
              {selected.company?.trim() ? (
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <Building2 className="h-3.5 w-3.5 shrink-0" />
                    {t('people.shell.company')}
                  </div>
                  <p className="break-words text-foreground">{selected.company}</p>
                </div>
              ) : null}
              {selected.jobTitle?.trim() ? (
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <Briefcase className="h-3.5 w-3.5 shrink-0" />
                    {t('people.shell.jobTitle')}
                  </div>
                  <p className="break-words text-foreground">{selected.jobTitle}</p>
                </div>
              ) : null}
              {selected.department?.trim() ? (
                <div className="min-w-0">
                  <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t('people.shell.fieldDepartment')}
                  </div>
                  <p className="break-words text-foreground">{selected.department}</p>
                </div>
              ) : null}
              {selected.officeLocation?.trim() ? (
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    {t('people.shell.fieldOffice')}
                  </div>
                  <p className="break-words text-foreground">{selected.officeLocation}</p>
                </div>
              ) : null}
              {selected.birthdayIso?.trim() ? (
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <Cake className="h-3.5 w-3.5 shrink-0" />
                    {t('people.shell.fieldBirthday')}
                  </div>
                  <p className="text-foreground">{selected.birthdayIso}</p>
                </div>
              ) : null}
              {selected.webPage?.trim() ? (
                <div className="min-w-0 sm:col-span-2">
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <Globe className="h-3.5 w-3.5 shrink-0" />
                    {t('people.shell.fieldWeb')}
                  </div>
                  <p className="break-all text-foreground">{selected.webPage}</p>
                </div>
              ) : null}
              {phonesDisplay.length > 0 ? (
                <div className="min-w-0 sm:col-span-2">
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <Phone className="h-3.5 w-3.5 shrink-0" />
                    {t('people.shell.phone')}
                  </div>
                  <ul className="space-y-1 text-foreground">
                    {phonesDisplay.map((p) => (
                      <li key={`${p.type}:${p.value}`}>
                        <span className="text-muted-foreground">{p.type}: </span>
                        {p.value}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {selected.notes?.trim() ? (
                <div className="min-w-0 sm:col-span-2">
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <StickyNote className="h-3.5 w-3.5 shrink-0" />
                    {t('people.shell.notes')}
                  </div>
                  <p className="whitespace-pre-wrap rounded-md border border-border/60 bg-muted/15 p-3 text-foreground">
                    {selected.notes}
                  </p>
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  )
})

PeopleContactDetailPanel.displayName = 'PeopleContactDetailPanel'
