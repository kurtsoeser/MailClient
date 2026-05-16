import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Topbar } from './app/layout/Topbar'
import { AccountSetupDialog } from './components/AccountSetupDialog'
import { FirstRunWizard } from './components/FirstRunWizard'
import { WorkflowMailFoldersIntro } from './components/WorkflowMailFoldersIntro'
import { ComposerStack } from './components/Composer'
import { ToastStack } from './components/ToastStack'
import { AppDialogHost } from './components/AppDialogHost'
import { NotionDestinationPickerDialog } from './components/NotionDestinationPickerDialog'
import { SnoozePickerHost } from './components/SnoozePickerHost'
import { CreateCloudTaskFromMailDialogHost } from './components/CreateCloudTaskFromMailDialogHost'
import { useAccountsStore } from './stores/accounts'
import { useMailStore } from './stores/mail'
import { useCalendarSyncStore } from './stores/calendar-sync'
import { useGlobalShortcuts } from './lib/use-global-shortcuts'
import {
  OPEN_ACCOUNT_SETTINGS_EVENT,
  type OpenAccountSettingsTab
} from './lib/open-account-settings'
import { PENDING_MAIL_RULES_SETTINGS_KEY, useAppModeStore } from './stores/app-mode'
import { subscribeConnectivityFromMain } from './stores/connectivity'

const HomeDashboard = lazy(async () => {
  const m = await import('./app/home/HomeDashboard')
  return { default: m.HomeDashboard }
})
const MailWorkspace = lazy(async () => {
  const m = await import('./app/layout/MailWorkspace')
  return { default: m.MailWorkspace }
})
const CalendarShell = lazy(async () => {
  const m = await import('./app/calendar/CalendarShell')
  return { default: m.CalendarShell }
})
const NotesShell = lazy(async () => {
  const m = await import('./app/notes/NotesShell')
  return { default: m.NotesShell }
})
const ChatShell = lazy(async () => {
  const m = await import('./app/chat/ChatShell')
  return { default: m.ChatShell }
})
const TasksShell = lazy(async () => {
  const m = await import('./app/tasks/TasksShell')
  return { default: m.TasksShell }
})
const WorkShell = lazy(async () => {
  const m = await import('./app/work/WorkShell')
  return { default: m.WorkShell }
})
const PeopleShell = lazy(async () => {
  const m = await import('./app/people/PeopleShell')
  return { default: m.PeopleShell }
})

function AppShellFallback(): JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-background text-muted-foreground">
      <div className="flex flex-col items-center gap-3">
        <div className="h-9 w-9 animate-pulse rounded-md bg-muted" />
        <span className="text-sm">{t('app.loadingShell')}</span>
      </div>
    </div>
  )
}

