import { createHmac } from 'node:crypto'
import { ConversationState } from '@repo/twin/contract'
import { describe, expect, it } from 'vitest'
import { bookingStatusOf, parseCalWebhook, verifyCalSignature } from '../agent/lib/cal-webhook'
import { secretsEqual } from '../agent/lib/secrets'

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
      trigger: 'BOOKING_CREATED',
      uid: 'bk_1',
      startTime: '2026-10-08T14:00:00Z',
      endTime: '2026-10-08T14:30:00Z',
      bookingRef: 'abc.def',
    })
  })

  it('yields a start time ConversationState accepts (Cal.com sends ISO with Z)', () => {
    const booking = parseCalWebhook(JSON.parse(body))
    expect(booking).not.toBeNull()
    const state = ConversationState.parse({
      booking: { status: 'confirmed', uid: 'bk_1', startTime: booking?.startTime },
    })
    expect(state.booking.startTime).toBe('2026-10-08T14:00:00Z')
  })

  it('rejects a booking trigger with malformed times or no booking ref', () => {
    expect(() =>
      parseCalWebhook({ ...envelope, payload: { ...envelope.payload, startTime: 'tomorrow' } }),
    ).toThrow()
    expect(() =>
      parseCalWebhook({ ...envelope, payload: { ...envelope.payload, metadata: {} } }),
    ).toThrow()
  })

  it('maps triggers to booking statuses and ignores the rest', () => {
    expect(bookingStatusOf('BOOKING_CREATED')).toBe('confirmed')
    expect(bookingStatusOf('BOOKING_RESCHEDULED')).toBe('rescheduled')
    expect(bookingStatusOf('BOOKING_CANCELLED')).toBe('cancelled')
    expect(parseCalWebhook({ triggerEvent: 'MEETING_ENDED' })).toBeNull()
    expect(parseCalWebhook({ triggerEvent: 'PING' })).toBeNull()
    expect(parseCalWebhook(null)).toBeNull()
  })

  it('compares secrets in constant time', () => {
    expect(secretsEqual('abc', 'abc')).toBe(true)
    expect(secretsEqual('abd', 'abc')).toBe(false)
    expect(secretsEqual('abcd', 'abc')).toBe(false)
    expect(secretsEqual(null, 'abc')).toBe(false)
    expect(secretsEqual('', 'abc')).toBe(false)
  })
})
