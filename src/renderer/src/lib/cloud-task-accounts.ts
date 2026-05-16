import type { ConnectedAccount } from '@shared/types'

export function isCloudTaskProvider(provider: string): boolean {
  return provider === 'microsoft' || provider === 'google'
}

export function accountSupportsCloudTasks(account: ConnectedAccount | undefined): boolean {
  return account != null && isCloudTaskProvider(account.provider)
}

/** Anzeige in Kontoauswahl: Name mit E-Mail in Klammern, wenn unterscheidbar. */
export function cloudTaskAccountOptionLabel(
  account: Pick<ConnectedAccount, 'displayName' | 'email'>
): string {
  const name = account.displayName?.trim()
  const email = account.email?.trim()
  if (name && email && name.toLowerCase() !== email.toLowerCase()) {
    return `${name} (${email})`
  }
  return name || email || ''
}
