import { createHmac, timingSafeEqual } from 'node:crypto'

const mac = (sessionId: string, key: string) => createHmac('sha256', key).update(`booking:${sessionId}`).digest('base64url')

/**
 * Opaque reference passed as Cal.com `metadata[bookingRef]`. The webhook echoes it back; the
 * signature proves the session id wasn't forged in the browser (metadata is client-supplied).
 */
export function signBookingRef(sessionId: string, key: string): string {
  return `${Buffer.from(sessionId).toString('base64url')}.${mac(sessionId, key)}`
}

/** The session id inside a valid reference, or null. */
export function verifyBookingRef(ref: string, key: string): string | null {
  const [encoded, sig] = ref.split('.')
  if (!encoded || !sig) return null
  const sessionId = Buffer.from(encoded, 'base64url').toString('utf8')
  const expected = Buffer.from(mac(sessionId, key))
  const given = Buffer.from(sig)
  return expected.length === given.length && timingSafeEqual(expected, given) ? sessionId : null
}
