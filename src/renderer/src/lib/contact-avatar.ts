import type { ConnectedAccount } from '@shared/types'

/** Gecachtes Microsoft-Profilbild (Data-URL), wenn die Absenderadresse einem Konto entspricht. */
export function profilePhotoSrcForEmail(
  accounts: ConnectedAccount[],
  photoDataUrls: Record<string, string>,
  email: string | null | undefined
): string | undefined {
  if (!email?.trim()) return undefined
  const lower = email.trim().toLowerCase()
  const acc = accounts.find((a) => (a.email ?? '').toLowerCase() === lower)
  if (!acc) return undefined
  return photoDataUrls[acc.id]
}
