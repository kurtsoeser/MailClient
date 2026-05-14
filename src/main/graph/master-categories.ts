import { createGraphClient } from './client'
import { loadConfig } from '../config'
import type { MailMasterCategory } from '@shared/types'

async function getClientFor(accountId: string): Promise<ReturnType<typeof createGraphClient>> {
  const config = await loadConfig()
  if (!config.microsoftClientId) {
    throw new Error('Keine Azure Client-ID konfiguriert.')
  }
  const homeAccountId = accountId.replace(/^ms:/, '')
  return createGraphClient(config.microsoftClientId, homeAccountId)
}

interface GraphMasterCategory {
  id: string
  displayName: string
  color: string
}

interface GraphCollection<T> {
  value: T[]
}

export async function graphListMasterCategories(accountId: string): Promise<MailMasterCategory[]> {
  const client = await getClientFor(accountId)
  const page = (await client
    .api('/me/outlook/masterCategories')
    .get()) as GraphCollection<GraphMasterCategory>
  return (page.value ?? []).map((c) => ({
    id: c.id,
    displayName: c.displayName,
    color: c.color
  }))
}

export async function graphCreateMasterCategory(
  accountId: string,
  displayName: string,
  color: string
): Promise<MailMasterCategory> {
  const client = await getClientFor(accountId)
  const created = (await client.api('/me/outlook/masterCategories').post({
    displayName: displayName.trim(),
    color
  })) as GraphMasterCategory
  return { id: created.id, displayName: created.displayName, color: created.color }
}

export async function graphUpdateMasterCategory(
  accountId: string,
  categoryId: string,
  patch: { displayName?: string; color?: string }
): Promise<void> {
  const client = await getClientFor(accountId)
  const body: { displayName?: string; color?: string } = {}
  if (patch.displayName !== undefined) body.displayName = patch.displayName.trim()
  if (patch.color !== undefined) body.color = patch.color
  await client.api(`/me/outlook/masterCategories/${categoryId}`).patch(body)
}

export async function graphDeleteMasterCategory(accountId: string, categoryId: string): Promise<void> {
  const client = await getClientFor(accountId)
  await client.api(`/me/outlook/masterCategories/${categoryId}`).delete()
}
