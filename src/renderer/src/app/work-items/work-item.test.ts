import { describe, expect, it } from 'vitest'
import type { MailListItem, TaskItemRow } from '@shared/types'
import {
  buildMasterWorkItemList,
  classifyWorkItemBucket,
  cloudTaskStableKey,
  dedupWorkItemsForMasterList,
  linkedMessageIdsForCloudTask,
  mailListItemToWorkItem,
  mailTodoStableKey,
  messageIdsToUnflagWhenCloudTaskCompletes,
  parseCloudTaskStableKey,
  parseMailTodoStableKey,
  taskItemToWorkItem,
  workItemEffectiveSortIso,
  workItemToView
} from '@/app/work-items'

const TZ = 'Europe/Berlin'

function sampleMail(overrides: Partial<MailListItem> = {}): MailListItem {
  return {
    id: 42,
    accountId: 'acc-ms',
    folderId: 1,
    threadId: 10,
    remoteId: 'r1',
    remoteThreadId: 't1',
    subject: 'Budget Q2',
    fromAddr: 'a@b.de',
    fromName: 'Alice',
    snippet: null,
    sentAt: '2026-05-10T08:00:00.000Z',
    receivedAt: '2026-05-10T08:05:00.000Z',
    isRead: false,
    isFlagged: false,
    hasAttachments: false,
    importance: null,
    snoozedUntil: null,
    todoDueAt: '2026-05-15T12:00:00.000Z',
    todoStartAt: '2026-05-14T09:00:00.000Z',
    todoEndAt: '2026-05-14T09:30:00.000Z',
    ...overrides
  }
}

function sampleTask(overrides: Partial<TaskItemRow> = {}): TaskItemRow {
  return {
    id: 'task-1',
    listId: 'list-1',
    title: 'Präsentation',
    completed: false,
    dueIso: '2026-05-16',
    notes: null,
    ...overrides
  }
}

describe('work-item-keys', () => {
  it('mail und cloud stable keys sind parsebar', () => {
    expect(mailTodoStableKey(42)).toBe('mail:todo:42')
    expect(parseMailTodoStableKey('mail:todo:42')).toBe(42)
    const ck = cloudTaskStableKey('a', 'l', 't1')
    expect(parseCloudTaskStableKey(ck)).toEqual({ accountId: 'a', listId: 'l', taskId: 't1' })
  })
})

describe('mailListItemToWorkItem', () => {
  it('mappt Planung und Fälligkeit', () => {
    const item = mailListItemToWorkItem(sampleMail())
    expect(item.kind).toBe('mail_todo')
    expect(item.messageId).toBe(42)
    expect(item.planned.plannedStartIso).toContain('2026-05-14')
    expect(item.dueAtIso).toContain('2026-05-15')
    expect(item.completed).toBe(false)
  })

  it('erledigte Mail ist bucket done', () => {
    const item = mailListItemToWorkItem(
      sampleMail({ todoCompletedAt: '2026-05-01T10:00:00.000Z' })
    )
    expect(classifyWorkItemBucket(item, TZ)).toBe('done')
  })
})

describe('taskItemToWorkItem', () => {
  it('übernimmt verknüpfte Message-IDs', () => {
    const item = taskItemToWorkItem(
      { ...sampleTask(), accountId: 'acc', listName: 'Tasks' },
      { linkedMessageIds: [42, 99] }
    )
    expect(item.linkedMessageIds).toEqual([42, 99])
    expect(messageIdsToUnflagWhenCloudTaskCompletes(item)).toEqual([42, 99])
  })
})

describe('dedupWorkItemsForMasterList', () => {
  it('blendet Mail-ToDo aus wenn Cloud-Task verknüpft', () => {
    const mail = mailListItemToWorkItem(sampleMail())
    const cloud = taskItemToWorkItem({
      ...sampleTask(),
      accountId: 'acc-ms',
      listName: 'Inbox'
    })
    const links = [{ messageId: 42, accountId: 'acc-ms', listId: 'list-1', taskId: 'task-1' }]
    const { items, hiddenMailMessageIds } = dedupWorkItemsForMasterList([mail, cloud], links)
    expect(items).toHaveLength(1)
    expect(items[0]!.kind).toBe('cloud_task')
    expect(hiddenMailMessageIds).toEqual([42])
  })

  it('buildMasterWorkItemList kombiniert Quellen', () => {
    const mail = mailListItemToWorkItem(sampleMail({ id: 7 }))
    const cloud = taskItemToWorkItem({
      ...sampleTask({ id: 'x' }),
      accountId: 'a',
      listName: 'L'
    })
    const r = buildMasterWorkItemList([mail], [cloud], [])
    expect(r.items).toHaveLength(2)
  })
})

describe('workItemEffectiveSortIso', () => {
  it('bevorzugt Planungsstart vor Fälligkeit', () => {
    const mail = mailListItemToWorkItem(sampleMail())
    expect(workItemEffectiveSortIso(mail)).toBe(mail.planned.plannedStartIso)
  })
})

describe('workItemToView', () => {
  it('setzt sourceLabel für Mail', () => {
    const w = mailListItemToWorkItem(sampleMail())
    const view = workItemToView(w, new Map(), TZ)
    expect(view.sourceLabel).toBe('E-Mail')
    expect(view.messageId).toBe(42)
    expect(view.effectiveSortIso).toBe(workItemEffectiveSortIso(w))
  })

  it('linkedMessageIds aus Links-Index', () => {
    const links = [{ messageId: 42, accountId: 'a', listId: 'l', taskId: 'task-1' }]
    expect(linkedMessageIdsForCloudTask(links, 'a', 'l', 'task-1')).toEqual([42])
  })
})
