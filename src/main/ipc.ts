import { registerAppIpc } from './ipc/register-app-ipc'
import { registerAuthIpc } from './ipc/register-auth-ipc'
import { registerCalendarIpc } from './ipc/register-calendar-ipc'
import { registerTasksIpc } from './ipc/register-tasks-ipc'
import { registerConfigIpc } from './ipc/register-config-ipc'
import { registerGraphIpc } from './ipc/register-graph-ipc'
import { registerMailIpc } from './ipc/register-mail-ipc'
import { registerNotesIpc } from './ipc/register-notes-ipc'
import { registerWorkflowVipRulesIpc } from './ipc/register-workflow-vip-rules-ipc'
import { registerSettingsBackupIpc } from './ipc/register-settings-backup-ipc'
import { registerWeatherIpc } from './ipc/register-weather-ipc'
import { registerPeopleIpc } from './ipc/register-people-ipc'
import { registerNotionIpc } from './ipc/register-notion-ipc'
import { ensureAccountProfilePhotosForMissing } from './ipc/ipc-helpers'
import { broadcastSyncStatus, broadcastMailChanged, broadcastNotesChanged } from './ipc/ipc-broadcasts'

export function registerIpcHandlers(): void {
  registerConfigIpc()
  registerCalendarIpc()
  registerTasksIpc()
  registerAppIpc()
  registerAuthIpc()
  registerGraphIpc()
  registerMailIpc()
  registerNotesIpc()
  registerWorkflowVipRulesIpc()
  registerSettingsBackupIpc()
  registerWeatherIpc()
  registerPeopleIpc()
  registerNotionIpc()

  setImmediate(() => {
    void ensureAccountProfilePhotosForMissing().catch((e) =>
      console.warn('[account-photo] Nachziehen der Profilfotos:', e)
    )
  })
}

void broadcastSyncStatus
void broadcastMailChanged
void broadcastNotesChanged
