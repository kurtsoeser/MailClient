import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Loader2, Plus, RefreshCw, Search, Star } from 'lucide-react'

import { useTranslation } from 'react-i18next'

import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'

import type { PeopleContactView, PeopleListFilter, PeopleListSort, PeopleNavCounts } from '@shared/types'

import { useAccountsStore } from '@/stores/accounts'

import { cn } from '@/lib/utils'

import { resolvedAccountColorCss } from '@/lib/avatar-color'

import { VerticalSplitter, useResizableWidth } from '@/components/ResizableSplitter'

import { PeopleContactDetailPanel, type PeopleContactDetailPanelHandle } from '@/app/people/PeopleContactDetailPanel'
import { PeopleContactListAvatar } from '@/app/people/PeopleContactListAvatar'
import { PeopleNewContactDialog } from '@/app/people/PeopleNewContactDialog'
import { peopleListPrimaryLabel } from '@/app/people/people-display-label'
import { groupPeopleListRows } from '@/app/people/people-list-groups'
import { useContactPhotoDataUrl } from '@/app/people/useContactPhotoDataUrl'
import { PeopleShellSortableAccountNavRow } from '@/app/people/PeopleShellAccountNavRow'
import {
  moduleColumnHeaderOutlineSmClass,
  moduleColumnHeaderShellBarClass,
  moduleColumnHeaderTitleClass
} from '@/components/ModuleColumnHeader'



type NavKey =

  | { kind: 'all' }

  | { kind: 'favorites' }

  | { kind: 'provider'; provider: 'microsoft' | 'google' }

  | { kind: 'account'; accountId: string }



const PEOPLE_SORT_STORAGE_KEY = 'mailclient.people.sortBy'

function readStoredPeopleSort(): PeopleListSort {

  try {

    const v = window.localStorage.getItem(PEOPLE_SORT_STORAGE_KEY)

    if (v === 'givenName' || v === 'surname' || v === 'displayName') return v

  } catch {

    /* ignore */

  }

  return 'displayName'

}



