import type { MailListItem, TodoDueKindList } from '@shared/types'
import type { ThreadGroup } from '@/lib/thread-group'
import { groupLabelTodoDueBucketDe, rankOpenTodoBucket } from '@/lib/todo-due-bucket'

/** Wie Outlook: Anordnen nach (Gruppierung der Liste). */
export type MailListArrangeBy =
  | 'date_conversations'
  | 'from'
  | 'to'
  | 'categories'
  | 'read_status'
  | 'importance'
  | 'flag_start'
  | 'flag_due'
  | 'subject'
  | 'attachments'
  | 'account'
  | 'message_type'
  | 'size_preview'
  | 'todo_bucket'

/** Heute oben = neueste zuerst; Spaeter oben = aelteste zuerst. */
export type MailListChronoOrder = 'newest_on_top' | 'oldest_on_top'

export type MailListVirtualRow =
  | {
      kind: 'thread-head'
      key: string
      thread: ThreadGroup
      threadMessages: MailListItem[]
    }
  | {
      kind: 'thread-sub'
      key: string
      threadKey: string
      message: MailListItem
    }

export interface MailListArrangeContext {
  /** Konto-E-Mail oder Anzeigename fuer Gruppe „Konto“. */
  accountLabel: (accountId: string) => string
  /** well_known des aktuellen Ordners (nur listKind folder). */
  folderWellKnown: string | null
  /** Optional: i18n fuer ToDo-Bucket-Gruppentitel (Mail-Liste / Dashboard). */
  todoDueBucketLabel?: (kind: TodoDueKindList) => string
  /** Optional: Label fuer Threads ohne offenes ToDo in der ToDo-Bucket-Gruppierung. */
  noOpenTodoLabel?: string
}

export const MAIL_LIST_ARRANGE_LABELS: Record<MailListArrangeBy, string> = {
  date_conversations: 'Datum (Konversationen)',
  from: 'Von',
  to: 'An',
  categories: 'Kategorien',
  read_status: 'Attributstatus',
  importance: 'Priorität',
  flag_start: 'Kennzeichen: Startdatum',
  flag_due: 'Kennzeichen: Faelligkeitsdatum',
  subject: 'Betreff',
  attachments: 'Anlagen',
  account: 'Konto',
  message_type: 'Typ',
  size_preview: 'Größe (Vorschau)',
  todo_bucket: 'ToDo: Zeiträume (heute, morgen, Woche, …)'
}

function latestIso(t: ThreadGroup): string {
  return t.latestMessage.receivedAt ?? t.latestMessage.sentAt ?? ''
}

function compareThreadChrono(a: ThreadGroup, b: ThreadGroup, order: MailListChronoOrder): number {
  const ad = latestIso(a)
  const bd = latestIso(b)
  if (ad === bd) return 0
  const newerFirst = ad > bd
  if (order === 'newest_on_top') return newerFirst ? -1 : 1
  return newerFirst ? 1 : -1
}

function firstToLabel(toAddrs: string | null | undefined): string {
  if (!toAddrs?.trim()) return '(Ohne Empfaenger)'
  const first = toAddrs.split(/[;,]/)[0]?.trim() ?? ''
  if (!first) return '(Ohne Empfaenger)'
  const m = first.match(/<([^>]+)>/)
  const raw = (m?.[1] ?? first).trim()
  return raw.length > 0 ? raw : '(Ohne Empfaenger)'
}

function importanceLabel(v: string | null | undefined): string {
  const x = (v ?? 'normal').toLowerCase()
  if (x === 'high') return 'Hoch'
  if (x === 'low') return 'Niedrig'
  return 'Normal'
}

function importanceRank(v: string | null | undefined): number {
  const x = (v ?? 'normal').toLowerCase()
  if (x === 'high') return 0
  if (x === 'normal') return 1
  if (x === 'low') return 2
  return 1
}

function primaryCategory(m: MailListItem): string {
  const cats = (m.categories ?? []).map((c) => c.trim()).filter((c) => c.length > 0)
  if (cats.length === 0) return 'Ohne Kategorie'
  return [...cats].sort((a, b) => a.localeCompare(b, 'de'))[0]!
}

function messageTypeLabel(m: MailListItem, folderWellKnown: string | null): string {
  const w = folderWellKnown?.toLowerCase() ?? ''
  if (w === 'drafts') return 'Entwurf'
  if (w === 'sentitems') return 'Gesendet'
  if (w === 'deleteditems') return 'Geloescht'
  if (w === 'junkemail') return 'Junk'
  void m
  return 'E-Mail'
}

