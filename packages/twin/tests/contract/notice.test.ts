import { describe, expect, it } from 'vitest'
import { encodeNotice, parseNotice } from '../../src/contract/notice'

describe('TwinNotice', () => {
  it('round-trips a booking notice', () => {
    const text = encodeNotice({ kind: 'booking.confirmed', startTime: '2026-10-08T14:00:00.000Z' })
    expect(parseNotice(text)).toEqual({ twinNotice: 1, kind: 'booking.confirmed', startTime: '2026-10-08T14:00:00.000Z' })
  })

  it('returns null for ordinary visitor text', () => {
    expect(parseNotice('hello there')).toBeNull()
    expect(parseNotice('{"kind":"booking.confirmed"}')).toBeNull()
  })
})
