import { createHmac, timingSafeEqual } from 'node:crypto'

/** Name of the httpOnly cookie that carries the signed visitor id. */
export const VISITOR_COOKIE = 'twin_vid'
/** Cookie lifetime matches retention: a visitor unseen for 90 days is purged anyway. */
export const VISITOR_COOKIE_MAX_AGE = 90 * 24 * 60 * 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const mac = (id: string, key: string) => createHmac('sha256', key).update(`visitor:${id}`).digest('base64url')

/** `<id>.<hmac>`: the id is not secret, the signature stops visitors from impersonating others. */
export function signVisitorCookie(visitorId: string, key: string): string {
  return `${visitorId}.${mac(visitorId, key)}`
}

/** The visitor id in a valid cookie value, or null. */
export function verifyVisitorCookie(value: string | undefined, key: string): string | null {
  if (!value) return null
  const dot = value.lastIndexOf('.')
  const id = value.slice(0, dot)
  const given = Buffer.from(value.slice(dot + 1))
  const expected = Buffer.from(mac(id, key))
  if (dot < 0 || !UUID.test(id) || given.length !== expected.length) return null
  return timingSafeEqual(given, expected) ? id : null
}