export function App(): JSX.Element {
  const [accountDialogOpen, setAccountDialogOpen] = useState(false)
  const [accountDialogInitialTab, setAccountDialogInitialTab] = useState<
    OpenAccountSettingsTab | undefined
  >(undefined)
  const [accountDialogInitialMailSubNav, setAccountDialogInitialMailSubNav] = useState<
    string | undefined
  >(undefined)
  const accounts = useAccountsStore((s) => s.accounts)
  const config = useAccountsStore((s) => s.config)
  const accountsLoading = useAccountsStore((s) => s.loading)
  const refreshAccounts = useMailStore((s) => s.refreshAccounts)
  const mode = useAppModeStore((s) => s.mode)

  const workflowMailTriageAccounts = useMemo(
    () => accounts.filter((a) => a.provider === 'microsoft' || a.provider === 'google'),
    [accounts]
  )

  const showWorkflowFoldersIntro =
    !accountsLoading &&
    Boolean(config) &&
    !config?.workflowMailFoldersIntroDismissed &&
    workflowMailTriageAccounts.length > 0

  const showFirstRunWizard =
    !accountsLoading &&
    config != null &&
    accounts.length === 0 &&
    config.firstRunSetupCompleted === false

  function openAccountSettings(
    tab: OpenAccountSettingsTab = 'general',
    mailSubNav?: string
  ): void {
    setAccountDialogInitialTab(tab)
    setAccountDialogInitialMailSubNav(mailSubNav)
    setAccountDialogOpen(true)
  }

  function closeAccountSettings(): void {
    setAccountDialogOpen(false)
    setAccountDialogInitialTab(undefined)
    setAccountDialogInitialMailSubNav(undefined)
  }

  useEffect(() => {
    // Einmalig beim Mount — nicht an Store-Funktions-Referenzen koppeln (vermeidet Re-Inits).
    useMailStore.getState().initialize()
    useCalendarSyncStore.getState().initialize()
    void useAccountsStore.getState().initialize()
  }, [])

  useGlobalShortcuts()

  useEffect(() => {
    return subscribeConnectivityFromMain()
  }, [])

  useEffect(() => {
    try {
      if (window.localStorage.getItem(PENDING_MAIL_RULES_SETTINGS_KEY) === '1') {
        window.localStorage.removeItem(PENDING_MAIL_RULES_SETTINGS_KEY)
        openAccountSettings('mail', 'rules')
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- einmalig nach Migration vom Regeln-Modul
  }, [])

  useEffect(() => {
    if (accounts.length > 0) {
      void refreshAccounts(accounts)
    }
  }, [accounts, refreshAccounts])

  useEffect(() => {
    const onOpenSettings = (e: Event): void => {
      const ce = e as CustomEvent<{ tab?: OpenAccountSettingsTab; mailSubNav?: string }>
      const tab = ce.detail?.tab ?? 'general'
      setAccountDialogInitialTab(tab)
      setAccountDialogInitialMailSubNav(ce.detail?.mailSubNav)
      setAccountDialogOpen(true)
    }
    window.addEventListener(OPEN_ACCOUNT_SETTINGS_EVENT, onOpenSettings as EventListener)
    return (): void => window.removeEventListener(OPEN_ACCOUNT_SETTINGS_EVENT, onOpenSettings as EventListener)
  }, [])

  return (
    <div className="app-chrome-root flex h-full min-h-0 flex-col text-foreground">
      <Topbar onOpenAccountDialog={(): void => openAccountSettings('general')} />
      <div className="flex min-h-0 flex-1 flex-col">
        <Suspense fallback={<AppShellFallback />}>
          {mode === 'home' && <HomeDashboard />}
          {mode === 'calendar' && <CalendarShell />}
          {mode === 'tasks' && <TasksShell />}
          {mode === 'work' && <WorkShell />}
          {mode === 'people' && <PeopleShell />}
          {mode === 'notes' && <NotesShell />}
          {mode === 'chat' && (
            <ChatShell onOpenAccountDialog={(): void => openAccountSettings('general')} />
          )}
          {mode === 'mail' && (
            <MailWorkspace onOpenAccountDialog={(): void => openAccountSettings('general')} />
          )}
        </Suspense>
      </div>
      {showFirstRunWizard ? (
        <FirstRunWizard
          onOpenSettings={(tab): void => {
            openAccountSettings(tab)
          }}
        />
      ) : null}
      <AccountSetupDialog
        open={accountDialogOpen}
        initialTab={accountDialogInitialTab}
        initialMailSubNav={accountDialogInitialMailSubNav}
        onClose={closeAccountSettings}
      />
      <WorkflowMailFoldersIntro
        open={showWorkflowFoldersIntro}
        workflowMailAccounts={workflowMailTriageAccounts}
        onClose={(): void => undefined}
        onOpenMailSettings={(): void => openAccountSettings('mail')}
      />
      <ComposerStack />
      <SnoozePickerHost />
      <CreateCloudTaskFromMailDialogHost />
      <ToastStack />
      <AppDialogHost />
      <NotionDestinationPickerDialog />
    </div>
  )
}
