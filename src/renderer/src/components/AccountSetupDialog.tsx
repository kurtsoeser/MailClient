import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useAccountsStore } from '@/stores/accounts'
import { useAppModeStore } from '@/stores/app-mode'
import { useLocaleStore } from '@/stores/locale'
import type { AppLocale } from '@/i18n'
import { useMailStore } from '@/stores/mail'
import { showAppConfirm } from '@/stores/app-dialog'
import { cn } from '@/lib/utils'
import { FilterTabs } from '@/components/FilterTabs'
import { CALENDAR_TIMEZONE_UI_OPTIONS } from '@shared/microsoft-timezones'
import { OUTLOOK_COLOR_PRESET_OPTIONS, outlookCategoryDotClass } from '@/lib/outlook-category-colors'
import { geocodeOpenMeteoPlace } from '@/lib/open-meteo-weather'
import { buildFolderTree, type FolderNode } from '@/lib/folder-tree'
import {
  mailFolderSidebarVisibilityKey,
  readSidebarHiddenMailFolderKeysFromStorage,
  writeSidebarHiddenMailFolderKeysAndNotify,
  MAIL_SIDEBAR_FOLDER_VISIBILITY_CHANGED_EVENT
} from '@/lib/mail-sidebar-folder-visibility-storage'
import {
  CALENDAR_VISIBILITY_CHANGED_EVENT,
  calendarVisibilityKey,
  readHiddenCalendarKeysFromStorage,
  readSidebarHiddenCalendarKeysFromStorage,
  writeHiddenCalendarKeysToStorage,
  writeSidebarHiddenCalendarKeysToStorage
} from '@/lib/calendar-visibility-storage'
import { SIDEBAR_DEFAULT_CAL_ID } from '@/app/calendar/calendar-shell-storage'
import { AccountPropertiesMenu } from '@/components/AccountPropertiesMenu'
import { BulkUnflagServerDialog } from '@/components/BulkUnflagServerDialog'
import { AccountSetupPanelFallback } from '@/components/account-setup/AccountSetupPanelFallback'

const AccountSetupNotionPanel = lazy(
  () => import('@/components/account-setup/AccountSetupNotionPanel')
)
const AccountSetupRulesPanel = lazy(
  () => import('@/components/account-setup/AccountSetupRulesPanel')
)
import { accountColorToCssBackground } from '@/lib/avatar-color'
import {
  DASHBOARD_GRID_STEP_DEFAULT_PX,
  DASHBOARD_GRID_STEP_MAX_PX,
  DASHBOARD_GRID_STEP_MIN_PX,
  readDashboardAlignStepPx,
  writeDashboardAlignStepPx
} from '@/app/home/dashboard-layout'
import type {
  ConnectedAccount,
  MailMasterCategory,
  MailFolder,
  CalendarGraphCalendarRow,
  LocalDataUsageReport
} from '@shared/types'
import { formatBytes } from '@/lib/format-bytes'
import { AccountSetupLocalDataSection } from '@/components/AccountSetupLocalDataSection'
import {
  Cloud,
  Contact,
  X,
  Plus,
  Loader2,
  AlertCircle,
  Trash2,
  CalendarClock,
  Eraser,
  Image as ImageIcon,
  Inbox,
  Tag,
  ListChecks,
  ListTodo,
  RefreshCw,
  Download,
  Upload,
  PanelLeft,
  HardDrive
} from 'lucide-react'

type SettingsTab = 'general' | 'accounts' | 'mail' | 'calendar' | 'contacts'

const SETTINGS_SUB_DEFAULT: Record<SettingsTab, string> = {
  general: 'language',
  accounts: 'connected',
  mail: 'sync',
  calendar: 'timezone',
  contacts: 'workspace'
}

type CalSidebarAccountLoad = {
  calendars: CalendarGraphCalendarRow[]
  groupCalendars: CalendarGraphCalendarRow[]
  loading: boolean
  groupLoading: boolean
  error: string | null
  groupError: string | null
}

const M365_GROUP_CAL_SETTINGS_PAGE = 50

async function loadAllM365GroupCalendarsForSettings(
  accountId: string
): Promise<CalendarGraphCalendarRow[]> {
  const out: CalendarGraphCalendarRow[] = []
  let offset = 0
  for (;;) {
    const page = await window.mailClient.calendar.listMicrosoft365GroupCalendars({
      accountId,
      offset,
      limit: M365_GROUP_CAL_SETTINGS_PAGE
    })
    out.push(...page.calendars)
    if (!page.hasMore) break
    offset = page.offset + page.limit
  }
  return out
}

function renderCalendarSidebarCheckboxRow(
  accId: string,
  cal: CalendarGraphCalendarRow,
  calSidebarHiddenKeysForSettings: Set<string>,
  busy: boolean,
  reconnectingAccountId: string | null,
  onToggle: (accountId: string, calId: string, visible: boolean) => void
): JSX.Element {
  const isDefaultSlot = cal.id === SIDEBAR_DEFAULT_CAL_ID
  const vk = calendarVisibilityKey(accId, cal.id)
  const inSidebar = !calSidebarHiddenKeysForSettings.has(vk)
  return (
    <label
      key={`${accId}:${cal.id}`}
      className={cn(
        'flex cursor-pointer items-start gap-2 rounded border border-transparent px-1 py-0.5 hover:bg-background/60',
        isDefaultSlot && 'opacity-60'
      )}
    >
      <input
        type="checkbox"
        className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-primary"
        checked={inSidebar}
        disabled={isDefaultSlot || busy || reconnectingAccountId !== null}
        onChange={(e): void => {
          onToggle(accId, cal.id, e.target.checked)
        }}
      />
      <span className="min-w-0 flex-1 text-[11px] leading-snug text-foreground">{cal.name}</span>
    </label>
  )
}

function snapshotLocalStorage(): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i)
    if (k != null) out[k] = window.localStorage.getItem(k) ?? ''
  }
  return out
}

function replaceLocalStorageFromBackup(entries: Record<string, string>): void {
  window.localStorage.clear()
  for (const [k, v] of Object.entries(entries)) {
    window.localStorage.setItem(k, v)
  }
}

function flattenFolderNodesDepthFirst(nodes: FolderNode[]): FolderNode[] {
  const out: FolderNode[] = []
  const walk = (list: FolderNode[]): void => {
    for (const n of list) {
      out.push(n)
      walk(n.children)
    }
  }
  walk(nodes)
  return out
}

function sameStringSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const x of a) {
    if (!b.has(x)) return false
  }
  return true
}

interface Props {
  open: boolean
  onClose: () => void
  /** Beim Oeffnen direkt einen Tab anzeigen (z. B. von Hinweisdialog «Triage-Ordner»). */
  initialTab?: SettingsTab
  /** Unterpunkt im Mail-Tab (z. B. `rules`). */
  initialMailSubNav?: string
}

