import { describe, expect, it } from 'vitest'
import { bookingTransition, type BookingEvent } from '../agent/lib/booking-transition'

const T1 = '2026-10-08T14:00:00Z'
const T2 = '2026-10-09T15:00:00Z'
const event = (over: Partial<BookingEvent> = {}): BookingEvent => ({
  uid: 'u1',
  status: 'confirmed',
  startTime: T1,
  rowChanged: true,
  ...over,
})
const both = { write: true, notify: true }
const none = { write: false, notify: false }

describe('bookingTransition', () => {
  it('writes and notifies when no booking is recorded', () => {
    expect(bookingTransition(undefined, event())).toEqual(both)
    expect(bookingTransition(null, event())).toEqual(both)
  })
  it('writes and notifies when the state has no uid yet, even if the row is unchanged', () => {
    expect(bookingTransition({ status: 'none' }, event({ rowChanged: false }))).toEqual(both)
  })
  it('does nothing when uid, status and start time already match (redelivery after success)', () => {
    expect(
      bookingTransition({ uid: 'u1', status: 'confirmed', startTime: T1 }, event({ rowChanged: false })),
    ).toEqual(none)
  })
  it('writes and notifies a status change for the same uid', () => {
    expect(
      bookingTransition({ uid: 'u1', status: 'confirmed', startTime: T1 }, event({ status: 'cancelled' })),
    ).toEqual(both)
  })
  it('recovers a partial failure: unchanged row, same uid, stale status', () => {
    expect(
      bookingTransition(
        { uid: 'u1', status: 'confirmed', startTime: T1 },
        event({ status: 'cancelled', rowChanged: false }),
      ),
    ).toEqual(both)
  })
  it('writes and notifies a new uid whose row changed', () => {
    expect(
      bookingTransition({ uid: 'u1', status: 'confirmed', startTime: T1 }, event({ uid: 'u2' })),
    ).toEqual(both)
  })
  it('skips a stale event for an older uid: unchanged row while the state holds another uid', () => {
    expect(
      bookingTransition(
        { uid: 'u2', status: 'rescheduled', startTime: T2 },
        event({ uid: 'u1', rowChanged: false }),
      ),
    ).toEqual(none)
  })
  it('writes and notifies a retried reschedule whose link is the recorded uid (state write failed)', () => {
    expect(
      bookingTransition(
        { uid: 'u1', status: 'confirmed', startTime: T1 },
        event({ uid: 'u2', status: 'rescheduled', startTime: T2, rowChanged: false, rescheduledFrom: 'u1' }),
      ),
    ).toEqual(both)
  })
  it('still skips an unchanged reschedule whose link is not the recorded uid', () => {
    expect(
      bookingTransition(
        { uid: 'u3', status: 'rescheduled', startTime: T1 },
        event({ uid: 'u2', status: 'rescheduled', startTime: T2, rowChanged: false, rescheduledFrom: 'u1' }),
      ),
    ).toEqual(none)
  })
  it('still skips the stale original after a reschedule even though the successor links to it', () => {
    expect(
      bookingTransition(
        { uid: 'u2', status: 'rescheduled', startTime: T2 },
        event({ uid: 'u1', rowChanged: false }),
      ),
    ).toEqual(none)
  })
  it('writes and notifies a same-uid reschedule that only moves the start time', () => {
    expect(
      bookingTransition(
        { uid: 'u1', status: 'rescheduled', startTime: T1 },
        event({ status: 'rescheduled', startTime: T2, rowChanged: false }),
      ),
    ).toEqual(both)
  })
  it('compares start times as instants, not strings', () => {
    expect(
      bookingTransition(
        { uid: 'u1', status: 'confirmed', startTime: '2026-10-08T14:00:00.000Z' },
        event({ startTime: '2026-10-08T16:00:00+02:00', rowChanged: false }),
      ),
    ).toEqual(none)
  })
  it('a recorded booking without a start time never counts as moved', () => {
    expect(bookingTransition({ uid: 'u1', status: 'confirmed' }, event({ rowChanged: false }))).toEqual(none)
  })
})
