import type { MailBulkUnflagInput, MailBulkUnflagResult } from '@shared/types'
import { listAccounts } from './accounts'
import {
  countFlaggedMessageIdsForBulkUnflag,
  listFlaggedMessageIdsForBulkUnflag
} from './db/messages-repo'
import { broadcastMailBulkUnflagProgress, broadcastMailChanged } from './ipc/ipc-broadcasts'
import { isAppOnline } from './network-status'
import { applySetFlaggedForMessage } from './message-graph-actions'

const GRAPH_THROTTLE_MS = 60

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function runBulkUnflagFlaggedMessages(input: MailBulkUnflagInput): Promise<MailBulkUnflagResult> {
  const accountId = String(input?.accountId ?? '').trim()
  if (!accountId) throw new Error('Konto-ID fehlt.')

  const accounts = await listAccounts()
  const acc = accounts.find((a) => a.id === accountId)
  if (!acc) throw new Error('Konto nicht gefunden.')
  if (acc.provider !== 'microsoft' && acc.provider !== 'google') {
    throw new Error('Batch-Entkennung ist nur für Microsoft- und Google-Konten verfügbar.')
  }

  const excludeDeletedJunk = input.excludeDeletedJunk === true

  if (input.dryRun) {
    const count = countFlaggedMessageIdsForBulkUnflag(accountId, excludeDeletedJunk)
    return { dryRun: true, count }
  }

  if (!isAppOnline()) {
    throw new Error('Keine Netzwerkverbindung. Batch-Entkennung erfordert Online-Zugang.')
  }

  const ids = listFlaggedMessageIdsForBulkUnflag(accountId, excludeDeletedJunk)
  const total = ids.length
  let processed = 0
  let failed = 0
  let firstError: string | null = null

  for (let i = 0; i < ids.length; i++) {
    const messageId = ids[i]!
    try {
      await applySetFlaggedForMessage(messageId, false, {
        source: 'bulk-unflag',
        skipBroadcast: true,
        skipActionRecord: true
      })
      processed++
    } catch (e) {
      failed++
      if (!firstError) firstError = e instanceof Error ? e.message : String(e)
    }

    if (i === 0 || (i + 1) % 25 === 0 || i + 1 === total) {
      broadcastMailBulkUnflagProgress({ accountId, done: i + 1, total })
    }

    if (i + 1 < ids.length) await delay(GRAPH_THROTTLE_MS)
  }

  broadcastMailChanged(accountId)
  return { dryRun: false, processed, failed, firstError }
}