export function AccountSetupDialog({
  open,
  onClose,
  initialTab,
  initialMailSubNav
}: Props): JSX.Element | null {
  const {
    config,
    accounts,
    setMicrosoftClientId,
    setGoogleClientId,
    setSyncWindowDays,
    setAutoLoadImages,
    setCalendarTimeZone,
    setWeatherLocation,
    addMicrosoftAccount,
    addGoogleAccount,
    refreshMicrosoftAccount,
    refreshGoogleAccount,
    removeAccount,
    patchAccountColor,
    patchAccountCalendarLoadAhead,
    error
  } = useAccountsStore()
  const refreshAccounts = useMailStore((s) => s.refreshAccounts)
  const triggerSync = useMailStore((s) => s.triggerSync)
  const foldersByAccount = useMailStore((s) => s.foldersByAccount)
  const flaggedFilterExcludeDeletedJunk = useMailStore((s) => s.flaggedFilterExcludeDeletedJunk)
  const setFlaggedFilterExcludeDeletedJunk = useMailStore((s) => s.setFlaggedFilterExcludeDeletedJunk)
  const { t } = useTranslation()
  const setAppMode = useAppModeStore((s) => s.setMode)
  const locale = useLocaleStore((s) => s.locale)
  const setLocale = useLocaleStore((s) => s.setLocale)

  const settingsTabOptions = useMemo(
    () =>
      [
        { id: 'general' as const, label: t('settings.tabGeneral') },
        { id: 'accounts' as const, label: t('settings.tabAccounts') },
        { id: 'mail' as const, label: t('settings.tabMail') },
        { id: 'calendar' as const, label: t('settings.tabCalendar') },
        { id: 'contacts' as const, label: t('settings.tabContacts') }
      ] satisfies Array<{ id: SettingsTab; label: string }>,
    [t]
  )

  const syncWindowOptions = useMemo(
    () =>
      [
        { value: 7 as const, label: t('settings.syncWindow.d7') },
        { value: 30 as const, label: t('settings.syncWindow.d30') },
        { value: 90 as const, label: t('settings.syncWindow.d90') },
        { value: 180 as const, label: t('settings.syncWindow.d180') },
        { value: 365 as const, label: t('settings.syncWindow.d365') },
        { value: null, label: t('settings.syncWindow.all') }
      ] satisfies Array<{ value: number | null; label: string }>,
    [t]
  )

  const calendarLoadAheadUiOptions = useMemo(
    () =>
      [
        { value: 'def', label: t('settings.calendarAhead.def'), patch: 'default' as const },
        { value: '30', label: t('settings.calendarAhead.d30'), patch: 30 },
        { value: '90', label: t('settings.calendarAhead.d90'), patch: 90 },
        { value: '180', label: t('settings.calendarAhead.d180'), patch: 180 },
        { value: '365', label: t('settings.calendarAhead.d365'), patch: 365 },
        { value: '730', label: t('settings.calendarAhead.d730'), patch: 730 },
        { value: 'all', label: t('settings.calendarAhead.all'), patch: null }
      ] satisfies Array<{ value: string; label: string; patch: number | null | 'default' }>,
    [t]
  )

  const [clientIdInput, setClientIdInput] = useState('')
  const [googleClientIdInput, setGoogleClientIdInput] = useState('')
  const [googleClientSecretInput, setGoogleClientSecretInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')
  const [subNavId, setSubNavId] = useState<Record<SettingsTab, string>>(() => ({ ...SETTINGS_SUB_DEFAULT }))
  const [categoryAccountId, setCategoryAccountId] = useState<string>('')
  const [masterCats, setMasterCats] = useState<MailMasterCategory[]>([])
  const [catBusy, setCatBusy] = useState(false)
  const [catErr, setCatErr] = useState<string | null>(null)
  const [newCatName, setNewCatName] = useState('')
  const [newCatColor, setNewCatColor] = useState('preset4')
  /** Konto-ID, fuer das gerade Microsoft OAuth (Refresh) laeuft. */
  const [reconnectingAccountId, setReconnectingAccountId] = useState<string | null>(null)
  const [mailCacheClearingAccountId, setMailCacheClearingAccountId] = useState<string | null>(null)
  const [mailCacheNotice, setMailCacheNotice] = useState<string | null>(null)
  const [tasksCacheClearingAccountId, setTasksCacheClearingAccountId] = useState<string | null>(null)
  const [tasksCacheNotice, setTasksCacheNotice] = useState<string | null>(null)
  const [colorSavingAccountId, setColorSavingAccountId] = useState<string | null>(null)
  const [aheadSavingAccountId, setAheadSavingAccountId] = useState<string | null>(null)
  const [backupBusy, setBackupBusy] = useState(false)
  const [backupNotice, setBackupNotice] = useState<string | null>(null)
  const [localDataUsage, setLocalDataUsage] = useState<LocalDataUsageReport | null>(null)
  const [localDataScanning, setLocalDataScanning] = useState(false)
  const [localDataBusy, setLocalDataBusy] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('preset4')

  const [wfAccountId, setWfAccountId] = useState<string>('')
  const [wfBusy, setWfBusy] = useState(false)
  const [wfErr, setWfErr] = useState<string | null>(null)
  const [wfFolders, setWfFolders] = useState<MailFolder[]>([])
  const [wfWipPick, setWfWipPick] = useState<string>('')
  const [wfDonePick, setWfDonePick] = useState<string>('')
  const [calendarAheadAccountId, setCalendarAheadAccountId] = useState<string>('')
  const [mailSidebarVisAccountId, setMailSidebarVisAccountId] = useState<string>('')
  const [mailSidebarHiddenKeys, setMailSidebarHiddenKeys] = useState<Set<string>>(() =>
    readSidebarHiddenMailFolderKeysFromStorage()
  )
  const [calSidebarHiddenKeysForSettings, setCalSidebarHiddenKeysForSettings] = useState<Set<string>>(() =>
    readSidebarHiddenCalendarKeysFromStorage()
  )
  const [calSidebarPerAccount, setCalSidebarPerAccount] = useState<Record<string, CalSidebarAccountLoad>>({})
  const [dashGridStepDraft, setDashGridStepDraft] = useState(String(DASHBOARD_GRID_STEP_DEFAULT_PX))
  const [weatherSearchDraft, setWeatherSearchDraft] = useState('')
  const [weatherBusy, setWeatherBusy] = useState(false)
  const [weatherMsg, setWeatherMsg] = useState<string | null>(null)
  const [bulkUnflagOpen, setBulkUnflagOpen] = useState(false)

  const calendarLinkedAccounts = useMemo(
    () => accounts.filter((a) => a.provider === 'microsoft' || a.provider === 'google'),
    [accounts]
  )

  useEffect(() => {
    if (open) {
      setClientIdInput(config?.microsoftClientId ?? '')
      setGoogleClientIdInput(config?.googleClientId ?? '')
      setGoogleClientSecretInput('')
      setLocalError(null)
      setBackupNotice(null)
      setMailCacheNotice(null)
    }
  }, [open, config])

  useEffect(() => {
    if (!open) return
    setDashGridStepDraft(String(readDashboardAlignStepPx()))
  }, [open])

  useEffect(() => {
    if (!open) return
    setWeatherSearchDraft(config?.weatherLocationName ?? '')
    setWeatherMsg(null)
  }, [open, config?.weatherLocationName])

  useEffect(() => {
    if (!open) return
    setActiveTab(initialTab ?? 'general')
    if (initialTab === 'mail' && initialMailSubNav) {
      setSubNavId((prev) => ({ ...prev, mail: initialMailSubNav }))
    }
  }, [open, initialTab, initialMailSubNav])

  const microsoftAccounts = useMemo(
    () => accounts.filter((a) => a.provider === 'microsoft'),
    [accounts]
  )

  const triageMailAccounts = useMemo(
    () => accounts.filter((a) => a.provider === 'microsoft' || a.provider === 'google'),
    [accounts]
  )

  const settingsSubNavItems = useMemo((): Array<{ id: string; label: string }> => {
    switch (activeTab) {
      case 'general':
        return [
          { id: 'language', label: t('settings.languageSection') },
          { id: 'dashboard', label: t('settings.dashboardGridHeading') },
          { id: 'weather', label: t('settings.weatherHeading') },
          { id: 'oauth', label: t('settings.oauthSummary') },
          { id: 'notion', label: t('settings.notionHeading') },
          { id: 'backup', label: t('settings.backupHeading') }
        ]
      case 'accounts':
        return [{ id: 'connected', label: t('settings.connectedAccounts') }]
      case 'mail':
        return [
          { id: 'sync', label: t('settings.syncWindowHeading') },
          { id: 'display', label: t('settings.mailDisplayHeading') },
          { id: 'sidebarFolders', label: t('settings.mailSidebarFoldersHeading') },
          { id: 'triage', label: t('settings.triageHeading') },
          { id: 'categories', label: t('settings.categoriesHeading') },
          { id: 'rules', label: t('settings.mailRulesHeading') }
        ]
      case 'calendar':
        return [
          { id: 'timezone', label: t('settings.calendarTzHeading') },
          { id: 'api', label: t('settings.calendarApiHeading') },
          { id: 'sidebar', label: t('settings.calendarSidebarHeading') }
        ]
      case 'contacts':
        return [
          { id: 'workspace', label: t('settings.contactsWorkspaceHeading') },
          { id: 'google', label: t('settings.contactsGoogleHeading') },
          { id: 'microsoft', label: t('settings.contactsMicrosoftHeading') },
          { id: 'accountsLink', label: t('settings.contactsGoAccounts') }
        ]
      default:
        return []
    }
  }, [activeTab, t])

  useEffect(() => {
    const ids = settingsSubNavItems.map((x) => x.id)
    setSubNavId((prev) => {
      const cur = prev[activeTab]
      if (ids.includes(cur)) return prev
      return { ...prev, [activeTab]: ids[0] ?? cur }
    })
  }, [activeTab, settingsSubNavItems])

  const mailSidebarFolderRows = useMemo(() => {
    if (!mailSidebarVisAccountId) return [] as FolderNode[]
    const folders = foldersByAccount[mailSidebarVisAccountId] ?? []
    return flattenFolderNodesDepthFirst(buildFolderTree(folders))
  }, [foldersByAccount, mailSidebarVisAccountId])

  useEffect(() => {
    if (!open || activeTab !== 'mail') return
    setCategoryAccountId((prev) => {
      if (prev && accounts.some((a) => a.id === prev)) return prev
      return microsoftAccounts[0]?.id ?? ''
    })
  }, [open, activeTab, accounts, microsoftAccounts])

  async function refreshMasterCategories(): Promise<void> {
    if (!categoryAccountId) {
      setMasterCats([])
      return
    }
    setCatBusy(true)
    setCatErr(null)
    try {
      const list = await window.mailClient.mail.listMasterCategories(categoryAccountId)
      setMasterCats(list)
    } catch (e) {
      setCatErr(e instanceof Error ? e.message : String(e))
    } finally {
      setCatBusy(false)
    }
  }

  useEffect(() => {
    if (!open || activeTab !== 'mail' || !categoryAccountId) return
    void refreshMasterCategories()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- explizit bei Konto-Wechsel neu laden
  }, [open, activeTab, categoryAccountId])

  useEffect(() => {
    if (!open || activeTab !== 'mail') return
    setWfAccountId((prev) => {
      if (prev && triageMailAccounts.some((a) => a.id === prev)) return prev
      return triageMailAccounts[0]?.id ?? ''
    })
  }, [open, activeTab, triageMailAccounts])

  useEffect(() => {
    if (!open || activeTab !== 'calendar') return
    setCalendarAheadAccountId((prev) => {
      if (prev && calendarLinkedAccounts.some((a) => a.id === prev)) return prev
      return calendarLinkedAccounts[0]?.id ?? ''
    })
  }, [open, activeTab, calendarLinkedAccounts])

  useEffect(() => {
    if (!open || activeTab !== 'mail') return
    setMailSidebarVisAccountId((prev) => {
      if (prev && triageMailAccounts.some((a) => a.id === prev)) return prev
      return triageMailAccounts[0]?.id ?? ''
    })
  }, [open, activeTab, triageMailAccounts])

  useEffect(() => {
    if (!open) return
    setMailSidebarHiddenKeys(readSidebarHiddenMailFolderKeysFromStorage())
    setCalSidebarHiddenKeysForSettings(readSidebarHiddenCalendarKeysFromStorage())
  }, [open])

  useEffect(() => {
    const onMailVis = (): void => {
      setMailSidebarHiddenKeys((prev) => {
        const next = readSidebarHiddenMailFolderKeysFromStorage()
        return sameStringSet(prev, next) ? prev : next
      })
    }
    const onCalVis = (): void => {
      setCalSidebarHiddenKeysForSettings((prev) => {
        const next = readSidebarHiddenCalendarKeysFromStorage()
        return sameStringSet(prev, next) ? prev : next
      })
    }
    window.addEventListener(MAIL_SIDEBAR_FOLDER_VISIBILITY_CHANGED_EVENT, onMailVis)
    window.addEventListener(CALENDAR_VISIBILITY_CHANGED_EVENT, onCalVis)
    return (): void => {
      window.removeEventListener(MAIL_SIDEBAR_FOLDER_VISIBILITY_CHANGED_EVENT, onMailVis)
      window.removeEventListener(CALENDAR_VISIBILITY_CHANGED_EVENT, onCalVis)
    }
  }, [])

  useEffect(() => {
    if (!open || activeTab !== 'calendar' || subNavId.calendar !== 'sidebar') {
      setCalSidebarPerAccount({})
      return
    }
    const accounts = calendarLinkedAccounts
    if (accounts.length === 0) {
      setCalSidebarPerAccount({})
      return
    }
    let cancelled = false
    const nextInit: Record<string, CalSidebarAccountLoad> = {}
    for (const a of accounts) {
      nextInit[a.id] = {
        calendars: [],
        groupCalendars: [],
        loading: true,
        groupLoading: a.provider === 'microsoft',
        error: null,
        groupError: null
      }
    }
    setCalSidebarPerAccount(nextInit)
    for (const a of accounts) {
      void window.mailClient.calendar
        .listCalendars({ accountId: a.id })
        .then((rows) => {
          if (cancelled) return
          setCalSidebarPerAccount((prev) => ({
            ...prev,
            [a.id]: {
              ...(prev[a.id] ?? {
                calendars: [],
                groupCalendars: [],
                loading: true,
                groupLoading: false,
                error: null,
                groupError: null
              }),
              calendars: rows.filter((c) => c.calendarKind !== 'm365Group'),
              loading: false,
              error: null
            }
          }))
        })
        .catch((e: unknown) => {
          if (cancelled) return
          setCalSidebarPerAccount((prev) => ({
            ...prev,
            [a.id]: {
              calendars: prev[a.id]?.calendars ?? [],
              groupCalendars: prev[a.id]?.groupCalendars ?? [],
              loading: false,
              groupLoading: prev[a.id]?.groupLoading ?? false,
              error: e instanceof Error ? e.message : String(e),
              groupError: prev[a.id]?.groupError ?? null
            }
          }))
        })

      if (a.provider === 'microsoft') {
        void loadAllM365GroupCalendarsForSettings(a.id)
          .then((groupRows) => {
            if (cancelled) return
            setCalSidebarPerAccount((prev) => ({
              ...prev,
              [a.id]: {
                ...(prev[a.id] ?? {
                  calendars: [],
                  groupCalendars: [],
                  loading: false,
                  groupLoading: true,
                  error: null,
                  groupError: null
                }),
                groupCalendars: groupRows,
                groupLoading: false,
                groupError: null
              }
            }))
          })
          .catch((e: unknown) => {
            if (cancelled) return
            setCalSidebarPerAccount((prev) => ({
              ...prev,
              [a.id]: {
                calendars: prev[a.id]?.calendars ?? [],
                groupCalendars: prev[a.id]?.groupCalendars ?? [],
                loading: prev[a.id]?.loading ?? false,
                groupLoading: false,
                error: prev[a.id]?.error ?? null,
                groupError: e instanceof Error ? e.message : String(e)
              }
            }))
          })
      }
    }
    return (): void => {
      cancelled = true
    }
  }, [open, activeTab, subNavId.calendar, calendarLinkedAccounts])

  const loadWorkflowFolderUi = useCallback(async (): Promise<void> => {
    if (!wfAccountId) {
      setWfFolders([])
      setWfWipPick('')
      setWfDonePick('')
      return
    }
    setWfBusy(true)
    setWfErr(null)
    try {
      const [folders, ui] = await Promise.all([
        window.mailClient.mail.listFolders(wfAccountId),
        window.mailClient.mail.getWorkflowMailFolderState(wfAccountId)
      ])
      setWfFolders(folders)
      setWfWipPick(ui.wipFolderId != null ? String(ui.wipFolderId) : '')
      setWfDonePick(ui.doneFolderId != null ? String(ui.doneFolderId) : '')
    } catch (e) {
      setWfErr(e instanceof Error ? e.message : String(e))
    } finally {
      setWfBusy(false)
    }
  }, [wfAccountId])

  useEffect(() => {
    if (!open || activeTab !== 'mail' || !wfAccountId) return
    void loadWorkflowFolderUi()
  }, [open, activeTab, wfAccountId, loadWorkflowFolderUi])

  const refreshLocalDataUsage = useCallback(async (): Promise<void> => {
    setLocalDataScanning(true)
    try {
      const report = await window.mailClient.localData.scanUsage()
      setLocalDataUsage(report)
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e))
    } finally {
      setLocalDataScanning(false)
    }
  }, [])

  useEffect(() => {
    if (!open || activeTab !== 'general' || subNavId.general !== 'backup') return
    void refreshLocalDataUsage()
  }, [open, activeTab, subNavId.general, refreshLocalDataUsage])

  const calendarAheadTargetAccount = useMemo(
    () =>
      calendarLinkedAccounts.find((a) => a.id === calendarAheadAccountId) ??
      calendarLinkedAccounts[0] ??
      null,
    [calendarLinkedAccounts, calendarAheadAccountId]
  )

  if (!open || typeof document === 'undefined') return null

  const hasClientId = Boolean(config?.microsoftClientId)
  const hasGoogleClientId = Boolean(config?.googleClientId?.trim())
  const hasGoogleClientSecret = Boolean(config?.googleClientSecret?.trim())
  const googleOAuthReady = hasGoogleClientId
  const showError = localError ?? error

  async function handleSaveGoogleClientId(): Promise<void> {
    setBusy(true)
    setLocalError(null)
    try {
      const trimmedId = googleClientIdInput.trim()
      const trimmedSec = googleClientSecretInput.trim()
      let secretArg: string | null | undefined
      if (trimmedSec.length > 0) {
        secretArg = trimmedSec
      } else if (hasGoogleClientSecret) {
        secretArg = undefined
      } else {
        secretArg = null
      }
      await setGoogleClientId(trimmedId, secretArg)
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleAddGoogle(): Promise<void> {
    setBusy(true)
    setLocalError(null)
    try {
      await addGoogleAccount()
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleRefreshGoogle(id: string): Promise<void> {
    setReconnectingAccountId(id)
    setLocalError(null)
    try {
      await refreshGoogleAccount(id)
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e))
    } finally {
      setReconnectingAccountId(null)
    }
  }

  async function handleSaveClientId(): Promise<void> {
    setBusy(true)
    setLocalError(null)
    try {
      await setMicrosoftClientId(clientIdInput)
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleAddMicrosoft(): Promise<void> {
    setBusy(true)
    setLocalError(null)
    try {
      await addMicrosoftAccount()
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleToggleAutoImages(value: boolean): Promise<void> {
    setBusy(true)
    setLocalError(null)
    try {
      await setAutoLoadImages(value)
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleSyncWindowChange(value: string): Promise<void> {
    setBusy(true)
    setLocalError(null)
    try {
      const days = value === 'all' ? null : Number.parseInt(value, 10)
      await setSyncWindowDays(days)
      for (const acc of accounts) {
        void triggerSync(acc.id)
      }
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleCalendarTimeZoneChange(value: string): Promise<void> {
    setBusy(true)
    setLocalError(null)
    try {
      await setCalendarTimeZone(value === 'auto' ? null : value)
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleWeatherSearchAndSave(): Promise<void> {
    setWeatherBusy(true)
    setWeatherMsg(null)
    setLocalError(null)
    try {
      const lang = locale === 'de' ? 'de' : 'en'
      const hit = await geocodeOpenMeteoPlace(weatherSearchDraft, lang)
      if (!hit) {
        setWeatherMsg(t('settings.weatherGeocodeEmpty'))
        return
      }
      await setWeatherLocation({ latitude: hit.latitude, longitude: hit.longitude, name: hit.label })
      setWeatherSearchDraft(hit.label)
      setWeatherMsg(t('settings.weatherSaved'))
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e))
    } finally {
      setWeatherBusy(false)
    }
  }

  async function handleWeatherClear(): Promise<void> {
    setWeatherBusy(true)
    setWeatherMsg(null)
    setLocalError(null)
    try {
      await setWeatherLocation(null)
      setWeatherSearchDraft('')
      setWeatherMsg(t('settings.weatherCleared'))
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e))
    } finally {
      setWeatherBusy(false)
    }
  }

  async function handleAccountColorChange(accountId: string, color: string): Promise<void> {
    setLocalError(null)
    setColorSavingAccountId(accountId)
    try {
      await patchAccountColor(accountId, color)
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e))
    } finally {
      setColorSavingAccountId(null)
    }
  }

  function calendarAheadSelectValue(acc: ConnectedAccount): string {
    if (acc.calendarLoadAheadDays === null) return 'all'
    if (acc.calendarLoadAheadDays === undefined) return 'def'
    return String(acc.calendarLoadAheadDays)
  }

  async function handleCalendarAheadChange(accountId: string, encoded: string): Promise<void> {
    const opt = calendarLoadAheadUiOptions.find((o) => o.value === encoded)
    if (!opt) return
    setLocalError(null)
    setAheadSavingAccountId(accountId)
    try {
      await patchAccountCalendarLoadAhead(accountId, opt.patch)
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e))
    } finally {
      setAheadSavingAccountId(null)
    }
  }

  function handleMailFolderSidebarCheckbox(accountId: string, folder: MailFolder, visible: boolean): void {
    if (folder.wellKnown === 'inbox' && !visible) return
    const vk = mailFolderSidebarVisibilityKey(accountId, folder.remoteId)
    const next = new Set(readSidebarHiddenMailFolderKeysFromStorage())
    if (visible) next.delete(vk)
    else next.add(vk)
    writeSidebarHiddenMailFolderKeysAndNotify(next)
  }

  function handleCalendarSidebarRowToggle(accountId: string, calId: string, visibleInSidebar: boolean): void {
    if (calId === SIDEBAR_DEFAULT_CAL_ID) return
    const vk = calendarVisibilityKey(accountId, calId)
    const nextSidebar = new Set(readSidebarHiddenCalendarKeysFromStorage())
    const nextHidden = new Set(readHiddenCalendarKeysFromStorage())
    if (visibleInSidebar) {
      nextSidebar.delete(vk)
      nextHidden.delete(vk)
    } else {
      nextSidebar.add(vk)
      nextHidden.add(vk)
    }
    writeSidebarHiddenCalendarKeysToStorage(nextSidebar)
    writeHiddenCalendarKeysToStorage(nextHidden)
  }

  async function handleClearTasksCache(accountId: string, email: string): Promise<void> {
    const ok = await showAppConfirm(
      t('settings.clearTasksCacheConfirm', { email }),
      {
        title: t('settings.clearTasksCacheTitle'),
        variant: 'danger',
        confirmLabel: t('settings.clearMailCacheConfirmButton')
      }
    )
    if (!ok) return
    setTasksCacheClearingAccountId(accountId)
    setLocalError(null)
    setTasksCacheNotice(null)
    try {
      const result = await window.mailClient.tasks.clearLocalTasksCache(accountId)
      await refreshAccounts(accounts)
      setTasksCacheNotice(
        result.resynced ? t('settings.clearTasksCacheDoneOnline') : t('settings.clearTasksCacheDoneOffline')
      )
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e))
    } finally {
      setTasksCacheClearingAccountId(null)
    }
  }

  async function handleClearMailCache(accountId: string, email: string): Promise<void> {
    const ok = await showAppConfirm(
      t('settings.clearMailCacheConfirm', { email }),
      {
        title: t('settings.clearMailCacheTitle'),
        variant: 'danger',
        confirmLabel: t('settings.clearMailCacheConfirmButton')
      }
    )
    if (!ok) return
    setMailCacheClearingAccountId(accountId)
    setLocalError(null)
    setMailCacheNotice(null)
    try {
      const result = await window.mailClient.mail.clearLocalMailCache(accountId)
      await refreshAccounts(accounts)
      setMailCacheNotice(
        result.resynced ? t('settings.clearMailCacheDoneOnline') : t('settings.clearMailCacheDoneOffline')
      )
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e))
    } finally {
      setMailCacheClearingAccountId(null)
    }
  }

  async function handleRemove(id: string): Promise<void> {
    setBusy(true)
    setLocalError(null)
    try {
      await removeAccount(id)
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleRefreshMicrosoft(id: string): Promise<void> {
    setReconnectingAccountId(id)
    setLocalError(null)
    try {
      await refreshMicrosoftAccount(id)
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e))
    } finally {
      setReconnectingAccountId(null)
    }
  }

  async function handleCreateMasterCategory(): Promise<void> {
    if (!categoryAccountId || !newCatName.trim()) return
    setCatBusy(true)
    setCatErr(null)
    try {
      await window.mailClient.mail.createMasterCategory({
        accountId: categoryAccountId,
        displayName: newCatName.trim(),
        color: newCatColor
      })
      setNewCatName('')
      await refreshMasterCategories()
    } catch (e) {
      setCatErr(e instanceof Error ? e.message : String(e))
    } finally {
      setCatBusy(false)
    }
  }

  async function handleDeleteMasterCategory(categoryId: string): Promise<void> {
    if (!categoryAccountId) return
    const ok = await showAppConfirm(t('settings.catDeleteConfirm'), {
      title: t('settings.catDeleteTitle'),
      variant: 'danger',
      confirmLabel: t('common.remove')
    })
    if (!ok) return
    setCatBusy(true)
    setCatErr(null)
    try {
      await window.mailClient.mail.deleteMasterCategory({
        accountId: categoryAccountId,
        categoryId
      })
      if (editingId === categoryId) setEditingId(null)
      await refreshMasterCategories()
    } catch (e) {
      setCatErr(e instanceof Error ? e.message : String(e))
    } finally {
      setCatBusy(false)
    }
  }

  async function handleSaveMasterCategoryEdit(): Promise<void> {
    if (!categoryAccountId || !editingId || !editName.trim()) return
    setCatBusy(true)
    setCatErr(null)
    try {
      await window.mailClient.mail.updateMasterCategory({
        accountId: categoryAccountId,
        categoryId: editingId,
        displayName: editName.trim(),
        color: editColor
      })
      setEditingId(null)
      await refreshMasterCategories()
    } catch (e) {
      setCatErr(e instanceof Error ? e.message : String(e))
    } finally {
      setCatBusy(false)
    }
  }

  async function handleWfEnsureDefaults(): Promise<void> {
    if (!wfAccountId) return
    setWfBusy(true)
    setWfErr(null)
    try {
      await window.mailClient.mail.ensureWorkflowMailFolders(wfAccountId)
      await loadWorkflowFolderUi()
      void triggerSync(wfAccountId).catch((e) => console.warn('[AccountSetup] triggerSync:', e))
      void refreshAccounts(accounts).catch((e) => console.warn('[AccountSetup] refreshAccounts:', e))
    } catch (e) {
      setWfErr(e instanceof Error ? e.message : String(e))
    } finally {
      setWfBusy(false)
    }
  }

  async function handleWfSaveMapping(): Promise<void> {
    if (!wfAccountId) return
    const wipId = wfWipPick === '' ? null : Number.parseInt(wfWipPick, 10)
    const doneId = wfDonePick === '' ? null : Number.parseInt(wfDonePick, 10)
    if (
      (wipId != null && !Number.isFinite(wipId)) ||
      (doneId != null && !Number.isFinite(doneId)) ||
      (wipId != null && doneId != null && wipId === doneId)
    ) {
      setWfErr(t('settings.wfErrTwoFolders'))
      return
    }
    setWfBusy(true)
    setWfErr(null)
    try {
      await window.mailClient.mail.setWorkflowMailFolderMapping({
        accountId: wfAccountId,
        wipFolderId: wipId,
        doneFolderId: doneId
      })
      await loadWorkflowFolderUi()
      void refreshAccounts(accounts).catch((e) => console.warn('[AccountSetup] refreshAccounts:', e))
    } catch (e) {
      setWfErr(e instanceof Error ? e.message : String(e))
    } finally {
      setWfBusy(false)
    }
  }

  async function handleExportSettingsBackup(): Promise<void> {
    setBackupNotice(null)
    setLocalError(null)
    setBackupBusy(true)
    try {
      const ls = snapshotLocalStorage()
      const r = await window.mailClient.settingsBackup.exportToFile(ls)
      if (!r.ok) {
        return
      }
      setBackupNotice(t('settings.backupSavedPath', { path: r.path }))
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e))
    } finally {
      setBackupBusy(false)
    }
  }

  async function handleOptimizeLocalData(): Promise<void> {
    setBackupNotice(null)
    setLocalError(null)
    setLocalDataBusy(true)
    try {
      const result = await window.mailClient.localData.optimize()
      const lines = [
        t('settings.localDataOptimized', {
          freed: formatBytes(result.freedBytes),
          total: formatBytes(result.afterTotalBytes)
        })
      ]
      if (result.chromiumCacheNeedsRestart) {
        lines.push(t('settings.localDataOptimizedRestartHint'))
      }
      setBackupNotice(lines.join(' '))
      await refreshLocalDataUsage()
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e))
    } finally {
      setLocalDataBusy(false)
    }
  }

  async function handleExportLocalDataArchive(mode: 'portable' | 'full'): Promise<void> {
    setBackupNotice(null)
    setLocalError(null)
    setLocalDataBusy(true)
    try {
      const r = await window.mailClient.localData.exportArchive(mode)
      if (!r.ok) return
      setBackupNotice(t('settings.localDataArchiveSaved', { path: r.path }))
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e))
    } finally {
      setLocalDataBusy(false)
    }
  }

  async function handleImportLocalDataArchive(): Promise<void> {
    setBackupNotice(null)
    setLocalError(null)
    const ok = await showAppConfirm(t('settings.localDataImportConfirmBody'), {
      title: t('settings.localDataImportConfirmTitle'),
      variant: 'danger',
      confirmLabel: t('common.import')
    })
    if (!ok) return
    setLocalDataBusy(true)
    try {
      const r = await window.mailClient.localData.pickAndRestoreArchive()
      if (!r.ok && 'error' in r) setLocalError(r.error)
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e))
    } finally {
      setLocalDataBusy(false)
    }
  }

  async function handleImportSettingsBackup(): Promise<void> {
    setBackupNotice(null)
    setLocalError(null)
    setBackupBusy(true)
    try {
      const pick = await window.mailClient.settingsBackup.pickAndRead()
      if (!pick.ok) {
        if ('error' in pick) setLocalError(pick.error)
        return
      }
      const ok = await showAppConfirm(t('settings.importConfirmBody'), {
        title: t('settings.importConfirmTitle'),
        variant: 'danger',
        confirmLabel: t('common.import')
      })
      if (!ok) return
      await window.mailClient.settingsBackup.applyFull(pick.backup)
      replaceLocalStorageFromBackup(pick.backup.localStorage)
      window.location.reload()
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e))
    } finally {
      setBackupBusy(false)
    }
  }

  return createPortal(
    <>
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        className="flex max-h-[92vh] w-[min(960px,96vw)] max-w-[96vw] flex-col overflow-hidden rounded-xl border border-border bg-card text-foreground shadow-2xl"
        onClick={(e): void => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h2 id="settings-dialog-title" className="text-sm font-semibold">
            {t('settings.title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label={t('settings.closeAria')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-border px-5 py-2">
          <FilterTabs<SettingsTab>
            value={activeTab}
            options={settingsTabOptions}
            onChange={setActiveTab}
            className="flex-wrap"
            ariaLabel={t('settings.tabsAria')}
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex min-h-0 flex-1 divide-x divide-border">
            <nav
              className="flex w-[13rem] shrink-0 flex-col gap-0.5 overflow-y-auto bg-muted/15 py-3 pl-2.5 pr-1.5"
              aria-label={t('settings.subNavAria')}
            >
              {settingsSubNavItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={(): void => {
                    setSubNavId((prev) => ({ ...prev, [activeTab]: item.id }))
                  }}
                  className={cn(
                    'w-full rounded-md px-2 py-2 text-left text-[11px] font-medium leading-snug transition-colors',
                    subNavId[activeTab] === item.id
                      ? 'bg-secondary text-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                  )}
                >
                  {item.label}
                </button>
              ))}
            </nav>
            <div
              className={cn(
                'min-h-0 min-w-0 flex-1 p-5',
                activeTab === 'mail' && subNavId.mail === 'rules'
                  ? 'flex flex-col overflow-hidden'
                  : 'overflow-y-auto'
              )}
            >
          {activeTab === 'general' && (
            <div role="tabpanel" aria-label={t('settings.generalPanelAria')} className="space-y-5">
              {subNavId.general === 'language' && (
              <section className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t('settings.languageSection')}
                </h3>
                <p className="text-xs leading-relaxed text-muted-foreground">{t('settings.languageHint')}</p>
                <label htmlFor="mailclient-ui-locale" className="sr-only">
                  {t('settings.languageSection')}
                </label>
                <select
                  id="mailclient-ui-locale"
                  value={locale}
                  onChange={(e): void => {
                    setLocale(e.target.value as AppLocale)
                  }}
                  className="w-full max-w-xs rounded-md border border-border bg-background px-3 py-1.5 text-xs outline-none focus:border-ring"
                >
                  <option value="de">{t('settings.languageDe')}</option>
                  <option value="en">{t('settings.languageEn')}</option>
                </select>
              </section>
              )}

              {subNavId.general === 'dashboard' && (
              <section className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t('settings.dashboardGridHeading')}
                </h3>
                <p className="text-xs leading-relaxed text-muted-foreground">{t('settings.dashboardGridHint')}</p>
                <label htmlFor="mailclient-dash-grid-step" className="block text-[11px] font-medium text-foreground">
                  {t('settings.dashboardGridLabel')}
                </label>
                <input
                  id="mailclient-dash-grid-step"
                  type="number"
                  min={DASHBOARD_GRID_STEP_MIN_PX}
                  max={DASHBOARD_GRID_STEP_MAX_PX}
                  step={1}
                  value={dashGridStepDraft}
                  onChange={(e): void => {
                    setDashGridStepDraft(e.target.value)
                  }}
                  onBlur={(): void => {
                    const n = Number.parseInt(dashGridStepDraft, 10)
                    writeDashboardAlignStepPx(Number.isFinite(n) ? n : DASHBOARD_GRID_STEP_DEFAULT_PX)
                    setDashGridStepDraft(String(readDashboardAlignStepPx()))
                  }}
                  className="w-full max-w-xs rounded-md border border-border bg-background px-3 py-1.5 text-xs tabular-nums outline-none focus:border-ring"
                />
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  {t('settings.dashboardGridRange', {
                    min: DASHBOARD_GRID_STEP_MIN_PX,
                    max: DASHBOARD_GRID_STEP_MAX_PX,
                    def: DASHBOARD_GRID_STEP_DEFAULT_PX
                  })}
                </p>
              </section>
              )}

              {subNavId.general === 'weather' && (
              <section className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-3">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Cloud className="h-3.5 w-3.5" aria-hidden />
                  {t('settings.weatherHeading')}
                </h3>
                <p className="text-xs leading-relaxed text-muted-foreground">{t('settings.weatherIntro')}</p>
                <label htmlFor="mailclient-weather-place" className="block text-[11px] font-medium text-foreground">
                  {t('settings.weatherPlaceLabel')}
                </label>
                <div className="flex flex-wrap gap-2">
                  <input
                    id="mailclient-weather-place"
                    type="text"
                    value={weatherSearchDraft}
                    onChange={(e): void => setWeatherSearchDraft(e.target.value)}
                    placeholder={t('settings.weatherPlacePlaceholder')}
                    disabled={busy || weatherBusy}
                    className="min-w-[12rem] flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs outline-none placeholder:text-muted-foreground focus:border-ring"
                  />
                  <button
                    type="button"
                    onClick={(): void => void handleWeatherSearchAndSave()}
                    disabled={busy || weatherBusy || !weatherSearchDraft.trim()}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                      busy || weatherBusy || !weatherSearchDraft.trim()
                        ? 'bg-secondary text-muted-foreground'
                        : 'bg-primary text-primary-foreground hover:bg-primary/90'
                    )}
                  >
                    {weatherBusy ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden /> : null}
                    {t('settings.weatherSave')}
                  </button>
                  <button
                    type="button"
                    onClick={(): void => void handleWeatherClear()}
                    disabled={
                      busy ||
                      weatherBusy ||
                      (config?.weatherLatitude == null && config?.weatherLongitude == null)
                    }
                    className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary/60 disabled:opacity-50"
                  >
                    {t('settings.weatherClear')}
                  </button>
                </div>
                {config?.weatherLatitude != null && config?.weatherLongitude != null ? (
                  <p className="text-[10px] text-muted-foreground">
                    {t('settings.weatherActive', {
                      name: config.weatherLocationName ?? t('settings.weatherCoordsFallback'),
                      lat: config.weatherLatitude.toFixed(2),
                      lon: config.weatherLongitude.toFixed(2)
                    })}
                  </p>
                ) : null}
                {weatherMsg ? <p className="text-[10px] text-emerald-600 dark:text-emerald-500">{weatherMsg}</p> : null}
              </section>
              )}

              {subNavId.general === 'oauth' && (
              <>
              <section className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t('settings.loginHeading')}
                </h3>
                <p className="text-xs leading-relaxed text-muted-foreground">{t('settings.loginIntro')}</p>
              </section>

              <details className="group rounded-md border border-border bg-background/40">
                <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium text-foreground marker:content-none [&::-webkit-details-marker]:hidden">
                  <span className="underline-offset-2 group-open:underline">{t('settings.oauthSummary')}</span>
                  <span className="mt-0.5 block text-[10px] font-normal text-muted-foreground">
                    {t('settings.oauthSub')}
                  </span>
                </summary>
                <div className="space-y-5 border-t border-border px-3 py-4">
                  <section className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {t('settings.azureHeading')}
                    </h3>
                    <p className="text-xs leading-relaxed text-muted-foreground">{t('settings.azureIntro')}</p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={clientIdInput}
                        onChange={(e): void => setClientIdInput(e.target.value)}
                        placeholder={t('settings.azureClientIdPlaceholder')}
                        className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs outline-none placeholder:text-muted-foreground focus:border-ring"
                      />
                      <button
                        type="button"
                        onClick={handleSaveClientId}
                        disabled={busy}
                        className={cn(
                          'rounded-md px-3 text-xs font-medium transition-colors',
                          busy
                            ? 'bg-secondary text-muted-foreground'
                            : 'bg-primary text-primary-foreground hover:bg-primary/90'
                        )}
                      >
                        {t('common.save')}
                      </button>
                    </div>
                    {hasClientId && (
                      <p className="text-[10px] text-emerald-500">{t('settings.azureActive')}</p>
                    )}
                  </section>

                  <section className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {t('settings.googleOAuthHeading')}
                    </h3>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {t('settings.googleOAuthIntro')}{' '}
                      <code className="text-foreground">http://127.0.0.1:47836/oauth2callback</code>
                    </p>
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={googleClientIdInput}
                        onChange={(e): void => setGoogleClientIdInput(e.target.value)}
                        placeholder={t('settings.googlePlaceholderId')}
                        autoComplete="off"
                        className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs outline-none placeholder:text-muted-foreground focus:border-ring"
                      />
                      <input
                        type="password"
                        value={googleClientSecretInput}
                        onChange={(e): void => setGoogleClientSecretInput(e.target.value)}
                        placeholder={
                          hasGoogleClientSecret
                            ? t('settings.googlePlaceholderSecretStored')
                            : t('settings.googlePlaceholderSecretNew')
                        }
                        autoComplete="new-password"
                        className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs outline-none placeholder:text-muted-foreground focus:border-ring"
                      />
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleSaveGoogleClientId}
                        disabled={busy || !googleClientIdInput.trim()}
                        className={cn(
                          'rounded-md px-3 text-xs font-medium transition-colors',
                          busy || !googleClientIdInput.trim()
                            ? 'bg-secondary text-muted-foreground'
                            : 'bg-primary text-primary-foreground hover:bg-primary/90'
                        )}
                      >
                        {t('common.save')}
                      </button>
                    </div>
                    {googleOAuthReady && (
                      <p className="text-[10px] text-emerald-500">{t('settings.googleActive')}</p>
                    )}
                  </section>
                </div>
              </details>
              </>
              )}

              {subNavId.general === 'notion' && (
                <Suspense fallback={<AccountSetupPanelFallback />}>
                  <AccountSetupNotionPanel
                    config={config}
                    busy={busy}
                    onBusy={setBusy}
                    onError={setLocalError}
                    onConfigSaved={(c): void => {
                      useAccountsStore.setState({ config: c })
                    }}
                  />
                </Suspense>
              )}

              {subNavId.general === 'backup' && (
              <section className="space-y-2 border-t border-border pt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t('settings.backupHeading')}
                </h3>
                <p className="text-xs leading-relaxed text-muted-foreground">{t('settings.backupIntro')}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={(): void => void handleExportSettingsBackup()}
                    disabled={backupBusy || busy}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                      backupBusy || busy
                        ? 'bg-secondary text-muted-foreground'
                        : 'border border-border bg-secondary/80 text-foreground hover:bg-secondary'
                    )}
                  >
                    {backupBusy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    {t('settings.exportDots')}
                  </button>
                  <button
                    type="button"
                    onClick={(): void => void handleImportSettingsBackup()}
                    disabled={backupBusy || busy}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                      backupBusy || busy
                        ? 'bg-secondary text-muted-foreground'
                        : 'border border-border bg-secondary/80 text-foreground hover:bg-secondary'
                    )}
                  >
                    {backupBusy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5" />
                    )}
                    {t('settings.importDots')}
                  </button>
                </div>
                {backupNotice ? (
                  <p className="text-[10px] text-emerald-600 dark:text-emerald-500">{backupNotice}</p>
                ) : null}

                <AccountSetupLocalDataSection
                  localDataUsage={localDataUsage}
                  localDataScanning={localDataScanning}
                  localDataBusy={localDataBusy}
                  backupBusy={backupBusy}
                  busy={busy}
                  onOptimize={(): void => void handleOptimizeLocalData()}
                  onExportPortable={(): void => void handleExportLocalDataArchive('portable')}
                  onExportFull={(): void => void handleExportLocalDataArchive('full')}
                  onImportArchive={(): void => void handleImportLocalDataArchive()}
                />
              </section>
              )}
            </div>
          )}

          {activeTab === 'accounts' && (
            <div role="tabpanel" aria-label={t('settings.accountsPanelAria')} className="space-y-5">
              {subNavId.accounts === 'connected' && (
              <section className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('settings.connectedAccounts')}
                  </h3>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={handleAddMicrosoft}
                      disabled={busy || !hasClientId || reconnectingAccountId !== null}
                      className={cn(
                        'flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                        busy || !hasClientId || reconnectingAccountId !== null
                          ? 'bg-secondary text-muted-foreground'
                          : 'bg-primary text-primary-foreground hover:bg-primary/90'
                      )}
                      title={
                        !hasClientId ? t('settings.msNoClientTitle') : t('settings.msConnectTitle')
                      }
                    >
                      {busy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Plus className="h-3.5 w-3.5" />
                      )}
                      Microsoft
                    </button>
                    <button
                      type="button"
                      onClick={handleAddGoogle}
                      disabled={busy || !googleOAuthReady || reconnectingAccountId !== null}
                      className={cn(
                        'flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                        busy || !googleOAuthReady || reconnectingAccountId !== null
                          ? 'bg-secondary text-muted-foreground'
                          : 'bg-primary text-primary-foreground hover:bg-primary/90'
                      )}
                      title={
                        !googleOAuthReady
                          ? t('settings.googleConfigureFirstTitle')
                          : t('settings.googleConnectTitle')
                      }
                    >
                      {busy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Plus className="h-3.5 w-3.5" />
                      )}
                      Google
                    </button>
                  </div>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">{t('settings.accountsIntro')}</p>

                {mailCacheNotice ? (
                  <p className="text-[10px] text-emerald-600 dark:text-emerald-500">{mailCacheNotice}</p>
                ) : null}
                {tasksCacheNotice ? (
                  <p className="text-[10px] text-emerald-600 dark:text-emerald-500">{tasksCacheNotice}</p>
                ) : null}

                {accounts.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border bg-background/50 p-4 text-center text-xs text-muted-foreground">
                    {t('settings.noAccountYet')}
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {accounts.map((acc) => (
                      <li
                        key={acc.id}
                        className="rounded-md border border-border bg-background/60 px-3 py-2"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white',
                              accountColorToCssBackground(acc.color) ? '' : acc.color
                            )}
                            style={
                              accountColorToCssBackground(acc.color)
                                ? { backgroundColor: accountColorToCssBackground(acc.color)! }
                                : undefined
                            }
                          >
                            {acc.initials}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-medium text-foreground">
                              {acc.displayName}
                            </div>
                            <div className="truncate text-[10px] text-muted-foreground">{acc.email}</div>
                          </div>
                          <div className="flex shrink-0 items-center gap-0.5">
                            {acc.provider === 'microsoft' ? (
                              <button
                                type="button"
                                onClick={(): void => {
                                  void handleRefreshMicrosoft(acc.id)
                                }}
                                disabled={busy || reconnectingAccountId !== null}
                                className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40"
                                title={t('settings.msReconnectTitle')}
                                aria-label={t('settings.msReconnectAria')}
                              >
                                {reconnectingAccountId === acc.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-3.5 w-3.5" />
                                )}
                              </button>
                            ) : acc.provider === 'google' ? (
                              <button
                                type="button"
                                onClick={(): void => {
                                  void handleRefreshGoogle(acc.id)
                                }}
                                disabled={busy || reconnectingAccountId !== null}
                                className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40"
                                title={t('settings.googleReconnectTitle')}
                                aria-label={t('settings.googleReconnectAria')}
                              >
                                {reconnectingAccountId === acc.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-3.5 w-3.5" />
                                )}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={(): void => {
                                void handleRemove(acc.id)
                              }}
                              disabled={busy || reconnectingAccountId !== null}
                              className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/20 hover:text-destructive disabled:opacity-40"
                              title={t('settings.removeAccountTitle')}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                        <div className="mt-2.5 border-t border-border/40 pt-2 pl-10 space-y-2">
                          <AccountPropertiesMenu
                            provider={acc.provider}
                            accountId={acc.id}
                            accountEmail={acc.email}
                            color={acc.color}
                            disabled={busy || reconnectingAccountId !== null}
                            saving={colorSavingAccountId === acc.id}
                            onColorChange={(next): void => {
                              void handleAccountColorChange(acc.id, next)
                            }}
                          />
                          {(acc.provider === 'microsoft' || acc.provider === 'google') && (
                            <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={(): void => {
                                void handleClearMailCache(acc.id, acc.email)
                              }}
                              disabled={
                                busy ||
                                reconnectingAccountId !== null ||
                                mailCacheClearingAccountId !== null ||
                                tasksCacheClearingAccountId !== null
                              }
                              className={cn(
                                'inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium outline-none transition-colors',
                                busy ||
                                  reconnectingAccountId !== null ||
                                  mailCacheClearingAccountId !== null ||
                                  tasksCacheClearingAccountId !== null
                                  ? 'cursor-not-allowed opacity-40'
                                  : 'hover:bg-secondary/80 focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/40'
                              )}
                              title={t('settings.clearMailCacheTitle')}
                            >
                              {mailCacheClearingAccountId === acc.id ? (
                                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
                              ) : (
                                <Eraser className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                              )}
                              {t('settings.clearMailCacheButton')}
                            </button>
                            <button
                              type="button"
                              onClick={(): void => {
                                void handleClearTasksCache(acc.id, acc.email)
                              }}
                              disabled={
                                busy ||
                                reconnectingAccountId !== null ||
                                mailCacheClearingAccountId !== null ||
                                tasksCacheClearingAccountId !== null
                              }
                              className={cn(
                                'inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium outline-none transition-colors',
                                busy ||
                                  reconnectingAccountId !== null ||
                                  mailCacheClearingAccountId !== null ||
                                  tasksCacheClearingAccountId !== null
                                  ? 'cursor-not-allowed opacity-40'
                                  : 'hover:bg-secondary/80 focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/40'
                              )}
                              title={t('settings.clearTasksCacheTitle')}
                            >
                              {tasksCacheClearingAccountId === acc.id ? (
                                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
                              ) : (
                                <ListTodo className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                              )}
                              {t('settings.clearTasksCacheButton')}
                            </button>
                            </div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              )}
            </div>
          )}

          {activeTab === 'mail' && (
            <div role="tabpanel" aria-label={t('settings.tabMail')} className="space-y-5">
              {subNavId.mail === 'sync' && (
              <section className="space-y-2">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Inbox className="h-3.5 w-3.5" />
                  {t('settings.syncWindowHeading')}
                </h3>
                <p className="text-xs leading-relaxed text-muted-foreground">{t('settings.syncWindowIntro')}</p>
                <select
                  value={config?.syncWindowDays == null ? 'all' : String(config.syncWindowDays)}
                  onChange={(e): void => {
                    void handleSyncWindowChange(e.target.value)
                  }}
                  disabled={busy}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs outline-none focus:border-ring"
                >
                  {syncWindowOptions.map((opt) => (
                    <option key={String(opt.value)} value={opt.value == null ? 'all' : String(opt.value)}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </section>
              )}

              {subNavId.mail === 'display' && (
              <section className="space-y-2">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <ImageIcon className="h-3.5 w-3.5" />
                  {t('settings.mailDisplayHeading')}
                </h3>
                <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-background/40 p-3">
                  <input
                    type="checkbox"
                    checked={config?.autoLoadImages ?? true}
                    onChange={(e): void => {
                      void handleToggleAutoImages(e.target.checked)
                    }}
                    disabled={busy}
                    className="mt-0.5 h-4 w-4 cursor-pointer accent-primary"
                  />
                  <span className="flex-1 text-xs">
                    <span className="block font-medium text-foreground">{t('settings.autoImagesTitle')}</span>
                    <span className="mt-0.5 block leading-relaxed text-muted-foreground">
                      {t('settings.autoImagesHint')}
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-background/40 p-3">
                  <input
                    type="checkbox"
                    checked={flaggedFilterExcludeDeletedJunk}
                    onChange={(e): void => {
                      setFlaggedFilterExcludeDeletedJunk(e.target.checked)
                    }}
                    disabled={busy}
                    className="mt-0.5 h-4 w-4 cursor-pointer accent-primary"
                  />
                  <span className="flex-1 text-xs">
                    <span className="block font-medium text-foreground">
                      {t('settings.flaggedMailboxFilterTitle')}
                    </span>
                    <span className="mt-0.5 block leading-relaxed text-muted-foreground">
                      {t('settings.flaggedMailboxFilterHint')}
                    </span>
                  </span>
                </label>
                <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3">
                  <div className="flex items-start gap-2">
                    <Eraser className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-xs font-medium text-foreground">{t('settings.bulkUnflagSettingsHeading')}</p>
                      <p className="text-xs leading-relaxed text-muted-foreground">{t('settings.bulkUnflagSettingsBody')}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(): void => setBulkUnflagOpen(true)}
                    disabled={busy || triageMailAccounts.length === 0}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors',
                      busy || triageMailAccounts.length === 0
                        ? 'cursor-not-allowed opacity-50'
                        : 'hover:bg-secondary/60'
                    )}
                  >
                    <Eraser className="h-3.5 w-3.5" aria-hidden />
                    {t('settings.bulkUnflagOpenButton')}
                  </button>
                </div>
              </section>
              )}

              {subNavId.mail === 'sidebarFolders' && (
              <section className="space-y-2">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <PanelLeft className="h-3.5 w-3.5" />
                  {t('settings.mailSidebarFoldersHeading')}
                </h3>
                <p className="text-xs leading-relaxed text-muted-foreground">{t('settings.mailSidebarFoldersIntro')}</p>
                {triageMailAccounts.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border bg-background/50 p-3 text-xs text-muted-foreground">
                    {t('settings.triageNeedMailAccount')}
                  </p>
                ) : (
                  <div className="space-y-2 rounded-md border border-border bg-background/40 p-3">
                    <label htmlFor="mail-sidebar-vis-account" className="sr-only">
                      {t('settings.mailSidebarFoldersAccountSr')}
                    </label>
                    <select
                      id="mail-sidebar-vis-account"
                      value={mailSidebarVisAccountId}
                      onChange={(e): void => setMailSidebarVisAccountId(e.target.value)}
                      disabled={busy}
                      className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-ring"
                    >
                      {triageMailAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.provider === 'google'
                            ? t('settings.triageAccountOptionGoogle', { email: a.email })
                            : t('settings.triageAccountOptionMicrosoft', { email: a.email })}
                        </option>
                      ))}
                    </select>
                    <div className="max-h-56 space-y-0.5 overflow-y-auto overscroll-contain pr-0.5">
                      {mailSidebarFolderRows.map((node) => {
                        const folder = node.folder
                        const depth = node.depth
                        const vk = mailFolderSidebarVisibilityKey(mailSidebarVisAccountId, folder.remoteId)
                        const hidden = mailSidebarHiddenKeys.has(vk)
                        const shown = !hidden
                        const isInbox = folder.wellKnown === 'inbox'
                        return (
                          <label
                            key={folder.id}
                            className="flex cursor-pointer items-start gap-2 rounded border border-transparent px-1 py-0.5 hover:bg-background/60"
                            style={{ paddingLeft: `${10 + depth * 14}px` }}
                          >
                            <input
                              type="checkbox"
                              className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-primary"
                              checked={shown}
                              disabled={isInbox || busy}
                              onChange={(e): void => {
                                handleMailFolderSidebarCheckbox(
                                  mailSidebarVisAccountId,
                                  folder,
                                  e.target.checked
                                )
                              }}
                            />
                            <span className="min-w-0 flex-1 text-[11px] leading-snug text-foreground">
                              {folder.name}
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )}
              </section>
              )}

              {subNavId.mail === 'triage' && (
              <section className="space-y-2">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <ListChecks className="h-3.5 w-3.5" />
                  {t('settings.triageHeading')}
                </h3>
                <p className="text-xs leading-relaxed text-muted-foreground">{t('settings.triageIntro')}</p>
                {triageMailAccounts.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border bg-background/50 p-3 text-xs text-muted-foreground">
                    {t('settings.triageNeedMailAccount')}
                  </p>
                ) : (
                  <div className="space-y-2 rounded-md border border-border bg-background/40 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <label htmlFor="wf-mail-account" className="sr-only">
                        {t('settings.wfAccountSr')}
                      </label>
                      <select
                        id="wf-mail-account"
                        value={wfAccountId}
                        onChange={(e): void => setWfAccountId(e.target.value)}
                        disabled={wfBusy}
                        className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-ring"
                      >
                        {triageMailAccounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.provider === 'google'
                              ? t('settings.triageAccountOptionGoogle', { email: a.email })
                              : t('settings.triageAccountOptionMicrosoft', { email: a.email })}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={wfBusy || !wfAccountId}
                        onClick={(): void => void handleWfEnsureDefaults()}
                        className="shrink-0 rounded-md border border-border bg-secondary px-2 py-1 text-[10px] font-medium text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50"
                      >
                        {t('settings.wfEnsureDefaults')}
                      </button>
                    </div>
                    {wfErr && (
                      <div className="rounded border border-destructive/40 bg-destructive/10 p-2 text-[10px] text-destructive">
                        {wfErr}
                      </div>
                    )}
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="space-y-1">
                        <span className="text-[10px] text-muted-foreground">{t('settings.wfWipLabel')}</span>
                        <select
                          value={wfWipPick}
                          onChange={(e): void => setWfWipPick(e.target.value)}
                          disabled={wfBusy || !wfAccountId}
                          className="w-full rounded border border-border bg-background px-2 py-1 text-xs outline-none"
                        >
                          <option value="">{t('settings.wfNotMapped')}</option>
                          {wfFolders.map((f) => (
                            <option key={f.id} value={String(f.id)}>
                              {f.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] text-muted-foreground">{t('settings.wfDoneLabel')}</span>
                        <select
                          value={wfDonePick}
                          onChange={(e): void => setWfDonePick(e.target.value)}
                          disabled={wfBusy || !wfAccountId}
                          className="w-full rounded border border-border bg-background px-2 py-1 text-xs outline-none"
                        >
                          <option value="">{t('settings.wfNotMapped')}</option>
                          {wfFolders.map((f) => (
                            <option key={f.id} value={String(f.id)}>
                              {f.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={wfBusy || !wfAccountId}
                      onClick={(): void => void handleWfSaveMapping()}
                      className="inline-flex w-full items-center justify-center gap-1 rounded-md bg-primary px-2 py-1.5 text-[10px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 sm:w-auto"
                    >
                      {wfBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                      {t('settings.wfSaveMapping')}
                    </button>
                  </div>
                )}
              </section>
              )}

              {subNavId.mail === 'categories' && (
              <section className="space-y-2">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Tag className="h-3.5 w-3.5" />
                  {t('settings.categoriesHeading')}
                </h3>
                <p className="text-xs leading-relaxed text-muted-foreground">{t('settings.categoriesIntro')}</p>

                {microsoftAccounts.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border bg-background/50 p-3 text-xs text-muted-foreground">
                    {t('settings.categoriesNeedAccount')}
                  </p>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <label htmlFor="mail-cat-account" className="sr-only">
                        {t('settings.catAccountSr')}
                      </label>
                      <select
                        id="mail-cat-account"
                        value={categoryAccountId}
                        onChange={(e): void => setCategoryAccountId(e.target.value)}
                        disabled={catBusy}
                        className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-ring"
                      >
                        {microsoftAccounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.email}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={catBusy || !categoryAccountId}
                        onClick={(): void => void refreshMasterCategories()}
                        className="shrink-0 rounded-md border border-border bg-secondary px-2 py-1 text-[10px] font-medium text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50"
                      >
                        {t('common.refresh')}
                      </button>
                    </div>

                    {catErr && (
                      <div className="rounded border border-destructive/40 bg-destructive/10 p-2 text-[10px] text-destructive">
                        {catErr}
                      </div>
                    )}

                    <div className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-background/40 p-2">
                      <div className="min-w-0 flex-1 space-y-1">
                        <span className="text-[10px] text-muted-foreground">{t('settings.newCategory')}</span>
                        <input
                          value={newCatName}
                          onChange={(e): void => setNewCatName(e.target.value)}
                          placeholder={t('settings.catNamePlaceholder')}
                          className="w-full rounded border border-border bg-background px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                      </div>
                      <select
                        value={newCatColor}
                        onChange={(e): void => setNewCatColor(e.target.value)}
                        className="rounded border border-border bg-background px-1 py-1 text-[10px] outline-none"
                      >
                        {OUTLOOK_COLOR_PRESET_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={catBusy || !newCatName.trim()}
                        onClick={(): void => void handleCreateMasterCategory()}
                        className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary px-2 py-1 text-[10px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      >
                        {catBusy ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Plus className="h-3 w-3" />
                        )}
                        {t('common.create')}
                      </button>
                    </div>

                    <ul className="max-h-52 space-y-0.5 overflow-y-auto rounded-md border border-border bg-background/30 p-2">
                      {catBusy && masterCats.length === 0 ? (
                        <li className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {t('settings.catLoading')}
                        </li>
                      ) : (
                        masterCats.map((c) => (
                          <li
                            key={c.id}
                            className="flex flex-wrap items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-secondary/40"
                          >
                            <span
                              className={cn(
                                'h-3 w-3 shrink-0 rounded-full',
                                outlookCategoryDotClass(c.color)
                              )}
                              aria-hidden
                            />
                            {editingId === c.id ? (
                              <>
                                <input
                                  value={editName}
                                  onChange={(e): void => setEditName(e.target.value)}
                                  className="min-w-[8rem] flex-1 rounded border border-border bg-background px-1 py-0.5 text-xs"
                                />
                                <select
                                  value={editColor}
                                  onChange={(e): void => setEditColor(e.target.value)}
                                  className="rounded border border-border bg-background text-[10px]"
                                >
                                  {OUTLOOK_COLOR_PRESET_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>
                                      {o.label}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  disabled={catBusy || !editName.trim()}
                                  onClick={(): void => void handleSaveMasterCategoryEdit()}
                                  className="text-[10px] font-medium text-primary hover:underline disabled:opacity-50"
                                >
                                  {t('common.save')}
                                </button>
                                <button
                                  type="button"
                                  disabled={catBusy}
                                  onClick={(): void => setEditingId(null)}
                                  className="text-[10px] text-muted-foreground hover:text-foreground"
                                >
                                  {t('common.cancel')}
                                </button>
                              </>
                            ) : (
                              <>
                                <span className="min-w-0 flex-1 truncate font-medium">{c.displayName}</span>
                                <button
                                  type="button"
                                  disabled={catBusy}
                                  onClick={(): void => {
                                    setEditingId(c.id)
                                    setEditName(c.displayName)
                                    setEditColor(c.color || 'preset4')
                                  }}
                                  className="shrink-0 text-[10px] text-muted-foreground hover:text-foreground"
                                >
                                  {t('common.edit')}
                                </button>
                                <button
                                  type="button"
                                  disabled={catBusy}
                                  onClick={(): void => void handleDeleteMasterCategory(c.id)}
                                  className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                                  title={t('common.delete')}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </li>
                        ))
                      )}
                    </ul>
                  </>
                )}
              </section>
              )}

              {subNavId.mail === 'rules' && (
              <section className="-mx-5 -mb-5 flex min-h-0 flex-col">
                <Suspense fallback={<AccountSetupPanelFallback />}>
                  <AccountSetupRulesPanel />
                </Suspense>
              </section>
              )}
            </div>
          )}

          {activeTab === 'calendar' && (
            <div role="tabpanel" aria-label={t('settings.tabCalendar')} className="space-y-5">
              {subNavId.calendar === 'timezone' && (
              <section className="space-y-2">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <CalendarClock className="h-3.5 w-3.5" />
                  {t('settings.calendarTzHeading')}
                </h3>
                <p className="text-xs leading-relaxed text-muted-foreground">{t('settings.calendarTzIntro')}</p>
                <select
                  value={config?.calendarTimeZone == null ? 'auto' : config.calendarTimeZone}
                  onChange={(e): void => {
                    void handleCalendarTimeZoneChange(e.target.value)
                  }}
                  disabled={busy}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs outline-none focus:border-ring"
                >
                  <option value="auto">{t('settings.calendarTzAuto')}</option>
                  {CALENDAR_TIMEZONE_UI_OPTIONS.map((opt) => (
                    <option key={opt.iana} value={opt.iana}>
                      {opt.label} ({opt.iana})
                    </option>
                  ))}
                </select>
              </section>
              )}

              {subNavId.calendar === 'api' && (
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t('settings.calendarApiHeading')}
                </h3>
                <p className="text-xs leading-relaxed text-muted-foreground">{t('settings.calendarApiIntro')}</p>
                {calendarLinkedAccounts.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border bg-background/50 p-3 text-xs text-muted-foreground">
                    {t('settings.calendarConnectHint')}
                  </p>
                ) : (
                  <div className="space-y-2">
                    <div>
                      <div className="mb-1 text-[10px] font-medium text-muted-foreground">
                        {t('settings.calendarAccountLabel')}
                      </div>
                      <select
                        value={calendarAheadAccountId}
                        onChange={(e): void => setCalendarAheadAccountId(e.target.value)}
                        disabled={busy || reconnectingAccountId !== null}
                        className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs outline-none focus:border-ring"
                      >
                        {calendarLinkedAccounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.displayName} ({a.email})
                          </option>
                        ))}
                      </select>
                    </div>
                    {calendarAheadTargetAccount ? (
                      <div className="space-y-1.5">
                        <div className="text-[10px] font-medium text-muted-foreground">
                          {t('settings.calendarAheadLabel')}
                        </div>
                        <select
                          value={calendarAheadSelectValue(calendarAheadTargetAccount)}
                          disabled={
                            busy ||
                            reconnectingAccountId !== null ||
                            aheadSavingAccountId === calendarAheadTargetAccount.id
                          }
                          onChange={(e): void => {
                            void handleCalendarAheadChange(
                              calendarAheadTargetAccount.id,
                              e.target.value
                            )
                          }}
                          className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs outline-none focus:border-ring"
                        >
                          {calendarLoadAheadUiOptions.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        {aheadSavingAccountId === calendarAheadTargetAccount.id ? (
                          <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            {t('settings.savingDots')}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                )}
              </section>
              )}

              {subNavId.calendar === 'sidebar' && (
              <section className="space-y-2">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <PanelLeft className="h-3.5 w-3.5" />
                  {t('settings.calendarSidebarHeading')}
                </h3>
                <p className="text-xs leading-relaxed text-muted-foreground">{t('settings.calendarSidebarIntro')}</p>
                {calendarLinkedAccounts.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border bg-background/50 p-3 text-xs text-muted-foreground">
                    {t('settings.calendarConnectHint')}
                  </p>
                ) : (
                  <div className="max-h-[min(70vh,520px)] space-y-3 overflow-y-auto overscroll-contain pr-0.5">
                    {calendarLinkedAccounts.map((acc) => {
                      const pack = calSidebarPerAccount[acc.id]
                      return (
                        <div
                          key={acc.id}
                          className="rounded-md border border-border/60 bg-background/40 p-2.5 shadow-sm"
                        >
                          <div className="mb-2 border-b border-border/50 pb-2">
                            <p className="truncate text-[11px] font-semibold text-foreground">{acc.displayName}</p>
                            <p className="truncate text-[10px] text-muted-foreground">{acc.email}</p>
                            <p className="mt-0.5 text-[9px] uppercase tracking-wide text-muted-foreground/90">
                              {acc.provider === 'google'
                                ? t('settings.calendarSidebarProviderGoogle')
                                : t('settings.calendarSidebarProviderMicrosoft')}
                            </p>
                          </div>
                          {!pack || (pack.loading && pack.calendars.length === 0) ? (
                            <p className="flex items-center gap-1 py-1 text-[10px] text-muted-foreground">
                              <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden />
                              {t('settings.catLoading')}
                            </p>
                          ) : pack.error ? (
                            <div className="rounded border border-destructive/40 bg-destructive/10 p-2 text-[10px] text-destructive">
                              {pack.error}
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <div className="space-y-0.5">
                                {pack.calendars.map((cal) =>
                                  renderCalendarSidebarCheckboxRow(
                                    acc.id,
                                    cal,
                                    calSidebarHiddenKeysForSettings,
                                    busy,
                                    reconnectingAccountId,
                                    handleCalendarSidebarRowToggle
                                  )
                                )}
                              </div>
                              {acc.provider === 'microsoft' ? (
                                <div className="space-y-1 border-t border-border/50 pt-2">
                                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                    {t('settings.calendarSidebarGroupCalendars')}
                                  </p>
                                  {pack.groupLoading ? (
                                    <p className="flex items-center gap-1 py-0.5 text-[10px] text-muted-foreground">
                                      <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden />
                                      {t('settings.calendarSidebarGroupCalendarsLoading')}
                                    </p>
                                  ) : pack.groupError ? (
                                    <p className="text-[10px] text-destructive">{pack.groupError}</p>
                                  ) : pack.groupCalendars.length === 0 ? (
                                    <p className="text-[10px] text-muted-foreground">
                                      {t('settings.calendarSidebarGroupCalendarsEmpty')}
                                    </p>
                                  ) : (
                                    <div className="space-y-0.5">
                                      {pack.groupCalendars.map((cal) =>
                                        renderCalendarSidebarCheckboxRow(
                                          acc.id,
                                          cal,
                                          calSidebarHiddenKeysForSettings,
                                          busy,
                                          reconnectingAccountId,
                                          handleCalendarSidebarRowToggle
                                        )
                                      )}
                                    </div>
                                  )}
                                </div>
                              ) : null}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>
              )}
            </div>
          )}

          {activeTab === 'contacts' && (
            <div role="tabpanel" aria-label={t('settings.contactsPanelAria')} className="space-y-5">
              {subNavId.contacts === 'workspace' && (
              <section className="space-y-2">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Contact className="h-3.5 w-3.5" aria-hidden />
                  {t('settings.contactsWorkspaceHeading')}
                </h3>
                <p className="text-xs leading-relaxed text-muted-foreground">{t('settings.contactsWorkspaceIntro')}</p>
                <button
                  type="button"
                  onClick={(): void => {
                    setAppMode('people')
                    onClose()
                  }}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    'bg-primary text-primary-foreground hover:bg-primary/90'
                  )}
                >
                  {t('settings.contactsOpenModule')}
                </button>
              </section>
              )}

              {subNavId.contacts === 'google' && (
              <section className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t('settings.contactsGoogleHeading')}
                </h3>
                <p className="text-xs leading-relaxed text-muted-foreground">{t('settings.contactsGoogleBody')}</p>
              </section>
              )}

              {subNavId.contacts === 'microsoft' && (
              <section className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t('settings.contactsMicrosoftHeading')}
                </h3>
                <p className="text-xs leading-relaxed text-muted-foreground">{t('settings.contactsMicrosoftBody')}</p>
              </section>
              )}

              {subNavId.contacts === 'accountsLink' && (
              <section className="space-y-2">
                <p className="text-xs leading-relaxed text-muted-foreground">{t('settings.contactsAccountsHint')}</p>
                <button
                  type="button"
                  onClick={(): void => setActiveTab('accounts')}
                  className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary/60"
                >
                  {t('settings.contactsGoAccounts')}
                </button>
              </section>
              )}
            </div>
          )}
            </div>
          </div>
          {showError && (
            <div className="flex shrink-0 items-start gap-2 border-t border-destructive/30 bg-destructive/10 px-5 py-3 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{showError}</span>
            </div>
          )}
        </div>
      </div>
    </div>
    <BulkUnflagServerDialog open={bulkUnflagOpen} onClose={(): void => setBulkUnflagOpen(false)} />
    </>,
    document.body
  )
}