export function PeopleShell(): JSX.Element {

  const { t } = useTranslation()

  const accounts = useAccountsStore((s) => s.accounts)

  const profilePhotoDataUrls = useAccountsStore((s) => s.profilePhotoDataUrls)



  const mailAccounts = useMemo(

    () => accounts.filter((a) => a.provider === 'microsoft' || a.provider === 'google'),

    [accounts]

  )



  const [nav, setNav] = useState<NavKey>({ kind: 'all' })

  const [query, setQuery] = useState('')

  const [sortBy, setSortBy] = useState<PeopleListSort>(() => readStoredPeopleSort())

  const [counts, setCounts] = useState<PeopleNavCounts | null>(null)

  const [rows, setRows] = useState<PeopleContactView[]>([])

  const [selected, setSelected] = useState<PeopleContactView | null>(null)

  const detailPanelRef = useRef<PeopleContactDetailPanelHandle | null>(null)

  const [listLoading, setListLoading] = useState(false)

  const [syncBusy, setSyncBusy] = useState(false)

  const [peopleAccountSyncId, setPeopleAccountSyncId] = useState<string | null>(null)

  const [peopleAccountSyncError, setPeopleAccountSyncError] = useState<Record<string, string>>({})

  const [createOpen, setCreateOpen] = useState(false)

  const [error, setError] = useState<string | null>(null)

  const selectedPhotoUrl = useContactPhotoDataUrl(
    selected?.id ?? null,
    selected?.photoLocalPath ?? null,
    selected != null,
    selected?.updatedLocal ?? null
  )



  const [listColumnWidth, setListColumnWidth] = useResizableWidth({

    storageKey: 'mailclient.peopleShell.listWidth',

    defaultWidth: 260,

    minWidth: 200,

    maxWidth: 440

  })



  const loadCounts = useCallback(async (): Promise<void> => {

    try {

      const c = await window.mailClient.people.getNavCounts()

      setCounts(c)

    } catch {

      setCounts(null)

    }

  }, [])



  const listFilter: PeopleListFilter = useMemo(() => {

    if (nav.kind === 'favorites') return 'favorites'

    if (nav.kind === 'provider') return nav.provider === 'microsoft' ? 'microsoft' : 'google'

    return 'all'

  }, [nav])



  const accountFilter = nav.kind === 'account' ? nav.accountId : null

  const preferredAccountIdForCreate = nav.kind === 'account' ? nav.accountId : null



  const setSortByPersist = useCallback((next: PeopleListSort): void => {

    setSortBy(next)

    try {

      window.localStorage.setItem(PEOPLE_SORT_STORAGE_KEY, next)

    } catch {

      /* ignore */

    }

  }, [])



  const loadList = useCallback(async (opts?: { preferSelect?: PeopleContactView; skipFlush?: boolean }): Promise<void> => {

    setListLoading(true)

    setError(null)

    try {

      if (!opts?.skipFlush) {

        const ok = (await detailPanelRef.current?.flushEditBeforeLeave?.()) ?? true

        if (!ok) return

      }

      const list = await window.mailClient.people.list({

        filter: listFilter,

        accountId: accountFilter,

        query: query.trim() || undefined,

        limit: 8000,

        sortBy

      })

      setRows(list)

      setSelected((cur) => {

        if (opts?.preferSelect) {

          const prefer = opts.preferSelect

          const hitPrefer = list.find(

            (x) =>

              x.accountId === prefer.accountId &&

              x.provider === prefer.provider &&

              x.remoteId === prefer.remoteId

          )

          if (hitPrefer) return hitPrefer

        }

        if (!cur) return list[0] ?? null

        const hit = list.find(

          (x) => x.accountId === cur.accountId && x.provider === cur.provider && x.remoteId === cur.remoteId

        )

        return hit ?? list[0] ?? null

      })

    } catch (e) {

      setError(e instanceof Error ? e.message : String(e))

      setRows([])

    } finally {

      setListLoading(false)

    }

  }, [listFilter, accountFilter, query, sortBy])



  const commitDetailThen = useCallback(async (run: () => void): Promise<void> => {

    const ok = (await detailPanelRef.current?.flushEditBeforeLeave?.()) ?? true

    if (!ok) return

    run()

  }, [])



  useEffect(() => {

    void loadCounts()

  }, [loadCounts])



  useEffect(() => {

    void loadList()

  }, [loadList])



  async function runSyncAll(): Promise<void> {

    setSyncBusy(true)

    setError(null)

    try {

      await window.mailClient.people.syncAll()

      await loadCounts()

      await loadList()

    } catch (e) {

      setError(e instanceof Error ? e.message : String(e))

    } finally {

      setSyncBusy(false)

    }

  }



  async function runSyncAccount(accountId: string): Promise<void> {

    if (syncBusy || peopleAccountSyncId) return

    setPeopleAccountSyncId(accountId)

    setPeopleAccountSyncError((prev) => {

      const next = { ...prev }

      delete next[accountId]

      return next

    })

    setError(null)

    try {

      const r = await window.mailClient.people.syncAccount(accountId)

      if (r.error) {

        setPeopleAccountSyncError((prev) => ({

          ...prev,

          [accountId]: r.error ?? 'Sync fehlgeschlagen'

        }))

      }

      await loadCounts()

      await loadList({ skipFlush: true })

    } catch (e) {

      const msg = e instanceof Error ? e.message : String(e)

      setPeopleAccountSyncError((prev) => ({ ...prev, [accountId]: msg }))

      setError(msg)

    } finally {

      setPeopleAccountSyncId(null)

    }

  }



  const accountDragSensors = useSensors(

    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })

  )



  function onPeopleAccountDragEnd(event: DragEndEvent): void {

    const { active, over } = event

    if (!over || active.id === over.id) return

    const mailIds = mailAccounts.map((a) => a.id)

    const oldIndex = mailIds.indexOf(String(active.id))

    const newIndex = mailIds.indexOf(String(over.id))

    if (oldIndex < 0 || newIndex < 0) return

    const reorderedMail = arrayMove(mailIds, oldIndex, newIndex)

    const mailSet = new Set(mailIds)

    const allIds = accounts.map((a) => a.id)

    let r = 0

    const nextIds: string[] = []

    for (const id of allIds) {

      if (mailSet.has(id)) {

        nextIds.push(reorderedMail[r++])

      } else {

        nextIds.push(id)

      }

    }

    void window.mailClient.auth.reorderAccounts(nextIds).catch((e) => {

      setError(e instanceof Error ? e.message : String(e))

    })

  }



  const accountCountById = useMemo(() => {

    const m = new Map<string, number>()

    if (counts?.byAccount) {

      for (const row of counts.byAccount) {

        m.set(row.accountId, row.total)

      }

    }

    return m

  }, [counts])



  const accountById = useMemo(() => new Map(mailAccounts.map((a) => [a.id, a] as const)), [mailAccounts])



  const listGroups = useMemo(() => groupPeopleListRows(rows, sortBy), [rows, sortBy])



  const groupHeaderLabel = useCallback(

    (letter: string): string =>

      letter === '#'

        ? t('people.shell.groupOther')

        : letter === '0-9'

          ? t('people.shell.groupDigits')

          : letter,

    [t]

  )



  const renderContactRow = useCallback(

    (c: PeopleContactView): JSX.Element => {

      const acc = accountById.get(c.accountId)

      const active =

        selected?.accountId === c.accountId &&

        selected?.remoteId === c.remoteId &&

        selected?.provider === c.provider

      return (

        <li key={`${c.accountId}:${c.provider}:${c.remoteId}`}>

          <button

            type="button"

            onClick={(): void => {

              void commitDetailThen(() => setSelected(c))

            }}

            className={cn(

              'flex w-full items-center gap-3 border-l-2 border-solid py-2.5 pl-2.5 pr-3 text-left transition-colors',

              active ? 'bg-secondary' : 'hover:bg-secondary/60'

            )}

            style={{ borderLeftColor: resolvedAccountColorCss(acc?.color) }}

          >

            <PeopleContactListAvatar

              contact={c}

              displayName={peopleListPrimaryLabel(c, sortBy)}

              accountColor={acc?.color ?? null}

            />

            <span className="min-w-0 flex-1">

              <span className="block truncate text-sm font-medium text-foreground">

                {peopleListPrimaryLabel(c, sortBy)}

              </span>

              {c.primaryEmail ? (

                <span className="block truncate text-xs text-muted-foreground">{c.primaryEmail}</span>

              ) : null}

            </span>

            {c.isFavorite ? (

              <Star className="h-4 w-4 shrink-0 fill-amber-400 text-amber-400" aria-hidden />

            ) : null}

          </button>

        </li>

      )

    },

    [accountById, selected, sortBy, commitDetailThen]

  )





  function navButton(

    key: NavKey,

    label: string,

    count: number | undefined,

    active: boolean

  ): JSX.Element {

    return (

      <button

        key={JSON.stringify(key)}

        type="button"

        onClick={(): void => {

          void commitDetailThen(() => {

            setNav(key)

            setSelected(null)

          })

        }}

        className={cn(

          'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors',

          active ? 'bg-primary/15 text-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'

        )}

      >

        <span className="truncate">{label}</span>

        {count !== undefined ? (

          <span className="ml-2 shrink-0 text-xs tabular-nums text-muted-foreground">

            {t('people.shell.countSuffix', { count })}

          </span>

        ) : null}

      </button>

    )

  }



  if (mailAccounts.length === 0) {

    return (

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 bg-background p-6 text-center text-muted-foreground">

        <p className="text-sm font-medium text-foreground">{t('people.shell.title')}</p>

        <p className="max-w-md text-sm">{t('people.shell.noAccounts')}</p>

      </div>

    )

  }



  const detailBody =

    selected != null ? (

      <PeopleContactDetailPanel

        ref={detailPanelRef}

        selected={selected}

        account={accountById.get(selected.accountId)}

        photoUrl={selectedPhotoUrl}

        listSortBy={sortBy}

        onUpdated={async (): Promise<void> => {

          await loadList({ skipFlush: true })

        }}

        onDeleted={async (): Promise<void> => {

          await loadCounts()

          await loadList({ skipFlush: true })

        }}

      />

    ) : (

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">

        <p className="font-medium text-foreground">{t('people.shell.selectContact')}</p>

        <p className="text-xs">{t('people.shell.selectHint')}</p>

      </div>

    )



  return (

    <div className="flex min-h-0 flex-1 flex-col bg-background">

      <header className={cn(moduleColumnHeaderShellBarClass, 'flex-wrap sm:flex-nowrap')}>

        <h1 className={cn(moduleColumnHeaderTitleClass, 'min-w-0')}>{t('people.shell.title')}</h1>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">

          <button

            type="button"

            disabled={syncBusy || peopleAccountSyncId != null || mailAccounts.length === 0}

            onClick={(): void => setCreateOpen(true)}

            className={cn(moduleColumnHeaderOutlineSmClass, 'disabled:opacity-50')}

          >

            <Plus className="h-3.5 w-3.5 shrink-0" />

            {t('people.shell.newContact')}

          </button>

          <button

            type="button"

            disabled={syncBusy || peopleAccountSyncId != null}

            onClick={(): void => void runSyncAll()}

            className={cn(moduleColumnHeaderOutlineSmClass, 'bg-secondary hover:bg-secondary/80')}

          >

            {syncBusy ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 shrink-0" />}

            {syncBusy ? t('people.shell.syncing') : t('people.shell.syncAll')}

          </button>

        </div>

      </header>



      {error ? (

        <div className="shrink-0 border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">

          {t('people.shell.syncError', { message: error })}

        </div>

      ) : null}



      <div className="flex min-h-0 flex-1 flex-row overflow-hidden">

        <aside className="flex w-60 min-w-[15rem] shrink-0 flex-col gap-3 border-r border-border bg-card p-3">

          <div className="space-y-1">

            <p className="px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">

              {t('people.shell.navOverview')}

            </p>

            {navButton({ kind: 'all' }, t('people.shell.navAll'), counts?.all, nav.kind === 'all')}

            {navButton(

              { kind: 'favorites' },

              t('people.shell.navFavorites'),

              counts?.favorites,

              nav.kind === 'favorites'

            )}

          </div>

          <div className="space-y-1">

            <p className="px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">

              {t('people.shell.navMicrosoft')}

            </p>

            {navButton(

              { kind: 'provider', provider: 'microsoft' },

              t('people.shell.navMicrosoft'),

              counts?.microsoftTotal,

              nav.kind === 'provider' && nav.provider === 'microsoft'

            )}

          </div>

          <div className="space-y-1">

            <p className="px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">

              {t('people.shell.navGoogle')}

            </p>

            {navButton(

              { kind: 'provider', provider: 'google' },

              t('people.shell.navGoogle'),

              counts?.googleTotal,

              nav.kind === 'provider' && nav.provider === 'google'

            )}

          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">

            <p className="px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">

              {t('people.shell.navAccounts')}

            </p>

            <DndContext

              sensors={accountDragSensors}

              collisionDetection={closestCenter}

              onDragEnd={onPeopleAccountDragEnd}

            >

              <SortableContext

                items={mailAccounts.map((a) => a.id)}

                strategy={verticalListSortingStrategy}

              >

                {mailAccounts.map((acc) => {

                  const total = accountCountById.get(acc.id) ?? 0

                  const active = nav.kind === 'account' && nav.accountId === acc.id

                  const rowSyncing = peopleAccountSyncId === acc.id

                  const syncSpin = rowSyncing || syncBusy

                  const syncDisabled = syncBusy || (peopleAccountSyncId != null && peopleAccountSyncId !== acc.id)

                  return (

                    <PeopleShellSortableAccountNavRow

                      key={acc.id}

                      account={acc}

                      profilePhotoDataUrl={profilePhotoDataUrls[acc.id]}

                      contactCount={total}

                      active={active}

                      showDragHandle={mailAccounts.length > 1}

                      syncSpin={syncSpin}

                      syncDisabled={syncDisabled}

                      syncError={Boolean(peopleAccountSyncError[acc.id])}

                      syncErrorMessage={peopleAccountSyncError[acc.id] ?? null}

                      onSelect={(): void => {

                        void commitDetailThen(() => {

                          setNav({ kind: 'account', accountId: acc.id })

                          setSelected(null)

                        })

                      }}

                      onSync={(): void => void runSyncAccount(acc.id)}

                    />

                  )

                })}

              </SortableContext>

            </DndContext>

          </div>

        </aside>



        <div className="flex min-h-0 min-w-0 flex-1 flex-row">

          <div

            style={{ width: listColumnWidth }}

            className="flex shrink-0 flex-col border-r border-border bg-background"

          >

            <div className="shrink-0 space-y-2 border-b border-border p-2">

              <div className="relative">

                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

                <input

                  type="search"

                  value={query}

                  onChange={(e): void => setQuery(e.target.value)}

                  placeholder={t('people.shell.searchPlaceholder')}

                  className="w-full rounded-md border border-border bg-card py-2 pl-9 pr-3 text-sm outline-none ring-primary focus:ring-1"

                />

              </div>

              <label className="block text-xs text-muted-foreground">

                <span className="mb-1 block">{t('people.shell.sortBy')}</span>

                <select

                  value={sortBy}

                  onChange={(e): void => {

                    const v = e.target.value

                    if (v === 'displayName' || v === 'givenName' || v === 'surname') setSortByPersist(v)

                  }}

                  className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm text-foreground outline-none ring-primary focus:ring-1"

                >

                  <option value="displayName">{t('people.shell.sortDisplayName')}</option>

                  <option value="givenName">{t('people.shell.sortGivenName')}</option>

                  <option value="surname">{t('people.shell.sortSurname')}</option>

                </select>

              </label>

            </div>

            <div key={`people-contact-list-${sortBy}`} className="min-h-0 flex-1 overflow-y-auto">

              {listLoading ? (

                <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">

                  <Loader2 className="h-5 w-5 animate-spin" />

                  {t('common.loading')}

                </div>

              ) : rows.length === 0 ? (

                <div className="p-6 text-center text-sm text-muted-foreground">

                  <p>{t('people.shell.emptyList')}</p>

                  <p className="mt-1 text-xs">{t('people.shell.emptyHint')}</p>

                </div>

              ) : (

                <div className="min-w-0 divide-y divide-border">

                  {listGroups.map((g, idx) => {

                      const header = groupHeaderLabel(g.letter)

                      return (

                        <div
                          key={`${sortBy}-${g.letter}-${idx}`}
                          className="min-w-0"
                          role="group"
                          aria-label={t('people.shell.groupSectionAria', { letter: header })}
                        >

                          <div

                            className={cn(

                              'sticky top-0 z-[1] border-b border-border bg-background/95 px-3 py-1.5',

                              'text-xs font-semibold uppercase tracking-wide text-muted-foreground',

                              'backdrop-blur supports-[backdrop-filter]:bg-background/75'

                            )}

                          >

                            {header}

                          </div>

                          <ul className="divide-y divide-border">{g.items.map((c) => renderContactRow(c))}</ul>

                        </div>

                      )

                    })}

                  </div>

              )}

            </div>

          </div>

          <VerticalSplitter

            onDrag={(delta): void => setListColumnWidth((w) => w + delta)}

            ariaLabel={t('people.shell.splitterListAria')}

          />

          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-card">

            {detailBody}

          </div>

        </div>

      </div>

      <PeopleNewContactDialog

        open={createOpen}

        onClose={(): void => setCreateOpen(false)}

        accounts={mailAccounts}

        preferredAccountId={preferredAccountIdForCreate}

        onCreated={async (c): Promise<void> => {

          await loadCounts()

          await loadList({ preferSelect: c })

        }}

      />

    </div>

  )

}

