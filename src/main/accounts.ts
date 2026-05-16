import { ACCOUNT_COLOR_PRESET_CLASSES } from '@shared/account-colors'
import { readJsonSecure, writeJsonSecure } from './secure-store'
import type {
  ConnectedAccount,
  SettingsBackupAccountPreferenceSnapshot
} from '@shared/types'

const ACCOUNTS_KEY = 'accounts'

const PRESET_LIST = ACCOUNT_COLOR_PRESET_CLASSES as unknown as string[]

export function pickAccountColor(existing: ConnectedAccount[]): string {
  const used = new Set(existing.map((a) => a.color))
  const free = PRESET_LIST.find((c) => !used.has(c))
  if (free) return free
  return PRESET_LIST[existing.length % PRESET_LIST.length]!
}

export function initials(name: string, fallback: string): string {
  const trimmed = name?.trim() || fallback
  const parts = trimmed.split(/\s+|[._-]/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
  }
  return trimmed.slice(0, 2).toUpperCase()
}

export async function listAccounts(): Promise<ConnectedAccount[]> {
  return readJsonSecure<ConnectedAccount[]>(ACCOUNTS_KEY, [])
}

export async function upsertAccount(account: ConnectedAccount): Promise<ConnectedAccount[]> {
  const current = await listAccounts()
  const idx = current.findIndex((a) => a.id === account.id)
  if (idx >= 0) {
    current[idx] = account
  } else {
    current.push(account)
  }
  await writeJsonSecure(ACCOUNTS_KEY, current)
  return current
}

export async function removeAccount(id: string): Promise<ConnectedAccount[]> {
  const current = await listAccounts()
  const next = current.filter((a) => a.id !== id)
  await writeJsonSecure(ACCOUNTS_KEY, next)
  return next
}

/**
 * Persistiert die Konten-Reihenfolge (Array-Reihenfolge im Secure Store).
 * `accountIds` muss dieselbe Menge und Laenge wie die gespeicherten Konten haben.
 */
export function accountPreferencesForBackup(
  accounts: ConnectedAccount[]
): SettingsBackupAccountPreferenceSnapshot[] {
  return accounts.map((a) => ({
    accountId: a.id,
    color: a.color,
    calendarLoadAheadDays: a.calendarLoadAheadDays ?? null,
    signatureTemplates: a.signatureTemplates,
    defaultSignatureTemplateId: a.defaultSignatureTemplateId ?? null
  }))
}

/**
 * Uebernimmt gesicherte Konten-Praeferenzen in bestehende Konten (gleiche IDs).
 * OAuth-Token und Anmeldedaten bleiben unveraendert.
 */
export async function mergeAccountPreferencesFromBackup(
  prefs: SettingsBackupAccountPreferenceSnapshot[],
  accountOrder?: string[]
): Promise<ConnectedAccount[]> {
  const current = await listAccounts()
  if (current.length === 0 || prefs.length === 0) {
    return current
  }
  const prefById = new Map(prefs.map((p) => [p.accountId, p] as const))
  let next = current.map((acc) => {
    const p = prefById.get(acc.id)
    if (!p) return acc
    const merged: ConnectedAccount = { ...acc }
    if (typeof p.color === 'string' && p.color.trim()) {
      merged.color = p.color.trim()
    }
    if ('calendarLoadAheadDays' in p) {
      if (p.calendarLoadAheadDays == null) {
        delete merged.calendarLoadAheadDays
      } else if (Number.isFinite(p.calendarLoadAheadDays)) {
        merged.calendarLoadAheadDays = Math.floor(p.calendarLoadAheadDays)
      }
    }
    if (Array.isArray(p.signatureTemplates)) {
      merged.signatureTemplates = p.signatureTemplates
    }
    if ('defaultSignatureTemplateId' in p) {
      merged.defaultSignatureTemplateId = p.defaultSignatureTemplateId ?? null
    }
    return merged
  })
  if (accountOrder && accountOrder.length === next.length) {
    const idSet = new Set(next.map((a) => a.id))
    const orderOk =
      accountOrder.every((id) => idSet.has(id)) &&
      new Set(accountOrder).size === accountOrder.length
    if (orderOk) {
      const byId = new Map(next.map((a) => [a.id, a] as const))
      next = accountOrder.map((id) => byId.get(id)!)
    }
  }
  await writeJsonSecure(ACCOUNTS_KEY, next)
  return next
}

export async function reorderAccounts(accountIds: string[]): Promise<ConnectedAccount[]> {
  const current = await listAccounts()
  if (accountIds.length !== current.length) {
    throw new Error('Ungueltige Konten-Reihenfolge (Anzahl stimmt nicht).')
  }
  const idSet = new Set(current.map((a) => a.id))
  const seen = new Set<string>()
  for (const id of accountIds) {
    if (!idSet.has(id)) {
      throw new Error('Ungueltige Konten-Reihenfolge (unbekannte Konto-ID).')
    }
    if (seen.has(id)) {
      throw new Error('Ungueltige Konten-Reihenfolge (doppelte ID).')
    }
    seen.add(id)
  }
  const byId = new Map(current.map((a) => [a.id, a] as const))
  const next = accountIds.map((id) => byId.get(id)!)
  await writeJsonSecure(ACCOUNTS_KEY, next)
  return next
}
