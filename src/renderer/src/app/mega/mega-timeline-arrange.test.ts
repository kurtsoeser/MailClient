import { describe, expect, it } from 'vitest'

import type { CalendarEventView } from '@shared/types'

import type { WorkListArrangeContext } from '@/app/work-items/work-item-list-arrange'

import { calendarEventToWorkItem, mailListItemToWorkItem } from '@/app/work-items/work-item-mapper'

import { computeMegaTimelineGroups } from '@/app/mega/mega-timeline-arrange'



const TZ = 'Europe/Berlin'



function megaCtx(labelPassthrough = true): WorkListArrangeContext {

  return {

    accountLabel: () => 'acc',

    noDueLabel: 'Ohne',

    openLabel: 'Offen',

    doneLabel: 'Erledigt',

    mailSourceLabel: 'Mail',

    formatCalendarDayGroupLabel: labelPassthrough ? (d) => d : undefined

  }

}



function sampleMail() {

  return mailListItemToWorkItem({

    id: 1,

    accountId: 'a1',

    folderId: null,

    threadId: null,

    remoteId: 'r1',

    remoteThreadId: null,

    subject: 'Mail A',

    fromAddr: null,

    fromName: null,

    snippet: null,

    sentAt: null,

    receivedAt: '2026-05-10T08:00:00.000Z',

    isRead: false,

    isFlagged: false,

    hasAttachments: false,

    importance: null,

    snoozedUntil: null,

    todoDueAt: '2026-05-16',

    todoStartAt: '2026-05-15T14:00:00.000Z',

    todoEndAt: '2026-05-15T15:00:00.000Z'

  })

}



function sampleEvent(): CalendarEventView {

  return {

    id: 'ev1',

    source: 'microsoft',

    accountId: 'a1',

    accountEmail: 'u@test.de',

    accountColorClass: 'blue',

    graphCalendarId: 'cal1',

    graphEventId: 'ev1',

    title: 'Meeting',

    startIso: '2026-05-15T10:00:00.000Z',

    endIso: '2026-05-15T11:00:00.000Z',

    isAllDay: false,

    location: null,

    webLink: null,

    joinUrl: null,

    organizer: null

  }

}



describe('computeMegaTimelineGroups', () => {

  it('sortiert nach effektiver Zeit (Planung vor Fälligkeit), Gruppe Kalendertag', () => {

    const mail = sampleMail()

    const event = calendarEventToWorkItem(sampleEvent())

    const groups = computeMegaTimelineGroups(

      [mail, event],

      'all',

      'oldest_on_top',

      'calendar_day',

      'de',

      megaCtx(),

      new Map(),

      TZ

    )

    expect(groups).toHaveLength(1)

    expect(groups[0]?.dayLabel).toBe('2026-05-15')

    expect(groups[0]?.items.map((i) => i.kind)).toEqual(['calendar_event', 'mail_todo'])

  })

})

