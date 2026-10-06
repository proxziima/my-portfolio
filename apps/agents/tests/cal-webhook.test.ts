import { createHmac } from 'node:crypto'
import { ConversationState } from '@repo/twin/contract'
import { describe, expect, it } from 'vitest'
import { bookingStatusOf, parseCalWebhook, verifyCalSignature } from '../agent/lib/cal-webhook'

const secret = 'w'.repeat(32)
const envelope = {
  triggerEvent: 'BOOKING_CREATED',
  createdAt: '2026-10-04T12:00:00Z',
  payload: {
    uid: 'bk_1',
    title: 'Intro call',
    startTime: '2026-10-08T14:00:00Z',
    endTime: '2026-10-08T14:30:00Z',
    metadata: { bookingRef: 'abc.def', videoCallUrl: 'https://cal.video/x' },
    attendees: [{ email: 'a@b.c', name: 'Ada', timeZone: 'Europe/Lisbon' }],
    organizer: { email: 'me@example.com' },
  },
}
const body = JSON.stringify(envelope)

describe('cal webhook', () => {
  it('verifies X-Cal-Signature-256 over the raw body in constant time', () => {
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyCalSignature(body, sig, secret)).toBe(true)
    expect(verifyCalSignature(body + ' ', sig, secret)).toBe(false)
    expect(verifyCalSignature(body, sig.slice(1), secret)).toBe(false)
    expect(verifyCalSignature(body, null, secret)).toBe(false)
  })

  it('extracts only ids, times and the booking ref, never attendee data', () => {
    expect(parseCalWebhook(JSON.parse(body))).toEqual({
      kind: 'booking',
      booking: {
        trigger: 'BOOKING_CREATED',
        uid: 'bk_1',
        startTime: '2026-10-08T14:00:00Z',
        endTime: '2026-10-08T14:30:00Z',
        bookingRef: 'abc.def',
      },
    })
  })

  it('yields a start time ConversationState accepts (Cal.com sends ISO with Z)', () => {
    const parsed = parseCalWebhook(JSON.parse(body))
    if (parsed.kind !== 'booking') throw new Error(`expected a booking, got ${parsed.kind}`)
    const state = ConversationState.parse({
      booking: { status: 'confirmed', uid: 'bk_1', startTime: parsed.booking.startTime },
    })
    expect(state.booking.startTime).toBe('2026-10-08T14:00:00Z')
  })

  it('reports a booking the twin cannot use with the trigger and issue paths, never throwing', () => {
    const invalid = (payload: Record<string, unknown>, triggerEvent = 'BOOKING_CREATED') =>
      parseCalWebhook({ ...envelope, triggerEvent, payload: { ...envelope.payload, ...payload } })
    // Booked directly on Cal.com: no twin booking ref.
    expect(invalid({ metadata: {} })).toEqual({
      kind: 'invalid',
      trigger: 'BOOKING_CREATED',
      issues: ['payload.metadata.bookingRef'],
    })
    expect(invalid({ metadata: undefined }, 'BOOKING_CANCELLED')).toEqual({
      kind: 'invalid',
      trigger: 'BOOKING_CANCELLED',
      issues: ['payload.metadata'],
    })
    expect(invalid({ startTime: 'tomorrow', endTime: '2026-10-08' })).toEqual({
      kind: 'invalid',
      trigger: 'BOOKING_CREATED',
      issues: ['payload.startTime', 'payload.endTime'],
    })
    expect(invalid({ uid: undefined }, 'BOOKING_RESCHEDULED')).toEqual({
      kind: 'invalid',
      trigger: 'BOOKING_RESCHEDULED',
      issues: ['payload.uid'],
    })
    expect(parseCalWebhook({ triggerEvent: 'BOOKING_CREATED' })).toEqual({
      kind: 'invalid',
      trigger: 'BOOKING_CREATED',
      issues: ['payload'],
    })
  })

  it('links a reschedule to the booking it replaces via payload.rescheduleUid', () => {
    const resched = (extra: Record<string, unknown>, triggerEvent = 'BOOKING_RESCHEDULED') =>
      parseCalWebhook({ ...envelope, triggerEvent, payload: { ...envelope.payload, ...extra } })
    expect(resched({ uid: 'bk_2', rescheduleUid: 'bk_1' })).toEqual({
      kind: 'booking',
      booking: {
        trigger: 'BOOKING_RESCHEDULED',
        uid: 'bk_2',
        startTime: '2026-10-08T14:00:00Z',
        endTime: '2026-10-08T14:30:00Z',
        bookingRef: 'abc.def',
        rescheduledFrom: 'bk_1',
      },
    })
    // Optional: absent or null means no link.
    const plain = resched({ uid: 'bk_2' })
    expect(plain.kind === 'booking' && 'rescheduledFrom' in plain.booking).toBe(false)
    const nulled = resched({ uid: 'bk_2', rescheduleUid: null })
    expect(nulled.kind === 'booking' && 'rescheduledFrom' in nulled.booking).toBe(false)
    // Only a reschedule carries the link.
    const created = resched({ rescheduleUid: 'bk_0' }, 'BOOKING_CREATED')
    expect(created.kind === 'booking' && 'rescheduledFrom' in created.booking).toBe(false)
    // Strict: a malformed link is an issue, never a silently different booking.
    expect(resched({ rescheduleUid: 42 })).toEqual({
      kind: 'invalid',
      trigger: 'BOOKING_RESCHEDULED',
      issues: ['payload.rescheduleUid'],
    })
    expect(resched({ rescheduleUid: '' })).toEqual({
      kind: 'invalid',
      trigger: 'BOOKING_RESCHEDULED',
      issues: ['payload.rescheduleUid'],
    })
  })

  it('never echoes attendee data in the reported issues', () => {
    const parsed = parseCalWebhook({ ...envelope, payload: { ...envelope.payload, metadata: {} } })
    expect(JSON.stringify(parsed)).not.toMatch(/Ada|a@b\.c|Lisbon/)
  })

  it('maps triggers to booking statuses and ignores the rest', () => {
    expect(bookingStatusOf('BOOKING_CREATED')).toBe('confirmed')
    expect(bookingStatusOf('BOOKING_RESCHEDULED')).toBe('rescheduled')
    expect(bookingStatusOf('BOOKING_CANCELLED')).toBe('cancelled')
    expect(parseCalWebhook({ triggerEvent: 'MEETING_ENDED' })).toEqual({ kind: 'other' })
    expect(parseCalWebhook({ triggerEvent: 'PING' })).toEqual({ kind: 'other' })
    expect(parseCalWebhook(null)).toEqual({ kind: 'other' })
  })
})