function snippetLen(m: MailListItem): number {
  return (m.snippet ?? '').length
}

function sizePreviewBucket(t: ThreadGroup): { label: string; sortKey: number } {
  const n = snippetLen(t.latestMessage)
  if (n >= 200) return { label: 'Lang (Vorschau)', sortKey: 2 }
  if (n >= 80) return { label: 'Mittel (Vorschau)', sortKey: 1 }
  return { label: 'Kurz (Vorschau)', sortKey: 0 }
}

/**
 * Datums-Buckets wie bisher fuer „Datum (Konversationen)“.
 */
export function dateBucketFor(iso: string | null | undefined): { key: string; label: string } {
  if (!iso) return { key: 'unknown', label: 'Unbekanntes Datum' }
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { key: 'unknown', label: 'Unbekanntes Datum' }
  const now = new Date()
  const startOfDay = (dt: Date): number =>
    new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime()
  const diffDays = Math.floor((startOfDay(now) - startOfDay(d)) / (24 * 60 * 60 * 1000))

  if (diffDays === 0) return { key: 'today', label: 'Heute' }
  if (diffDays === 1) return { key: 'yesterday', label: 'Gestern' }
  if (diffDays > 1 && diffDays <= 6) return { key: 'thisWeek', label: 'Diese Woche' }

  const sameYearMonth = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  if (sameYearMonth) return { key: 'thisMonth', label: 'Diesen Monat' }

  const month = d.toLocaleDateString('de-DE', { month: 'long' })
  const year = d.getFullYear()
  const sameYear = year === now.getFullYear()
  return {
    key: `${year}-${d.getMonth()}`,
    label: sameYear ? month : `${month} ${year}`
  }
}

function bucketKeyFromIso(iso: string | null | undefined): string {
  return dateBucketFor(iso).key
}

function bucketLabelFromIso(iso: string | null | undefined): string {
  return dateBucketFor(iso).label
}

function flagDateIso(kind: 'start' | 'due', m: MailListItem): string | null {
  const iso = kind === 'start' ? m.todoStartAt ?? m.todoDueAt : m.todoDueAt ?? m.todoStartAt
  return iso && iso.trim().length > 0 ? iso : null
}

interface GroupBucket {
  label: string
  sortKey: string | number
  threads: ThreadGroup[]
}

function compareGroupOrder(
  a: GroupBucket,
  b: GroupBucket,
  arrange: MailListArrangeBy,
  chrono: MailListChronoOrder
): number {
  if (arrange === 'date_conversations' || arrange === 'flag_start' || arrange === 'flag_due') {
    const emptyKey = (sk: string | number): boolean => {
      const s = String(sk)
      return s.startsWith('unknown') || s.startsWith('zzzz')
    }
    const maxIso = (bucket: GroupBucket): string => {
      if (emptyKey(bucket.sortKey)) return ''
      return bucket.threads.reduce((mx, t) => {
        const v = latestIso(t)
        return v > mx ? v : mx
      }, '')
    }
    const ad = maxIso(a)
    const bd = maxIso(b)
    if (ad !== bd) {
      const newer = ad > bd
      if (chrono === 'newest_on_top') return newer ? -1 : 1
      return newer ? 1 : -1
    }
    return a.label.localeCompare(b.label, 'de', { sensitivity: 'base' })
  }

  if (typeof a.sortKey === 'number' && typeof b.sortKey === 'number') {
    if (a.sortKey !== b.sortKey) return a.sortKey - b.sortKey
  } else {
    const as = String(a.sortKey)
    const bs = String(b.sortKey)
    if (as !== bs) return as.localeCompare(bs, 'de', { sensitivity: 'base' })
  }

  return a.label.localeCompare(b.label, 'de', { sensitivity: 'base' })
}

