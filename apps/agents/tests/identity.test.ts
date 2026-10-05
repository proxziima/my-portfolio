import { describe, expect, it } from 'vitest'
import { DEV_VISITOR_ID, visitorIdOf, visitorTimeZoneOf, type Principal } from '../agent/lib/identity'

const user = (id: string, tz?: string): Principal => ({ principalType: 'user', principalId: `web:${id}`, authenticator: 'twin-web', attributes: tz ? { tz } : {} })

describe('identity', () => {
  it('maps web visitors and local dev to visitor ids', () => {
    expect(visitorIdOf(user('7f9c2a50-1d1e-4c1b-9a51-1f2a3b4c5d6e'))).toBe('7f9c2a50-1d1e-4c1b-9a51-1f2a3b4c5d6e')
    expect(visitorIdOf({ principalType: 'local-dev', principalId: 'dev', authenticator: 'local-dev', attributes: {} })).toBe(DEV_VISITOR_ID)
  })

  it('refuses principals that are not visitors', () => {
    expect(visitorIdOf({ principalType: 'service', principalId: 'cal', authenticator: 'cal-webhook', attributes: {} })).toBeNull()
    expect(visitorIdOf(user('not-a-uuid'))).toBeNull()
    expect(visitorIdOf(null)).toBeNull()
  })

  it('reads a valid IANA zone and ignores garbage', () => {
    expect(visitorTimeZoneOf(user('7f9c2a50-1d1e-4c1b-9a51-1f2a3b4c5d6e', 'Europe/Lisbon'))).toBe('Europe/Lisbon')
    expect(visitorTimeZoneOf(user('7f9c2a50-1d1e-4c1b-9a51-1f2a3b4c5d6e', 'Mars/Base'))).toBeNull()
  })
})
