import { describe, expect, it } from 'vitest'
import { signVisitorCookie, verifyVisitorCookie } from '@/lib/twin/cookie'

const key = 'c'.repeat(32)
const id = '7f9c2a50-1d1e-4c1b-9a51-1f2a3b4c5d6e'

describe('visitor cookie', () => {
  it('round-trips a visitor id', () => {
    expect(verifyVisitorCookie(signVisitorCookie(id, key), key)).toBe(id)
  })

  it('rejects tampering, other keys and non-uuids', () => {
    const v = signVisitorCookie(id, key)
    expect(verifyVisitorCookie(v.replace('7f9c', '7f9d'), key)).toBeNull()
    expect(verifyVisitorCookie(v, 'd'.repeat(32))).toBeNull()
    expect(verifyVisitorCookie(signVisitorCookie('admin', key), key)).toBeNull()
    expect(verifyVisitorCookie(undefined, key)).toBeNull()
  })
})
