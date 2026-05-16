import type { TFunction } from 'i18next'
import { showAppConfirm } from '@/stores/app-dialog'

/** Bestätigung zum Löschen einer oder mehrerer Cloud-Aufgaben (App-Dialog statt `window.confirm`). */
export async function confirmDeleteCloudTasks(t: TFunction, count: number): Promise<boolean> {
  const message =
    count === 1
      ? t('tasks.shell.deleteConfirm')
      : t('tasks.shell.deleteManyConfirm', { count })
  const title =
    count === 1
      ? t('tasks.shell.deleteConfirmTitle')
      : t('tasks.shell.deleteManyConfirmTitle', { count })
  return showAppConfirm(message, {
    title,
    variant: 'danger',
    confirmLabel: t('common.delete'),
    cancelLabel: t('common.cancel')
  })
}
