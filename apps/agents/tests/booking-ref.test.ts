import { describe, expect, it } from 'vitest'
import { signBookingRef, verifyBookingRef } from '../agent/lib/booking-ref'

const key = 's'.repeat(32)

describe('booking ref', () => {
  it('round-trips a session id', () => {
    expect(verifyBookingRef(signBookingRef('wrun_abc', key), key)).toBe('wrun_abc')
  })

  it('rejects tampering and wrong keys', () => {
    const ref = signBookingRef('wrun_abc', key)
    // The id is base64url-encoded, so swap the encoded id and keep the original signature.
    const [, sig] = ref.split('.')
    const forged = `${Buffer.from('wrun_abd').toString('base64url')}.${sig}`
    expect(verifyBookingRef(forged, key)).toBeNull()
    expect(verifyBookingRef(`${ref}x`, key)).toBeNull()
    expect(verifyBookingRef(ref, 't'.repeat(32))).toBeNull()
    expect(verifyBookingRef('garbage', key)).toBeNull()
  })
})
