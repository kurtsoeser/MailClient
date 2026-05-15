import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Topbar } from './app/layout/Topbar'
import { AccountSetupDialog } from './components/AccountSetupDialog'
import { FirstRunWizard } from './components/FirstRunWizard'
import { WorkflowMailFoldersIntro } from './components/WorkflowMailFoldersIntro'
import { ComposerStack } from './components/Composer'
import { ToastStack } from './components/ToastStack'
import { AppDialogHost } from './components/AppDialogHost'
import { SnoozePickerHost } from './components/SnoozePickerHost'
import { useAccountsStore } from './stores/accounts'
import { useMailStore } from './stores/mail'
import { useGlobalShortcuts } from './lib/use-global-shortcuts'
import { OPEN_ACCOUNT_SETTINGS_EVENT, type OpenAccountSettingsTab } from './lib/open-account-settings'
import { useAppModeStore } from './stores/app-mode'
import { subscribeConnectivityFromMain } from './stores/connectivity'

const HomeDashboard = lazy(async () => {
  const m = await import('./app/home/HomeDashboard')
  return { default: m.HomeDashboard }
})
const MailWorkspace = lazy(async () => {
  const m = await import('./app/layout/MailWorkspace')
  return { default: m.MailWorkspace }
})
const WorkflowBoard = lazy(async () => {
  const m = await import('./app/workflow/WorkflowBoard')
  return { default: m.WorkflowBoard }
})
const CalendarShell = lazy(async () => {
  const m = await import('./app/calendar/CalendarShell')
  return { default: m.CalendarShell }
})
const NotesShell = lazy(async () => {
  const m = await import('./app/notes/NotesShell')
  return { default: m.NotesShell }
})
const RulesShell = lazy(async () => {
  const m = await import('./app/rules/RulesShell')
  return { default: m.RulesShell }
})
const ChatShell = lazy(async () => {
  const m = await import('./app/chat/ChatShell')
  return { default: m.ChatShell }
})
const TasksShell = lazy(async () => {
  const m = await import('./app/tasks/TasksShell')
  return { default: m.TasksShell }
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
  const initialize = useAccountsStore((s) => s.initialize)
  const accounts = useAccountsStore((s) => s.accounts)
  const config = useAccountsStore((s) => s.config)
  const accountsLoading = useAccountsStore((s) => s.loading)
  const initMail = useMailStore((s) => s.initialize)
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

  function openAccountSettings(tab: OpenAccountSettingsTab = 'general'): void {
    setAccountDialogInitialTab(tab)
    setAccountDialogOpen(true)
  }

  function closeAccountSettings(): void {
    setAccountDialogOpen(false)
    setAccountDialogInitialTab(undefined)
  }

  useEffect(() => {
    initMail()
    void initialize()
  }, [initialize, initMail])

  useGlobalShortcuts()

  useEffect(() => {
    return subscribeConnectivityFromMain()
  }, [])

  useEffect(() => {
    if (accounts.length > 0) {
      void refreshAccounts(accounts)
    }
  }, [accounts, refreshAccounts])

  useEffect(() => {
    const onOpenSettings = (e: Event): void => {
      const ce = e as CustomEvent<{ tab?: OpenAccountSettingsTab }>
      const tab = ce.detail?.tab ?? 'general'
      setAccountDialogInitialTab(tab)
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
          {mode === 'workflow' && <WorkflowBoard />}
          {mode === 'calendar' && <CalendarShell />}
          {mode === 'tasks' && <TasksShell />}
          {mode === 'people' && <PeopleShell />}
          {mode === 'notes' && <NotesShell />}
          {mode === 'rules' && <RulesShell />}
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
      <ToastStack />
      <AppDialogHost />
    </div>
  )
}