function threadGroupKey(
  t: ThreadGroup,
  arrange: MailListArrangeBy,
  ctx: MailListArrangeContext
): { label: string; sortKey: string | number } {
  const m = t.latestMessage
  switch (arrange) {
    case 'date_conversations': {
      const iso = latestIso(t)
      return { label: bucketLabelFromIso(iso), sortKey: bucketKeyFromIso(iso) }
    }
    case 'from': {
      const label = m.fromName?.trim() || m.fromAddr?.trim() || '(Unbekannt)'
      return { label, sortKey: label.toLowerCase() }
    }
    case 'to': {
      const label = firstToLabel(m.toAddrs)
      return { label, sortKey: label.toLowerCase() }
    }
    case 'categories': {
      const label = primaryCategory(m)
      return { label, sortKey: label.toLowerCase() }
    }
    case 'read_status': {
      const unread = t.unreadCount > 0
      return {
        label: unread ? 'Ungelesen' : 'Gelesen',
        sortKey: unread ? 0 : 1
      }
    }
    case 'importance':
      return { label: '', sortKey: '' }
    case 'flag_start': {
      const iso = flagDateIso('start', m)
      if (!iso) return { label: 'Ohne Startdatum', sortKey: 'zzzz-no-start' }
      return { label: bucketLabelFromIso(iso), sortKey: bucketKeyFromIso(iso) }
    }
    case 'flag_due': {
      const iso = flagDateIso('due', m)
      if (!iso) return { label: 'Ohne Faelligkeit', sortKey: 'zzzz-no-due' }
      return { label: bucketLabelFromIso(iso), sortKey: bucketKeyFromIso(iso) }
    }
    case 'subject': {
      const raw = (m.subject ?? '(Ohne Betreff)').trim() || '(Ohne Betreff)'
      return { label: raw, sortKey: raw.toLowerCase() }
    }
    case 'attachments': {
      const has = t.hasAttachments || m.hasAttachments
      return {
        label: has ? 'Mit Anlagen' : 'Ohne Anlagen',
        sortKey: has ? 0 : 1
      }
    }
    case 'account': {
      const label = ctx.accountLabel(m.accountId)
      return { label, sortKey: label.toLowerCase() }
    }
    case 'message_type': {
      const label = messageTypeLabel(m, ctx.folderWellKnown)
      return { label, sortKey: label.toLowerCase() }
    }
    case 'size_preview': {
      const b = sizePreviewBucket(t)
      return { label: b.label, sortKey: b.sortKey }
    }
    case 'todo_bucket': {
      const k = t.openTodoDueKind
      if (!k) {
        return { label: ctx.noOpenTodoLabel ?? 'Ohne offenes ToDo', sortKey: 99 }
      }
      const label = ctx.todoDueBucketLabel
        ? ctx.todoDueBucketLabel(k)
        : groupLabelTodoDueBucketDe(k)
      return { label, sortKey: rankOpenTodoBucket(k) }
    }
    default:
      return { label: '', sortKey: '' }
  }
}

function sortGroups(
  groups: GroupBucket[],
  arrange: MailListArrangeBy,
  chrono: MailListChronoOrder
): GroupBucket[] {
  const g = [...groups]

  if (arrange === 'importance') {
    g.sort((a, b) => {
      const ar = importanceRank(a.threads[0]?.latestMessage.importance)
      const br = importanceRank(b.threads[0]?.latestMessage.importance)
      if (ar !== br) return ar - br
      return compareGroupOrder(a, b, arrange, chrono)
    })
    return g
  }

  if (arrange === 'read_status') {
    g.sort((a, b) => (a.sortKey as number) - (b.sortKey as number))
    return g
  }

  if (arrange === 'attachments') {
    g.sort((a, b) => (a.sortKey as number) - (b.sortKey as number))
    return g
  }

  if (arrange === 'size_preview') {
    g.sort((a, b) => (b.sortKey as number) - (a.sortKey as number))
    return g
  }

  if (arrange === 'todo_bucket') {
    g.sort((a, b) => (a.sortKey as number) - (b.sortKey as number))
    return g
  }

  if (arrange === 'date_conversations' || arrange === 'flag_start' || arrange === 'flag_due') {
    g.sort((a, b) => compareGroupOrder(a, b, arrange, chrono))
    return g
  }

  g.sort((a, b) => compareGroupOrder(a, b, arrange, chrono))
  return g
}

function bucketThreads(
  threads: ThreadGroup[],
  arrange: MailListArrangeBy,
  ctx: MailListArrangeContext
): GroupBucket[] {
  if (arrange === 'importance') {
    const m = new Map<number, ThreadGroup[]>()
    for (const t of threads) {
      const r = importanceRank(t.latestMessage.importance)
      const arr = m.get(r) ?? []
      arr.push(t)
      m.set(r, arr)
    }
    const order = [0, 1, 2]
    return order
      .filter((k) => m.has(k))
      .map((k) => {
        const list = m.get(k)!
        const label = importanceLabel(list[0]!.latestMessage.importance)
        return { label, sortKey: k, threads: list }
      })
  }

  const map = new Map<string, GroupBucket>()
  for (const t of threads) {
    const { label, sortKey } = threadGroupKey(t, arrange, ctx)
    const key = `${typeof sortKey === 'number' ? `n:${sortKey}` : `s:${sortKey}`}\t${label}`
    const ex = map.get(key)
    if (ex) ex.threads.push(t)
    else map.set(key, { label, sortKey, threads: [t] })
  }
  return [...map.values()]
}

