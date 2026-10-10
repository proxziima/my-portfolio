import { describe, expect, it } from 'vitest'
import { MAX_ID_LENGTH, posthogIdsFromCookie } from '../src/cookie'

const TOKEN = 'phc_abc'
const value = (o: unknown) => encodeURIComponent(JSON.stringify(o))

describe('posthogIdsFromCookie', () => {
  it('reads the distinct id and the session id', () => {
    const header = `a=1; ph_${TOKEN}_posthog=${value({ distinct_id: 'd-1', $sesid: [1, 's-1', 0] })}; b=2`
    expect(posthogIdsFromCookie(header, TOKEN)).toEqual({ distinctId: 'd-1', sessionId: 's-1' })
  })

  it('returns a null session id when the cookie has none', () => {
    const header = `ph_${TOKEN}_posthog=${value({ distinct_id: 'd-1' })}`
    expect(posthogIdsFromCookie(header, TOKEN)).toEqual({ distinctId: 'd-1', sessionId: null })
  })

  it('is null for a missing header, another project, malformed JSON or no distinct id', () => {
    expect(posthogIdsFromCookie(null, TOKEN)).toBeNull()
    expect(posthogIdsFromCookie(`ph_other_posthog=${value({ distinct_id: 'x' })}`, TOKEN)).toBeNull()
    expect(posthogIdsFromCookie(`ph_${TOKEN}_posthog=%7Bnot-json`, TOKEN)).toBeNull()
    expect(posthogIdsFromCookie(`ph_${TOKEN}_posthog=${value({ $sesid: [1, 's', 0] })}`, TOKEN)).toBeNull()
  })

  it('ignores ids too long to be real, so a forged cookie cannot bloat a JWT', () => {
    const header = `ph_${TOKEN}_posthog=${value({ distinct_id: 'x'.repeat(MAX_ID_LENGTH + 1) })}`
    expect(posthogIdsFromCookie(header, TOKEN)).toBeNull()
  })
})
