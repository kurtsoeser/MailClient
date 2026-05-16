import type { CalendarEventView, MailListItem, TaskItemRow, TodoDueKindList } from '@shared/types'

/** Discriminant für WorkItem-Quellen. */
export type WorkItemKind = 'mail_todo' | 'cloud_task' | 'calendar_event'

/** Verknüpfung Mail ↔ Cloud-Aufgabe (Variante C, 1:n; Tabelle `mail_cloud_task_link`). */
export interface MailCloudTaskLink {
  messageId: number
  accountId: string
  listId: string
  taskId: string
}

/** Geplante Arbeitszeit (Cloud: lokaler Store ab Phase 1; Mail: todoStart/End). */
export interface WorkItemPlannedSchedule {
  plannedStartIso: string | null
  plannedEndIso: string | null
}

export type MailTodoWorkItem = {
  kind: 'mail_todo'
  stableKey: string
  messageId: number
  accountId: string
  title: string
  dueAtIso: string | null
  planned: WorkItemPlannedSchedule
  completed: boolean
  mail: MailListItem
}

export type CloudTaskWorkItem = {
  kind: 'cloud_task'
  stableKey: string
  accountId: string
  listId: string
  taskId: string
  listName: string
  title: string
  dueAtIso: string | null
  planned: WorkItemPlannedSchedule
  completed: boolean
  /** Verknüpfte Mail-IDs aus `mail_cloud_task_link`. */
  linkedMessageIds: number[]
  task: TaskItemRow
}

export type CalendarEventWorkItem = {
  kind: 'calendar_event'
  stableKey: string
  accountId: string
  title: string
  dueAtIso: string | null
  planned: WorkItemPlannedSchedule
  /** Kalender-Termine haben keinen Erledigt-Status; Filter nutzen Endzeit. */
  completed: boolean
  event: CalendarEventView
}

export type WorkItem = MailTodoWorkItem | CloudTaskWorkItem | CalendarEventWorkItem

/** Flache Ansicht für Listen, Filter und Sortierung. */
export interface WorkItemView {
  kind: WorkItemKind
  stableKey: string
  title: string
  dueAtIso: string | null
  plannedStartIso: string | null
  plannedEndIso: string | null
  /** Zeitliste / Kalendertag-Gruppierung: Planung > Fälligkeit > Mail-Eingang / Terminstart. */
  effectiveSortIso: string | null
  completed: boolean
  bucket: TodoDueKindList
  accountId: string
  sourceLabel: string
  messageId: number | null
  listId: string | null
  listName: string | null
}

export type MasterListDedupStrategy = 'prefer_cloud_task'
