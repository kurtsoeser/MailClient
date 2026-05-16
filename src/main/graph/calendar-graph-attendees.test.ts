import { describe, expect, it } from 'vitest'
import {
  applyGraphMeetingInviteToPayload,
  buildGraphAttendees
} from './calendar-graph'

describe('buildGraphAttendees', () => {
  it('dedupliziert und normalisiert E-Mail-Adressen', () => {
    expect(
      buildGraphAttendees(['A@Example.com', 'a@example.com', 'b@test.org'])
    ).toEqual([
      {
        emailAddress: { address: 'a@example.com', name: 'a@example.com' },
        type: 'required'
      },
      {
        emailAddress: { address: 'b@test.org', name: 'b@test.org' },
        type: 'required'
      }
    ])
  })

  it('filtert ungueltige Adressen', () => {
    expect(buildGraphAttendees(['kein-email', 'valid@x.org'])).toEqual([
      {
        emailAddress: { address: 'valid@x.org', name: 'valid@x.org' },
        type: 'required'
      }
    ])
  })
})

describe('applyGraphMeetingInviteToPayload', () => {
  it('setzt attendees und responseRequested bei Teilnehmern', () => {
    const payload: Record<string, unknown> = {}
    applyGraphMeetingInviteToPayload(payload, ['teilnehmer@example.com'])
    expect(payload.attendees).toHaveLength(1)
    expect(payload.responseRequested).toBe(true)
  })

  it('laesst Payload unveraendert ohne Teilnehmer', () => {
    const payload: Record<string, unknown> = { subject: 'Test' }
    applyGraphMeetingInviteToPayload(payload, [])
    expect(payload.attendees).toBeUndefined()
    expect(payload.responseRequested).toBeUndefined()
  })
})
