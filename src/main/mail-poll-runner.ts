import { runBackgroundPoll } from './sync-runner'
import { wakeDueSnoozes } from './snooze'
import { isAppOnline } from './network-status'
import { loadConfigSync } from './config'

const MIN_POLL_INTERVAL_MS = 30_000
const MAX_POLL_INTERVAL_MS = 600_000

let timer: NodeJS.Timeout | null = null
let running = false
let stopRequested = false

/**
 * Liefert eine Folder-ID, die zusaetzlich zum Standard-Set (Inbox/Sent)
 * gepollt werden soll. Standard: aktuell vom Renderer ausgewaehlter Folder.
 * Vom Main aus aktualisieren wir den Wert via `setActivePollFolder`.
 */
let activeFolderId: number | null = null

export function setActivePollFolder(folderId: number | null): void {
  activeFolderId = folderId
}

function resolvePollIntervalMs(): number {
  const sec = loadConfigSync().mailPollIntervalSeconds ?? 60
  const clamped = Math.min(Math.max(Math.floor(sec), 30), 600)
  return clamped * 1000
}

function scheduleNextPollTick(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  timer = setInterval(() => {
    void tick()
  }, resolvePollIntervalMs())
}

async function tick(): Promise<void> {
  if (running || stopRequested) return
  running = true
  try {
    // Faellige Snoozes zuerst zurueckschieben, damit der nachfolgende Poll
    // sie sofort in ihren Original-Ordnern wiederfindet.
    try {
      const woken = await wakeDueSnoozes()
      if (woken > 0) console.log(`[snooze] ${woken} Mails aufgeweckt`)
    } catch (e) {
      console.warn('[snooze] wake-tick error', e)
    }

    if (isAppOnline()) {
      try {
        const { processScheduledComposeQueue } = await import('./compose-scheduled-runner')
        await processScheduledComposeQueue()
      } catch (e) {
        console.warn('[compose-scheduled] tick error', e)
      }

      const extra = activeFolderId != null ? [activeFolderId] : []
      await runBackgroundPoll(extra)
    }
  } catch (e) {
    console.warn('[mail-poll] tick error', e)
  } finally {
    running = false
  }
}

export function startMailPolling(): void {
  if (timer) return
  stopRequested = false
  // Erster Tick verzoegert, damit Initial-Sync zuerst durchlaeuft.
  setTimeout(() => {
    void tick()
  }, 15_000)
  scheduleNextPollTick()
}

/** Nach Aenderung von `mailPollIntervalSeconds` in den Einstellungen. */
export function restartMailPollingInterval(): void {
  if (!timer) return
  scheduleNextPollTick()
}

export function stopMailPolling(): void {
  stopRequested = true
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

/**
 * Manuelles Anstossen aus dem Renderer (z.B. ueber einen Refresh-Button).
 * Garantiert sequentiell zum Hintergrund-Tick.
 */
export async function triggerManualPoll(folderId: number | null): Promise<void> {
  setActivePollFolder(folderId)
  await tick()
}
