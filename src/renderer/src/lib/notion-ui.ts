import type { CalendarEventView } from '@shared/types'
import i18n from 'i18next'
import type { MailContextHandlers } from '@/lib/mail-context-menu'
import { toNotionAppUrl } from '@/lib/notion-url'
import { openExternalUrl } from '@/lib/open-external'
import { pickNotionDestination } from '@/stores/notion-destination-picker'
import { showAppAlert, showAppChoice, showAppPrompt } from '@/stores/app-dialog'

async function showNotionOpenDialog(
  successMessage: string,
  pageUrl: string
): Promise<void> {
  const choice = await showAppChoice(successMessage, {
    title: 'Notion',
    cancelLabel: i18n.t('common.close'),
    actions: [
      { id: 'web', label: i18n.t('settings.notionOpenWeb'), variant: 'secondary' },
      { id: 'app', label: i18n.t('settings.notionOpenApp'), variant: 'primary' }
    ]
  })
  if (choice === 'web') {
    void openExternalUrl(pageUrl)
  } else if (choice === 'app') {
    void openExternalUrl(toNotionAppUrl(pageUrl))
  }
}

export async function sendMailToNotion(
  messageId: number,
  pageId?: string | null,
  webLink?: string | null
): Promise<void> {
  const result = await window.mailClient.notion.appendMail({
    messageId,
    pageId: pageId ?? null,
    webLink: webLink ?? null
  })
  await showNotionOpenDialog(i18n.t('notion.appendSuccessMail'), result.pageUrl)
}

export async function sendCalendarEventToNotion(
  event: CalendarEventView,
  pageId?: string | null,
  localeCode: 'de' | 'en' = 'de'
): Promise<void> {
  const result = await window.mailClient.notion.appendEvent({
    event,
    pageId: pageId ?? null,
    localeCode
  })
  await showNotionOpenDialog(i18n.t('notion.appendSuccessEvent'), result.pageUrl)
}

export async function sendMailAsNewNotionPage(
  messageId: number,
  suggestedTitle?: string | null,
  parentPageId?: string | null,
  webLink?: string | null
): Promise<void> {
  const defaultTitle = suggestedTitle?.trim() || i18n.t('notion.newPageDefaultMail')
  const title = await showAppPrompt(i18n.t('notion.newPageTitlePrompt'), {
    title: i18n.t('notion.contextSendAsNewPage'),
    defaultValue: defaultTitle,
    placeholder: i18n.t('notion.newPageTitlePlaceholder'),
    confirmLabel: i18n.t('common.create')
  })
  if (title === null) return

  const result = await window.mailClient.notion.createMailPage({
    messageId,
    title: title.trim() || defaultTitle,
    parentPageId: parentPageId ?? null,
    webLink: webLink ?? null
  })
  await showNotionOpenDialog(i18n.t('notion.createSuccessMail'), result.pageUrl)
}

export async function sendCalendarEventAsNewNotionPage(
  event: CalendarEventView,
  localeCode: 'de' | 'en' = 'de',
  parentPageId?: string | null
): Promise<void> {
  const defaultTitle = event.title?.trim() || i18n.t('notion.newPageDefaultEvent')
  const title = await showAppPrompt(i18n.t('notion.newPageTitlePrompt'), {
    title: i18n.t('notion.contextSendEventAsNewPage'),
    defaultValue: defaultTitle,
    placeholder: i18n.t('notion.newPageTitlePlaceholder'),
    confirmLabel: i18n.t('common.create')
  })
  if (title === null) return

  const result = await window.mailClient.notion.createEventPage({
    event,
    title: title.trim() || defaultTitle,
    parentPageId: parentPageId ?? null,
    localeCode
  })
  await showNotionOpenDialog(i18n.t('notion.createSuccessEvent'), result.pageUrl)
}

export async function pickAndSendMailToNotion(
  messageId: number,
  webLink?: string | null,
  suggestedTitle?: string | null
): Promise<void> {
  const pick = await pickNotionDestination('mail', {
    suggestedTitle: suggestedTitle ?? undefined,
    messageId
  })
  if (!pick) return
  if (pick.mode === 'created') {
    await showNotionOpenDialog(i18n.t('notion.createSuccessMail'), pick.pageUrl)
    return
  }
  await sendMailToNotion(messageId, pick.pageId, webLink)
}

export async function pickAndSendCalendarEventToNotion(
  event: CalendarEventView,
  localeCode: 'de' | 'en' = 'de'
): Promise<void> {
  const pick = await pickNotionDestination('calendar', {
    suggestedTitle: event.title?.trim() || undefined,
    calendarEvent: event,
    localeCode
  })
  if (!pick) return
  if (pick.mode === 'created') {
    await showNotionOpenDialog(i18n.t('notion.createSuccessEvent'), pick.pageUrl)
    return
  }
  await sendCalendarEventToNotion(event, pick.pageId, localeCode)
}

export async function runNotionSendWithErrorHandling(fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await showAppAlert(i18n.t('notion.appendFailed', { message }), { title: 'Notion' })
  }
}

async function ensureNotionConnected(): Promise<boolean> {
  const st = await window.mailClient.notion.getStatus()
  if (st.connected) return true
  await showAppAlert(i18n.t('notion.connectFirst'), { title: 'Notion' })
  return false
}

export function createMailSendToNotionHandler(): NonNullable<MailContextHandlers['sendToNotion']> {
  return (msg): void => {
    void (async (): Promise<void> => {
      if (!(await ensureNotionConnected())) return
      await runNotionSendWithErrorHandling(() =>
        pickAndSendMailToNotion(msg.id, undefined, msg.subject?.trim() || null)
      )
    })()
  }
}

export function createMailSendAsNewNotionPageHandler(): NonNullable<
  MailContextHandlers['sendToNotionAsNewPage']
> {
  return (msg): void => {
    void (async (): Promise<void> => {
      if (!(await ensureNotionConnected())) return
      await runNotionSendWithErrorHandling(() =>
        sendMailAsNewNotionPage(msg.id, msg.subject?.trim() || null)
      )
    })()
  }
}