/**
 * Virtuelle Zeilen fuer GroupedVirtuoso inkl. Gruppenkoepfe und Thread-Subs.
 */
export function computeMailListLayout(
  threads: ThreadGroup[],
  messagesByThread: Map<string, MailListItem[]>,
  expandedThreads: Set<string>,
  arrange: MailListArrangeBy,
  chrono: MailListChronoOrder,
  ctx: MailListArrangeContext
): {
  groupLabels: string[]
  groupCounts: number[]
  /** Nur bei `arrange === 'todo_bucket'`: erster Thread je Bucket; sonst `null`. */
  groupTodoDueKinds: (TodoDueKindList | null)[]
  flatRows: MailListVirtualRow[]
} {
  const buckets = bucketThreads([...threads], arrange, ctx)
  const orderedBuckets = sortGroups(buckets, arrange, chrono)

  for (const b of orderedBuckets) {
    b.threads.sort((a, c) => compareThreadChrono(a, c, chrono))
  }

  const groupLabels: string[] = []
  const groupCounts: number[] = []
  const groupTodoDueKinds: (TodoDueKindList | null)[] = []
  const flatRows: MailListVirtualRow[] = []

  for (const bucket of orderedBuckets) {
    const rows: MailListVirtualRow[] = []
    for (const t of bucket.threads) {
      const tMsgs = messagesByThread.get(t.threadKey) ?? [t.latestMessage]
      rows.push({
        kind: 'thread-head',
        key: `head:${t.threadKey}`,
        thread: t,
        threadMessages: tMsgs
      })
      if (t.messageCount > 1 && expandedThreads.has(t.threadKey)) {
        const subs = [...tMsgs]
        subs.sort((a, b) => {
          const ad = a.receivedAt ?? a.sentAt ?? ''
          const bd = b.receivedAt ?? b.sentAt ?? ''
          if (ad !== bd) return ad < bd ? -1 : 1
          return a.id - b.id
        })
        for (const m of subs) {
          rows.push({
            kind: 'thread-sub',
            key: `sub:${t.threadKey}:${m.id}`,
            threadKey: t.threadKey,
            message: m
          })
        }
      }
    }
    if (rows.length === 0) continue
    groupLabels.push(bucket.label)
    groupCounts.push(rows.length)
    groupTodoDueKinds.push(
      arrange === 'todo_bucket' ? (bucket.threads[0]?.openTodoDueKind ?? null) : null
    )
    flatRows.push(...rows)
  }

  return { groupLabels, groupCounts, groupTodoDueKinds, flatRows }
}

/** Stabiler Schluessel pro Gruppe fuer Ein-/Ausklappen (Index + Sortier-Modus + Anzeige-Label). */
export function mailListGroupCollapseKey(
  arrange: MailListArrangeBy,
  groupIndex: number,
  label: string
): string {
  return `${arrange}\0${groupIndex}\0${label}`
}

/**
 * Entfernt Zeilen eingeklappter Gruppen; `visibleGroupCounts[i]` ist 0, wenn die Gruppe eingeklappt ist
 * (GroupedVirtuoso zeigt dann nur noch den Gruppenkopf).
 */
export function filterMailListLayoutForCollapsedGroups(
  groupLabels: string[],
  groupCounts: number[],
  flatRows: MailListVirtualRow[],
  arrange: MailListArrangeBy,
  collapsedKeys: Set<string>
): { visibleGroupCounts: number[]; visibleFlatRows: MailListVirtualRow[] } {
  let offset = 0
  const visibleGroupCounts: number[] = []
  const visibleFlatRows: MailListVirtualRow[] = []
  for (let gi = 0; gi < groupCounts.length; gi++) {
    const n = groupCounts[gi] ?? 0
    const label = groupLabels[gi] ?? ''
    const slice = flatRows.slice(offset, offset + n)
    offset += n
    const key = mailListGroupCollapseKey(arrange, gi, label)
    if (collapsedKeys.has(key)) {
      visibleGroupCounts.push(0)
    } else {
      visibleGroupCounts.push(n)
      visibleFlatRows.push(...slice)
    }
  }
  return { visibleGroupCounts, visibleFlatRows }
}

export function navigableIdsFromFlatRows(flatRows: MailListVirtualRow[]): number[] {
  return flatRows.map((row) =>
    row.kind === 'thread-head' ? row.thread.latestMessage.id : row.message.id
  )
}
