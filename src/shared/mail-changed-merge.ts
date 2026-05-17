import type { MailChangedPayload } from './types'

/** Mehrere `mail:changed`-Events pro Konto zu einem Payload zusammenführen. */
export function mergeMailChangedPayload(
  existing: MailChangedPayload,
  incoming: Omit<MailChangedPayload, 'accountId'>
): MailChangedPayload {
  const folderIds = new Set<number>([...(existing.folderIds ?? []), ...(incoming.folderIds ?? [])])
  const kind =
    existing.kind === 'action' || incoming.kind === 'action'
      ? 'action'
      : (incoming.kind ?? existing.kind)
  return {
    accountId: existing.accountId,
    kind,
    folderIds: folderIds.size > 0 ? [...folderIds] : undefined
  }
}
