import { describe, expect, it } from 'vitest'
import { bookingTransition } from '../agent/lib/booking-transition'

describe('bookingTransition', () => {
  it('writes and notifies when no booking is recorded', () => {
    expect(bookingTransition(undefined, 'u1', 'confirmed')).toEqual({ write: true, notify: true })
    expect(bookingTransition(null, 'u1', 'confirmed')).toEqual({ write: true, notify: true })
  })
  it('does nothing when uid and status already match (redelivery after success)', () => {
    expect(bookingTransition({ uid: 'u1', status: 'confirmed' }, 'u1', 'confirmed')).toEqual({
      write: false,
      notify: false,
    })
  })
  it('writes and notifies a status change for the same uid', () => {
    expect(bookingTransition({ uid: 'u1', status: 'confirmed' }, 'u1', 'cancelled')).toEqual({
      write: true,
      notify: true,
    })
  })
  it('writes and notifies a different uid with the same status', () => {
    expect(bookingTransition({ uid: 'u1', status: 'confirmed' }, 'u2', 'confirmed')).toEqual({
      write: true,
      notify: true,
    })
  })
})
