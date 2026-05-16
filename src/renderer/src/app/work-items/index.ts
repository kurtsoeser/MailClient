export type {
  CalendarEventWorkItem,
  CloudTaskWorkItem,
  MailCloudTaskLink,
  MailTodoWorkItem,
  MasterListDedupStrategy,
  WorkItem,
  WorkItemKind,
  WorkItemPlannedSchedule,
  WorkItemView
} from '@shared/work-item'

export {
  mailTodoStableKey,
  cloudTaskStableKey,
  cloudTaskStableKeyFromParts,
  parseMailTodoStableKey,
  parseCloudTaskStableKey,
  mailCloudTaskLinkKey
} from '@/app/work-items/work-item-keys'

export {
  loadPlannedScheduleMapForTasks,
  plannedScheduleMapFromDtos,
  cloudTaskKeysFromItems
} from '@/app/work-items/load-planned-schedules'

export {
  computeWorkItemDueBounds,
  normalizeDueAtIso,
  classifyDueAtIso
} from '@/app/work-items/work-item-due'

export {
  classifyMailTodoDueBucket,
  classifyWorkItemBucket,
  workItemEffectiveSortIso
} from '@/app/work-items/work-item-bucket'

export {
  mailListItemToWorkItem,
  mailListItemsToWorkItems,
  calendarEventToWorkItem,
  taskItemToWorkItem,
  taskRowToWorkItem,
  accountLabelForWorkItem,
  workItemSourceLabel,
  workItemToView,
  workItemsToViews
} from '@/app/work-items/work-item-mapper'

export {
  indexLinksByMessageId,
  indexLinksByCloudTaskKey,
  linkedMessageIdsForCloudTask,
  messageIdsToUnflagWhenCloudTaskCompletes,
  attachLinkedMessageIds,
  mergeUniqueLinks
} from '@/app/work-items/work-item-links'

export {
  dedupWorkItemsForMasterList,
  buildMasterWorkItemList,
  type DedupWorkItemsResult
} from '@/app/work-items/work-item-dedup'

export { openWorkItemInCalendar, resolveWorkItemGotoDateIso } from '@/app/work-items/work-item-calendar-nav'
export {
  buildWorkItemContextMenuItems,
  type WorkItemContextHandlers
} from '@/app/work-items/work-item-context-menu'
export {
  isoToDatetimeLocalValue,
  datetimeLocalValueToIso,
  dueDateInputValue
} from '@/app/work-items/work-item-datetime'
export { loadMasterWorkItems, listMailCloudTaskLinks } from '@/app/work-items/load-master-work-items'
export { loadMegaWorkItems } from '@/app/work-items/load-mega-work-items'
export { toggleWorkItemCompleted, completeCloudWorkItem } from '@/app/work-items/work-item-actions'
